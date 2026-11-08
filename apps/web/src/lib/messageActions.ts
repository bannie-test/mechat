import type { Message } from './types'

export type MessageAction = 'reply' | 'copy' | 'edit' | 'forward' | 'delete'

/** Actions offered for a message, in menu order (shared by the context menu and the hover bar). */
export function messageActions(msg: Message, mine: boolean): { name: MessageAction; icon: string; danger?: boolean }[] {
  const out: { name: MessageAction; icon: string; danger?: boolean }[] = []
  if (!msg._status) out.push({ name: 'reply', icon: 'reply' })
  if (msg.content && msg.kind !== 'sticker') out.push({ name: 'copy', icon: 'copy' })
  if (mine && msg.kind === 'text' && !msg._status) out.push({ name: 'edit', icon: 'edit' })
  if (!msg._status && msg.kind !== 'call') out.push({ name: 'forward', icon: 'forward' })
  if (mine) out.push({ name: 'delete', icon: 'trash', danger: true })
  return out
}
