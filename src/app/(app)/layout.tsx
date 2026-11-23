import './app.css'
import { LocaleProvider } from '@/lib/i18n-client'
import { localizedMetadata, requestLocale } from '@/lib/i18n-server'
import ThemeScript from './ThemeScript'
import Providers from './Providers'

export const generateMetadata = () => localizedMetadata(true)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale()
  return <html lang={locale} suppressHydrationWarning>
    <head><ThemeScript /></head>
    <body><LocaleProvider locale={locale}><Providers>{children}</Providers></LocaleProvider></body>
  </html>
}
