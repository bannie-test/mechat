<script setup lang="ts">
import { goBack } from '@/router'
import Icon from './Icon.vue'
defineProps<{ title: string }>()
</script>

<template>
  <header class="screen-head">
    <button v-ripple class="icon-btn" @click="goBack"><Icon name="back" /></button>
    <h2 class="ellipsis">{{ title }}</h2>
    <slot />
  </header>
</template>

<style scoped>
.screen-head { display: flex; align-items: center; gap: 8px; padding: calc(8px + var(--safe-top)) 8px 8px; min-height: calc(var(--header-h) + var(--safe-top)); }
h2 { flex: 1; margin: 0 0 0 4px; font-size: 19px; }
</style>
