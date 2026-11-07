<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push'
import { uploadAvatar } from '@/lib/storage'
import { useAuth } from '@/stores/auth'
import { useSettings, type ThemePref } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import type { Locale } from '@/lib/types'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import ScreenHeader from './ScreenHeader.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const settings = useSettings()
const ui = useUi()

const name = ref(auth.profile?.display_name ?? '')
const username = ref(auth.profile?.username ?? '')
const bio = ref(auth.profile?.bio ?? '')
const saving = ref(false)
const uploading = ref(false)
const push = ref<PushState>('unsupported')
const pushBusy = ref(false)

onMounted(async () => {
  push.value = await pushState().catch(() => 'unsupported' as const)
})

const dirty = () =>
  name.value.trim() !== auth.profile?.display_name ||
  username.value.trim() !== auth.profile?.username ||
  (bio.value.trim() || null) !== (auth.profile?.bio || null)

async function save() {
  if (!dirty()) return
  saving.value = true
  try {
    await auth.updateProfile({
      display_name: name.value.trim(),
      username: username.value.trim().toLowerCase(),
      bio: bio.value.trim() || null,
    })
    ui.toast(t('settings.saved'), undefined, 1500)
  } catch (e) {
    const msg = (e as { code?: string }).code === '23505' ? t('settings.usernameTaken') : t('settings.invalidProfile')
    ui.toast(msg)
  } finally {
    saving.value = false
  }
}

async function pickAvatar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f || !auth.userId) return
  uploading.value = true
  try {
    await auth.updateProfile({ avatar_url: await uploadAvatar(auth.userId, f) })
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    uploading.value = false
  }
}

async function setLocale(l: Locale) {
  settings.setLocale(l)
  await auth.updateProfile({ locale: l }).catch(() => {})
}

function setTheme(p: ThemePref, e: MouseEvent) {
  settings.setTheme(p, { x: e.clientX, y: e.clientY })
}

async function togglePush() {
  pushBusy.value = true
  try {
    push.value = push.value === 'enabled' ? await disablePush() : await enablePush()
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    pushBusy.value = false
  }
}

async function signOut() {
  if (!confirm(t('settings.confirmSignOut'))) return
  await auth.signOut()
  void router.replace({ name: 'login' })
}
</script>

<template>
  <section class="screen">
    <ScreenHeader :title="$t('settings.title')" />
    <div class="body scroll">
      <div class="hero">
        <label class="avatar-pick">
          <Avatar :id="auth.userId ?? ''" :name="auth.profile?.display_name ?? ''" :url="auth.profile?.avatar_url" :size="104" />
          <span class="cam"><span v-if="uploading" class="spinner" /><Icon v-else name="camera" :size="20" /></span>
          <input type="file" accept="image/*" hidden @change="pickAvatar" />
        </label>
      </div>

      <div class="form">
        <label class="field"><input v-model="name" maxlength="64" @blur="save" /><span>{{ $t('settings.name') }}</span></label>
        <label class="field"><input v-model="username" maxlength="32" pattern="[a-z0-9_]{3,32}" @blur="save" /><span>{{ $t('settings.username') }}</span></label>
        <label class="field"><input v-model="bio" maxlength="200" @blur="save" /><span>{{ $t('settings.bio') }}</span></label>
        <small class="muted">{{ $t('settings.usernameHint') }}</small>
      </div>

      <div class="section-title">{{ $t('settings.appearance') }}</div>
      <div class="seg">
        <button v-for="p in (['light', 'dark', 'system'] as ThemePref[])" :key="p" :class="{ on: settings.themePref === p }" @click="setTheme(p, $event)">
          <Icon :name="p === 'light' ? 'sun' : p === 'dark' ? 'moon' : 'settings'" :size="18" />{{ $t(`settings.themes.${p}`) }}
        </button>
      </div>

      <div class="section-title">{{ $t('settings.language') }}</div>
      <div class="seg">
        <button :class="{ on: settings.locale === 'en' }" @click="setLocale('en')">English</button>
        <button :class="{ on: settings.locale === 'vi' }" @click="setLocale('vi')">Tiếng Việt</button>
      </div>

      <div class="section-title">{{ $t('settings.notifications') }}</div>
      <label class="list-item" :class="{ disabled: push === 'unsupported' || push === 'denied' || push === 'needs-install' }">
        <Icon name="bell" class="muted" />
        <span class="grow">
          {{ $t('settings.pushTitle') }}
          <small class="muted block">{{ $t(`settings.push.${push}`) }}</small>
        </span>
        <span class="switch">
          <input type="checkbox" :checked="push === 'enabled'" :disabled="pushBusy || push === 'unsupported' || push === 'denied' || push === 'needs-install'" @change="togglePush" />
          <i />
        </span>
      </label>

      <div class="section-title">{{ $t('settings.friends') }}</div>
      <button v-ripple class="list-item" @click="router.push({ name: 'invites' })">
        <Icon name="personAdd" class="muted" /><span class="grow">{{ $t('invites.title') }}</span><Icon name="chevron" class="muted" />
      </button>

      <button v-ripple class="list-item danger" @click="signOut"><Icon name="logout" />{{ $t('settings.signOut') }}</button>
      <p class="muted version">iemanchat · v0.1.0</p>
    </div>
  </section>
</template>

<style scoped>
.screen { display: flex; flex-direction: column; height: 100%; }
.body { flex: 1; padding: 0 8px calc(24px + var(--safe-bottom)); }
.hero { display: grid; place-items: center; padding: 8px 0 16px; }
.avatar-pick { position: relative; cursor: pointer; }
.cam { position: absolute; right: 2px; bottom: 2px; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; border: 3px solid var(--surface); }
.cam .spinner { width: 16px; height: 16px; border-width: 2px; }
.form { display: grid; gap: 12px; padding: 0 8px; }
.seg { display: flex; gap: 6px; padding: 0 8px; }
.seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border-radius: 10px; background: var(--surface-2); font-weight: 500; transition: 0.15s; }
.seg button.on { background: var(--accent); color: var(--on-accent); }
.grow { flex: 1; min-width: 0; }
.block { display: block; font-size: 12px; }
.disabled { opacity: 0.6; }
.danger { color: var(--danger); margin-top: 16px; }
.version { text-align: center; font-size: 12px; margin-top: 20px; }
</style>
