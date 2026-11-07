import { createI18n } from 'vue-i18n'
import en from './en'
import vi from './vi'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, vi },
})
