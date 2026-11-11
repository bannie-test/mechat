export type ChatType = 'direct' | 'group'
export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'sticker' | 'gif' | 'system' | 'call' | 'weather'
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
  /** Local: the person's own display name when you've given them a nickname (display_name then holds the nickname). */
  real_name?: string
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
  /** Upload progress 0..1 while sending an attachment. */
  _progress?: number
  /** Only on this device, never sent (e.g. the weather card from /weather). */
  _local?: boolean
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
  /** False when the owner muted this member (or the group is restricted and they weren't picked). */
  can_post: boolean
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
  /** Group: only the owner, admins and picked members can send. */
  restricted?: boolean
  member_count: number
  unread_count: number
  last_message: Message | null
}

export interface MiniApp {
  id: string
  name: Partial<Record<Locale, string>>
  description: Partial<Record<Locale, string>>
  icon: string | null
  url: string
  sort: number
}
