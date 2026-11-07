/**
 * Small WebRTC mesh: every participant has one RTCPeerConnection to every other participant.
 *
 * Each connection carries three transceivers in a fixed order — audio, camera, screen — created
 * by the "initiator" (the peer with the smaller peerId) before the first offer. Turning the camera
 * or screen share on/off is just `replaceTrack`, so after the first offer/answer no renegotiation
 * is needed. Only the initiator ever sends offers (also for ICE restarts), so offers never collide.
 */
import type { CallTransport, PeerInfo, Signal } from './transport'

export type Slot = 'audio' | 'cam' | 'screen'
const SLOTS: Slot[] = ['audio', 'cam', 'screen']

export interface RemotePeer {
  peerId: string
  userId: string
  initiator: boolean
  pc: RTCPeerConnection
  /** Remote tracks by slot (exist once negotiated; silent/black while the sender is off). */
  tracks: Partial<Record<Slot, MediaStreamTrack>>
  /** Latest presence payload (mic/cam/screen flags). */
  info: PeerInfo | null
  /** Seen in presence at least once (so a presence "leave" can remove it). */
  inRoom: boolean
  connection: RTCPeerConnectionState
  pendingIce: RTCIceCandidateInit[]
  offerTimer: number
  iceTimer: number
}

export interface MeshHandlers {
  peerChanged(p: RemotePeer): void
  peerLeft(peerId: string): void
  event(name: string, data: Record<string, unknown>): void
}

export class Mesh {
  readonly peers = new Map<string, RemotePeer>()
  private local: Record<Slot, MediaStreamTrack | null> = { audio: null, cam: null, screen: null }
  private closed = false
  /** Signals are handled one at a time so ICE candidates never race their offer/answer. */
  private chain: Promise<void> = Promise.resolve()

  constructor(
    private transport: CallTransport,
    private me: PeerInfo,
    private iceServers: RTCIceServer[],
    private on: MeshHandlers,
  ) {
    transport.onSignal = (s) => {
      this.chain = this.chain.then(() => this.onSignal(s)).catch((e) => console.warn('[call] signal', s.kind, e))
    }
    transport.onPeers = (list) => this.onPeers(list)
    transport.onEvent = (name, data) => this.on.event(name, data)
  }

  get self(): PeerInfo {
    return this.me
  }

  join() {
    return this.transport.join({ ...this.me })
  }

  setTrack(slot: Slot, track: MediaStreamTrack | null) {
    this.local[slot] = track
    for (const p of this.peers.values()) {
      const t = this.transceiver(p, slot)
      if (t && t.sender.track !== track) void t.sender.replaceTrack(track).catch((e) => console.warn('[call] replaceTrack', e))
    }
  }

  async setState(patch: Partial<Pick<PeerInfo, 'mic' | 'cam' | 'screen'>>) {
    Object.assign(this.me, patch)
    await this.transport.update({ ...this.me })
  }

  emit(name: string, data: Record<string, unknown> = {}) {
    this.transport.emit(name, { ...data, peerId: this.me.peerId, userId: this.me.userId })
  }

  async leave() {
    if (this.closed) return
    this.closed = true
    for (const p of this.peers.values()) {
      this.transport.send({ from: this.me.peerId, to: p.peerId, kind: 'bye' })
      this.dispose(p)
    }
    this.peers.clear()
    await this.transport.leave()
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------
  private onPeers(list: PeerInfo[]) {
    if (this.closed) return
    const present = new Set(list.map((i) => i.peerId))
    for (const info of list) {
      const p = this.peers.get(info.peerId) ?? this.createPeer(info.peerId, info.userId)
      p.info = info
      p.userId = info.userId
      p.inRoom = true
      this.on.peerChanged(p)
    }
    for (const p of [...this.peers.values()]) {
      if (p.inRoom && !present.has(p.peerId)) this.removePeer(p.peerId)
    }
  }

  private createPeer(peerId: string, userId: string): RemotePeer {
    const initiator = this.me.peerId < peerId
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' })
    const p: RemotePeer = {
      peerId, userId, initiator, pc, tracks: {}, info: null, inRoom: false,
      connection: 'new', pendingIce: [], offerTimer: 0, iceTimer: 0,
    }
    this.peers.set(peerId, p)

    pc.onicecandidate = (e) => {
      this.transport.send({ from: this.me.peerId, to: peerId, kind: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null })
    }
    pc.ontrack = (e) => {
      const slot = SLOTS[pc.getTransceivers().indexOf(e.transceiver)]
      if (!slot) return
      p.tracks[slot] = e.track
      e.track.onunmute = () => this.on.peerChanged(p)
      e.track.onmute = () => this.on.peerChanged(p)
      this.on.peerChanged(p)
    }
    pc.onconnectionstatechange = () => {
      p.connection = pc.connectionState
      if (pc.connectionState === 'failed') this.restart(p)
      this.on.peerChanged(p)
    }
    pc.oniceconnectionstatechange = () => {
      window.clearTimeout(p.iceTimer)
      if (pc.iceConnectionState === 'failed') this.restart(p)
      else if (pc.iceConnectionState === 'disconnected') {
        p.iceTimer = window.setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') this.restart(p)
        }, 4000)
      }
    }
    pc.onnegotiationneeded = () => {
      if (p.initiator) void this.offer(p)
    }

