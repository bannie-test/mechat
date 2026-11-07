import { onBeforeUnmount, ref } from 'vue'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']

export interface Recording {
  blob: Blob
  mime: string
  duration: number
  waveform: number[]
}

/** Voice note recorder with a live level meter and a compact waveform. */
export function useRecorder() {
  const recording = ref(false)
  const elapsed = ref(0)
  const level = ref(0)
  let rec: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let chunks: Blob[] = []
  let samples: number[] = []
  let started = 0
  let raf = 0
  let resolveStop: ((r: Recording | null) => void) | null = null
  let cancelled = false

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunks = []
    samples = []
    cancelled = false
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      const duration = (performance.now() - started) / 1000
      cleanup()
      if (cancelled || duration < 0.6) return resolveStop?.(null)
      const type = rec?.mimeType || mime || 'audio/webm'
      resolveStop?.({ blob: new Blob(chunks, { type }), mime: type, duration, waveform: compress(samples, 48) })
    }

    ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let lastSample = 0
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
      level.value = peak
      const now = performance.now()
      elapsed.value = (now - started) / 1000
      if (now - lastSample > 80) {
        samples.push(peak)
        lastSample = now
      }
      raf = requestAnimationFrame(tick)
    }

    started = performance.now()
    rec.start(250)
    recording.value = true
    raf = requestAnimationFrame(tick)
  }

  function stop(): Promise<Recording | null> {
    return new Promise((resolve) => {
      resolveStop = resolve
      if (rec && rec.state !== 'inactive') rec.stop()
      else resolve(null)
    })
  }

  function cancel() {
    cancelled = true
    void stop()
  }

  function cleanup() {
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    void ctx?.close()
    stream = null
    ctx = null
    recording.value = false
    level.value = 0
  }

  onBeforeUnmount(() => cancel())

  return { recording, elapsed, level, start, stop, cancel }
}

function compress(values: number[], n: number) {
  if (!values.length) return Array(n).fill(0.1)
  const out: number[] = []
  const step = values.length / n
  for (let i = 0; i < n; i++) {
    const slice = values.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1))
    out.push(Math.round(Math.min(1, Math.max(...slice) * 1.6) * 100) / 100)
  }
  return out
}
