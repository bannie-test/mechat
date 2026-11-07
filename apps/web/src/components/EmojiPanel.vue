<script setup lang="ts">
import { ref, watch } from 'vue'
import { config } from '@/config'
import { EMOJI_GROUPS, STICKERS } from '@/lib/emoji'
import type { Attachment } from '@/lib/types'

const emit = defineEmits<{ emoji: [e: string]; sticker: [e: string]; gif: [a: Attachment] }>()

type Tab = 'emoji' | 'stickers' | 'gif'
const tab = ref<Tab>('emoji')
const hasGif = Boolean(config.giphyKey)

interface Gif { id: string; url: string; preview: string; width: number; height: number }
const gifQuery = ref('')
const gifs = ref<Gif[]>([])
const gifLoading = ref(false)

async function loadGifs() {
  if (!hasGif) return
  gifLoading.value = true
  const base = 'https://api.giphy.com/v1/gifs/'
  const q = gifQuery.value.trim()
  const url = q
    ? `${base}search?api_key=${config.giphyKey}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
    : `${base}trending?api_key=${config.giphyKey}&limit=24&rating=pg-13`
  try {
    const res = await fetch(url)
    const json = (await res.json()) as { data: Array<{ id: string; images: Record<string, { url: string; width: string; height: string }> }> }
    gifs.value = json.data.map((g) => {
      const full = g.images.fixed_width ?? g.images.original
      return { id: g.id, url: full.url, preview: g.images.fixed_width_small?.url ?? full.url, width: +full.width, height: +full.height }
    })
  } catch {
    gifs.value = []
  } finally {
    gifLoading.value = false
  }
}

let t = 0
watch(gifQuery, () => {
  window.clearTimeout(t)
  t = window.setTimeout(loadGifs, 350)
})
watch(tab, (v) => { if (v === 'gif' && !gifs.value.length) void loadGifs() })
</script>

<template>
  <div class="panel" data-no-swipe>
    <nav class="tabs">
      <button :class="{ on: tab === 'emoji' }" @click="tab = 'emoji'">{{ $t('emoji.emoji') }}</button>
      <button :class="{ on: tab === 'stickers' }" @click="tab = 'stickers'">{{ $t('emoji.stickers') }}</button>
      <button v-if="hasGif" :class="{ on: tab === 'gif' }" @click="tab = 'gif'">GIF</button>
    </nav>

    <div v-if="tab === 'emoji'" class="body scroll">
      <template v-for="g in EMOJI_GROUPS" :key="g.key">
        <div class="group">{{ $t(`emoji.${g.key}`) }}</div>
        <div class="grid">
          <button v-for="e in g.list" :key="e" class="e" @click="emit('emoji', e)">{{ e }}</button>
        </div>
      </template>
    </div>

    <div v-else-if="tab === 'stickers'" class="body scroll">
      <div class="grid stickers">
        <button v-for="s in STICKERS" :key="s" class="s" @click="emit('sticker', s)">{{ s }}</button>
      </div>
    </div>

    <div v-else class="body scroll">
      <input v-model="gifQuery" class="gif-search" :placeholder="$t('emoji.searchGif')" />
      <div v-if="gifLoading && !gifs.length" class="center"><span class="spinner" /></div>
      <div class="gifs">
        <button
          v-for="g in gifs" :key="g.id" class="gif"
          @click="emit('gif', { url: g.url, width: g.width, height: g.height, mime: 'image/gif' })"
        >
          <img :src="g.preview" alt="" loading="lazy" />
        </button>
      </div>
      <small class="muted credit">Powered by GIPHY</small>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; height: 300px; background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-lg); overflow: hidden; }
.tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--border); }
.tabs button { flex: 1; height: 32px; border-radius: 8px; font-weight: 600; color: var(--text-muted); }
.tabs button.on { background: var(--hover); color: var(--accent); }
.body { flex: 1; padding: 4px 8px 8px; }
.group { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 8px 4px 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); }
.e { font-size: 26px; height: 40px; border-radius: 8px; transition: transform 0.12s; }
.e:hover { background: var(--hover); transform: scale(1.15); }
.stickers { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 4px; padding-top: 6px; }
.s { font-size: 52px; height: 76px; border-radius: 12px; transition: transform 0.15s var(--ease-out); }
.s:hover { background: var(--hover); transform: scale(1.1) rotate(-4deg); }
.gif-search { width: 100%; height: 36px; margin: 4px 0 8px; padding: 0 12px; border-radius: 18px; border: 0; background: var(--surface-2); outline: none; }
.gifs { columns: 3 100px; column-gap: 4px; }
.gif { display: block; width: 100%; margin-bottom: 4px; border-radius: 8px; overflow: hidden; }
.gif img { width: 100%; height: auto; }
.center { display: grid; place-items: center; padding: 24px; color: var(--accent); }
.credit { display: block; text-align: center; padding: 6px; }
</style>
