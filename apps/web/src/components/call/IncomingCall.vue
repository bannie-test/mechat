<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { colorFor } from '@/lib/format'
import { useWide } from '@/composables/useBreakpoint'
import { useCall } from '@/stores/call'
import { useChats } from '@/stores/chats'
import Avatar from '@/components/Avatar.vue'
import Icon from '@/components/Icon.vue'

const { t } = useI18n()
const call = useCall()
const chats = useChats()
const wide = useWide()

const row = computed(() => call.incoming)
const chat = computed(() => chats.byId(row.value?.chat_id))
const video = computed(() => row.value?.kind === 'video')
const title = computed(() => chats.title(chat.value))
const avatar = computed(() => chats.avatar(chat.value))
const subtitle = computed(() => {
  if (chat.value?.type === 'group') {
    const who = chats.people[row.value?.started_by ?? '']?.display_name ?? ''
    return t('call.groupCalling', { name: who })
  }
  return video.value ? t('call.incomingVideo') : t('call.incomingVoice')
})
const bg = computed(() => {
  const c = colorFor(avatar.value.id || 'x')
  return { background: `radial-gradient(120% 90% at 50% 20%, color-mix(in srgb, ${c} 55%, #121a24), #0a0f15 70%)` }
})
</script>

<template>
  <Teleport to="body">
    <Transition :name="wide ? 'card' : 'sheet-up'">
      <div v-if="call.phase === 'incoming' && row" class="incoming" :class="{ wide }" :style="wide ? undefined : bg" role="alertdialog" :aria-label="subtitle">
        <div class="who">
          <span class="pulse"><Avatar v-bind="avatar" :size="wide ? 56 : 132" /></span>
          <div class="text">
            <b class="ellipsis">{{ title }}</b>
            <small class="ellipsis"><Icon :name="video ? 'videocam' : 'phone'" :size="15" /> {{ subtitle }}</small>
          </div>
        </div>
        <div class="actions">
          <div class="act">
            <button class="round decline" :title="t('call.decline')" @click="call.decline()"><Icon name="callEnd" :size="28" /></button>
            <small>{{ t('call.decline') }}</small>
          </div>
          <div class="act">
            <button class="round accept" :title="t('call.accept')" @click="call.accept(video)"><Icon :name="video ? 'videocam' : 'phone'" :size="28" /></button>
            <small>{{ t('call.accept') }}</small>
          </div>
        </div>
        <button v-if="video" class="voice-only" @click="call.accept(false)">{{ t('call.acceptVoice') }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.incoming {
  position: fixed; inset: 0; z-index: 320; color: #fff; display: flex; flex-direction: column; align-items: center;
  justify-content: space-between; padding: calc(18vh + var(--safe-top)) 24px calc(48px + var(--safe-bottom));
}
.who { display: grid; justify-items: center; gap: 26px; text-align: center; max-width: 100%; }
.text { display: grid; gap: 6px; max-width: 100%; }
.text b { font-size: 28px; font-weight: 700; }
.text small { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 16px; opacity: 0.85; }
.pulse { position: relative; display: grid; border-radius: 50%; }
.pulse::before, .pulse::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.2); z-index: -1; animation: halo 2s ease-out infinite; }
.pulse::after { animation-delay: 1s; }
@keyframes halo { from { transform: scale(1); opacity: 0.85; } to { transform: scale(2); opacity: 0; } }
.actions { display: flex; gap: 72px; }
.act { display: grid; justify-items: center; gap: 8px; }
.act small { font-size: 13px; opacity: 0.9; }
.round { width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; color: #fff; transition: transform 0.12s; }
.round:active { transform: scale(0.92); }
.decline { background: #f04848; }
.accept { background: #2fb36a; animation: nudge 1.6s ease-in-out infinite; }
@keyframes nudge {
  0%, 60%, 100% { transform: rotate(0); }
  66% { transform: rotate(-14deg); } 72% { transform: rotate(12deg); } 78% { transform: rotate(-10deg); } 84% { transform: rotate(6deg); }
}
.voice-only { position: absolute; bottom: calc(12px + var(--safe-bottom)); color: #fff; opacity: 0.8; font-size: 14px; text-decoration: underline; }

/* desktop: a card in the corner */
.incoming.wide {
  inset: auto 24px 24px auto; width: 360px; padding: 18px; border-radius: 20px; gap: 14px; justify-content: flex-start; align-items: stretch;
  background: #17212b; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}
.wide .who { grid-template-columns: auto 1fr; justify-items: start; text-align: left; gap: 14px; align-items: center; }
.wide .text b { font-size: 18px; }
.wide .text small { justify-content: flex-start; font-size: 14px; }
.wide .pulse::before, .wide .pulse::after { background: rgba(47, 179, 106, 0.35); }
.wide .actions { gap: 12px; }
.wide .act { flex: 1; }
.wide .act small { display: none; }
.wide .round { width: 100%; height: 46px; border-radius: 14px; }
.wide .voice-only { position: static; align-self: center; font-size: 13px; }

.sheet-up-enter-active, .sheet-up-leave-active { transition: transform 0.4s var(--ease-out), opacity 0.3s; }
.sheet-up-enter-from, .sheet-up-leave-to { transform: translateY(8%); opacity: 0; }
.card-enter-active, .card-leave-active { transition: transform 0.35s var(--ease-out), opacity 0.25s; }
.card-enter-from, .card-leave-to { transform: translateY(24px) scale(0.96); opacity: 0; }
</style>
