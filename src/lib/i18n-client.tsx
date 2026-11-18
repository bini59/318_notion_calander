'use client'

import { createContext, useCallback, useContext } from 'react'
import en from '@/messages/en.json'
import ko from '@/messages/ko.json'
import type { Locale } from './locale'

const LocaleContext = createContext<Locale>('en')
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}
export function useLocale() { return useContext(LocaleContext) }
export function useTranslations() {
  const locale = useLocale()
  const messages = locale === 'ko' ? ko : en
  return useCallback((key: keyof typeof en) => messages[key], [messages])
}
