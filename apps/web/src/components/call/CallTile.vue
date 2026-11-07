<script setup lang="ts">
import { computed, ref } from 'vue'
import { colorFor } from '@/lib/format'
import Avatar from '@/components/Avatar.vue'
import Icon from '@/components/Icon.vue'
import CallVideo from './CallVideo.vue'

const props = defineProps<{
  userId: string
  name: string
  avatarUrl?: string | null
  stream: MediaStream | null
  /** Show the video (camera/screen is on). */
  videoOn: boolean
  screen?: boolean
  mic?: boolean
  speaking?: boolean
  connecting?: boolean
  mirror?: boolean
  label?: string
  /** Large single tile (1:1 call / pinned). */
  big?: boolean
}>()

const video = ref<InstanceType<typeof CallVideo> | null>(null)
const bg = computed(() => `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${colorFor(props.userId)} 55%, #1c2733), #0f1720 75%)`)

/** The <video> element, for screenshots (null if not showing video). */
function videoEl(): HTMLVideoElement | null {
  return props.videoOn && video.value?.ready ? video.value.el : null
}
defineExpose({ videoEl })
</script>

<template>
  <div class="tile" :class="{ speaking, big, screen, off: !videoOn }" :style="{ background: bg }">
    <CallVideo v-if="stream" v-show="videoOn" ref="video" :stream="stream" :mirror="mirror" :contain="screen" />
    <div v-if="!videoOn" class="who">
      <span class="ring" :class="{ on: speaking }"><Avatar :id="userId" :name="name" :url="avatarUrl" :size="big ? 120 : 72" /></span>
    </div>
    <div class="label">
      <Icon v-if="mic === false" name="micOff" :size="15" class="muted-ic" />
      <Icon v-if="screen" name="screenShare" :size="15" />
      <span class="ellipsis">{{ label ?? name }}</span>
    </div>
    <div v-if="connecting" class="connecting"><span class="spinner" /></div>
  </div>
</template>

<style scoped>
.tile {
  position: relative; overflow: hidden; border-radius: 16px; min-height: 0; min-width: 0;
  box-shadow: inset 0 0 0 0 transparent; transition: box-shadow 0.2s;
}
.tile.big { border-radius: 0; }
.tile.speaking { box-shadow: inset 0 0 0 3px #4ade80; }
.tile.screen { background: #000 !important; }
.who { position: absolute; inset: 0; display: grid; place-items: center; }
.ring { position: relative; border-radius: 50%; display: grid; }
.ring::before, .ring::after {
  content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 3px solid #4ade80; opacity: 0; transform: scale(0.9);
}
.ring.on::before { animation: talk 1.2s ease-out infinite; }
.ring.on::after { animation: talk 1.2s ease-out 0.4s infinite; }
@keyframes talk { from { opacity: 0.9; transform: scale(0.95); } to { opacity: 0; transform: scale(1.35); } }
.label {
  position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); display: flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #fff; background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
.big .label { display: none; }
.muted-ic { color: #ff6b6b; }
.connecting { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.25); color: #fff; }
</style>
