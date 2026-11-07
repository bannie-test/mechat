/** Camera, microphone and screen capture helpers for calls. */
import { supabase } from '@/lib/supabase'

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

/** Browsers only expose cameras/mics on HTTPS pages (and localhost). */
function devices(): MediaDevices {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Calls need HTTPS'), { name: 'InsecureContextError' })
  return navigator.mediaDevices
}

export async function getMic(): Promise<MediaStreamTrack> {
  const s = await devices().getUserMedia({ audio: AUDIO, video: false })
  return s.getAudioTracks()[0]
}

/** Smaller video when more people are on the call (everyone uploads to everyone). */
export async function getCamera(facing: 'user' | 'environment', group = false): Promise<MediaStreamTrack> {
  const size = group ? { width: { ideal: 640 }, height: { ideal: 480 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }
  const s = await devices().getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, ...size, frameRate: { ideal: 24, max: 30 } },
  })
  return s.getVideoTracks()[0]
}

export const canShareScreen = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function'

export async function getScreen(): Promise<MediaStreamTrack> {
  const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false })
  const track = s.getVideoTracks()[0]
  track.contentHint = 'detail'
  return track
}

export async function countCameras(): Promise<number> {
  const list = await navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? []
  return list.filter((d) => d.kind === 'videoinput').length
}

/** "Permission denied" / "no device" → message key, or null for other errors. */
export function mediaErrorKey(e: unknown): string | null {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'call.errors.permission'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'call.errors.noDevice'
  if (name === 'NotReadableError') return 'call.errors.busyDevice'
  if (name === 'InsecureContextError') return 'call.errors.insecure'
  return null
}

// ---------------------------------------------------------------------------
// ICE servers (STUN, plus TURN from the `turn` Edge Function when configured)
// ---------------------------------------------------------------------------
const FALLBACK: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
let cached: { servers: RTCIceServer[]; until: number } | null = null

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached && cached.until > Date.now()) return cached.servers
  try {
    const res = await Promise.race([
      supabase.functions.invoke<{ iceServers: RTCIceServer[] }>('turn'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    const servers = res.data?.iceServers
    if (res.error || !servers?.length) throw res.error ?? new Error('no ice servers')
    cached = { servers, until: Date.now() + 6 * 3600_000 }
    return servers
  } catch {
    return FALLBACK
  }
}
