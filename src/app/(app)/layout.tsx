import type { Metadata } from 'next'
import './app.css'
import { LOGO_ICONS } from '@/lib/logo'
import ThemeScript from './ThemeScript'

// 로그인 이후 내부 화면 — @bini59/design 토큰/컴포넌트를 쓴다. 랜딩((site))과 루트 레이아웃을 분리해
// 디자인 시스템의 전역 CSS(--color-* 초기화, body 스타일)가 공개 랜딩에 새지 않게 한다.
export const metadata: Metadata = {
  title: '내 캘린더 · Notion Calendar Bridge',
  icons: { icon: LOGO_ICONS },
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  )
}
