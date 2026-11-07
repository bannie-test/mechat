<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import Icon from '@/components/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const settings = useSettings()

const inviteFromLink = typeof route.query.invite === 'string' ? route.query.invite : ''
const mode = ref<'signin' | 'join'>(inviteFromLink ? 'join' : 'signin')
const step = ref<'form' | 'code'>('form')
const email = ref('')
const name = ref('')
const invite = ref(inviteFromLink)
const code = ref('')
const busy = ref(false)
const error = ref('')
const codeInput = ref<HTMLInputElement | null>(null)
const cooldown = ref(0)

const canSubmit = computed(() =>
  /.+@.+\..+/.test(email.value) && (mode.value === 'signin' || (name.value.trim() && invite.value.trim().length >= 6)),
)

function describe(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? '')
  if (/rate|security purposes/i.test(msg)) return t('login.errors.rateLimit')
  if (/INVITE_REQUIRED|Database error saving new user/i.test(msg)) return t('login.errors.invite')
  if (/Signups not allowed|not found|otp_disabled/i.test(msg)) return t('login.errors.noAccount')
  if (/expired|invalid/i.test(msg)) return t('login.errors.badCode')
  return msg || t('errors.generic')
}

function startCooldown() {
  cooldown.value = 60
  const id = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) clearInterval(id)
  }, 1000)
}

async function send() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'join') {
      const ok = await auth.checkInvite(invite.value)
      if (!ok) throw new Error('INVITE_REQUIRED')
      await auth.sendCode(email.value, { invite: invite.value, displayName: name.value, locale: settings.locale })
    } else {
      await auth.sendCode(email.value)
    }
    step.value = 'code'
    startCooldown()
    await nextTick()
    codeInput.value?.focus()
  } catch (e) {
    error.value = describe(e)
  } finally {
    busy.value = false
  }
}

async function verify() {
  if (code.value.length < 6 || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await auth.verifyCode(email.value, code.value)
    void router.replace({ name: 'home' })
  } catch (e) {
    error.value = describe(e)
    code.value = ''
  } finally {
    busy.value = false
  }
}

watch(code, (v) => {
  code.value = v.replace(/\D/g, '').slice(0, 6)
  if (code.value.length === 6) void verify()
})

// Magic link opened in this browser → session arrives via URL hash.
watch(() => auth.session, (s) => { if (s) void router.replace({ name: 'home' }) })
</script>

<template>
  <div class="login">
    <button class="theme icon-btn" @click="settings.toggleTheme($event)"><Icon :name="settings.isDark ? 'sun' : 'moon'" /></button>
    <div class="card">
      <img src="/favicon.svg" alt="" class="logo" width="88" height="88" />
      <h1>iemanchat</h1>

      <Transition name="fade" mode="out-in">
        <div v-if="step === 'form'" key="form" class="stack">
          <div class="tabs">
            <button :class="{ on: mode === 'signin' }" @click="mode = 'signin'; error = ''">{{ $t('login.signIn') }}</button>
            <button :class="{ on: mode === 'join' }" @click="mode = 'join'; error = ''">{{ $t('login.join') }}</button>
            <i class="ink" :style="{ transform: mode === 'join' ? 'translateX(100%)' : 'none' }" />
          </div>
          <p class="muted">{{ mode === 'signin' ? $t('login.signInHint') : $t('login.joinHint') }}</p>

          <form class="stack" @submit.prevent="send">
            <Transition name="bar">
              <div v-if="mode === 'join'" class="stack">
                <label class="field"><input v-model="invite" autocapitalize="characters" autocomplete="off" required /><span>{{ $t('login.inviteCode') }}</span></label>
                <label class="field"><input v-model="name" autocomplete="name" maxlength="64" required /><span>{{ $t('login.yourName') }}</span></label>
              </div>
            </Transition>
            <label class="field"><input v-model="email" type="email" autocomplete="email" inputmode="email" required /><span>{{ $t('login.email') }}</span></label>
            <button class="btn block" :disabled="!canSubmit || busy">
              <span v-if="busy" class="spinner" />{{ $t('login.sendCode') }}
            </button>
          </form>
        </div>

        <div v-else key="code" class="stack">
          <p>{{ $t('login.codeSent', { email }) }}</p>
          <input
            ref="codeInput" v-model="code" class="code" inputmode="numeric" autocomplete="one-time-code"
            maxlength="6" placeholder="••••••"
          />
          <p class="muted small">{{ $t('login.codeHint') }}</p>
          <button class="btn block" :disabled="code.length < 6 || busy" @click="verify">
            <span v-if="busy" class="spinner" />{{ $t('login.verify') }}
          </button>
          <div class="row">
            <button class="btn ghost" @click="step = 'form'; code = ''; error = ''">{{ $t('login.changeEmail') }}</button>
            <button class="btn ghost" :disabled="cooldown > 0 || busy" @click="send">
              {{ cooldown > 0 ? $t('login.resendIn', { s: cooldown }) : $t('login.resend') }}
            </button>
          </div>
        </div>
      </Transition>

      <Transition name="fade"><p v-if="error" class="error">{{ error }}</p></Transition>

      <div class="lang">
        <button :class="{ on: settings.locale === 'en' }" @click="settings.setLocale('en')">English</button>·
        <button :class="{ on: settings.locale === 'vi' }" @click="settings.setLocale('vi')">Tiếng Việt</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%; display: grid; place-items: center; padding: 24px 16px calc(24px + var(--safe-bottom));
  background: linear-gradient(160deg, var(--chat-bg), var(--chat-bg-2)); overflow-y: auto;
}
.theme { position: fixed; top: calc(12px + var(--safe-top)); right: 12px; background: var(--surface); }
.card {
  width: min(400px, 100%); display: grid; gap: 14px; text-align: center; padding: 32px 24px;
  border-radius: 20px; background: var(--surface); box-shadow: var(--shadow-lg); animation: card-in 0.5s var(--ease-out);
}
@keyframes card-in { from { transform: translateY(20px) scale(0.97); opacity: 0; } }
.logo { justify-self: center; animation: float 4s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-6px); } }
h1 { margin: 0; font-size: 26px; }
.stack { display: grid; gap: 12px; text-align: left; }
.stack > p { margin: 0; text-align: center; }
.tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 10px; padding: 3px; }
.tabs button { position: relative; z-index: 1; height: 36px; border-radius: 8px; font-weight: 600; color: var(--text-muted); transition: color 0.2s; }
.tabs button.on { color: var(--text); }
.ink { position: absolute; left: 3px; top: 3px; width: calc(50% - 3px); height: 36px; border-radius: 8px; background: var(--surface); box-shadow: var(--shadow); transition: transform 0.3s var(--ease-out); }
.code {
  height: 60px; border-radius: 12px; border: 2px solid var(--border); background: transparent; text-align: center;
  font: 600 30px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 12px; outline: none; transition: border-color 0.2s;
}
.code:focus { border-color: var(--accent); }
.small { font-size: 13px; }
.row { display: flex; justify-content: space-between; }
.error { margin: 0; color: var(--danger); }
.lang { display: flex; justify-content: center; gap: 8px; color: var(--text-muted); font-size: 14px; }
.lang button.on { color: var(--accent); font-weight: 600; }
.bar-enter-active, .bar-leave-active { transition: max-height 0.3s var(--ease-out), opacity 0.25s; max-height: 140px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
.btn .spinner { width: 18px; height: 18px; border-width: 2px; }
</style>
