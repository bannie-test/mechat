<script setup lang="ts">
/**
 * System card for /weather (/thời-tiết, /dự-báo). The layout is fixed; only the data from
 * Open-Meteo changes. Seen only by the person who asked, never sent to the chat.
 */
import { computed, watch } from 'vue'
import { describe, isStorm, isWet, type WeatherError, type WeatherReport } from '@/lib/weather'
import type { Message } from '@/lib/types'
import { formatTime } from '@/lib/format'
import { useSettings } from '@/stores/settings'
import Icon from './Icon.vue'

const props = defineProps<{ msg: Message }>()
const emit = defineEmits<{ close: []; retry: []; loaded: [effect: 'rain' | 'storm' | null] }>()
const settings = useSettings()

const state = computed(() => props.msg.attachment?.state as 'loading' | 'ok' | 'error')
const r = computed(() => props.msg.attachment?.report as WeatherReport | undefined)
const error = computed(() => props.msg.attachment?.error as WeatherError | undefined)
const look = computed(() => (r.value ? describe(r.value.code, r.value.isDay) : null))

const theme = computed(() => {
  const w = r.value
  if (!w) return 'neutral'
  if (isStorm(w.code)) return 'storm'
  if (isWet(w.code)) return 'rain'
  if (!w.isDay) return 'night'
  if (w.code <= 2) return 'sunny'
  return 'cloudy'
})

// Fires once, when the forecast arrives (not when the card is shown again later).
watch(state, (s) => {
  const w = r.value
  if (s === 'ok' && w) emit('loaded', isStorm(w.code) ? 'storm' : isWet(w.code) ? 'rain' : null)
  else if (s === 'error') emit('loaded', null)
})

const uvKey = computed(() => {
  const uv = r.value?.uv ?? 0
  return uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : 'veryHigh'
})
</script>

<template>
  <div class="wx-row">
    <article class="wx" :class="theme">
      <header class="wx-head">
        <span class="sys"><Icon name="settings" :size="14" />{{ $t('weather.system') }}</span>
        <span class="only">{{ $t('weather.onlyYou') }}</span>
        <button class="x" :title="$t('common.close')" @click="emit('close')"><Icon name="close" :size="16" /></button>
      </header>

      <!-- loading -->
      <div v-if="state === 'loading'" class="wx-wait">
        <span class="spinner" />
        <span>{{ $t('weather.locating') }}</span>
      </div>

      <!-- error -->
      <div v-else-if="state === 'error'" class="wx-wait">
        <span class="big-ic">📍</span>
        <span>{{ $t(`weather.errors.${error ?? 'network'}`) }}</span>
        <button class="retry" @click="emit('retry')">{{ $t('chat.retry') }}</button>
      </div>

      <!-- report -->
      <template v-else-if="r && look">
        <div class="place">
          <Icon name="pin" :size="15" />
          <b class="ellipsis">{{ r.place || `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}` }}</b>
          <small>{{ $t('weather.today') }} · {{ formatTime(r.fetchedAt, settings.locale) }}</small>
        </div>

        <div class="now">
          <span class="now-ic">{{ look.icon }}</span>
          <div class="now-t">
            <span class="temp">{{ r.temp }}°</span>
            <span class="cond">{{ $t(`weather.codes.${look.key}`) }}</span>
            <small>{{ $t('weather.feelsLike', { t: r.feelsLike }) }} · ↑{{ r.tempMax }}° ↓{{ r.tempMin }}°</small>
          </div>
        </div>

        <dl class="stats">
          <div><dt>💧 {{ $t('weather.humidity') }}</dt><dd>{{ r.humidity }}%</dd></div>
          <div><dt>☔ {{ $t('weather.rainChance') }}</dt><dd>{{ r.rainChance }}%</dd></div>
          <div><dt>🌧️ {{ $t('weather.rainSum') }}</dt><dd>{{ r.rainSum.toFixed(1) }} mm</dd></div>
          <div><dt>💨 {{ $t('weather.wind') }}</dt><dd>{{ r.wind }} km/h</dd></div>
          <div><dt>🔆 UV</dt><dd>{{ r.uv }} <small>{{ $t(`weather.uv.${uvKey}`) }}</small></dd></div>
          <div><dt>🌅 {{ $t('weather.sun') }}</dt><dd>{{ r.sunrise }} – {{ r.sunset }}</dd></div>
        </dl>

        <ol class="hours">
          <li v-for="h in r.hours" :key="h.time">
            <small>{{ h.time }}</small>
            <span>{{ describe(h.code, true).icon }}</span>
            <b>{{ h.temp }}°</b>
            <small class="rain" :style="{ opacity: h.rain ? 1 : 0.45 }">{{ h.rain }}%</small>
          </li>
        </ol>

        <footer class="src">{{ $t('weather.source') }}</footer>
      </template>
    </article>
  </div>
