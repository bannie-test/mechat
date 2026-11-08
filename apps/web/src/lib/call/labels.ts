import type { Message } from '@/lib/types'

export interface CallLogInfo {
  /** i18n key for the title, e.g. "Missed call". */
  key: string
  video: boolean
  /** Still ringing or in progress. */
  live: boolean
  /** Show in red (missed/declined, from the receiving side). */
  missed: boolean
  outgoing: boolean
  /** Seconds (0 if never answered). */
  duration: number
}

/** Describe a `kind: 'call'` message from the viewer's point of view. */
export function callLogInfo(m: Message, mine: boolean, group: boolean): CallLogInfo {
  const a = m.attachment ?? {}
  const video = a.call_kind === 'video'
  const status = String(a.status ?? 'ended')
  const live = status === 'ringing' || status === 'ongoing'
  const duration = Number(a.duration ?? 0)
  let key: string
  if (live) key = 'call.ongoing'
  else if (status === 'missed') key = mine ? 'call.log.cancelled' : video ? 'call.log.missedVideo' : 'call.log.missed'
  else if (status === 'declined') key = mine ? 'call.log.declinedOut' : 'call.log.declinedIn'
  else if (group) key = video ? 'call.log.groupVideo' : 'call.log.group'
  else if (mine) key = video ? 'call.log.outgoingVideo' : 'call.log.outgoing'
  else key = video ? 'call.log.incomingVideo' : 'call.log.incoming'
  return { key, video, live, missed: !mine && (status === 'missed' || status === 'declined'), outgoing: mine, duration }
}
