/** Call sounds generated with Web Audio (no audio files) + speaking detection. */
let ctx: AudioContext | null = null

export function audioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

function note(ac: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

function repeat(play: (ac: AudioContext, at: number) => void, everySec: number): () => void {
  let alive = true
  const tick = () => {
    if (!alive) return
    try {
      const ac = audioContext()
      play(ac, ac.currentTime + 0.05)
    } catch {
      /* audio blocked until the user interacts */
    }
  }
  tick()
  const id = window.setInterval(tick, everySec * 1000)
  return () => {
    alive = false
    window.clearInterval(id)
  }
}

function once(play: (ac: AudioContext, at: number) => void) {
  try {
    const ac = audioContext()
    play(ac, ac.currentTime + 0.02)
  } catch {
    /* ignore */
  }
}

export const tones = {
  /** Incoming call: a soft marimba-like phrase. */
  ring: () => repeat((ac, t) => [784, 988, 1175, 988, 1319].forEach((f, i) => note(ac, f, t + i * 0.15, 0.45, 0.2, 'triangle')), 2.6),
  /** Outgoing call (Vietnamese/European ringback): 425 Hz, then a pause. */
  ringback: () => repeat((ac, t) => note(ac, 425, t, 1.1, 0.07), 4),
  connected: () => once((ac, t) => { note(ac, 660, t, 0.14, 0.12); note(ac, 990, t + 0.12, 0.22, 0.12) }),
  hangup: () => once((ac, t) => [0, 0.2, 0.4].forEach((d) => note(ac, 470, t + d, 0.14, 0.08, 'square'))),
  /** Camera shutter for screenshots. */
  shutter: () => once((ac, t) => {
    const len = Math.floor(ac.sampleRate * 0.12)
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    const src = ac.createBufferSource()
    const gain = ac.createGain()
    gain.gain.value = 0.35
    src.buffer = buf
    src.connect(gain).connect(ac.destination)
    src.start(t)
  }),
}

/** Calls `cb(level)` (0..1) a few times per second for an audio track. Returns a stop function. */
export function watchLevel(track: MediaStreamTrack, cb: (level: number) => void): () => void {
  let src: MediaStreamAudioSourceNode | null = null
  try {
    const ac = audioContext()
    src = ac.createMediaStreamSource(new MediaStream([track]))
    const analyser = ac.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const id = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) {
        const x = (v - 128) / 128
        sum += x * x
      }
      cb(Math.min(1, Math.sqrt(sum / buf.length) * 4))
    }, 180)
    return () => {
      window.clearInterval(id)
      src?.disconnect()
    }
  } catch {
    return () => src?.disconnect()
  }
}
