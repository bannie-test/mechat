<script setup lang="ts">
/**
 * Enter a 6-digit code by shooting numbered balloons with a cannon.
 * Easy on purpose: tapping a balloon always hits it (the ball homes in), every digit 0–9 is
 * always on screen, and a popped balloon re-inflates so digits can repeat.
 * Keyboard digits / Backspace and pasting a code also work.
 */
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { vibrate } from '@/lib/motion'

const LEN = 6
const props = defineProps<{ modelValue: string; disabled?: boolean; shake?: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const W = 320
const H = 350
const ROPE_Y = 10
const PIVOT = { x: 160, y: 328 }
const SPEED = 700
const BARREL = 44
const R = 23 // balloon radius (x); y radius is R * 1.18
const COLORS = ['#ff6b6b', '#ff922b', '#fcc419', '#51cf66', '#20c997', '#339af0', '#5c7cfa', '#cc5de8', '#f06595', '#94d82d']

/** Balloon slots: 4 / 3 / 3, hanging from the rope. */
const SLOTS: [number, number][] = [
  [48, 52], [123, 52], [197, 52], [272, 52],
  [86, 112], [160, 112], [234, 112],
  [48, 172], [160, 178], [272, 172],
]

interface Balloon { digit: string; ax: number; len: number; phase: number; color: string; popped: boolean; respawnAt: number; inflate: number }
interface Ball { id: number; x: number; y: number; vx: number; vy: number; target: number | null; slot: number | null; trail: { x: number; y: number }[] }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number; kind: 'shard' | 'smoke' | 'text'; text?: string }

function shuffled<T>(a: T[]) {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const digits = shuffled(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
const balloons = reactive<Balloon[]>(SLOTS.map(([x, y], i) => ({
  digit: digits[i], ax: x, len: y - ROPE_Y, phase: Math.random() * Math.PI * 2,
  color: COLORS[Number(digits[i])], popped: false, respawnAt: 0, inflate: 0,
})))
const balls = reactive<Ball[]>([])
const particles = reactive<Particle[]>([])
const slots = reactive<(string | null)[]>(Array(LEN).fill(null))
const reserved = ref(0)
const angle = ref(0) // degrees from vertical
const recoil = ref(0)
/** Time until which the dotted aim line shows (after a shot, or while hovering with a mouse). */
const aimUntil = ref(0)
const time = ref(0)
const shaking = ref(false)
const svg = ref<SVGSVGElement | null>(null)
let uid = 0

/** Current centre of a balloon (gentle sway + bob). */
function pos(b: Balloon, t = time.value) {
  const amp = (5 + b.len * 0.03) / b.len
  const a = amp * Math.sin(t * 1.25 + b.phase)
  return { x: b.ax + b.len * Math.sin(a), y: ROPE_Y + b.len * Math.cos(a) + 2 * Math.sin(t * 1.9 + b.phase) }
}

function emitCode() {
  let s = ''
  for (const d of slots) {
    if (d === null) break
    s += d
  }
  if (s !== props.modelValue) emit('update:modelValue', s)
}

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------
function aimAt(x: number, y: number) {
  const deg = (Math.atan2(x - PIVOT.x, PIVOT.y - y) * 180) / Math.PI
  angle.value = Math.max(-72, Math.min(72, deg))
}

function fire(target: number | null, tx: number, ty: number) {
  if (props.disabled) return
  if (target !== null && reserved.value >= LEN) {
    shake()
    return
  }
  aimAt(tx, ty)
  const rad = (angle.value * Math.PI) / 180
  const dir = { x: Math.sin(rad), y: -Math.cos(rad) }
  const x = PIVOT.x + dir.x * BARREL
  const y = PIVOT.y + dir.y * BARREL
  balls.push({ id: uid++, x, y, vx: dir.x * SPEED, vy: dir.y * SPEED, target, slot: target === null ? null : reserved.value++, trail: [] })
  aimUntil.value = time.value + 0.35
  recoil.value = 1
  for (let i = 0; i < 5; i++) {
    particles.push({
      id: uid++, x, y, vx: dir.x * 60 + (Math.random() - 0.5) * 60, vy: dir.y * 60 + (Math.random() - 0.5) * 60,
      life: 0, max: 0.45, color: '#c8ced8', r: 5 + Math.random() * 4, kind: 'smoke',
    })
  }
  vibrate(6)
}

function fireDigit(d: string) {
  const i = balloons.findIndex((b) => b.digit === d)
  if (i < 0) return
  const p = pos(balloons[i])
  fire(i, p.x, p.y)
}

function hit(ball: Ball) {
  const b = balloons[ball.target!]
  const p = pos(b)
  b.popped = true
  b.respawnAt = time.value + 0.55
  b.inflate = 0
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4
    const v = 120 + Math.random() * 140
    particles.push({ id: uid++, x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 0.7, color: b.color, r: 3 + Math.random() * 3, kind: 'shard' })
  }
  particles.push({ id: uid++, x: p.x, y: p.y, vx: 0, vy: -70, life: 0, max: 0.8, color: b.color, r: 0, kind: 'text', text: b.digit })
  if (ball.slot !== null) slots[ball.slot] = b.digit
  vibrate(10)
  emitCode()
  if (slots.every((d) => d !== null)) celebrate()
}

/** All six in: pop the rest in a ripple for a little firework. */
function celebrate() {
  vibrate(25)
  balloons.forEach((b, i) => {
    setTimeout(() => {
      if (b.popped) return
      const p = pos(b)
      b.popped = true
      b.respawnAt = time.value + 1.4
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2
        const v = 80 + Math.random() * 160
        particles.push({ id: uid++, x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.9, color: COLORS[(i + k) % 10], r: 3 + Math.random() * 3, kind: 'shard' })
      }
    }, 120 + i * 45)
  })
}

