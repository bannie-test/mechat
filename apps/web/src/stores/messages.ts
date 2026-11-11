import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'
import { copyAttachment, removeAttachment } from '@/lib/storage'
import { sfx } from '@/lib/sound'
import { fetchWeather, type WeatherError } from '@/lib/weather'
import type { Attachment, Locale, Message, MessageKind, Reaction } from '@/lib/types'
import { useAuth } from './auth'
import { useChats } from './chats'

const PAGE = 40

interface ChatMessages {
  items: Message[]
  loaded: boolean
  hasMore: boolean
  loading: boolean
}

export type Preparer = (onProgress: (fraction: number) => void) => Promise<Attachment>

export interface Draft {
  kind: MessageKind
  content?: string | null
  attachment?: Attachment | null
  reply_to_id?: string | null
  forwarded_from?: Message['forwarded_from']
  /** Local preview (object URL) while uploading. */
  localUrl?: string
}

export const useMessages = defineStore('messages', () => {
  const byChat = reactive<Record<string, ChatMessages>>({})
  const reactions = reactive<Record<string, Reaction[]>>({})
  /** Messages fetched individually (e.g. reply targets outside the loaded page). */
  const extras = reactive<Record<string, Message | null>>({})
  /** Upload steps for messages that still need their attachment (enables retry). */
  const preparers = new Map<string, Preparer>()

  // At most 3 uploads at a time: parallel enough to be fast, without starving each other.
  let running = 0
  const waiting: (() => void)[] = []
  async function slot<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= 3) await new Promise<void>((r) => waiting.push(r))
    running++
    try {
      return await fn()
    } finally {
      running--
      waiting.shift()?.()
    }
  }

  function bucket(chatId: string): ChatMessages {
    // Read back through the reactive object: `x ??= {}` would return the raw, untracked object.
    if (!byChat[chatId]) byChat[chatId] = { items: [], loaded: false, hasMore: true, loading: false }
    return byChat[chatId]
  }

  function upsert(msg: Message) {
    const b = bucket(msg.chat_id)
    if (msg.deleted_at) {
      b.items = b.items.filter((m) => m.id !== msg.id)
      return
    }
    const i = b.items.findIndex((m) => m.id === msg.id)
    if (i >= 0) {
      const prev = b.items[i]
      b.items[i] = { ...msg, _localUrl: prev._localUrl, _status: msg._status }
      return
    }
    let j = b.items.length
    while (j > 0 && b.items[j - 1].created_at > msg.created_at) j--
    b.items.splice(j, 0, msg)
  }

  function find(id: string | null | undefined): Message | undefined {
    if (!id) return undefined
    for (const b of Object.values(byChat)) {
      const m = b.items.find((x) => x.id === id)
      if (m) return m
    }
    return extras[id] ?? undefined
  }

  async function fetchOne(id: string) {
    if (id in extras) return
    extras[id] = null
    const { data } = await supabase.from('messages').select('*').eq('id', id).maybeSingle()
    extras[id] = (data as Message) ?? null
  }

  async function loadReactions(ids: string[]) {
    if (!ids.length) return
    const { data } = await supabase.from('message_reactions').select('*').in('message_id', ids)
    for (const id of ids) reactions[id] = []
    for (const r of (data ?? []) as Reaction[]) reactions[r.message_id].push(r)
  }

  async function loadLatest(chatId: string) {
    const b = bucket(chatId)
    b.loading = true
    try {
      const { data, error } = await supabase
        .from('messages').select('*').eq('chat_id', chatId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(PAGE)
      if (error) throw error
      const rows = (data ?? []) as Message[]
      if (!b.loaded) b.hasMore = rows.length === PAGE
      for (const m of rows.reverse()) upsert(m)
      b.loaded = true
      await loadReactions(rows.map((m) => m.id))
    } finally {
      b.loading = false
    }
  }

  async function loadOlder(chatId: string) {
    const b = bucket(chatId)
    if (b.loading || !b.hasMore) return 0
    const oldest = b.items.find((m) => !m._status && !m._local)
    if (!oldest) return 0
    b.loading = true
    try {
      const { data } = await supabase
        .from('messages').select('*').eq('chat_id', chatId).is('deleted_at', null)
        .lt('created_at', oldest.created_at).order('created_at', { ascending: false }).limit(PAGE)
      const rows = ((data ?? []) as Message[]).reverse()
      b.hasMore = rows.length === PAGE
      b.items = [...rows, ...b.items]
      await loadReactions(rows.map((m) => m.id))
      return rows.length
    } finally {
      b.loading = false
    }
  }

  async function deliver(msg: Message) {
    try {
      let attachment = msg.attachment
      const prepare = preparers.get(msg.id)
      if (prepare) {
        const live = () => bucket(msg.chat_id).items.find((m) => m.id === msg.id)
        const uploaded = await slot(() => prepare((f) => {
          const m = live()
          if (m) m._progress = f
        }))
        attachment = { ...(attachment ?? {}), ...uploaded }
        preparers.delete(msg.id)
      }
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id: msg.id, chat_id: msg.chat_id, sender_id: msg.sender_id, kind: msg.kind,
          content: msg.content, attachment, reply_to_id: msg.reply_to_id, forwarded_from: msg.forwarded_from,
        })
        .select().single()
      if (error) throw error
      upsert({ ...(data as Message), _status: undefined })
      useChats().onMessageInsert(data as Message)
      if (prepare) sfx.uploaded()
    } catch (e) {
      console.error('send failed', e)
      const cur = bucket(msg.chat_id).items.find((m) => m.id === msg.id)
      if (cur && cur._status === 'sending') cur._status = 'failed'
    }
  }

  async function send(chatId: string, draft: Draft, prepare?: Preparer) {
    const msg: Message = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      sender_id: useAuth().userId,
      kind: draft.kind,
      content: draft.content ?? null,
      attachment: draft.attachment ?? null,
      reply_to_id: draft.reply_to_id ?? null,
      forwarded_from: draft.forwarded_from ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      _status: 'sending',
      _localUrl: draft.localUrl,
    }
    if (prepare) preparers.set(msg.id, prepare)
    upsert(msg)
    useChats().onMessageInsert(msg)
    await deliver(msg)
  }

  /** /weather: a system card only you see, filled in once the location and forecast arrive. */
  async function postWeather(chatId: string, locale: Locale) {
    const msg: Message = {
      id: crypto.randomUUID(), chat_id: chatId, sender_id: null, kind: 'weather', content: null,
      attachment: { state: 'loading' }, reply_to_id: null, forwarded_from: null,
      created_at: new Date().toISOString(), edited_at: null, deleted_at: null, _local: true,
    }
    upsert(msg)
    const cur = () => bucket(chatId).items.find((m) => m.id === msg.id)
    try {
      const report = await fetchWeather(locale)
      const m = cur()
      if (m) m.attachment = { state: 'ok', report }
    } catch (e) {
      const m = cur()
      const error: WeatherError = e === 'denied' || e === 'unavailable' ? e : 'network'
      if (m) m.attachment = { state: 'error', error }
    }
  }

  async function retry(msg: Message) {
    msg._status = 'sending'
    msg._progress = 0
    await deliver(msg)
  }

  function discard(msg: Message) {
    preparers.delete(msg.id)
    const b = bucket(msg.chat_id)
    b.items = b.items.filter((m) => m.id !== msg.id)
  }

  async function edit(msg: Message, content: string) {
    const prev = msg.content
    msg.content = content
    msg.edited_at = new Date().toISOString()
    const { error } = await supabase.from('messages').update({ content }).eq('id', msg.id)
    if (error) {
      msg.content = prev
      throw error
    }
  }

  async function remove(msg: Message) {
    if (msg._status) return discard(msg)
    const b = bucket(msg.chat_id)
    b.items = b.items.filter((m) => m.id !== msg.id)
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg.id)
    if (error) {
      upsert(msg)
      throw error
    }
    if (msg.attachment?.path) void removeAttachment(msg.attachment.path).catch(() => {})
    useChats().onMessageUpdate({ ...msg, deleted_at: new Date().toISOString() })
  }

  async function toggleReaction(msg: Message, emoji: string) {
    const me = useAuth().userId!
    if (!reactions[msg.id]) reactions[msg.id] = []
    const list = reactions[msg.id]
    const mine = list.find((r) => r.user_id === me && r.emoji === emoji)
    if (mine) {
      reactions[msg.id] = list.filter((r) => r !== mine)
      await supabase.from('message_reactions').delete().match({ message_id: msg.id, user_id: me, emoji })
    } else {
      list.push({ message_id: msg.id, user_id: me, emoji, created_at: new Date().toISOString() })
      const { error } = await supabase.from('message_reactions').insert({ message_id: msg.id, user_id: me, emoji })
      if (error && error.code !== '23505') reactions[msg.id] = list.filter((r) => !(r.user_id === me && r.emoji === emoji))
    }
  }

  async function forward(msg: Message, toChatId: string) {
    const chats = useChats()
    const originalSender = msg.forwarded_from ?? {
      sender_id: msg.sender_id,
      sender_name: chats.people[msg.sender_id ?? '']?.display_name ?? '',
    }
    let attachment = msg.attachment
    if (attachment?.path) attachment = { ...attachment, path: await copyAttachment(attachment.path, toChatId) }
    await send(toChatId, { kind: msg.kind, content: msg.content, attachment, forwarded_from: originalSender })
  }

  // ---- realtime ------------------------------------------------------------
  function onRemote(type: 'INSERT' | 'UPDATE', msg: Message) {
    if (type === 'INSERT' && msg.sender_id !== useAuth().userId && msg.kind !== 'system' && msg.kind !== 'call' && !find(msg.id)) {
      const chat = useChats().byId(msg.chat_id)
      if (!chat?.muted) sfx.incoming()
    }
    if (msg.id in extras) extras[msg.id] = msg
    const b = byChat[msg.chat_id]
    if (b?.loaded) upsert(msg)
    const chats = useChats()
    // Idempotent: also covers our own messages sent from a mini app or another device.
    if (type === 'INSERT') chats.onMessageInsert(msg)
    else chats.onMessageUpdate(msg)
  }

  function onReaction(type: string, row: Partial<Reaction>, old: Partial<Reaction>) {
    if (type === 'INSERT' && row.message_id) {
      if (!reactions[row.message_id]) reactions[row.message_id] = []
      const list = reactions[row.message_id]
      if (!list.some((r) => r.user_id === row.user_id && r.emoji === row.emoji)) list.push(row as Reaction)
    } else if (type === 'DELETE' && old.message_id && reactions[old.message_id]) {
      reactions[old.message_id] = reactions[old.message_id].filter(
        (r) => !(r.user_id === old.user_id && r.emoji === old.emoji),
      )
    }
  }

  function reset() {
    for (const k of Object.keys(byChat)) delete byChat[k]
    for (const k of Object.keys(reactions)) delete reactions[k]
  }

  return {
    byChat, reactions, extras, bucket, find, fetchOne,
    loadLatest, loadOlder, send, postWeather, retry, discard, edit, remove, toggleReaction, forward,
    onRemote, onReaction, reset,
  }
})