    if (initiator) {
      for (const slot of SLOTS) {
        const t = pc.addTransceiver(slot === 'audio' ? 'audio' : 'video', { direction: 'sendrecv' })
        if (this.local[slot]) void t.sender.replaceTrack(this.local[slot])
      }
    }
    return p
  }

  private transceiver(p: RemotePeer, slot: Slot): RTCRtpTransceiver | undefined {
    return p.pc.getTransceivers()[SLOTS.indexOf(slot)]
  }

  private removePeer(peerId: string) {
    const p = this.peers.get(peerId)
    if (!p) return
    this.dispose(p)
    this.peers.delete(peerId)
    this.on.peerLeft(peerId)
  }

  private dispose(p: RemotePeer) {
    window.clearTimeout(p.offerTimer)
    window.clearTimeout(p.iceTimer)
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null
    p.pc.oniceconnectionstatechange = p.pc.onnegotiationneeded = null
    p.pc.close()
  }

  // ---------------------------------------------------------------------------
  // Negotiation
  // ---------------------------------------------------------------------------
  private async offer(p: RemotePeer) {
    if (this.closed || p.pc.signalingState === 'closed') return
    try {
      await p.pc.setLocalDescription()
      this.sendOffer(p)
    } catch (e) {
      console.warn('[call] offer', e)
    }
  }

  private sendOffer(p: RemotePeer) {
    const d = p.pc.localDescription
    if (!d || d.type !== 'offer' || this.closed) return
    this.transport.send({ from: this.me.peerId, to: p.peerId, kind: 'offer', sdp: { type: d.type, sdp: d.sdp } })
    // No answer yet (they may have subscribed a moment after we saw them)? Send it again.
    window.clearTimeout(p.offerTimer)
    p.offerTimer = window.setTimeout(() => {
      if (p.pc.signalingState === 'have-local-offer') this.sendOffer(p)
    }, 5000)
  }

  private restart(p: RemotePeer) {
    if (this.closed || p.pc.signalingState === 'closed') return
    if (p.initiator) p.pc.restartIce()
    else this.transport.send({ from: this.me.peerId, to: p.peerId, kind: 'restart' })
  }

  private async flushIce(p: RemotePeer) {
    for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {})
  }

  private async onSignal(s: Signal) {
    if (this.closed) return
    let p = this.peers.get(s.from)
    switch (s.kind) {
      case 'offer': {
        if (!s.sdp) return
        p ??= this.createPeer(s.from, '')
        if (p.initiator) return // only the lower peerId offers; ignore anything else
        await p.pc.setRemoteDescription(s.sdp)
        p.pc.getTransceivers().forEach((t, i) => {
          if (t.direction !== 'sendrecv') t.direction = 'sendrecv'
          const track = this.local[SLOTS[i]] ?? null
          if (t.sender.track !== track) void t.sender.replaceTrack(track)
        })
        await p.pc.setLocalDescription()
        const a = p.pc.localDescription!
        this.transport.send({ from: this.me.peerId, to: s.from, kind: 'answer', sdp: { type: a.type, sdp: a.sdp } })
        await this.flushIce(p)
        break
      }
      case 'answer':
        if (!p || !s.sdp || p.pc.signalingState !== 'have-local-offer') return
        window.clearTimeout(p.offerTimer)
        await p.pc.setRemoteDescription(s.sdp)
        await this.flushIce(p)
        break
      case 'ice':
        if (!p || !s.candidate) return
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.candidate).catch(() => {})
        else p.pendingIce.push(s.candidate)
        break
      case 'restart':
        if (p?.initiator && p.pc.signalingState !== 'closed') p.pc.restartIce()
        break
      case 'bye':
        if (p) this.removePeer(p.peerId)
        break
    }
  }
}
