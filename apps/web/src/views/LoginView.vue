<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { reducedMotion } from '@/lib/motion'
import Icon from '@/components/Icon.vue'
import Capybara from '@/components/login/Capybara.vue'
import BalloonGame from '@/components/login/BalloonGame.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const settings = useSettings()

const mode = ref<'signin' | 'join'>(route.query.join !== undefined ? 'join' : 'signin')
const step = ref<'form' | 'code'>('form')
const email = ref('')
const name = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const codeInput = ref<HTMLInputElement | null>(null)
const cooldown = ref(0)

/** Shoot balloons to enter the code; typing is the fallback (and the default with reduced motion). */
const game = ref(!reducedMotion())
const shakeGame = ref(0)
const sad = ref(false)
const diving = ref(false)
const splash = ref(false)
let verifying = false

const mood = computed(() =>
  diving.value ? 'dive' : sad.value ? 'sad' : step.value === 'code' ? 'shy' : 'idle',
)

const canSubmit = computed(() =>
  /.+@.+\..+/.test(email.value) && (mode.value === 'signin' || name.value.trim()),
)

function describe(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? '')
  if (/rate|security purposes/i.test(msg)) return t('login.errors.rateLimit')
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
      await auth.sendCode(email.value, { displayName: name.value, locale: settings.locale })
    } else {
      await auth.sendCode(email.value)
    }
    step.value = 'code'
    startCooldown()
    await nextTick()
    if (!game.value) codeInput.value?.focus()
  } catch (e) {
    error.value = describe(e)
  } finally {
    busy.value = false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function verify() {
  if (code.value.length < 6 || busy.value) return
  busy.value = true
  verifying = true
  error.value = ''
  try {
    await auth.verifyCode(email.value, code.value)
    await diveIn()
    void router.replace({ name: 'home' })
  } catch (e) {
    verifying = false
    error.value = describe(e)
    code.value = ''
    shakeGame.value++
    sad.value = true
    setTimeout(() => (sad.value = false), 1800)
  } finally {
    busy.value = false
  }
}

/** Capybara dives, water rises over the screen, the chat appears as it drains. */
async function diveIn() {
  if (reducedMotion()) return
  await sleep(game.value ? 650 : 150) // let the balloon firework play
  diving.value = true
  setTimeout(() => (splash.value = true), 620)
  await sleep(900)
  await waterWipe()
}

function waterWipe() {
  const el = document.createElement('div')
  el.className = 'water-wipe'
  el.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>'
  document.body.appendChild(el)
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 560)
    setTimeout(() => el.classList.add('out'), 950)
    setTimeout(() => el.remove(), 1700)
  })
}

watch(code, (v) => {
  code.value = v.replace(/\D/g, '').slice(0, 6)
  if (code.value.length === 6) void verify()
})

async function useKeyboard() {
  game.value = false
  await nextTick()
  codeInput.value?.focus()
}

// Magic link opened in this browser → session arrives via URL hash.
watch(() => auth.session, (s) => { if (s && !verifying) void router.replace({ name: 'home' }) })
</script>

<template>
  <div class="login">
    <button class="theme icon-btn" @click="settings.toggleTheme($event)"><Icon :name="settings.isDark ? 'sun' : 'moon'" /></button>
    <div class="sky" />

    <div class="stage">
      <div class="pool-back">
        <svg class="wave" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 10Q25 0 50 10T100 10T150 10T200 10T250 10T300 10T350 10T400 10V20H0z" /></svg>
      </div>

      <div class="card" :class="{ compact: step === 'code' }">
        <img src="/favicon.svg" alt="" class="logo" />
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

            <Transition name="fade" mode="out-in">
              <BalloonGame v-if="game" key="game" v-model="code" :disabled="busy || diving" :shake="shakeGame" />
              <div v-else key="type" class="stack">
                <input
                  ref="codeInput" v-model="code" class="code" inputmode="numeric" autocomplete="one-time-code"
                  maxlength="6" placeholder="••••••"
                />
                <p class="muted small">{{ $t('login.codeHint') }}</p>
              </div>
            </Transition>

            <button class="mode-link" type="button" @click="game ? useKeyboard() : (game = true)">
              {{ game ? $t('login.game.typeInstead') : $t('login.game.playInstead') }}
            </button>
            <button v-if="!game || busy" class="btn block" :disabled="code.length < 6 || busy" @click="verify">
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

      <!-- The capybara's corner of the pool. Ripples share the drift animation so they stay under him. -->
      <div class="pond">
        <div class="drift" :class="{ stop: diving }">
          <Capybara :mood="mood" />
        </div>
        <div class="pool-front">
          <svg class="wave" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 10Q25 0 50 10T100 10T150 10T200 10T250 10T300 10T350 10T400 10V20H0z" /></svg>
        </div>
        <div class="drift ripples" :class="{ stop: diving }">
          <i /><i />
          <template v-if="splash"><b v-for="k in 12" :key="k" :style="{ '--a': (k * 30) + 'deg', '--d': (k % 3) * 0.05 + 's' }" /></template>
        </div>
      </div>
    </div>

    <div class="lake" />
  </div>
</template>

<style scoped>
.login {
  --water-top: #8fd3f4; --water-deep: #4aa3dc; --water-front: rgba(64, 156, 216, 0.9); --foam: rgba(255, 255, 255, 0.75);
  position: relative; min-height: 100%; display: flex; flex-direction: column; align-items: center;
  padding-top: calc(24px + var(--safe-top)); overflow-x: hidden; overflow-y: auto;
  background: linear-gradient(170deg, var(--chat-bg), var(--chat-bg-2));
}
.sky { flex: 1 1 0; min-height: 8px; }
.lake { flex: 1 1 0; width: 100%; min-height: 64px; background: var(--water-deep); }
.theme { position: fixed; z-index: 5; top: calc(12px + var(--safe-top)); right: 12px; background: var(--surface); }