function back() {
  if (reserved.value === 0 || balls.some((b) => b.slot !== null)) return
  reserved.value--
  slots[reserved.value] = null
  emitCode()
  vibrate(5)
}

function reset() {
  balls.splice(0)
  for (let i = 0; i < LEN; i++) slots[i] = null
  reserved.value = 0
}

function shake() {
  shaking.value = false
  requestAnimationFrame(() => (shaking.value = true))
  setTimeout(() => (shaking.value = false), 450)
}

// Parent cleared the code (wrong code) → start over with a shake.
watch(() => props.modelValue, (v) => { if (v === '' && reserved.value) reset() })
watch(() => props.shake, () => shake())

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function toSvg(e: PointerEvent) {
  const m = svg.value?.getScreenCTM()
  if (!m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

function onDown(e: PointerEvent) {
  const p = toSvg(e)
  if (!p) return
  // Generous hit area: nearest balloon within ~1.5 radii counts.
  let best = -1
  let bestD = (R * 1.6) ** 2
  balloons.forEach((b, i) => {
    const c = pos(b)
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
    if (d < bestD) { best = i; bestD = d }
  })
  if (best >= 0) {
    const c = pos(balloons[best])
    fire(best, c.x, c.y)
  } else if (p.y < PIVOT.y - 20) fire(null, p.x, p.y)
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const p = toSvg(e)
  if (!p) return
  aimAt(p.x, p.y)
  aimUntil.value = time.value + 0.6
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault()
    fireDigit(e.key)
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    back()
  }
}

function onPaste(e: ClipboardEvent) {
  const d = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '')
  if (d.length < LEN) return
  e.preventDefault()
  reset()
  // Fire them in quick succession so it still looks like a volley.
  d.slice(0, LEN).split('').forEach((ch, i) => setTimeout(() => fireDigit(ch), i * 110))
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let raf = 0
let last = 0
function frame(now: number) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
  last = now
  time.value += dt
  const t = time.value

  recoil.value = Math.max(0, recoil.value - dt * 5)

  for (const b of balloons) {
    if (b.popped && t >= b.respawnAt) b.popped = false
    if (!b.popped && b.inflate < 1) b.inflate = Math.min(1, b.inflate + dt * 3)
  }

  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i]
    if (ball.target !== null) {
      const c = pos(balloons[ball.target])
      const dx = c.x - ball.x
      const dy = c.y - ball.y
      const dist = Math.hypot(dx, dy)
      if (dist < R) {
        hit(ball)
        balls.splice(i, 1)
        continue
      }
      ball.vx = (dx / dist) * SPEED
      ball.vy = (dy / dist) * SPEED
    } else {
      ball.vy += 900 * dt
    }
    ball.trail.unshift({ x: ball.x, y: ball.y })
    if (ball.trail.length > 6) ball.trail.pop()
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt
    if (ball.x < -20 || ball.x > W + 20 || ball.y < -20 || ball.y > H + 20) balls.splice(i, 1)
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life += dt
    if (p.life >= p.max) {
      particles.splice(i, 1)
      continue
    }
    if (p.kind === 'shard') p.vy += 500 * dt
    if (p.kind === 'smoke') { p.vx *= 0.92; p.vy *= 0.92; p.r += dt * 14 }
    p.x += p.vx * dt
    p.y += p.vy * dt
  }

  raf = requestAnimationFrame(frame)
}

