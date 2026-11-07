export function reducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function vibrate(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}
