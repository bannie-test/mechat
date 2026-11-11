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
    const [{ data, error }, { data: rows }, { data: flags }] = await Promise.all([
      supabase.rpc('get_my_chats'),
      supabase.from('chat_members').select('*'),
      supabase.from('chats').select('id, restricted'),
    ])
    if (error) throw error
    const restricted = new Map(((flags ?? []) as { id: string; restricted: boolean }[]).map((f) => [f.id, f.restricted]))
    list.value = ((data ?? []) as ChatSummary[]).map((c) => ({ ...c, restricted: restricted.get(c.id) ?? false }))
    for (const k of Object.keys(members)) delete members[k]
    for (const m of (rows ?? []) as ChatMember[]) {
      if (!members[m.chat_id]) members[m.chat_id] = []
      members[m.chat_id].push(m)
    }
    loaded.value = true
  }

  // ---- nicknames (only you see them) -------------------------------------------
  /** userId -> nickname you gave them. Applied to people[id].display_name; the real name stays in real_name. */
  const nicknames = reactive<Record<string, string>>({})

  function withNick(p: Profile): Profile {
    const real = p.real_name ?? p.display_name
    const nick = nicknames[p.id]
    return { ...p, real_name: real, display_name: nick || real }
  }

  async function loadPeople() {
    const [{ data }, { data: nicks }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('nicknames').select('target_id, nickname'),
    ])
    for (const k of Object.keys(nicknames)) delete nicknames[k]
    for (const n of (nicks ?? []) as { target_id: string; nickname: string }[]) nicknames[n.target_id] = n.nickname
    for (const p of (data ?? []) as Profile[]) people[p.id] = withNick(p)
  }

  async function setNickname(userId: string, nickname: string) {
    const nick = nickname.trim().slice(0, 64)
    const me_ = me()
    if (!me_ || userId === me_) return
    if (nick) {
      const { error } = await supabase.from('nicknames').upsert({ owner_id: me_, target_id: userId, nickname: nick, updated_at: new Date().toISOString() })
      if (error) throw error
      nicknames[userId] = nick
    } else {
      const { error } = await supabase.from('nicknames').delete().match({ owner_id: me_, target_id: userId })
      if (error) throw error
      delete nicknames[userId]
    }
    const p = people[userId]
    if (p) people[userId] = withNick(p)
  }

  /** Real (self-chosen) name, e.g. for forwarded-message credits that other people see. */
  function realName(userId: string | null | undefined) {
    const p = people[userId ?? '']
    return p?.real_name ?? p?.display_name ?? ''
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
    if (row.restricted !== undefined) c.restricted = row.restricted
    if (row.last_message_at && row.last_message_at > c.last_message_at) c.last_message_at = row.last_message_at
  }

  function onProfile(row: Profile) {
    people[row.id] = withNick({ ...people[row.id], ...row, real_name: undefined })
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

  // ---- group moderation -------------------------------------------------------------
  function myMember(chatId: string) {
    return (members[chatId] ?? []).find((m) => m.user_id === me())
  }
  /** Owner / admin of a group. */
  function isManager(chatId: string) {
    const r = myMember(chatId)?.role
    return byId(chatId)?.type === 'group' && (r === 'owner' || r === 'admin')
  }
  /** Can I send in this chat? (Muted members and members of restricted groups can't.) */
  function canPost(chatId: string) {
    const m = myMember(chatId)
    if (!m) return true // members not loaded yet: let the server decide
    return m.role !== 'member' || m.can_post !== false
  }

  async function removeMember(chatId: string, userId: string) {
    const { error } = await supabase.rpc('remove_chat_member', { p_chat: chatId, p_user: userId })
    if (error) throw error
    if (members[chatId]) members[chatId] = members[chatId].filter((m) => m.user_id !== userId)
  }

  async function setCanPost(chatId: string, userId: string, value: boolean) {
    const { error } = await supabase.rpc('set_member_can_post', { p_chat: chatId, p_user: userId, p_can_post: value })
    if (error) throw error
    const m = members[chatId]?.find((x) => x.user_id === userId)
    if (m) m.can_post = value
  }

  async function setRestricted(chatId: string, restricted: boolean, allowed: string[] = []) {
    const { error } = await supabase.rpc('set_chat_restricted', { p_chat: chatId, p_restricted: restricted, p_allowed: allowed })
    if (error) throw error
    onChatUpdate({ id: chatId, restricted })
    for (const m of members[chatId] ?? []) if (m.role === 'member') m.can_post = !restricted || allowed.includes(m.user_id)
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
    nicknames, setNickname, realName, isManager, canPost, removeMember, setCanPost, setRestricted,
  }
})
