import type { Locale } from './types'

const tag = (l: Locale) => (l === 'vi' ? 'vi-VN' : 'en-US')

export function formatTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(tag(locale), { hour: '2-digit', minute: '2-digit' })
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Chat list timestamp: time today, weekday this week, else date. */
export function formatListTime(iso: string, locale: Locale) {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return formatTime(iso, locale)
  const diffDays = (now.getTime() - d.getTime()) / 86400000
  if (diffDays < 6) return d.toLocaleDateString(tag(locale), { weekday: 'short' })
  return d.toLocaleDateString(tag(locale), { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' })
}

export function formatDay(iso: string, locale: Locale, today: string, yesterday: string) {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return today
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (isSameDay(d, y)) return yesterday
  return d.toLocaleDateString(tag(locale), {
    day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(sec = 0) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Stable avatar color from an id. */
const COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774']
export function colorFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export type Segment = { text: string; href?: string }
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g
export function linkify(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i) })
    out.push({ text: m[0], href: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function isOnlyEmoji(text: string) {
  const t = text.trim()
  if (!t || t.length > 12) return false
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t)
}
