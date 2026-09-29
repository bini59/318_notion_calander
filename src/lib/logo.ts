// 개인 프로젝트 공용 로고(static.bini59.dev) — 다른 서비스와 동일한 파비콘/브랜드 마크.
export const LOGO_ICONS = [16, 32, 64, 128, 256, 512].map((size) => ({
  url: `https://static.bini59.dev/logo/logo-${size}.png`,
  type: 'image/png',
  sizes: `${size}x${size}`,
}))

export const LOGO_MARK_URL = 'https://static.bini59.dev/logo/logo-128.png'
