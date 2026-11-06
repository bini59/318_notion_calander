import en from '@/messages/en.json'
import ko from '@/messages/ko.json'
import { headers } from 'next/headers'
import { localeFromAcceptLanguage } from './locale'
import { LOGO_ICONS } from './logo'

export async function requestLocale() {
  return localeFromAcceptLanguage((await headers()).get('accept-language'))
}

export async function localizedMetadata(app = false) {
  const locale = await requestLocale()
  const messages = locale === 'ko' ? ko : en
  const title = app ? messages.appTitle : messages.siteTitle
  const description = messages.metadataDescription
  return { title, description, icons: { icon: LOGO_ICONS }, openGraph: { title, description, locale: locale === 'ko' ? 'ko_KR' : 'en_US' } }
}
