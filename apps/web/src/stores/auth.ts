import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { disablePush } from '@/lib/push'
import type { Locale, Profile } from '@/lib/types'

export const useAuth = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  const userId = computed(() => session.value?.user.id ?? null)
  let initPromise: Promise<void> | null = null

  async function loadProfile() {
    if (!userId.value) return
    const { data } = await supabase.from('profiles').select('*').eq('id', userId.value).maybeSingle()
    profile.value = (data as Profile) ?? null
  }

  function init() {
    initPromise ??= (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (session.value) await loadProfile()
      supabase.auth.onAuthStateChange((event, s) => {
        const changedUser = s?.user.id !== session.value?.user.id
        session.value = s
        // Never await Supabase calls inside this callback (it holds the auth lock).
        if (event === 'SIGNED_OUT') profile.value = null
        else if (s && (changedUser || !profile.value)) setTimeout(loadProfile, 0)
      })
      ready.value = true
    })()
    return initPromise
  }

  async function sendCode(email: string, signup?: { displayName: string; locale: Locale }) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: Boolean(signup),
        emailRedirectTo: location.origin,
        data: signup
          ? { display_name: signup.displayName.trim(), locale: signup.locale }
          : undefined,
      },
    })
    if (error) throw error
  }

  async function verifyCode(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' })
    if (error) throw error
    session.value = data.session
    await loadProfile()
  }

  async function updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'username' | 'bio' | 'avatar_url' | 'locale'>>) {
    if (!userId.value) return
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId.value).select().single()
    if (error) throw error
    profile.value = data as Profile
  }

  async function signOut() {
    try { await disablePush() } catch { /* ignore */ }
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
  }

  return { session, profile, ready, userId, init, loadProfile, sendCode, verifyCode, updateProfile, signOut }
})
