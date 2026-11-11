<script setup lang="ts">
/**
 * Crop / reposition a picture before it's used.
 *   mode "send"   – photo for a chat: free choice of shape (original, square, 4:3, 3:4, 16:9)
 *   mode "avatar" – profile / group picture: round, square output
 * Drag to move, wheel / pinch / slider to zoom, rotate in 90° steps.
 * Emits `done(blob)`; in "send" mode an untouched picture emits `done(null)` (send the original).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{ file: Blob; mode: 'send' | 'avatar' }>()
const emit = defineEmits<{ done: [blob: Blob | null]; cancel: [] }>()

const url = URL.createObjectURL(props.file)
const img = ref<HTMLImageElement | null>(null)
const natural = ref({ w: 0, h: 0 })
const stage = ref<HTMLElement | null>(null)
const stageSize = ref({ w: 0, h: 0 })

const rotation = ref(0)
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const busy = ref(false)

type Aspect = 'original' | '1' | '4/3' | '3/4' | '16/9'
const aspect = ref<Aspect>(props.mode === 'avatar' ? '1' : 'original')
const ASPECTS: { key: Aspect; label: string }[] = [
  { key: 'original', label: '' }, { key: '1', label: '1:1' }, { key: '4/3', label: '4:3' },
  { key: '3/4', label: '3:4' }, { key: '16/9', label: '16:9' },
]

/** Image size after rotation. */
const rotated = computed(() => (rotation.value % 180 ? { w: natural.value.h, h: natural.value.w } : { w: natural.value.w, h: natural.value.h }))
const ratio = computed(() => {
  if (aspect.value === 'original') return rotated.value.w / Math.max(1, rotated.value.h)
  const [a, b] = aspect.value.split('/').map(Number)
  return a / (b || 1)
})
/** The crop frame, fitted into the stage. */
const frame = computed(() => {
  const pad = 28
  const sw = Math.max(1, stageSize.value.w - pad * 2)
  const sh = Math.max(1, stageSize.value.h - pad * 2)
  return sw / sh > ratio.value ? { w: sh * ratio.value, h: sh } : { w: sw, h: sw / ratio.value }
})
const minScale = computed(() => Math.max(frame.value.w / Math.max(1, rotated.value.w), frame.value.h / Math.max(1, rotated.value.h)))
const scale = computed(() => minScale.value * zoom.value)

function clamp(o: { x: number; y: number }) {
  const mx = Math.max(0, (rotated.value.w * scale.value - frame.value.w) / 2)
  const my = Math.max(0, (rotated.value.h * scale.value - frame.value.h) / 2)
  return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) }
}
watch([scale, frame], () => (offset.value = clamp(offset.value)))

const touched = computed(() => rotation.value !== 0 || zoom.value !== 1 || aspect.value !== 'original' || offset.value.x !== 0 || offset.value.y !== 0)

const imgStyle = computed(() => ({
  width: `${natural.value.w}px`,
  height: `${natural.value.h}px`,
  transform: `translate(-50%, -50%) translate(${offset.value.x}px, ${offset.value.y}px) rotate(${rotation.value}deg) scale(${scale.value})`,
}))

// ---- gestures ------------------------------------------------------------------
const pointers = new Map<number, { x: number; y: number }>()
let pinch = 0
let pinchZoom = 1
const dragging = ref(false)

function down(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  dragging.value = true
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = Math.hypot(a.x - b.x, a.y - b.y)
    pinchZoom = zoom.value
  }
}
function move(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  const cur = { x: e.clientX, y: e.clientY }
  pointers.set(e.pointerId, cur)
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()]
    setZoom(pinchZoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch))
  } else if (pointers.size === 1) {
    offset.value = clamp({ x: offset.value.x + cur.x - prev.x, y: offset.value.y + cur.y - prev.y })
  }
}
function up(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = 0
  if (!pointers.size) dragging.value = false
}
function wheel(e: WheelEvent) {
  setZoom(zoom.value * Math.exp(-e.deltaY * 0.0015))
}
function setZoom(z: number) {
  zoom.value = Math.min(5, Math.max(1, z))
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360
  offset.value = { x: 0, y: 0 }
}
function reset() {
  rotation.value = 0
  zoom.value = 1
  offset.value = { x: 0, y: 0 }
  aspect.value = props.mode === 'avatar' ? '1' : 'original'
}

