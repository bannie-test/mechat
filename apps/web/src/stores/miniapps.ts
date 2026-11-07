import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Locale, MiniApp } from '@/lib/types'

export const useMiniApps = defineStore('miniapps', () => {
  const apps = ref<MiniApp[]>([])
  const loaded = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    const { data } = await supabase.from('mini_apps').select('id, name, description, icon, url, sort').order('sort')
    apps.value = (data ?? []) as MiniApp[]
    loaded.value = true
  }

  function byId(id: string | null | undefined) {
    return apps.value.find((a) => a.id === id)
  }

  function label(app: MiniApp, locale: Locale) {
    return app.name[locale] ?? app.name.en ?? app.id
  }

  function describe(app: MiniApp, locale: Locale) {
    return app.description[locale] ?? app.description.en ?? ''
  }

  return { apps, loaded, load, byId, label, describe }
})
