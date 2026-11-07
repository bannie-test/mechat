import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '@/lib/types'

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

export const useUi = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0
  function toast(text: string, action?: Toast['action'], ms = 3500) {
    const id = ++seq
    toasts.value.push({ id, text, action })
    if (ms > 0) setTimeout(() => dismiss(id), ms)
    return id
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  const forwarding = ref<Message | null>(null)
  const viewer = ref<{ src: string; alt?: string } | null>(null)
  const appDrawerOpen = ref(false)
  const appDrawerChatId = ref<string | null>(null)

  function openAppDrawer(chatId: string | null = null) {
    appDrawerChatId.value = chatId
    appDrawerOpen.value = true
  }

  return { toasts, toast, dismiss, forwarding, viewer, appDrawerOpen, appDrawerChatId, openAppDrawer }
})
