import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** What each participant publishes about itself (Realtime presence). */
export interface PeerInfo {
  /** Random per join, so the same user on two devices are two peers. */
  peerId: string
  userId: string
  mic: boolean
  cam: boolean
  screen: boolean
}

/** WebRTC signaling between two peers. */
export interface Signal {
  from: string
  to: string
  kind: 'offer' | 'answer' | 'ice' | 'restart' | 'bye'
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit | null
}

/** Signaling + membership for one call room. */
export interface CallTransport {
  join(me: PeerInfo): Promise<void>
  update(me: PeerInfo): Promise<void>
  send(signal: Signal): void
  /** Small broadcasts to everyone, e.g. "took a screenshot". */
  emit(name: string, data: Record<string, unknown>): void
  leave(): Promise<void>
  onSignal: (s: Signal) => void
  /** Everyone else currently in the room. */
  onPeers: (peers: PeerInfo[]) => void
  onEvent: (name: string, data: Record<string, unknown>) => void
}

export type TransportFactory = (callId: string) => CallTransport

/** Supabase Realtime: broadcast for signaling, presence for who is in the call. */
class SupabaseTransport implements CallTransport {
  private ch: RealtimeChannel | null = null
  private me: PeerInfo | null = null
  onSignal: (s: Signal) => void = () => {}
  onPeers: (peers: PeerInfo[]) => void = () => {}
  onEvent: (name: string, data: Record<string, unknown>) => void = () => {}

  constructor(private callId: string) {}

  join(me: PeerInfo) {
    this.me = me
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const ch = supabase.channel(`call:${this.callId}`, {
        config: { broadcast: { self: false }, presence: { key: me.peerId } },
      })
      this.ch = ch
      ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const s = payload as Signal
        if (s.to === this.me?.peerId) this.onSignal(s)
      })
        .on('broadcast', { event: 'event' }, ({ payload }) => {
          const p = payload as { name: string; data: Record<string, unknown> }
          this.onEvent(p.name, p.data)
        })
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState<PeerInfo>()
          const peers: PeerInfo[] = []
          for (const [key, metas] of Object.entries(state)) {
            const last = metas[metas.length - 1] as unknown as PeerInfo | undefined
            if (key !== this.me?.peerId && last?.peerId) peers.push(last)
          }
          this.onPeers(peers)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Also runs after a reconnect: re-announce ourselves.
            await ch.track({ ...this.me })
            if (!settled) { settled = true; resolve() }
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
            settled = true
            reject(new Error(status))
          }
        })
    })
  }

  async update(me: PeerInfo) {
    this.me = me
    await this.ch?.track({ ...me })
  }

  send(signal: Signal) {
    void this.ch?.send({ type: 'broadcast', event: 'signal', payload: signal })
  }

  emit(name: string, data: Record<string, unknown>) {
    void this.ch?.send({ type: 'broadcast', event: 'event', payload: { name, data } })
  }

  async leave() {
    const ch = this.ch
    this.ch = null
    if (!ch) return
    await ch.untrack().catch(() => {})
    await supabase.removeChannel(ch)
  }
}

let factory: TransportFactory = (id) => new SupabaseTransport(id)

export function createTransport(callId: string): CallTransport {
  return factory(callId)
}

/** Swap the signaling layer (tests use an in-memory relay). */
export function setTransportFactory(f: TransportFactory) {
  factory = f
}
