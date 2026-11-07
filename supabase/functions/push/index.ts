// Sends Web Push notifications for a new message.
// Invoked by the `messages_after_insert` trigger (pg_net) with a shared secret header.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const T = {
  en: { image: '📷 Photo', file: '📎 File', voice: '🎤 Voice message', sticker: 'Sticker', gif: 'GIF', text: '', call: '📞 Incoming call', callVideo: '📹 Incoming video call' },
  vi: { image: '📷 Hình ảnh', file: '📎 Tệp', voice: '🎤 Tin nhắn thoại', sticker: 'Nhãn dán', gif: 'GIF', text: '', call: '📞 Cuộc gọi đến', callVideo: '📹 Cuộc gọi video đến' },
} as const
type Locale = keyof typeof T
type Kind = keyof (typeof T)['en']

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  const { message_id } = await req.json().catch(() => ({}))
  if (!message_id) return new Response('bad request', { status: 400 })

  const { data: msg } = await db
    .from('messages')
    .select('id, chat_id, sender_id, kind, content, attachment, deleted_at')
    .eq('id', message_id)
    .maybeSingle()
  if (!msg || msg.deleted_at || msg.kind === 'system') return new Response('skip')

  const [{ data: chat }, { data: members }, { data: sender }] = await Promise.all([
    db.from('chats').select('id, type, title').eq('id', msg.chat_id).single(),
    db.from('chat_members').select('user_id, muted').eq('chat_id', msg.chat_id),
    db.from('profiles').select('display_name, avatar_url').eq('id', msg.sender_id).maybeSingle(),
  ])
  const recipients = (members ?? []).filter((m) => m.user_id !== msg.sender_id && !m.muted).map((m) => m.user_id)
  if (!chat || recipients.length === 0) return new Response('no recipients')

  const [{ data: subs }, { data: profiles }] = await Promise.all([
    db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', recipients),
    db.from('profiles').select('id, locale').in('id', recipients),
  ])
  const localeOf = new Map((profiles ?? []).map((p) => [p.id, (p.locale as Locale) ?? 'en']))
  const senderName = sender?.display_name ?? 'iemanchat'

  const results = await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      const t = T[localeOf.get(s.user_id) ?? 'en'] ?? T.en
      const kind = msg.kind as Kind
      const isCall = kind === 'call'
      const preview = isCall
        ? (msg.attachment?.call_kind === 'video' ? t.callVideo : t.call)
        : kind === 'text' || (kind === 'sticker' && msg.content)
          ? (msg.content ?? '').slice(0, 140)
          : t[kind] ?? ''
      const payload = {
        title: chat.type === 'group' ? chat.title ?? 'iemanchat' : senderName,
        body: chat.type === 'group' ? `${senderName}: ${preview}` : preview,
        icon: sender?.avatar_url ?? undefined,
        chatId: chat.id,
        url: `/c/${chat.id}`,
        // Calls: a separate, ringing-style notification that is useless after a minute.
        call: isCall || undefined,
        tag: isCall ? `call-${msg.attachment?.call_id ?? msg.id}` : undefined,
      }
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: isCall ? 60 : 60 * 60 * 24, urgency: 'high' },
        )
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
        throw err
      }
    }),
  )
  const sent = results.filter((r) => r.status === 'fulfilled').length
  return Response.json({ sent, failed: results.length - sent })
})