function onVisibility() {
  cancelAnimationFrame(raf)
  last = 0
  if (!document.hidden) raf = requestAnimationFrame(frame)
}

onMounted(() => {
  raf = requestAnimationFrame(frame)
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPaste)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('paste', onPaste)
  document.removeEventListener('visibilitychange', onVisibility)
})

const ease = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2) // slight overshoot
</script>

<template>
  <div class="game" :class="{ shaking }">
    <div class="slots" role="status" :aria-label="modelValue">
      <span
        v-for="(d, i) in slots" :key="i" class="slot"
        :class="{ filled: d !== null, pending: d === null && i < reserved, next: i === reserved && !disabled }"
      >
        <Transition name="digit"><b v-if="d !== null" :key="d">{{ d }}</b></Transition>
      </span>
      <button type="button" class="back" :disabled="reserved === 0 || disabled" :aria-label="$t('login.game.back')" @click="back">⌫</button>
    </div>

    <svg
      ref="svg" class="arena" :class="{ off: disabled }" :viewBox="`0 0 ${W} ${H}`"
      @pointerdown.prevent="onDown" @pointermove="onMove"
    >
      <!-- rope -->
      <path :d="`M0 ${ROPE_Y + 2} Q${W / 2} ${ROPE_Y + 12} ${W} ${ROPE_Y + 2}`" class="rope" />
      <!-- strings -->
      <template v-for="(b, i) in balloons" :key="'s' + i">
        <line
          v-if="!b.popped" :x1="b.ax" :y1="ROPE_Y + 5" :x2="pos(b, time).x" :y2="pos(b, time).y - R * 1.18 * ease(b.inflate)"
          class="string"
        />
      </template>
      <!-- balloons -->
      <g
        v-for="(b, i) in balloons" v-show="!b.popped" :key="'b' + i" class="balloon"
        :transform="`translate(${pos(b, time).x} ${pos(b, time).y}) scale(${ease(b.inflate)})`"
      >
        <path :d="`M-4 ${-R * 1.18 - 5}h8l-4 6z`" :fill="b.color" />
        <ellipse :rx="R" :ry="R * 1.18" :fill="b.color" />
        <ellipse cx="-8" cy="-10" rx="5" ry="9" fill="#fff" opacity="0.35" transform="rotate(20 -8 -10)" />
        <text y="9" text-anchor="middle" class="num">{{ b.digit }}</text>
      </g>
      <!-- particles -->
      <template v-for="p in particles" :key="p.id">
        <circle v-if="p.kind !== 'text'" :cx="p.x" :cy="p.y" :r="p.r" :fill="p.color" :opacity="1 - p.life / p.max" />
        <text v-else :x="p.x" :y="p.y" text-anchor="middle" class="float" :fill="p.color" :opacity="1 - p.life / p.max">{{ p.text }}</text>
      </template>
      <!-- balls with a short trail -->
      <g v-for="b in balls" :key="b.id">
        <circle v-for="(p, k) in b.trail" :key="k" :cx="p.x" :cy="p.y" :r="6 - k * 0.8" class="trail" :opacity="0.4 - k * 0.06" />
        <circle :cx="b.x" :cy="b.y" r="7" class="ball" />
      </g>
      <!-- ground the cannon stands on -->
      <path :d="`M0 ${H - 10}Q${W / 2} ${PIVOT.y - 22} ${W} ${H - 10}V${H}H0z`" class="ground" />
      <!-- dotted aim line -->
      <line
        v-if="aimUntil > time" class="aim" :opacity="Math.min(1, (aimUntil - time) * 3)"
        :x1="PIVOT.x + Math.sin(angle * Math.PI / 180) * (BARREL + 8)" :y1="PIVOT.y - Math.cos(angle * Math.PI / 180) * (BARREL + 8)"
        :x2="PIVOT.x + Math.sin(angle * Math.PI / 180) * (BARREL + 90)" :y2="PIVOT.y - Math.cos(angle * Math.PI / 180) * (BARREL + 90)"
      />
      <!-- cannon -->
      <g :transform="`translate(${PIVOT.x} ${PIVOT.y})`">
        <g :transform="`rotate(${angle})`" class="barrel">
          <rect x="-11" :y="-BARREL + recoil * 8" width="22" :height="BARREL" rx="7" />
          <rect x="-13" :y="-BARREL + recoil * 8" width="26" height="9" rx="4" class="lip" />
        </g>
        <path d="M-30 12a30 30 0 0 1 60 0z" class="base" />
        <circle cx="-20" cy="10" r="7" class="wheel" />
        <circle cx="20" cy="10" r="7" class="wheel" />
      </g>
    </svg>
    <p class="hint muted">{{ $t('login.game.hint') }}</p>
  </div>
