import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref, shallowRef } from 'vue'
import { config } from '@/config'
import { i18n } from '@/i18n'
import { fire, supabase } from '@/lib/supabase'
import { Mesh, type RemotePeer } from '@/lib/call/mesh'
import { createTransport, type PeerInfo } from '@/lib/call/transport'
import { countCameras, getCamera, getIceServers, getMic, getScreen, mediaErrorKey } from '@/lib/call/media'
import { tones, watchLevel } from '@/lib/call/sound'
import { useAuth } from './auth'
import { useChats } from './chats'
import { useUi } from './ui'

export type CallKind = 'voice' | 'video'
export type Phase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'live' | 'ended'
export type EndReason = 'ended' | 'noAnswer' | 'declined' | 'full'

export interface CallRow {
  id: string
  chat_id: string
  started_by: string | null
  kind: CallKind
  message_id: string | null
  participants: string[]
  declined: string[]
  started_at: string
  answered_at: string | null
  ended_at: string | null
  heartbeat_at: string
}

export interface Participant {
  peerId: string
  userId: string
  mic: boolean
  cam: boolean
  screen: boolean
  audio: MediaStream | null
  camStream: MediaStream | null
  screenStream: MediaStream | null
  connected: boolean
  speaking: boolean
}

/** How long a call rings before it counts as missed. */
const RING_MS = 45_000
/** A call without a heartbeat for this long is considered dead. */
const LIVE_MS = 90_000
/** Mesh calls get heavy beyond this (everyone uploads to everyone). */
const MAX_PEOPLE = 6

const t = (key: string, vars: Record<string, unknown> = {}) =>
  (i18n.global.t as unknown as (k: string, v: Record<string, unknown>) => string)(key, vars)

