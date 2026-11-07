import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { i18n } from '@/i18n'
import { reducedMotion } from '@/lib/motion'
import type { Locale } from '@/lib/types'

export type ThemePref = 'light' | 'dark' | 'system'

function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

export const useSettings = defineStore('settings', () => {
  const themePref = ref<ThemePref>((read('iemanchat.theme') as ThemePref) || 'system')
  const locale = ref<Locale>((read('iemanchat.locale') as Locale) || (navigator.language.startsWith('vi') ? 'vi' : 'en'))
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(mq.matches)
  mq.addEventListener('change', (e) => (systemDark.value = e.matches))

  const isDark = computed(() => themePref.value === 'dark' || (themePref.value === 'system' && systemDark.value))

  function applyTheme(dark: boolean) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17212b' : '#2f88e8')
  }
  watch(isDark, applyTheme, { immediate: true })

  watch(locale, (l) => {
    i18n.global.locale.value = l
    document.documentElement.lang = l
    write('iemanchat.locale', l)
  }, { immediate: true })

  /** Change theme with a circular reveal from the pointer (View Transitions API). */
  function setTheme(pref: ThemePref, origin?: { x: number; y: number }) {
    const nextDark = pref === 'dark' || (pref === 'system' && systemDark.value)
    const commit = () => {
      themePref.value = pref
      write('iemanchat.theme', pref)
      applyTheme(nextDark)
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (!doc.startViewTransition || reducedMotion() || nextDark === isDark.value) return commit()
    const x = origin?.x ?? innerWidth - 40
    const y = origin?.y ?? 40
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const t = doc.startViewTransition(commit)
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 500, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }

  function toggleTheme(e?: MouseEvent) {
    setTheme(isDark.value ? 'light' : 'dark', e ? { x: e.clientX, y: e.clientY } : undefined)
  }

  function setLocale(l: Locale) {
    locale.value = l
  }

  /** Colors handed to mini apps so they match the chat theme. */
  function themeForMiniApp() {
    const s = getComputedStyle(document.documentElement)
    const v = (n: string) => s.getPropertyValue(n).trim()
    return {
      mode: isDark.value ? ('dark' as const) : ('light' as const),
      colors: {
        bg: v('--bg'), surface: v('--surface'), text: v('--text'),
        muted: v('--text-muted'), accent: v('--accent'), accentText: v('--on-accent'),
      },
    }
  }

  return { themePref, locale, isDark, setTheme, toggleTheme, setLocale, themeForMiniApp }
})
