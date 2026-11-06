import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import en from '@/messages/en.json'
import ko from '@/messages/ko.json'
import { LocaleProvider } from './i18n-client'
import Stepper from '@/app/(app)/setup/Stepper'

vi.mock('next/headers', () => ({ headers: vi.fn() }))
import { headers } from 'next/headers'
import { localizedMetadata } from './i18n-server'

describe('localized UI', () => {
  it('keeps both message catalogs in sync', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort())
    expect(Object.values(en).every(Boolean)).toBe(true)
    expect(Object.values(ko).every(Boolean)).toBe(true)
  })
  it('renders wizard labels in the selected language', () => {
    const render = (locale: 'en' | 'ko') => renderToStaticMarkup(<LocaleProvider locale={locale}><Stepper current={1} /></LocaleProvider>)
    expect(render('en')).toContain('Choose database')
    expect(render('en')).not.toMatch(/[가-힣]/)
    expect(render('ko')).toContain('DB 선택')
  })
  it('localizes metadata and Open Graph for the request', async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ 'accept-language': 'ko-KR,ko;q=0.9' }) as never)
    expect(await localizedMetadata()).toMatchObject({ title: ko.siteTitle, description: ko.metadataDescription, openGraph: { locale: 'ko_KR', title: ko.siteTitle } })
    vi.mocked(headers).mockResolvedValue(new Headers({ 'accept-language': 'en-US,en;q=0.9' }) as never)
    expect(await localizedMetadata(true)).toMatchObject({ title: en.appTitle, description: en.metadataDescription, openGraph: { locale: 'en_US', title: en.appTitle } })
  })
})