</template>

<style scoped>
.wx-row { display: flex; justify-content: center; margin: 10px 0; }
.wx {
  --wx-a: #5b8def; --wx-b: #7fb6ff;
  width: min(360px, 100%); padding: 12px 14px 10px; border-radius: 20px; color: #fff;
  background: linear-gradient(155deg, var(--wx-a), var(--wx-b)); box-shadow: var(--shadow-lg);
  animation: wx-in 0.4s var(--ease-out); overflow: hidden; position: relative;
}
@keyframes wx-in { from { transform: translateY(14px) scale(0.96); opacity: 0; } }
.wx.sunny { --wx-a: #f59e2a; --wx-b: #4fa8f0; }
.wx.cloudy { --wx-a: #6b84a3; --wx-b: #a3b8cf; }
.wx.rain { --wx-a: #35506e; --wx-b: #5f7f9f; }
.wx.storm { --wx-a: #2a2340; --wx-b: #4b3f6b; }
.wx.night { --wx-a: #141e3a; --wx-b: #34477a; }
.wx.neutral { --wx-a: #4a6584; --wx-b: #7590ad; }

.wx-head { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.92; }
.sys { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.2); font-weight: 600; }
.only { flex: 1; opacity: 0.8; }
.x { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: rgba(0, 0, 0, 0.15); }

.wx-wait { display: grid; justify-items: center; gap: 10px; padding: 22px 8px 16px; text-align: center; font-size: 14px; }
.big-ic { font-size: 34px; }
.retry { padding: 6px 16px; border-radius: 14px; background: rgba(255, 255, 255, 0.25); color: #fff; font-weight: 600; }

.place { display: flex; align-items: center; gap: 5px; margin-top: 10px; font-size: 14px; min-width: 0; }
.place b { min-width: 0; }
.place small { margin-left: auto; flex: none; opacity: 0.8; font-size: 12px; }

.now { display: flex; align-items: center; gap: 14px; margin: 6px 0 10px; }
.now-ic { font-size: 58px; line-height: 1; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.25)); animation: float 4s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-4px); } }
.now-t { display: grid; }
.temp { font-size: 46px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
.cond { font-size: 16px; font-weight: 600; }
.now-t small { font-size: 12.5px; opacity: 0.85; }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0; }
.stats div { padding: 7px 8px; border-radius: 12px; background: rgba(255, 255, 255, 0.16); min-width: 0; }
.stats dt { font-size: 11px; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stats dd { margin: 2px 0 0; font-size: 15px; font-weight: 700; white-space: nowrap; }
.stats dd small { font-size: 10.5px; font-weight: 500; opacity: 0.85; }

.hours { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; margin: 10px 0 0; padding: 8px 2px; list-style: none; border-radius: 12px; background: rgba(0, 0, 0, 0.12); }
.hours li { display: grid; justify-items: center; gap: 2px; font-size: 18px; }
.hours small { font-size: 11px; opacity: 0.85; }
.hours b { font-size: 13px; }
.hours .rain { color: #bfe3ff; font-weight: 600; }
.src { margin-top: 8px; text-align: right; font-size: 10.5px; opacity: 0.7; }
</style>
