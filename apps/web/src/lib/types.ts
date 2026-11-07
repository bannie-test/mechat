export type ChatType = 'direct' | 'group'
export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'sticker' | 'gif' | 'system'
export type Locale = 'en' | 'vi'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_admin: boolean
  locale: Locale
  last_seen_at: string
  created_at: string
}

export interface Attachment {
  /** Storage path in the `attachments` bucket. */
  path?: string
  /** Direct URL (GIFs from a provider). */
  url?: string
  name?: string
  mime?: string
  size?: number
  width?: number
  height?: number
  /** Seconds (voice). */
  duration?: number
  /** 0..1 levels for voice messages. */
  waveform?: number[]
  /** System message data. */
  [key: string]: unknown
}

export interface ForwardedFrom {
  sender_id: string | null
  sender_name: string
}

export interface Message {
  id: string
  chat_id: string
  sender_id: string | null
  kind: MessageKind
  content: string | null
  attachment: Attachment | null
  reply_to_id: string | null
  forwarded_from: ForwardedFrom | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  /** Local-only fields. */
  _status?: 'sending' | 'failed'
  _localUrl?: string
}

export interface Reaction {
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ChatMember {
  chat_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  last_read_at: string
  muted: boolean
}

export interface ChatSummary {
  id: string
  type: ChatType
  title: string | null
  avatar_url: string | null
  created_at: string
  last_message_at: string
  muted: boolean
  last_read_at: string
  peer_id: string | null
  member_count: number
  unread_count: number
  last_message: Message | null
}

export interface Invite {
  code: string
  created_by: string | null
  note: string | null
  used_by: string | null
  used_at: string | null
  expires_at: string
  created_at: string
}

export interface MiniApp {
  id: string
  name: Partial<Record<Locale, string>>
  description: Partial<Record<Locale, string>>
  icon: string | null
  url: string
  sort: number
}
