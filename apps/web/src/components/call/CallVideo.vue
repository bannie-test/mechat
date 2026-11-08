<script setup lang="ts">
/** <video> bound to a MediaStream (Vue can't bind srcObject as an attribute). Always muted: audio plays elsewhere. */
import { ref, watch } from 'vue'

const props = defineProps<{ stream: MediaStream | null; mirror?: boolean; contain?: boolean }>()
const el = ref<HTMLVideoElement | null>(null)
const ready = ref(false)

watch(
  [el, () => props.stream],
  ([v, s]) => {
    if (!v) return
    if (v.srcObject !== s) {
      v.srcObject = s
      ready.value = false
    }
    if (s) void v.play().catch(() => {})
  },
  { immediate: true },
)

defineExpose({ el, ready })
</script>

<template>
  <video
    ref="el" class="cv" :class="{ mirror, contain, ready }" autoplay playsinline muted
    @loadeddata="ready = true" @resize="ready = true"
  />
</template>

<style scoped>
.cv { width: 100%; height: 100%; object-fit: cover; display: block; background: transparent; opacity: 0; transition: opacity 0.3s; }
.cv.ready { opacity: 1; }
.cv.contain { object-fit: contain; }
.cv.mirror { transform: scaleX(-1); }
</style>