// ---- output -----------------------------------------------------------------
async function finish() {
  if (props.mode === 'send' && !touched.value) return emit('done', null)
  const el = img.value
  if (!el) return
  busy.value = true
  try {
    const s = scale.value
    const cropW = frame.value.w / s
    const cropH = frame.value.h / s
    const x0 = rotated.value.w / 2 - (frame.value.w / 2 + offset.value.x) / s
    const y0 = rotated.value.h / 2 - (frame.value.h / 2 + offset.value.y) / s
    const max = props.mode === 'avatar' ? 512 : 1920
    const k = Math.min(1, max / Math.max(cropW, cropH))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(cropW * k))
    canvas.height = Math.max(1, Math.round(cropH * k))
    const g = canvas.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.scale(k, k)
    g.translate(-x0, -y0)
    g.translate(rotated.value.w / 2, rotated.value.h / 2)
    g.rotate((rotation.value * Math.PI) / 180)
    g.drawImage(el, -natural.value.w / 2, -natural.value.h / 2)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
    emit('done', blob)
  } finally {
    busy.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
  else if (e.key === 'Enter') void finish()
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([entry]) => (stageSize.value = { w: entry.contentRect.width, h: entry.contentRect.height }))
  if (stage.value) ro.observe(stage.value)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  document.removeEventListener('keydown', onKey)
  URL.revokeObjectURL(url)
})
</script>

<template>
  <Teleport to="body">
    <div class="cropper" role="dialog" aria-modal="true" :aria-label="$t('crop.title')">
      <header class="bar">
        <button class="round" :title="$t('common.cancel')" @click="emit('cancel')"><Icon name="close" /></button>
        <b>{{ $t(mode === 'avatar' ? 'crop.avatarTitle' : 'crop.title') }}</b>
        <button class="round" :title="$t('crop.reset')" :disabled="!touched" @click="reset"><Icon name="rotate" :size="20" style="transform: scaleX(-1)" /></button>
      </header>

      <div
        ref="stage" class="stage" :class="{ dragging }"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel.prevent="wheel"
      >
        <img
          ref="img" :src="url" alt="" draggable="false" :style="imgStyle"
          @load="natural = { w: img!.naturalWidth, h: img!.naturalHeight }"
        />
        <div class="frame" :class="{ round: mode === 'avatar' }" :style="{ width: frame.w + 'px', height: frame.h + 'px' }">
          <i class="g v1" /><i class="g v2" /><i class="g h1" /><i class="g h2" />
        </div>
      </div>

      <footer class="tools">
        <div v-if="mode === 'send'" class="aspects">
          <button v-for="a in ASPECTS" :key="a.key" :class="{ on: aspect === a.key }" @click="aspect = a.key">
            {{ a.label || $t('crop.original') }}
          </button>
        </div>
        <div class="zoom-row">
          <Icon name="image" :size="16" class="muted" />
          <input type="range" min="1" max="5" step="0.01" :value="zoom" :aria-label="$t('crop.zoom')" @input="setZoom(+($event.target as HTMLInputElement).value)" />
          <Icon name="image" :size="24" class="muted" />
          <button class="round soft" :title="$t('crop.rotate')" @click="rotate"><Icon name="rotate" :size="20" /></button>
        </div>
        <button class="btn block go" :disabled="busy || !natural.w" @click="finish">
          <span v-if="busy" class="spinner" /><Icon v-else :name="mode === 'avatar' ? 'check' : 'send'" :size="20" />
          {{ $t(mode === 'avatar' ? 'crop.save' : 'crop.send') }}
        </button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.cropper {
  position: fixed; inset: 0; z-index: 400; display: flex; flex-direction: column; background: #0c1117; color: #fff;
  animation: fade-in 0.2s ease;
}
@keyframes fade-in { from { opacity: 0; } }
.bar { display: flex; align-items: center; gap: 8px; padding: calc(8px + var(--safe-top)) 10px 8px; }
.bar b { flex: 1; text-align: center; font-size: 17px; }
.round { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.round:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
.round:disabled { opacity: 0.35; }
.round.soft { background: rgba(255, 255, 255, 0.12); flex: none; }

.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; }
.stage.dragging { cursor: grabbing; }
.stage img { position: absolute; left: 50%; top: 50%; max-width: none; transform-origin: center; pointer-events: none; }
.stage:not(.dragging) img { transition: transform 0.18s ease-out; }
.frame {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(8, 12, 18, 0.62); outline: 2px solid rgba(255, 255, 255, 0.9);
}
.frame.round { border-radius: 50%; }
.g { position: absolute; background: rgba(255, 255, 255, 0.35); opacity: 0; transition: opacity 0.2s; }
.dragging .g { opacity: 1; }
.frame.round .g { display: none; }
.v1, .v2 { top: 0; bottom: 0; width: 1px; }
.h1, .h2 { left: 0; right: 0; height: 1px; }
.v1 { left: 33.33%; } .v2 { left: 66.66%; } .h1 { top: 33.33%; } .h2 { top: 66.66%; }

.tools { display: grid; gap: 12px; width: min(520px, 100%); margin: 0 auto; padding: 12px 16px calc(16px + var(--safe-bottom)); }
.aspects { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.aspects button { height: 32px; padding: 0 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.1); color: #fff; font-size: 13px; font-weight: 600; }
.aspects button.on { background: #fff; color: #0c1117; }
.zoom-row { display: flex; align-items: center; gap: 10px; }
.zoom-row input { flex: 1; accent-color: var(--accent); }
.muted { opacity: 0.6; }
.go { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; font-size: 16px; }
.go .spinner { width: 18px; height: 18px; border-width: 2px; }
</style>
