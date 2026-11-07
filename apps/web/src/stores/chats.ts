import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { ChatMember, ChatSummary, Message, Profile } from '@/lib/types'
import { useAuth } from './auth'

export const useChats = defineStore('chats', () => {
  const list = ref<ChatSummary[]>([])
  const loaded = ref(false)
  const people = reactive<Record<string, Profile>>({})
  const members = reactive<Record<string, ChatMember[]>>({})
  const activeChatId = ref<string | null>(null)

  const me = () => useAuth().userId

  const sorted = computed(() =>
    [...list.value].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
  )
  const totalUnread = computed(() => list.value.reduce((n, c) => n + (c.muted ? 0 : c.unread_count), 0))

  function byId(id: string | null | undefined) {
    return id ? list.value.find((c) => c.id === id) : undefined
  }

  async function load() {
    // Small friend groups: fetching every membership row (for read ticks) is cheap.
    const [{ data, error }, { data: rows }] = await Promise.all([
      supabase.rpc('get_my_chats'),
      supabase.from('chat_members').select('*'),
    ])
    if (error) throw error
    list.value = (data ?? []) as ChatSummary[]
    for (const k of Object.keys(members)) delete members[k]
    for (const m of (rows ?? []) as ChatMember[]) {
      if (!members[m.chat_id]) members[m.chat_id] = []
      members[m.chat_id].push(m)
    }
    loaded.value = true
  }

  async function loadPeople() {
    const { data } = await supabase.from('profiles').select('*')
    for (const p of (data ?? []) as Profile[]) people[p.id] = p
  }

  async function loadMembers(chatId: string) {
    const { data } = await supabase.from('chat_members').select('*').eq('chat_id', chatId)
    members[chatId] = (data ?? []) as ChatMember[]
  }

  function title(chat: ChatSummary | undefined) {
    if (!chat) return ''
    if (chat.type === 'group') return chat.title ?? ''
    return people[chat.peer_id ?? '']?.display_name ?? '…'
  }

  /** Avatar descriptor for a chat (group image or the other person's avatar). */
  function avatar(chat: ChatSummary | undefined) {
    if (!chat) return { id: '', name: '', url: null as string | null }
    if (chat.type === 'group') return { id: chat.id, name: chat.title ?? '', url: chat.avatar_url }
    const p = people[chat.peer_id ?? '']
    return { id: chat.peer_id ?? chat.id, name: p?.display_name ?? '', url: p?.avatar_url ?? null }
  }

  // ---- realtime handlers -------------------------------------------------
  function onMessageInsert(msg: Message) {
    const chat = byId(msg.chat_id)
    if (!chat) return void load()
    if (!chat.last_message || chat.last_message.created_at <= msg.created_at || chat.last_message.id === msg.id) {
      chat.last_message = msg
    }
    if (msg.created_at > chat.last_message_at) chat.last_message_at = msg.created_at
    if (msg.sender_id !== me() && msg.kind !== 'system' && !msg._status) chat.unread_count++
  }

  function onMessageUpdate(msg: Message) {
    const chat = byId(msg.chat_id)
    if (chat?.last_message?.id !== msg.id) return
    if (msg.deleted_at) void load()
    else chat.last_message = msg
  }

  function onMember(type: string, row: Partial<ChatMember>, old: Partial<ChatMember>) {
    const chatId = (row.chat_id ?? old.chat_id) as string
    const userId = (row.user_id ?? old.user_id) as string
    if (type === 'INSERT') {
      if (userId === me()) return void load()
      if (members[chatId]) members[chatId].push(row as ChatMember)
      const c = byId(chatId)
      if (c) c.member_count++
    } else if (type === 'DELETE') {
      if (userId === me()) list.value = list.value.filter((c) => c.id !== chatId)
      else if (members[chatId]) members[chatId] = members[chatId].filter((m) => m.user_id !== userId)
      const c = byId(chatId)
      if (c) c.member_count = Math.max(0, c.member_count - 1)
    } else if (type === 'UPDATE') {
      const list2 = members[chatId]
      const i = list2?.findIndex((m) => m.user_id === userId) ?? -1
      if (list2 && i >= 0) list2[i] = { ...list2[i], ...row }
      const c = byId(chatId)
      if (c && userId === me()) {
        if (row.muted !== undefined) c.muted = row.muted
        if (row.last_read_at) {
          c.last_read_at = row.last_read_at
          if (row.last_read_at >= c.last_message_at) c.unread_count = 0
        }
      }
    }
  }

  function onChatUpdate(row: Partial<ChatSummary> & { id: string }) {
    const c = byId(row.id)
    if (!c) return
    if (row.title !== undefined) c.title = row.title
    if (row.avatar_url !== undefined) c.avatar_url = row.avatar_url
    if (row.last_message_at && row.last_message_at > c.last_message_at) c.last_message_at = row.last_message_at
  }

  function onProfile(row: Profile) {
    people[row.id] = { ...people[row.id], ...row }
    const auth = useAuth()
    if (row.id === auth.userId) auth.profile = { ...auth.profile!, ...row }
  }

  // ---- actions ------------------------------------------------------------
  const readTimers = new Map<string, number>()
  function markRead(chatId: string) {
    const c = byId(chatId)
    if (!c || (c.unread_count === 0 && c.last_read_at >= c.last_message_at)) return
    c.unread_count = 0
    if (readTimers.has(chatId)) return
    readTimers.set(chatId, window.setTimeout(async () => {
      readTimers.delete(chatId)
      const { data } = await supabase.rpc('mark_read', { p_chat: chatId })
      if (data && c) c.last_read_at = data as string
    }, 400))
  }

  async function setMuted(chatId: string, muted: boolean) {
    const c = byId(chatId)
    if (c) c.muted = muted
    await supabase.from('chat_members').update({ muted }).eq('chat_id', chatId).eq('user_id', me()!)
  }

  async function openDirect(userId: string) {
    const existing = list.value.find((c) => c.type === 'direct' && c.peer_id === userId)
    if (existing) return existing.id
    const { data, error } = await supabase.rpc('create_direct_chat', { p_other: userId })
    if (error) throw error
    await load()
    return data as string
  }

  async function createGroup(name: string, userIds: string[]) {
    const { data, error } = await supabase.rpc('create_group_chat', { p_title: name, p_members: userIds })
    if (error) throw error
    await load()
    return data as string
  }

  async function addMembers(chatId: string, userIds: string[]) {
    const { error } = await supabase.rpc('add_chat_members', { p_chat: chatId, p_members: userIds })
    if (error) throw error
    await loadMembers(chatId)
  }

  async function leave(chatId: string) {
    const { error } = await supabase.rpc('leave_chat', { p_chat: chatId })
    if (error) throw error
    list.value = list.value.filter((c) => c.id !== chatId)
  }

  async function updateGroup(chatId: string, patch: { title?: string; avatar_url?: string | null }) {
    const { error } = await supabase.from('chats').update(patch).eq('id', chatId)
    if (error) throw error
    onChatUpdate({ id: chatId, ...patch })
  }

  function reset() {
    list.value = []
    loaded.value = false
    activeChatId.value = null
  }

  return {
    list, loaded, people, members, activeChatId, sorted, totalUnread,
    byId, load, loadPeople, loadMembers, title, avatar,
    onMessageInsert, onMessageUpdate, onMember, onChatUpdate, onProfile,
    markRead, setMuted, openDirect, createGroup, addMembers, leave, updateGroup, reset,
  }
})
