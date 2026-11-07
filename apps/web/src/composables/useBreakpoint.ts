import { onScopeDispose, ref } from 'vue'

const QUERY = '(min-width: 900px)'
const wide = ref(typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches)
let bound = false

/** true when the two-pane (desktop/tablet) layout is active. */
export function useWide() {
  if (!bound) {
    bound = true
    matchMedia(QUERY).addEventListener('change', (e) => (wide.value = e.matches))
  }
  onScopeDispose(() => {})
  return wide
}
