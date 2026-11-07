import { supabase } from './supabase'
import type { Attachment } from './types'

const BUCKET = 'attachments'
const cache = new Map<string, { url: string; exp: number }>()
const inflight = new Map<string, Promise<string>>()

export async function signedUrl(path: string, download?: string): Promise<string> {
  const key = download ? `${path}#dl` : path
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  const pending = inflight.get(key)
  if (pending) return pending
  const p = (async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600, download ? { download } : undefined)
    if (error || !data) throw error ?? new Error('signed url failed')
    cache.set(key, { url: data.signedUrl, exp: Date.now() + 3600_000 })
    return data.signedUrl
  })().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function safeName(name: string) {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'file'
}

export async function uploadAttachment(chatId: string, file: Blob, name: string): Promise<Attachment> {
  const path = `${chatId}/${crypto.randomUUID()}-${safeName(name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '31536000',
  })
  if (error) throw error
  return { path, name, mime: file.type, size: file.size }
}

export async function copyAttachment(fromPath: string, toChatId: string): Promise<string> {
  const file = fromPath.split('/').slice(1).join('/')
  const to = `${toChatId}/${crypto.randomUUID()}-${file.replace(/^[0-9a-f-]{36}-/, '')}`
  const { error } = await supabase.storage.from(BUCKET).copy(fromPath, to)
  if (error) throw error
  return to
}

export async function removeAttachment(path: string) {
  await supabase.storage.from(BUCKET).remove([path])
}

export async function uploadAvatar(userId: string, file: Blob): Promise<string> {
  const resized = await resizeImage(file, 512, 0.85)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, resized.blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/** Downscale large photos before upload (saves free-tier storage and bandwidth). */
export async function resizeImage(file: Blob, max = 1920, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return { blob: file, width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  if (scale === 1 && file.type === 'image/jpeg' && file.size < 1.5 * 1024 * 1024) {
    bitmap.close()
    return { blob: file, width, height }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', quality),
  )
  return { blob, width, height }
}
