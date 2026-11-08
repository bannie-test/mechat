<script setup lang="ts">
/** Rain falling over the chat for a few seconds (thunder flashes too when it's a storm). */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { reducedMotion } from '@/lib/motion'

const props = withDefaults(defineProps<{ storm?: boolean; duration?: number }>(), { storm: false, duration: 5000 })
const emit = defineEmits<{ done: [] }>()

const leaving = ref(false)
const count = reducedMotion() ? 0 : props.storm ? 130 : 90
const drops = Array.from({ length: count }, () => ({
  left: Math.random() * 104 - 2,
  delay: -Math.random() * 1.2,
  dur: 0.45 + Math.random() * 0.4,
  len: 14 + Math.random() * 18,
  op: 0.35 + Math.random() * 0.45,
}))

let t1 = 0
let t2 = 0
onMounted(() => {
  t1 = window.setTimeout(() => (leaving.value = true), props.duration - 600)
  t2 = window.setTimeout(() => emit('done'), props.duration)
})
onBeforeUnmount(() => {
  window.clearTimeout(t1)
  window.clearTimeout(t2)
})
</script>

<template>
  <div class="rain" :class="{ leaving, storm }" aria-hidden="true">
    <div class="tint" />
    <i
      v-for="(d, i) in drops" :key="i"
      :style="{ left: d.left + '%', height: d.len + 'px', opacity: d.op, animationDelay: d.delay + 's', animationDuration: d.dur + 's' }"
    />
    <div v-if="storm" class="flash" />
  </div>
</template>

<style scoped>
.rain { position: absolute; inset: 0; z-index: 25; pointer-events: none; overflow: hidden; transition: opacity 0.6s; }
.rain.leaving { opacity: 0; }
.tint { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(40, 60, 90, 0.28), rgba(40, 60, 90, 0.08)); animation: tint-in 0.6s ease; }
.storm .tint { background: linear-gradient(180deg, rgba(25, 20, 50, 0.42), rgba(25, 20, 50, 0.14)); }
@keyframes tint-in { from { opacity: 0; } }
i {
  position: absolute; top: -40px; width: 1.6px; border-radius: 1px;
  background: linear-gradient(180deg, transparent, rgba(200, 225, 255, 0.95));
  transform: rotate(12deg); animation: fall linear infinite;
}
@keyframes fall { to { transform: translate(-22vh, 112vh) rotate(12deg); } }
.flash { position: absolute; inset: 0; background: #fff; opacity: 0; animation: thunder 5s linear; }
@keyframes thunder {
  0%, 18% { opacity: 0; } 19% { opacity: 0.75; } 21% { opacity: 0; } 23% { opacity: 0.5; } 26%, 62% { opacity: 0; }
  63% { opacity: 0.6; } 66%, 100% { opacity: 0; }
}
</style>
