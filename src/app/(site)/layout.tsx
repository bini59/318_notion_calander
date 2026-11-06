import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { LocaleProvider } from '@/lib/i18n-client'
import { localizedMetadata, requestLocale } from '@/lib/i18n-server'
import './globals.css'

const inter = Inter({ variable: '--font-sans', subsets: ['latin'] })
export const generateMetadata = () => localizedMetadata()

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale()
  return <html lang={locale} className={inter.variable}>
    <body className="bg-background text-foreground antialiased"><LocaleProvider locale={locale}>{children}</LocaleProvider></body>
    {process.env.NODE_ENV === 'production' && <GoogleAnalytics gaId="G-YG7WX7G45Y" />}
  </html>
}
