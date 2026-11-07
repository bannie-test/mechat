<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import type { Invite } from '@/lib/types'
import { useChats } from '@/stores/chats'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import Icon from './Icon.vue'
import ScreenHeader from './ScreenHeader.vue'

const { t } = useI18n()
const chats = useChats()
const settings = useSettings()
const ui = useUi()
const invites = ref<Invite[]>([])
const note = ref('')
const busy = ref(false)

async function load() {
  const { data } = await supabase.from('invites').select('*').order('created_at', { ascending: false })
  invites.value = (data ?? []) as Invite[]
}
onMounted(load)

const linkFor = (code: string) => `${location.origin}/login?invite=${code}`

async function create() {
  busy.value = true
  const { data, error } = await supabase.rpc('create_invite', { p_note: note.value })
  busy.value = false
  if (error) return ui.toast(t('errors.generic'))
  note.value = ''
  invites.value.unshift(data as Invite)
  void share(data as Invite)
}

async function share(inv: Invite) {
  const url = linkFor(inv.code)
  const text = t('invites.shareText', { code: inv.code })
  if (navigator.share) {
    await navigator.share({ title: 'iemanchat', text, url }).catch(() => {})
  } else {
    await navigator.clipboard?.writeText(`${text}\n${url}`)
    ui.toast(t('chat.copied'), undefined, 1500)
  }
}

async function revoke(inv: Invite) {
  await supabase.from('invites').delete().eq('code', inv.code)
  invites.value = invites.value.filter((i) => i.code !== inv.code)
}

function status(inv: Invite) {
  if (inv.used_by) return t('invites.usedBy', { name: chats.people[inv.used_by]?.display_name ?? '' })
  if (new Date(inv.expires_at) < new Date()) return t('invites.expired')
  return t('invites.expires', { date: new Date(inv.expires_at).toLocaleDateString(settings.locale === 'vi' ? 'vi-VN' : 'en-US') })
}
</script>

<template>
  <section class="screen">
    <ScreenHeader :title="$t('invites.title')" />
    <div class="body scroll">
      <p class="muted intro">{{ $t('invites.intro') }}</p>
      <div class="create">
        <label class="field"><input v-model="note" maxlength="100" /><span>{{ $t('invites.note') }}</span></label>
        <button class="btn" :disabled="busy" @click="create"><Icon name="plus" :size="20" />{{ $t('invites.create') }}</button>
      </div>

      <TransitionGroup name="pop" tag="div" class="list">
        <div v-for="inv in invites" :key="inv.code" class="invite" :class="{ used: inv.used_by }">
          <div class="code">{{ inv.code }}</div>
          <div class="info">
            <span v-if="inv.note" class="ellipsis">{{ inv.note }}</span>
            <small class="muted">{{ status(inv) }}</small>
          </div>
          <template v-if="!inv.used_by">
            <button class="icon-btn accent" :title="$t('invites.share')" @click="share(inv)"><Icon name="link" /></button>
            <button class="icon-btn" :title="$t('invites.revoke')" @click="revoke(inv)"><Icon name="trash" /></button>
          </template>
        </div>
      </TransitionGroup>
    </div>
  </section>
</template>

<style scoped>
.screen { display: flex; flex-direction: column; height: 100%; }
.body { flex: 1; padding: 0 12px calc(24px + var(--safe-bottom)); }
.intro { margin: 0 4px 16px; }
.create { display: grid; gap: 10px; margin-bottom: 20px; }
.list { display: grid; gap: 8px; }
.invite { display: flex; align-items: center; gap: 12px; padding: 10px 8px 10px 14px; border-radius: 12px; background: var(--surface-2); }
.invite.used { opacity: 0.6; }
.code { font: 600 17px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 2px; }
.info { flex: 1; min-width: 0; display: grid; }
</style>
