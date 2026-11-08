/** Short UI sounds made with Web Audio (no audio files). Muted when the user turns sounds off. */
import { audioContext } from './call/sound'

let enabled = true
export function setSoundEnabled(on: boolean) {
  enabled = on
}

function blip(freqs: number[], step: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  if (!enabled) return
  try {
    const ac = audioContext()
    const t0 = ac.currentTime + 0.01
    freqs.forEach((f, i) => {
      const at = t0 + i * step
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(f, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gain).connect(ac.destination)
      osc.start(at)
      osc.stop(at + dur + 0.03)
    })
  } catch {
    /* audio is blocked until the first user gesture */
  }
}

export const sfx = {
  /** A message arrived. */
  incoming: () => blip([880, 1320], 0.09, 0.18, 0.12),
  /** Your message went out. */
  sent: () => blip([660], 0, 0.09, 0.07, 'triangle'),
  /** A file / photo / voice note finished uploading. */
  uploaded: () => blip([523, 659, 784], 0.07, 0.16, 0.09, 'triangle'),
  /** Picked an emoji or reaction. */
  pop: () => blip([1200], 0, 0.06, 0.06),
}