</template>

<style scoped>
.game { display: grid; gap: 8px; }
.shaking { animation: shake 0.42s; }
@keyframes shake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
.slots { display: flex; gap: 6px; justify-content: center; align-items: center; }
.slot {
  position: relative; width: 38px; height: 46px; border-radius: 10px; display: grid; place-items: center;
  border: 2px solid var(--border); font: 700 24px ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: border-color 0.2s, background 0.2s;
}
.slot.next { border-color: var(--accent); }
.slot.filled { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.slot.pending::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 0.5s infinite alternate; }
@keyframes pulse { to { transform: scale(0.4); } }
.back { width: 36px; height: 40px; border-radius: 10px; font-size: 20px; color: var(--text-muted); }
.back:disabled { opacity: 0.35; }
.digit-enter-active { animation: digit-in 0.35s cubic-bezier(.2,.9,.3,1.5); }
@keyframes digit-in { from { transform: translateY(-14px) scale(0.3); opacity: 0; } }

.arena { width: 100%; height: auto; display: block; touch-action: manipulation; user-select: none; -webkit-user-select: none; cursor: crosshair; }
.arena.off { pointer-events: none; opacity: 0.7; }
.rope { stroke: var(--text-muted); stroke-width: 2.5; fill: none; opacity: 0.6; }
.string { stroke: var(--text-muted); stroke-width: 1.2; opacity: 0.55; }
.num { font: 800 23px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; fill: #fff; stroke: rgba(0, 0, 0, 0.25); stroke-width: 3; paint-order: stroke; pointer-events: none; }
.float { font: 900 26px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; stroke: #fff; stroke-width: 4; paint-order: stroke; }
.ball { fill: #2b2f3a; stroke: #fff; stroke-width: 2; }
.trail { fill: var(--text-muted); }
.ground { fill: color-mix(in srgb, #51cf66 22%, transparent); }
.aim { stroke: var(--accent); stroke-width: 3; stroke-dasharray: 2 8; stroke-linecap: round; }
.barrel rect { fill: #3b4252; }
.barrel .lip { fill: #2b303b; }
.base { fill: #59627a; }
.wheel { fill: #2b303b; stroke: #8a93a8; stroke-width: 3; }
.hint { margin: 0; text-align: center; font-size: 13px; }
</style>