export const useCall = defineStore('call', () => {
  const phase = ref<Phase>('idle')
  const chatId = ref<string | null>(null)
  const kind = ref<CallKind>('voice')
  const call = ref<CallRow | null>(null)
  const incoming = ref<CallRow | null>(null)
  const participants = ref<Participant[]>([])
  const mic = ref(true)
  const cam = ref(false)
  const screen = ref(false)
  const localCam = shallowRef<MediaStream | null>(null)
  const localScreen = shallowRef<MediaStream | null>(null)
  const facing = ref<'user' | 'environment'>('user')
  const canFlip = ref(false)
  const minimized = ref(false)
  const connectedAt = ref<number | null>(null)
  const now = ref(Date.now())
  const endReason = ref<EndReason>('ended')
  const endedAfter = ref(0)
  const meSpeaking = ref(false)
  /** Live calls per chat (for "join" banners). */
  const active = reactive<Record<string, CallRow>>({})
  const clock = ref(Date.now())

  let mesh: Mesh | null = null
  let micTrack: MediaStreamTrack | null = null
  let camTrack: MediaStreamTrack | null = null
  let screenTrack: MediaStreamTrack | null = null
  let stopSound: (() => void) | null = null
  let ringTimer = 0
  let heartbeat = 0
  let aloneTimer = 0
  let ticker = 0
  let buzzTimer = 0
  let clockTimer = 0
  let attempt = 0
  let everConnected = false
  let wakeLock: WakeLockSentinel | null = null
  const levelStops = new Map<string, () => void>()

  const chat = computed(() => useChats().byId(chatId.value ?? incoming.value?.chat_id))
  const inCall = computed(() => phase.value === 'outgoing' || phase.value === 'connecting' || phase.value === 'live')
  const isGroup = computed(() => chat.value?.type === 'group')
  const duration = computed(() => (connectedAt.value ? Math.max(0, now.value - connectedAt.value) : 0))
  const reconnecting = computed(() => phase.value === 'live' && participants.value.some((p) => !p.connected))

  // ---------------------------------------------------------------------------
  // Sounds
  // ---------------------------------------------------------------------------
  function play(stop: () => void) {
    silence()
    stopSound = stop
  }
  function silence() {
    stopSound?.()
    stopSound = null
    window.clearInterval(buzzTimer)
    try { navigator.vibrate?.(0) } catch { /* unsupported */ }
  }

  // ---------------------------------------------------------------------------
  // Start / answer / decline
  // ---------------------------------------------------------------------------
  /** Call a chat, or join the call already going on there. */
  async function start(target: string, k: CallKind) {
    if (phase.value === 'incoming' || inCall.value) {
      if (chatId.value === target && inCall.value) minimized.value = false
      else useUi().toast(t('call.busy'))
      return
    }
    reset()
    const my = ++attempt
    chatId.value = target
    kind.value = k
    phase.value = 'connecting'
    const ice = getIceServers() // in parallel with the camera prompt
    try {
      const media = await acquire(k === 'video')
      if (my !== attempt) return drop(media)
      adopt(media)
      const { data, error } = await supabase.rpc('start_call', { p_chat: target, p_kind: k })
      if (error) throw error
      let row = data as CallRow
      const me = useAuth().userId
      const fresh = row.started_by === me && !row.answered_at && row.participants.length <= 1
      if (!fresh) {
        const res = await supabase.rpc('answer_call', { p_call: row.id })
        if (res.error) throw res.error
        row = res.data as CallRow
      }
      if (my !== attempt) {
        // Hung up while the call was being created: don't leave it ringing.
        if (fresh) fire(supabase.rpc('end_call', { p_call: row.id }))
        return
      }
      call.value = row
      kind.value = row.kind
      if (fresh) {
        phase.value = 'outgoing'
        play(tones.ringback())
      }
      ringTimer = window.setTimeout(() => { if (!everConnected) void hangUp('noAnswer') }, RING_MS)
      await joinRoom(row, await ice)
    } catch (e) {
      if (my === attempt) await fail(e)
    }
  }

  async function accept(video: boolean) {
    const row = incoming.value
    if (!row) return
    stopIncoming()
    reset()
    const my = ++attempt
    chatId.value = row.chat_id
    kind.value = row.kind
    phase.value = 'connecting'
    const ice = getIceServers()
    try {
      const media = await acquire(video)
      if (my !== attempt) return drop(media)
      adopt(media)
      const { data, error } = await supabase.rpc('answer_call', { p_call: row.id })
      if (error) throw error
      if (my !== attempt) return
      call.value = data as CallRow
      ringTimer = window.setTimeout(() => { if (!everConnected) void hangUp('noAnswer') }, RING_MS)
      await joinRoom(call.value, await ice)
    } catch (e) {
      if (my === attempt) await fail(e)
    }
  }

  function decline() {
    const row = incoming.value
    if (!row) return
    stopIncoming()
    fire(supabase.rpc('decline_call', { p_call: row.id }))
  }

  interface Media { mic: MediaStreamTrack; cam: MediaStreamTrack | null }

  async function acquire(video: boolean): Promise<Media> {
    const micT = await getMic()
    let camT: MediaStreamTrack | null = null
    if (video) {
      try {
        camT = await getCamera(facing.value, isGroup.value)
      } catch (e) {
        useUi().toast(t(mediaErrorKey(e) ?? 'call.errors.noCamera'))
      }
    }
    return { mic: micT, cam: camT }
  }

  function adopt(m: Media) {
    micTrack = m.mic
    camTrack = m.cam
    mic.value = true
    cam.value = !!camTrack
    localCam.value = camTrack ? markRaw(new MediaStream([camTrack])) : null
    void countCameras().then((n) => (canFlip.value = n > 1))
  }

  /** Media we got after the user already hung up. */
  function drop(m: Media) {
    m.mic.stop()
    m.cam?.stop()
  }

  async function joinRoom(row: CallRow, ice: RTCIceServer[]) {
    const me: PeerInfo = { peerId: crypto.randomUUID(), userId: useAuth().userId!, mic: mic.value, cam: cam.value, screen: false }
    const m = new Mesh(createTransport(row.id), me, ice, { peerChanged, peerLeft, event: onEvent })
    mesh = m
    m.setTrack('audio', micTrack)
    m.setTrack('cam', camTrack)
    await m.join()
    heartbeat = window.setInterval(beat, 25_000)
    ticker = window.setInterval(() => (now.value = Date.now()), 1000)
    if (micTrack) {
      levelStops.set('me', watchLevel(micTrack, (l) => {
        const v = mic.value && l > 0.06
        if (meSpeaking.value !== v) meSpeaking.value = v
      }))
    }
    try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null } catch { /* not supported */ }
  }

  async function fail(e: unknown) {
    console.error('[call]', e)
    const msg = String((e as { message?: string })?.message ?? '')
    useUi().toast(t(mediaErrorKey(e) ?? (msg.includes('CALL_ENDED') ? 'call.errors.ended' : 'call.errors.failed')))
    silence()
    await teardown()
    reset()
  }

  /** One participant keeps the call row fresh so others can still join it. */
  function beat() {
    if (!mesh || !call.value) return
    const ids = [mesh.self.peerId, ...participants.value.map((p) => p.peerId)].sort()
    if (ids[0] === mesh.self.peerId) fire(supabase.rpc('call_heartbeat', { p_call: call.value.id }))
  }

  // ---------------------------------------------------------------------------
  // Peers
  // ---------------------------------------------------------------------------
  function peerChanged(p: RemotePeer) {
    let part = participants.value.find((x) => x.peerId === p.peerId)
    if (!part) {
      if (mesh && mesh.peers.size >= MAX_PEOPLE && !everConnected) {
        void hangUp('full')
        return
      }
      participants.value.push({
        peerId: p.peerId, userId: p.userId, mic: true, cam: false, screen: false,
        audio: null, camStream: null, screenStream: null, connected: false, speaking: false,
      })
      part = participants.value[participants.value.length - 1]
      window.clearTimeout(aloneTimer)
    }
    if (p.userId) part.userId = p.userId
    if (p.info) {
      part.mic = p.info.mic
      part.cam = p.info.cam
      part.screen = p.info.screen
    }
    const { audio, cam: camT, screen: screenT } = p.tracks
    if (audio && part.audio?.getAudioTracks()[0] !== audio) {
      part.audio = markRaw(new MediaStream([audio]))
      levelStops.get(p.peerId)?.()
      const target = part
      levelStops.set(p.peerId, watchLevel(audio, (l) => {
        const v = target.mic && l > 0.05
        if (target.speaking !== v) target.speaking = v
      }))
    }
    if (camT && part.camStream?.getVideoTracks()[0] !== camT) part.camStream = markRaw(new MediaStream([camT]))
    if (screenT && part.screenStream?.getVideoTracks()[0] !== screenT) part.screenStream = markRaw(new MediaStream([screenT]))
    part.connected = p.connection === 'connected'
    if (part.connected && !everConnected) firstConnect()
  }

  function firstConnect() {
    everConnected = true
    window.clearTimeout(ringTimer)
    silence()
    tones.connected()
    phase.value = 'live'
    connectedAt.value = Date.now()
  }

  function peerLeft(peerId: string) {
    levelStops.get(peerId)?.()
    levelStops.delete(peerId)
    participants.value = participants.value.filter((x) => x.peerId !== peerId)
    if (participants.value.length || !everConnected || !inCall.value) return
    if (!isGroup.value) {
      void hangUp('ended') // the other person hung up
    } else {
      window.clearTimeout(aloneTimer)
      aloneTimer = window.setTimeout(() => { if (!participants.value.length) void hangUp('ended') }, 3 * 60_000)
    }
  }

  function onEvent(name: string, data: Record<string, unknown>) {
    if (name === 'screenshot') {
      const who = useChats().people[String(data.userId)]?.display_name ?? ''
      useUi().toast(t('call.screenshotTaken', { name: who }), undefined, 2500)
    }
  }

  // ---------------------------------------------------------------------------
  // Hang up
  // ---------------------------------------------------------------------------
  async function hangUp(reason: EndReason = 'ended') {
    if (!inCall.value) return
    attempt++
    const row = call.value
    const alone = !mesh || mesh.peers.size === 0
    endReason.value = reason
    endedAfter.value = connectedAt.value ? Date.now() - connectedAt.value : 0
    silence()
    tones.hangup()
    phase.value = 'ended'
    await teardown()
    // The last one out closes the call (and writes its log entry).
    if (row && alone) fire(supabase.rpc('end_call', { p_call: row.id }))
    window.setTimeout(() => { if (phase.value === 'ended') reset() }, 1600)
  }

  async function teardown() {
    window.clearTimeout(ringTimer)
    window.clearInterval(heartbeat)
    window.clearTimeout(aloneTimer)
    window.clearInterval(ticker)
    for (const stop of levelStops.values()) stop()
    levelStops.clear()
    for (const tr of [micTrack, camTrack, screenTrack]) tr?.stop()
    micTrack = camTrack = screenTrack = null
    localCam.value = null
    localScreen.value = null
    void wakeLock?.release().catch(() => {})
    wakeLock = null
    const m = mesh
    mesh = null
    await m?.leave().catch(() => {})
  }

  function reset() {
    phase.value = 'idle'
    chatId.value = null
    call.value = null
    participants.value = []
    mic.value = true
    cam.value = false
    screen.value = false
    minimized.value = false
    connectedAt.value = null
    meSpeaking.value = false
    everConnected = false
  }

  // ---------------------------------------------------------------------------
  // In-call controls
  // ---------------------------------------------------------------------------
  function toggleMic() {
    mic.value = !mic.value
    if (micTrack) micTrack.enabled = mic.value
    void mesh?.setState({ mic: mic.value })
  }

  async function toggleCam() {
    if (cam.value) {
      camTrack?.stop()
      camTrack = null
      localCam.value = null
      cam.value = false
      mesh?.setTrack('cam', null)
    } else {
      try {
        camTrack = await getCamera(facing.value, isGroup.value)
        localCam.value = markRaw(new MediaStream([camTrack]))
        cam.value = true
        mesh?.setTrack('cam', camTrack)
        void countCameras().then((n) => (canFlip.value = n > 1))
      } catch (e) {
        useUi().toast(t(mediaErrorKey(e) ?? 'call.errors.noCamera'))
        return
      }
    }
    void mesh?.setState({ cam: cam.value })
  }

  async function flip() {
    if (!cam.value) return
    const next = facing.value === 'user' ? 'environment' : 'user'
    camTrack?.stop() // phones often can't open two cameras at once
    let track: MediaStreamTrack
    try {
      track = await getCamera(next, isGroup.value)
      facing.value = next
    } catch {
      track = await getCamera(facing.value, isGroup.value)
    }
    camTrack = track
    localCam.value = markRaw(new MediaStream([track]))
    mesh?.setTrack('cam', track)
  }

  async function toggleScreen() {
    if (screen.value) return stopScreen()
    try {
      const track = await getScreen()
      track.onended = () => stopScreen() // "Stop sharing" in the browser's own bar
      screenTrack = track
      localScreen.value = markRaw(new MediaStream([track]))
      screen.value = true
      mesh?.setTrack('screen', track)
      void mesh?.setState({ screen: true })
    } catch (e) {
      if ((e as { name?: string })?.name !== 'NotAllowedError') useUi().toast(t('call.errors.screen'))
    }
  }

  function stopScreen() {
    if (!screen.value) return
    screenTrack?.stop()
    screenTrack = null
    localScreen.value = null
    screen.value = false
    mesh?.setTrack('screen', null)
    void mesh?.setState({ screen: false })
  }

  function notifyScreenshot() {
    mesh?.emit('screenshot')
  }

  // ---------------------------------------------------------------------------
  // Ringing + live call tracking (calls table via Realtime)
  // ---------------------------------------------------------------------------
  function ring(row: CallRow, checkAge: boolean) {
    const me = useAuth().userId
    if (!me || row.started_by === me || row.ended_at) return
    if (row.participants.includes(me) || row.declined.includes(me)) return
    if (phase.value !== 'idle' || incoming.value) return
    const age = Math.max(0, Date.now() - Date.parse(row.started_at))
    if (checkAge && age > RING_MS) return
    incoming.value = row
    phase.value = 'incoming'
    play(tones.ring())
    const buzz = () => { try { navigator.vibrate?.([500, 300, 500]) } catch { /* unsupported */ } }
    buzz()
    buzzTimer = window.setInterval(buzz, 2600)
    window.clearTimeout(ringTimer)
    ringTimer = window.setTimeout(stopIncoming, checkAge ? Math.max(5000, RING_MS - age) : RING_MS)
  }

  function stopIncoming() {
    silence()
    window.clearTimeout(ringTimer)
    incoming.value = null
    if (phase.value === 'incoming') phase.value = 'idle'
  }

  /** calls table change from Realtime (or initial load). */
  function onRow(type: 'INSERT' | 'UPDATE' | 'SYNC', row: CallRow) {
    if (!row?.id) return
    const me = useAuth().userId ?? ''
    const cur = active[row.chat_id]
    if (row.ended_at) {
      if (cur?.id === row.id) delete active[row.chat_id]
    } else if (!cur || cur.id === row.id || row.started_at > cur.started_at) {
      active[row.chat_id] = row
    }
    if (type !== 'UPDATE') ring(row, type === 'SYNC')
    if (incoming.value?.id === row.id && (row.ended_at || row.participants.includes(me) || row.declined.includes(me))) {
      stopIncoming()
    }
    if (call.value?.id === row.id) {
      call.value = row
      // Declined/cancelled while nobody else is here.
      if (row.ended_at && inCall.value && participants.value.length === 0) {
        void hangUp(row.declined.length && !row.answered_at ? 'declined' : 'ended')
      }
    }
  }

  function liveCall(id: string): CallRow | null {
    const row = active[id]
    if (!row || row.ended_at || clock.value - Date.parse(row.heartbeat_at) > LIVE_MS) return null
    return row
  }

  async function init() {
    window.clearInterval(clockTimer)
    clockTimer = window.setInterval(() => (clock.value = Date.now()), 15_000)
    const { data } = await supabase.from('calls').select('*').is('ended_at', null).order('started_at')
    for (const row of (data ?? []) as CallRow[]) onRow('SYNC', row)
  }

  async function stopAll() {
    stopIncoming()
    if (inCall.value) await hangUp()
    window.clearInterval(clockTimer)
    for (const k of Object.keys(active)) delete active[k]
  }

  // Closing the tab mid-call: say bye, and close the call if we were the last one in it.
  window.addEventListener('pagehide', () => {
    if (!inCall.value || !call.value) return
    const alone = !mesh || mesh.peers.size === 0
    const id = call.value.id
    void mesh?.leave()
    const token = useAuth().session?.access_token
    if (alone && token) {
      void fetch(`${config.supabaseUrl}/rest/v1/rpc/end_call`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_call: id }),
      }).catch(() => {})
    }
  })

  return {
    phase, chatId, kind, call, incoming, participants, mic, cam, screen, localCam, localScreen,
    facing, canFlip, minimized, connectedAt, now, duration, endReason, endedAfter, meSpeaking,
    active, chat, inCall, isGroup, reconnecting,
    start, accept, decline, hangUp, toggleMic, toggleCam, flip, toggleScreen, notifyScreenshot,
    onRow, liveCall, init, stopAll,
  }
})
