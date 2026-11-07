<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatDuration } from '@/lib/format'
import { useAttachmentUrl } from '@/composables/useSignedUrl'
import type { Attachment } from '@/lib/types'
import Icon from './Icon.vue'

const props = defineProps<{ attachment: Attachment | null; localUrl?: string; mine: boolean }>()
const src = useAttachmentUrl(() => ({ attachment: props.attachment, localUrl: props.localUrl }))

const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const progress = ref(0)
const current = ref(0)
const bars = computed(() => props.attachment?.waveform?.length ? props.attachment.waveform : Array(40).fill(0.3))
const duration = computed(() => props.attachment?.duration ?? 0)

// Only one voice note plays at a time.
const onOtherPlay = (e: Event) => {
  if ((e as CustomEvent).detail !== audio.value) audio.value?.pause()
}
window.addEventListener('iemanchat:voice-play', onOtherPlay)
async function toggle() {
  const a = audio.value
  if (!a || !src.value) return
  if (a.paused) {
    window.dispatchEvent(new CustomEvent('iemanchat:voice-play', { detail: a }))
    await a.play().catch(() => {})
  } else a.pause()
}
function onTime() {
  const a = audio.value!
  current.value = a.currentTime
  const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration.value
  progress.value = d ? Math.min(1, a.currentTime / d) : 0
}
function seek(e: MouseEvent) {
  const a = audio.value
  if (!a) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration.value
  a.currentTime = ((e.clientX - rect.left) / rect.width) * d
}
onBeforeUnmount(() => {
  audio.value?.pause()
  window.removeEventListener('iemanchat:voice-play', onOtherPlay)
})
</script>

<template>
  <div class="voice" :class="{ mine }" data-no-swipe>
    <button class="play" :disabled="!src" @click.stop="toggle">
      <Icon :name="playing ? 'pause' : 'play'" :size="26" />
    </button>
    <div class="body">
      <div class="wave" @click.stop="seek">
        <i
          v-for="(v, i) in bars" :key="i"
          :class="{ on: i / bars.length < progress }"
          :style="{ height: Math.max(3, v * 22) + 'px' }"
        />
      </div>
      <small>{{ formatDuration(playing || current ? current : duration) }}</small>
    </div>
    <audio
      v-if="src" ref="audio" :src="src" preload="metadata"
      @play="playing = true" @pause="playing = false" @ended="playing = false; progress = 0; current = 0"
      @timeupdate="onTime"
    />
  </div>
</template>

<style scoped>
.voice { display: flex; align-items: center; gap: 10px; min-width: 220px; padding: 2px 0; }
.play { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; flex: none; }
.mine .play { background: var(--bubble-out-meta); color: var(--bubble-out); }
.body { flex: 1; display: grid; gap: 2px; }
.wave { display: flex; align-items: center; gap: 2px; height: 24px; cursor: pointer; }
.wave i { width: 3px; border-radius: 2px; background: currentColor; opacity: 0.35; transition: opacity 0.1s; }
.wave i.on { opacity: 1; color: var(--accent); }
.mine .wave i.on { color: var(--bubble-out-meta); }
small { font-size: 12px; color: var(--bubble-meta); }
.mine small { color: var(--bubble-out-meta); }
</style>
