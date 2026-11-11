<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAttachmentUrl } from '@/composables/useSignedUrl'
import type { Attachment } from '@/lib/types'

const props = defineProps<{ attachment: Attachment | null; localUrl?: string; maxWidth?: number; uploading?: boolean; progress?: number }>()
const emit = defineEmits<{ open: [src: string] }>()
const src = useAttachmentUrl(() => ({ attachment: props.attachment, localUrl: props.localUrl }))
const loaded = ref(false)

const box = computed(() => {
  const w = props.attachment?.width || 320
  const h = props.attachment?.height || 240
  const max = props.maxWidth ?? 320
  const width = Math.min(max, w)
  const height = Math.min(420, Math.max(80, (h / w) * width))
  return { width: `${width}px`, aspectRatio: `${width} / ${height}` }
})
</script>

<template>
  <button class="media" :style="box" @click.stop="src && emit('open', src)">
    <img v-if="src" :src="src" :class="{ loaded }" alt="" loading="lazy" @load="loaded = true" />
    <span v-if="!loaded || uploading" class="shimmer" :class="{ dim: uploading }">
      <span v-if="uploading" class="ring" :style="{ '--p': Math.round((progress ?? 0) * 100) }">
        <small>{{ Math.round((progress ?? 0) * 100) }}%</small>
      </span>
    </span>
  </button>
</template>

<style scoped>
.media { position: relative; display: block; max-width: 100%; border-radius: 12px; overflow: hidden; background: rgba(127, 127, 127, 0.15); }
img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.25s; }
img.loaded { opacity: 1; }
.shimmer { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%) 0 0 / 200% 100%; animation: shimmer 1.2s linear infinite; }
.shimmer.dim { background-color: rgba(0, 0, 0, 0.25); }
.ring { position: relative; width: 46px; height: 46px; display: grid; place-items: center; border-radius: 50%; background: rgba(0, 0, 0, 0.35); }
.ring::before {
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(#fff calc(var(--p) * 1%), rgba(255, 255, 255, 0.25) 0);
  -webkit-mask: radial-gradient(circle, transparent 18px, #000 19px); mask: radial-gradient(circle, transparent 18px, #000 19px);
}
.ring small { position: relative; font-size: 11px; font-weight: 700; color: #fff; }
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