.stage { position: relative; width: min(400px, calc(100% - 32px)); display: flex; flex-direction: column; }

/* Water behind the card: starts ~110px above the card's bottom, full screen width. */
.pool-back {
  position: absolute; z-index: 0; left: 50%; width: 100vw; margin-left: -50vw; top: calc(100% - 210px); bottom: 0;
  background: linear-gradient(180deg, var(--water-top), var(--water-deep) 85%);
}
.wave { position: absolute; bottom: calc(100% - 1px); left: 0; width: 200%; height: 16px; animation: waves 7s linear infinite; }
.pool-back .wave path { fill: var(--water-top); }
.pool-front .wave { height: 14px; animation-duration: 4.5s; animation-direction: reverse; }
.pool-front .wave path { fill: var(--water-front); }
@keyframes waves { to { transform: translateX(-50%); } }

.card {
  position: relative; z-index: 1; display: grid; gap: 14px; text-align: center; padding: 28px 24px 30px;
  border-radius: 22px; background: var(--surface); box-shadow: var(--shadow-lg); animation: card-in 0.5s var(--ease-out);
}
@keyframes card-in { from { transform: translateY(20px) scale(0.97); opacity: 0; } }
.logo { justify-self: center; width: 88px; height: 88px; transition: width 0.3s, height 0.3s; animation: float 4s ease-in-out infinite; }
.compact .logo { width: 52px; height: 52px; }
.compact { gap: 10px; padding: 18px 16px 26px; }
@keyframes float { 50% { transform: translateY(-6px); } }
h1 { margin: 0; font-size: 26px; }
.compact h1 { font-size: 20px; }
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
.mode-link { justify-self: center; color: var(--accent); font-size: 14px; font-weight: 600; padding: 2px 8px; }
.row { display: flex; justify-content: space-between; }
.error { margin: 0; color: var(--danger); }
.lang { display: flex; justify-content: center; gap: 8px; color: var(--text-muted); font-size: 14px; }
.lang button.on { color: var(--accent); font-weight: 600; }
.bar-enter-active, .bar-leave-active { transition: max-height 0.3s var(--ease-out), opacity 0.25s; max-height: 140px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
.btn .spinner { width: 18px; height: 18px; border-width: 2px; }

/* Pond under the card: capybara (z2) sits between the back water and the front wave (z3). */
.pond { position: relative; z-index: 2; height: 118px; margin-top: -22px; pointer-events: none; }
.pool-front {
  position: absolute; z-index: 3; left: 50%; width: 100vw; margin-left: -50vw; bottom: -60px; height: 110px;
  background: linear-gradient(180deg, var(--water-front), var(--water-deep));
}
.drift { position: absolute; z-index: 2; bottom: -6px; width: 112px; animation: drift 19s ease-in-out infinite alternate; }
.drift.stop { animation-play-state: paused; }
@keyframes drift { from { left: 0; } to { left: calc(100% - 112px); } }
.ripples { z-index: 4; bottom: 40px; height: 18px; }
.ripples i {
  position: absolute; left: 50%; top: 0; width: 120px; height: 18px; margin-left: -60px; border-radius: 50%;
  border: 2px solid var(--foam); opacity: 0; animation: ripple 3.4s ease-out infinite;
}
.ripples i + i { animation-delay: 1.7s; }
@keyframes ripple { from { transform: scale(0.75); opacity: 0.9; } to { transform: scale(1.45); opacity: 0; } }
.ripples b {
  position: absolute; left: 50%; top: 6px; width: 9px; height: 9px; margin-left: -4px; border-radius: 50%; background: var(--foam);
  animation: splash 0.7s cubic-bezier(.2,.7,.4,1) var(--d) forwards; transform: rotate(var(--a)) translateY(0);
}
@keyframes splash {
  0% { transform: rotate(var(--a)) translateY(0) scale(1); opacity: 1; }
  100% { transform: rotate(var(--a)) translateY(-70px) scale(0.4); opacity: 0; }
}
</style>

<style>
:root[data-theme='dark'] .login { --water-top: #1f5b82; --water-deep: #143f5c; --water-front: rgba(20, 70, 104, 0.92); --foam: rgba(170, 220, 255, 0.35); }

/* Lives on <body> so it survives the route change: water rises, chat appears as it fades. */
.water-wipe {
  position: fixed; inset: 0; z-index: 1000; pointer-events: none;
  background: linear-gradient(180deg, #8fd3f4, #2f86c4);
  animation: water-up 0.56s cubic-bezier(.55, 0, .3, 1) both;
  transition: opacity 0.7s ease;
}
:root[data-theme='dark'] .water-wipe { background: linear-gradient(180deg, #1f5b82, #0e2a3f); }
.water-wipe.out { opacity: 0; }
@keyframes water-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.water-wipe i {
  position: absolute; bottom: -20px; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7); animation: bubble 1.3s ease-in forwards;
}
.water-wipe i:nth-child(1) { left: 12%; animation-delay: 0.1s; }
.water-wipe i:nth-child(2) { left: 30%; width: 22px; height: 22px; animation-delay: 0.25s; }
.water-wipe i:nth-child(3) { left: 48%; animation-delay: 0.05s; }
.water-wipe i:nth-child(4) { left: 63%; width: 10px; height: 10px; animation-delay: 0.35s; }
.water-wipe i:nth-child(5) { left: 78%; width: 18px; height: 18px; animation-delay: 0.15s; }
.water-wipe i:nth-child(6) { left: 90%; animation-delay: 0.3s; }
@keyframes bubble { to { transform: translateY(-110vh); } }
</style>
