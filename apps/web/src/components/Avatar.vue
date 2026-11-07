<script setup lang="ts">
import { computed } from 'vue'
import { colorFor, initials } from '@/lib/format'

const props = withDefaults(defineProps<{ id: string; name: string; url?: string | null; size?: number; online?: boolean }>(), { size: 48 })
const bg = computed(() => `linear-gradient(135deg, ${colorFor(props.id)}, color-mix(in srgb, ${colorFor(props.id)} 70%, #000))`)
</script>

<template>
  <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }">
    <img v-if="url" :src="url" :alt="name" loading="lazy" />
    <span v-else class="initials" :style="{ background: bg }">{{ initials(name) }}</span>
    <Transition name="pop"><i v-if="online" class="dot" /></Transition>
  </span>
</template>

<style scoped>
.avatar { position: relative; flex: none; display: inline-block; }
img, .initials { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.initials { display: grid; place-items: center; color: #fff; font-weight: 600; user-select: none; }
.dot {
  position: absolute; right: 1px; bottom: 1px; width: 28%; height: 28%; max-width: 14px; max-height: 14px;
  border-radius: 50%; background: var(--online); border: 2px solid var(--surface);
}
</style>
