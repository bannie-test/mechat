<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useRealtime } from '@/stores/realtime'
import { useUi } from '@/stores/ui'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import PeoplePicker from './PeoplePicker.vue'
import ScreenHeader from './ScreenHeader.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const chats = useChats()
const realtime = useRealtime()
const ui = useUi()

const mode = ref<'direct' | 'group'>('direct')
const picked = ref<string[]>([])
const groupName = ref('')
const busy = ref(false)
const q = ref('')

const people = computed(() =>
  Object.values(chats.people)
    .filter((p) => p.id !== auth.userId)
    .filter((p) => !q.value || (p.display_name + ' ' + p.username).toLowerCase().includes(q.value.toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
)

async function openDirect(id: string) {
  busy.value = true
  try {
    const chatId = await chats.openDirect(id)
    void router.replace({ name: 'chat', params: { id: chatId } })
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    busy.value = false
  }
}

async function createGroup() {
  if (!groupName.value.trim() || !picked.value.length) return
  busy.value = true
  try {
    const id = await chats.createGroup(groupName.value.trim(), picked.value)
    void router.replace({ name: 'chat', params: { id } })
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="screen">
    <ScreenHeader :title="mode === 'group' ? $t('newChat.newGroup') : $t('newChat.title')" />
    <div class="body scroll">
      <template v-if="mode === 'direct'">
        <input v-model="q" class="q" :placeholder="$t('common.search')" />
        <button v-ripple class="list-item accent" @click="mode = 'group'">
          <span class="circle"><Icon name="group" :size="22" /></span>{{ $t('newChat.newGroup') }}
        </button>
        <button v-ripple class="list-item accent" @click="router.push({ name: 'invites' })">
          <span class="circle"><Icon name="personAdd" :size="22" /></span>{{ $t('newChat.inviteFriend') }}
        </button>
        <div class="section-title">{{ $t('newChat.people') }}</div>
        <button v-for="p in people" :key="p.id" v-ripple class="list-item" :disabled="busy" @click="openDirect(p.id)">
          <Avatar :id="p.id" :name="p.display_name" :url="p.avatar_url" :size="46" :online="realtime.online.has(p.id)" />
          <span class="col">
            <span class="ellipsis">{{ p.display_name }}</span>
            <small class="muted">@{{ p.username }}</small>
          </span>
        </button>
        <p v-if="!people.length" class="muted empty">{{ $t('newChat.nobody') }}</p>
      </template>

      <template v-else>
        <label class="field group-name">
          <input v-model="groupName" maxlength="64" autofocus /><span>{{ $t('newChat.groupName') }}</span>
        </label>
        <PeoplePicker v-model="picked" />
      </template>
    </div>
    <Transition name="pop">
      <button
        v-if="mode === 'group'" v-ripple class="fab" :disabled="busy || !groupName.trim() || !picked.length"
        :title="$t('newChat.create')" @click="createGroup"
      >
        <span v-if="busy" class="spinner" /><Icon v-else name="check" />
      </button>
    </Transition>
  </section>
</template>

<style scoped>
.screen { position: relative; display: flex; flex-direction: column; height: 100%; }
.body { flex: 1; padding: 0 8px calc(96px + var(--safe-bottom)); }
.q { width: calc(100% - 8px); height: 40px; margin: 0 4px 8px; padding: 0 14px; border-radius: 20px; border: 0; background: var(--surface-2); outline: none; }
.accent { color: var(--accent); font-weight: 500; }
.circle { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 14%, transparent); }
.col { flex: 1; min-width: 0; display: grid; text-align: left; }
.empty { text-align: center; padding: 16px; }
.group-name { margin: 4px 4px 12px; }
.fab {
  position: absolute; right: 20px; bottom: calc(20px + var(--safe-bottom)); width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent); color: var(--on-accent); display: grid; place-items: center; box-shadow: var(--shadow-lg);
}
.fab:disabled { opacity: 0.5; }
</style>
