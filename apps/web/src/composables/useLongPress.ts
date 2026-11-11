/**
 * Long-press (touch) + right-click (mouse) handler for context menus.
 * When `enabled()` returns false nothing is intercepted (the browser's own menu shows on right-click).
 */
export function onLongPress(el: HTMLElement, cb: (x: number, y: number) => void, ms = 420, enabled: () => boolean = () => true) {
  let timer = 0
  let sx = 0
  let sy = 0
  const clear = () => window.clearTimeout(timer)
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !enabled()) return
    sx = e.clientX
    sy = e.clientY
    timer = window.setTimeout(() => cb(sx, sy), ms)
  }
  const move = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clear()
  }
  const ctx = (e: MouseEvent) => {
    if (!enabled()) return
    e.preventDefault()
    clear()
    cb(e.clientX, e.clientY)
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', clear)
  el.addEventListener('pointercancel', clear)
  el.addEventListener('contextmenu', ctx)
  return () => {
    clear()
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', clear)
    el.removeEventListener('pointercancel', clear)
    el.removeEventListener('contextmenu', ctx)
  }
}
