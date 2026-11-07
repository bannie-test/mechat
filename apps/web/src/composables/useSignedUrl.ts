import { ref, watchEffect } from 'vue'
import { signedUrl } from '@/lib/storage'
import type { Attachment } from '@/lib/types'

/** Resolves an attachment to a displayable URL (local preview → provider URL → signed storage URL). */
export function useAttachmentUrl(get: () => { attachment: Attachment | null; localUrl?: string }) {
  const url = ref<string | null>(null)
  watchEffect(async () => {
    const { attachment, localUrl } = get()
    if (localUrl) return void (url.value = localUrl)
    if (attachment?.url) return void (url.value = attachment.url)
    if (attachment?.path) {
      try {
        url.value = await signedUrl(attachment.path)
      } catch {
        url.value = null
      }
    }
  })
  return url
}
