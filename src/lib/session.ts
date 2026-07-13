import type { NextRequest, NextResponse } from 'next/server'
import { decrypt, encrypt } from './crypto'
import { getEnv } from './env'

// user id를 AES-256-GCM으로 봉인한 세션 쿠키. GCM authTag가 무결성을 보장하므로
// 별도 서명 없이도 위조 쿠키는 복호화 단계에서 걸러진다(readSession → null).
// ponytail: 만료/회전 없음 — 필요해지면 payload를 `session:${userId}:${exp}`로 확장해 검사.
export const SESSION_COOKIE = 'session'

// 세션과 access_token 저장이 같은 TOKEN_ENC_KEY를 공유하므로, 봉인 payload에 purpose 태그를
// 붙여 도메인을 분리한다(심층방어). 토큰 ciphertext가 어쩌다 세션 쿠키로 들어와도 이 접두사가
// 없으면 유효 세션으로 오인되지 않는다.
const PURPOSE = 'session:'

export function sealSession(userId: string): string {
  return encrypt(`${PURPOSE}${userId}`)
}

export function readSession(req: NextRequest): string | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const plain = decrypt(raw)
    // purpose 태그 검증 — 없으면(예: 토큰 형식) 세션 아님.
    if (!plain.startsWith(PURPOSE)) return null
    return plain.slice(PURPOSE.length)
  } catch {
    // 변조/포맷 불일치/키 불일치 — 인증 실패로 취급, 절대 throw하지 않는다.
    return null
  }
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set(SESSION_COOKIE, sealSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    // https 배포에서만 Secure — 로컬 http 개발에서 브라우저가 쿠키를 버리지 않도록 BASE_URL로 판별.
    secure: getEnv().BASE_URL.startsWith('https'),
    path: '/',
  })
}
