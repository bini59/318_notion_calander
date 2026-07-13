import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'

let session: typeof import('./session')
let crypto: typeof import('./crypto')

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = './data/app.db'
  session = await import('./session')
  crypto = await import('./crypto')
})

function reqWithCookie(value?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (value !== undefined) headers.cookie = `${session.SESSION_COOKIE}=${value}`
  return new NextRequest('http://localhost:3000/api/x', { headers })
}

describe('session seal/read round-trip', () => {
  it('reads back the exact user id that was sealed', () => {
    const sealed = session.sealSession('user-42')
    expect(sealed).not.toBe('user-42') // 평문 노출 없음
    expect(session.readSession(reqWithCookie(sealed))).toBe('user-42')
  })

  it('returns null when the cookie is missing', () => {
    expect(session.readSession(reqWithCookie(undefined))).toBeNull()
  })

  it('returns null for a tampered cookie instead of throwing', () => {
    const sealed = session.sealSession('user-42')
    const tampered = sealed.slice(0, -3) + 'zzz'
    expect(session.readSession(reqWithCookie(tampered))).toBeNull()
  })

  it('returns null for a garbage cookie value', () => {
    expect(session.readSession(reqWithCookie('not-a-valid-payload'))).toBeNull()
  })

  it('returns null for a valid ciphertext lacking the session purpose tag (e.g. a token)', () => {
    // 같은 키로 암호화됐지만 purpose 태그가 없는 값 = access_token 형식 → 세션으로 오인 금지.
    const tokenShaped = crypto.encrypt('secret_ntn_looks_like_a_token')
    expect(session.readSession(reqWithCookie(tokenShaped))).toBeNull()
  })
})
