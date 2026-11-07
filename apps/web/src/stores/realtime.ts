import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ChatMember, Message, Profile, Reaction } from '@/lib/types'
import { useChats } from './chats'
import { useMessages } from './messages'

const TYPING_TTL = 5000

/**
 * One channel for database changes (RLS filters what each user receives) and one
 * "lobby" channel for presence (online) + typing broadcasts.
 */
export const useRealtime = defineStore('realtime', () => {
  const online = ref(new Set<string>())
  /** chatId -> userId -> expiry timestamp */
  const typing = reactive<Record<string, Record<string, number>>>({})
  const connected = ref(false)

  let db: RealtimeChannel | null = null
  let lobby: RealtimeChannel | null = null
  let me: string | null = null
  let wasConnected = false
  let sweep = 0
  const lastTypingSent = new Map<string, number>()

  function start(userId: string) {
    if (me === userId && db) return
    stop()
    me = userId
    const chats = useChats()
    const messages = useMessages()

    db = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
        if (p.eventType === 'INSERT' || p.eventType === 'UPDATE') messages.onRemote(p.eventType, p.new as Message)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) =>
        messages.onReaction(p.eventType, p.new as Partial<Reaction>, p.old as Partial<Reaction>),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, (p) =>
        chats.onMember(p.eventType, p.new as Partial<ChatMember>, p.old as Partial<ChatMember>),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, (p) =>
        chats.onChatUpdate(p.new as { id: string }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
        if (p.eventType !== 'DELETE') chats.onProfile(p.new as Profile)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          connected.value = true
          if (wasConnected) void resync()
          wasConnected = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connected.value = false
        }
      })

    lobby = supabase.channel('lobby', { config: { presence: { key: userId } } })
    lobby
      .on('presence', { event: 'sync' }, () => {
        online.value = new Set(Object.keys(lobby!.presenceState()))
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { chat_id, user_id } = payload as { chat_id: string; user_id: string }
        if (user_id === me) return
        ;(typing[chat_id] ??= {})[user_id] = Date.now() + TYPING_TTL
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        const { chat_id, user_id } = payload as { chat_id: string; user_id: string }
        if (typing[chat_id]) delete typing[chat_id][user_id]
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await trackPresence()
      })

    sweep = window.setInterval(() => {
      const now = Date.now()
      for (const [chat, users] of Object.entries(typing)) {
        for (const [u, exp] of Object.entries(users)) if (exp < now) delete typing[chat][u]
      }
    }, 1000)

    document.addEventListener('visibilitychange', onVisibility)
  }

  async function trackPresence() {
    if (!lobby || document.visibilityState !== 'visible') return
    await lobby.track({ online_at: new Date().toISOString() })
  }

  async function onVisibility() {
    if (!lobby) return
    if (document.visibilityState === 'visible') {
      await trackPresence()
      void resync()
    } else {
      await lobby.untrack()
      void supabase.rpc('touch_last_seen')
    }
  }

  /** Re-fetch after the socket was asleep (phones suspend background tabs). */
  async function resync() {
    const chats = useChats()
    const messages = useMessages()
    await chats.load().catch(() => {})
    if (chats.activeChatId) await messages.loadLatest(chats.activeChatId).catch(() => {})
  }

  function sendTyping(chatId: string) {
    const now = Date.now()
    if (!lobby || now - (lastTypingSent.get(chatId) ?? 0) < 2500) return
    lastTypingSent.set(chatId, now)
    void lobby.send({ type: 'broadcast', event: 'typing', payload: { chat_id: chatId, user_id: me } })
  }

  function stopTyping(chatId: string) {
    if (!lobby || !lastTypingSent.has(chatId)) return
    lastTypingSent.delete(chatId)
    void lobby.send({ type: 'broadcast', event: 'stop_typing', payload: { chat_id: chatId, user_id: me } })
  }

  function typingIn(chatId: string): string[] {
    return Object.keys(typing[chatId] ?? {})
  }

  function stop() {
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(sweep)
    if (db) void supabase.removeChannel(db)
    if (lobby) void supabase.removeChannel(lobby)
    db = lobby = null
    me = null
    wasConnected = false
    online.value = new Set()
  }

  return { online, typing, connected, start, stop, sendTyping, stopTyping, typingIn, resync }
})
