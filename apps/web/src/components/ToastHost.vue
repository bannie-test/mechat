<script setup lang="ts">
import { useUi } from '@/stores/ui'
const ui = useUi()
</script>

<template>
  <div class="toasts">
    <TransitionGroup name="toast">
      <div v-for="t in ui.toasts" :key="t.id" class="toast">
        <span>{{ t.text }}</span>
        <button v-if="t.action" class="action" @click="t.action.run(); ui.dismiss(t.id)">{{ t.action.label }}</button>
        <button class="x" @click="ui.dismiss(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts { position: fixed; left: 50%; bottom: calc(24px + var(--safe-bottom)); transform: translateX(-50%); z-index: 1000; display: grid; gap: 8px; width: min(420px, calc(100vw - 32px)); pointer-events: none; }
.toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(30, 36, 44, 0.94); color: #fff; box-shadow: var(--shadow-lg); backdrop-filter: blur(8px); }
.toast span { flex: 1; }
.action { color: #7cc0ff; font-weight: 600; }
.x { opacity: 0.6; font-size: 18px; }
.toast-enter-active, .toast-leave-active { transition: transform 0.25s var(--ease-out), opacity 0.25s; }
.toast-enter-from, .toast-leave-to { transform: translateY(16px) scale(0.96); opacity: 0; }
</style>
