import type { Directive } from 'vue'
import { reducedMotion } from '@/lib/motion'

/** v-ripple: Material-style ink ripple from the pointer position. */
export const vRipple: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value === false) return
    el.classList.add('ripple-host')
    const onDown = (e: PointerEvent) => {
      if (reducedMotion() || e.button !== 0) return
      const rect = el.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 2
      const ink = document.createElement('span')
      ink.className = 'ripple-ink'
      ink.style.width = ink.style.height = `${size}px`
      ink.style.left = `${e.clientX - rect.left - size / 2}px`
      ink.style.top = `${e.clientY - rect.top - size / 2}px`
      el.appendChild(ink)
      const release = () => {
        ink.classList.add('ripple-out')
        setTimeout(() => ink.remove(), 400)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', release)
      }
      window.addEventListener('pointerup', release)
      window.addEventListener('pointercancel', release)
    }
    el.addEventListener('pointerdown', onDown)
    ;(el as HTMLElement & { _ripple?: typeof onDown })._ripple = onDown
  },
  unmounted(el) {
    const h = (el as HTMLElement & { _ripple?: (e: PointerEvent) => void })._ripple
    if (h) el.removeEventListener('pointerdown', h)
  },
}
