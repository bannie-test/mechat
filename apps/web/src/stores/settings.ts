import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { i18n } from '@/i18n'
import { reducedMotion } from '@/lib/motion'
import { resizeImage } from '@/lib/storage'
import { setSoundEnabled } from '@/lib/sound'
import { DEFAULT_REACTIONS } from '@/lib/emoji'
import type { Locale } from '@/lib/types'

export type ThemePref = 'light' | 'dark' | 'system'

function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch {
    return false // private mode or storage full
  }
}

/** Readable text color on top of `hex`. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0b1520' : '#ffffff'
}

function readList(key: string, fallback: string[]) {
  try {
    const v = JSON.parse(read(key) ?? 'null')
    return Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length ? v : fallback
  } catch {
    return fallback
  }
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

  // ---- sounds --------------------------------------------------------------
  const sound = ref(read('iemanchat.sound') !== 'off')
  watch(sound, (on) => {
    setSoundEnabled(on)
    write('iemanchat.sound', on ? 'on' : 'off')
  }, { immediate: true })

  // ---- quick reactions (5, editable) ---------------------------------------
  const quickReactions = ref<string[]>(readList('iemanchat.reactions', DEFAULT_REACTIONS).slice(0, 5))
  function setQuickReaction(i: number, emoji: string) {
    const next = [...quickReactions.value]
    const dup = next.indexOf(emoji)
    if (dup >= 0 && dup !== i) next[dup] = next[i] // swap instead of listing an emoji twice
    next[i] = emoji
    quickReactions.value = next
    write('iemanchat.reactions', JSON.stringify(next))
  }
  function resetQuickReactions() {
    quickReactions.value = [...DEFAULT_REACTIONS]
    write('iemanchat.reactions', null)
  }

  // ---- accent color --------------------------------------------------------
  const accent = ref<string | null>(read('iemanchat.accent'))
  watch(accent, (c) => {
    const root = document.documentElement
    if (c && /^#[0-9a-f]{6}$/i.test(c)) {
      root.dataset.accent = ''
      root.style.setProperty('--custom-accent', c)
      root.style.setProperty('--custom-on-accent', onColor(c))
    } else {
      delete root.dataset.accent
      root.style.removeProperty('--custom-accent')
      root.style.removeProperty('--custom-on-accent')
    }
  }, { immediate: true })
  function setAccent(c: string | null) {
    accent.value = c
    write('iemanchat.accent', c)
  }

  // ---- chat background -----------------------------------------------------
  const wallpaper = ref<string | null>(read('iemanchat.wallpaper'))
  /** Resizes the picture and keeps it on this device. Returns false if it doesn't fit in storage. */
  async function setWallpaper(file: File | null) {
    if (!file) {
      wallpaper.value = null
      write('iemanchat.wallpaper', null)
      return true
    }
    const { blob } = await resizeImage(file, 1600, 0.78)
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error)
      r.readAsDataURL(blob)
    })
    if (!write('iemanchat.wallpaper', url)) return false
    wallpaper.value = url
    return true
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

  return {
    themePref, locale, isDark, setTheme, toggleTheme, setLocale, themeForMiniApp,
    sound, quickReactions, setQuickReaction, resetQuickReactions,
    accent, setAccent, wallpaper, setWallpaper,
  }
})
