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
import { ACCENTS } from '@/lib/emoji'
import Avatar from './Avatar.vue'
import EmojiGrid from './EmojiGrid.vue'
import ImageCropper from './ImageCropper.vue'
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
  hasPw.value = await auth.hasPassword().catch(() => false)
})

// ---- password (for username + password sign-in) ------------------------------
const hasPw = ref(false)
const pwOpen = ref(false)
const pw1 = ref('')
const pw2 = ref('')
const pwBusy = ref(false)
async function savePassword() {
  if (pw1.value.length < 8) return ui.toast(t('settings.passwordShort'))
  if (pw1.value !== pw2.value) return ui.toast(t('settings.passwordMismatch'))
  pwBusy.value = true
  try {
    await auth.setPassword(pw1.value)
    hasPw.value = true
    pwOpen.value = false
    pw1.value = pw2.value = ''
    ui.toast(t('settings.passwordSaved'), undefined, 2000)
  } catch (e) {
    ui.toast((e as { message?: string }).message || t('errors.generic'))
  } finally {
    pwBusy.value = false
  }
}

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

const cropping = ref<File | null>(null)
function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) cropping.value = f
}
async function onAvatarCropped(blob: Blob | null) {
  const f = blob ?? cropping.value
  cropping.value = null
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

// ---- quick reactions / accent / background ------------------------------------
const editingSlot = ref<number | null>(null)
function pickReaction(e: string) {
  if (editingSlot.value === null) return
  settings.setQuickReaction(editingSlot.value, e)
  editingSlot.value = null
}

const wallpaperBusy = ref(false)
async function pickWallpaper(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  wallpaperBusy.value = true
  try {
    if (!(await settings.setWallpaper(f))) ui.toast(t('settings.wallpaperTooBig'))
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    wallpaperBusy.value = false
  }
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

      <div class="section-title">{{ $t('settings.security') }}</div>
      <button v-ripple class="list-item" @click="pwOpen = !pwOpen">
        <Icon name="lock" class="muted" />
        <span class="grow">
          {{ hasPw ? $t('settings.changePassword') : $t('settings.setPassword') }}
          <small class="muted block">{{ $t('settings.passwordHint', { u: auth.profile?.username ?? '' }) }}</small>
        </span>
        <Icon name="chevron" class="muted" :style="{ transform: pwOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }" />
      </button>
      <Transition name="bar">
        <form v-if="pwOpen" class="form pw-form" @submit.prevent="savePassword">
          <input :value="auth.profile?.username" autocomplete="username" hidden />
          <label class="field"><input v-model="pw1" type="password" autocomplete="new-password" minlength="8" required /><span>{{ $t('settings.newPassword') }}</span></label>
          <label class="field"><input v-model="pw2" type="password" autocomplete="new-password" minlength="8" required /><span>{{ $t('settings.confirmPassword') }}</span></label>
          <button class="btn" :disabled="pwBusy || !pw1 || !pw2"><span v-if="pwBusy" class="spinner sm" />{{ $t('common.save') }}</button>
        </form>
      </Transition>

      <div class="section-title">{{ $t('settings.appearance') }}</div>
      <div class="seg">
        <button v-for="p in (['light', 'dark', 'system'] as ThemePref[])" :key="p" :class="{ on: settings.themePref === p }" @click="setTheme(p, $event)">
          <Icon :name="p === 'light' ? 'sun' : p === 'dark' ? 'moon' : 'settings'" :size="18" />{{ $t(`settings.themes.${p}`) }}
        </button>
      </div>

      <div class="section-title">{{ $t('settings.accent') }}</div>
      <div class="swatches">
        <button
          v-for="c in ACCENTS" :key="c" class="swatch" :style="{ background: c }"
          :class="{ on: (settings.accent ?? ACCENTS[0]) === c }" :title="c"
          @click="settings.setAccent(c === ACCENTS[0] ? null : c)"
        ><Icon v-if="(settings.accent ?? ACCENTS[0]) === c" name="check" :size="18" /></button>
        <label class="swatch custom" :title="$t('settings.customColor')" :class="{ on: !!settings.accent && !ACCENTS.includes(settings.accent) }">
          <Icon name="plus" :size="18" />
          <input type="color" :value="settings.accent ?? ACCENTS[0]" @input="settings.setAccent(($event.target as HTMLInputElement).value)" />
        </label>
      </div>

      <div class="section-title">{{ $t('settings.wallpaper') }}</div>
      <div class="wall-row">
        <div class="wall-preview" :style="settings.wallpaper ? { backgroundImage: `url(&quot;${settings.wallpaper}&quot;)` } : undefined">
          <span class="wp-bubble in" /><span class="wp-bubble out" />
        </div>
        <div class="wall-actions">
          <label v-ripple class="btn-soft">
            <span v-if="wallpaperBusy" class="spinner sm" /><Icon v-else name="image" :size="18" />{{ $t('settings.wallpaperUpload') }}
            <input type="file" accept="image/*" hidden @change="pickWallpaper" />
          </label>
          <button v-if="settings.wallpaper" v-ripple class="btn-soft" @click="settings.setWallpaper(null)">{{ $t('settings.wallpaperReset') }}</button>
        </div>
      </div>

      <div class="section-title">{{ $t('settings.reactions') }}</div>
      <div class="reactions-edit">
        <button
          v-for="(e, i) in settings.quickReactions" :key="i" class="slot" :class="{ on: editingSlot === i }"
          @click="editingSlot = editingSlot === i ? null : i"
        >{{ e }}</button>
        <button class="reset-link" @click="settings.resetQuickReactions(); editingSlot = null">{{ $t('settings.reset') }}</button>
      </div>
      <small class="muted hint">{{ $t('settings.reactionsHint') }}</small>
      <div v-if="editingSlot !== null" class="grid-wrap">
        <EmojiGrid :selected="settings.quickReactions[editingSlot]" @pick="pickReaction" />
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

      <div class="section-title">{{ $t('settings.sounds') }}</div>
      <label class="list-item">
        <Icon name="bell" class="muted" />
        <span class="grow">
          {{ $t('settings.soundTitle') }}
          <small class="muted block">{{ $t('settings.soundHint') }}</small>
        </span>
        <span class="switch">
          <input v-model="settings.sound" type="checkbox" />
          <i />
        </span>
      </label>

      <div class="section-title">{{ $t('settings.friends') }}</div>
      <button v-ripple class="list-item" @click="router.push({ name: 'invites' })">
        <Icon name="personAdd" class="muted" /><span class="grow">{{ $t('invites.title') }}</span><Icon name="chevron" class="muted" />
      </button>

      <button v-ripple class="list-item danger" @click="signOut"><Icon name="logout" />{{ $t('settings.signOut') }}</button>
      <ImageCropper v-if="cropping" :file="cropping" mode="avatar" @done="onAvatarCropped" @cancel="cropping = null" />
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
.swatches { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 8px; }
.swatch {
  position: relative; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08); transition: transform 0.15s var(--ease-out); cursor: pointer;
}
.swatch:hover { transform: scale(1.08); }
.swatch.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
.swatch.custom { background: conic-gradient(#f44, #fd4, #4d6, #4cf, #64f, #f4c, #f44); }
.swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.wall-row { display: flex; gap: 14px; align-items: center; padding: 0 8px; }
.wall-preview {
  position: relative; flex: none; width: 96px; height: 120px; border-radius: 12px; overflow: hidden;
  background: linear-gradient(160deg, var(--chat-bg), var(--chat-bg-2)) center / cover; box-shadow: var(--shadow);
}
.wp-bubble { position: absolute; height: 14px; border-radius: 7px; box-shadow: var(--shadow); }
.wp-bubble.in { left: 8px; top: 40px; width: 52px; background: var(--bubble-in); }
.wp-bubble.out { right: 8px; top: 66px; width: 60px; background: var(--bubble-out); }
.wall-actions { display: grid; gap: 8px; }
.btn-soft {
  display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: 10px;
  background: var(--surface-2); font-weight: 500; cursor: pointer;
}
.spinner.sm { width: 16px; height: 16px; border-width: 2px; }
.reactions-edit { display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.slot { width: 46px; height: 46px; border-radius: 12px; font-size: 26px; background: var(--surface-2); transition: transform 0.15s var(--ease-out); }
.slot:hover { transform: scale(1.06); }
.slot.on { box-shadow: 0 0 0 2px var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface-2)); }
.reset-link { margin-left: auto; color: var(--accent); font-weight: 500; padding: 6px 8px; }
.hint { display: block; padding: 6px 8px 0; font-size: 12px; }
.grid-wrap { padding: 8px 8px 0; }
.grid-wrap :deep(.egrid) { width: 100%; max-width: none; box-shadow: none; background: var(--surface-2); }
.grid-wrap :deep(.g) { background: var(--surface-2); }
.pw-form { padding: 8px 8px 4px; }
.pw-form .btn { justify-self: end; display: inline-flex; gap: 8px; align-items: center; }
.bar-enter-active, .bar-leave-active { transition: max-height 0.3s var(--ease-out), opacity 0.25s; max-height: 220px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
.version { text-align: center; font-size: 12px; margin-top: 20px; }
</style>
