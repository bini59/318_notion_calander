'use client'

import { THEME_SCRIPT } from '@bini59/design'

// 첫 페인트 전에 <html data-theme>를 맞춰 라이트/다크 깜빡임을 막는다.
// (서버 컴포넌트 layout이 디자인 시스템 배럴을 직접 import하면 훅 모듈이 서버 그래프로 들어와서 클라이언트 경계를 둔다.)
export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
}
