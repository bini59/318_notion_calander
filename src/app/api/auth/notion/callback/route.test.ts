import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// 라우트가 붙는 실제 계약만 mock — STATE_COOKIE 등 상수는 원본 유지.
const exchangeCodeForToken = vi.fn()
const upsertUserByWorkspace = vi.fn()

vi.mock('@/lib/notion-oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notion-oauth')>()),
  exchangeCodeForToken,
}))
vi.mock('@/lib/users', () => ({ upsertUserByWorkspace }))

let GET: typeof import('./route').GET
let STATE_COOKIE: string

const CALLBACK = 'http://localhost:3000/api/auth/notion/callback'

function req(query: string, cookieState?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookieState !== undefined) headers.cookie = `${STATE_COOKIE}=${cookieState}`
  return new NextRequest(`${CALLBACK}${query}`, { headers })
}

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = './data/app.db'
  ;({ STATE_COOKIE } = await import('@/lib/notion-oauth'))
  ;({ GET } = await import('./route'))
})

beforeEach(() => {
  exchangeCodeForToken.mockReset()
  upsertUserByWorkspace.mockReset()
})

describe('GET /api/auth/notion/callback', () => {
  it('redirects to ?notion=denied when the user rejects (error param)', async () => {
    const res = await GET(req('?error=access_denied'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/?notion=denied')
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('returns 400 when state is missing', async () => {
    const res = await GET(req('?code=c'))
    expect(res.status).toBe(400)
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('returns 400 when query state does not match the cookie', async () => {
    const res = await GET(req('?code=c&state=attacker', 'real'))
    expect(res.status).toBe(400)
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('returns 502 without leaking token/error detail when exchange throws', async () => {
    exchangeCodeForToken.mockRejectedValue(new Error('secret_ntn_leak 401 boom'))
    const res = await GET(req('?code=c&state=s', 's'))
    expect(res.status).toBe(502)
    const body = await res.text()
    expect(body).not.toMatch(/secret_ntn_leak|401|boom/)
  })

  it('redirects to /setup, clears state, and sets a session cookie on success', async () => {
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'tok', workspaceId: 'ws' })
    upsertUserByWorkspace.mockReturnValue('user-1')
    const res = await GET(req('?code=the-code&state=s', 's'))

    expect(res.headers.get('location')).toBe('http://localhost:3000/setup')
    expect(exchangeCodeForToken).toHaveBeenCalledWith('the-code')
    expect(upsertUserByWorkspace).toHaveBeenCalledWith({ accessToken: 'tok', workspaceId: 'ws' })

    const setCookie = res.headers.get('set-cookie') ?? ''
    // state 삭제 = 빈 값 + 과거 만료(Next.js는 Expires=1970 또는 Max-Age=0로 지운다)
    expect(setCookie).toMatch(
      new RegExp(`${STATE_COOKIE}=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)`, 'i'),
    )
    // 세션 쿠키는 봉인된(평문 user id 아닌) 값 + httpOnly
    expect(setCookie).toMatch(/session=/)
    expect(setCookie).not.toMatch(/session=user-1[;,]/)
    expect(setCookie).toMatch(/HttpOnly/i)
  })
})
