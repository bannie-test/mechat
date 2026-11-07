<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUi } from '@/stores/ui'
import Icon from './Icon.vue'
import ScreenHeader from './ScreenHeader.vue'

const { t } = useI18n()
const ui = useUi()

/** Opens the login page on the "Create account" tab. */
const link = `${location.origin}/login?join`
const canShare = typeof navigator.share === 'function'

async function copy() {
  try {
    await navigator.clipboard.writeText(link)
    ui.toast(t('chat.copied'), undefined, 1500)
  } catch {
    ui.toast(t('errors.generic'))
  }
}

async function share() {
  await navigator.share({ title: 'iemanchat', text: t('invites.shareText'), url: link }).catch(() => {})
}
</script>

<template>
  <section class="screen">
    <ScreenHeader :title="$t('invites.title')" />
    <div class="body scroll">
      <img src="/favicon.svg" alt="" class="logo" width="96" height="96" />
      <p class="muted intro">{{ $t('invites.intro') }}</p>
      <button class="link" @click="copy">{{ link }}</button>
      <div class="actions">
        <button v-ripple class="btn" :class="{ ghost: canShare }" @click="copy"><Icon name="link" :size="20" />{{ $t('invites.copy') }}</button>
        <button v-if="canShare" v-ripple class="btn" @click="share">{{ $t('invites.share') }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.screen { display: flex; flex-direction: column; height: 100%; }
.body { flex: 1; padding: 12px 16px calc(24px + var(--safe-bottom)); display: grid; align-content: start; justify-items: center; gap: 16px; text-align: center; }
.logo { margin-top: 8px; }
.intro { margin: 0; max-width: 340px; }
.link {
  max-width: 100%; padding: 12px 14px; border-radius: 12px; background: var(--surface-2);
  font: 500 14px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere;
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
</style>
