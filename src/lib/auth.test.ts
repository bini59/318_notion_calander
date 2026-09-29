import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let auth: typeof import('./auth')

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = './data/app.db'
  auth = await import('./auth')
})

afterEach(() => vi.unstubAllGlobals())

const stub = (status: number, body: unknown = {}) => {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const user = (membership: unknown) => ({ userId: 'u1', email: null, name: 'n', avatarUrl: null, membership })

describe('verifySid', () => {
  it('passes the sid cookie and app secret to /verify and allows an active membership', async () => {
    const fetchMock = stub(200, user({ role: 'user', status: 'active', joinedAt: 'x' }))
    const v = await auth.verifySid('sid-ok')
    expect(v.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://auth.bini59.dev/verify?client_id=test-client')
    expect(init.headers).toEqual({ cookie: 'sid=sid-ok', 'x-app-secret': 'test-secret' })
  })

  it('denies (403) a logged-in user without an active membership', async () => {
    stub(200, user(null))
    expect((await auth.verifySid('sid-null')).status).toBe(403)
    stub(200, user({ role: 'user', status: 'suspended', joinedAt: 'x' }))
    expect((await auth.verifySid('sid-susp')).status).toBe(403)
  })

  it('maps 401 to login-required and throws on auth outages', async () => {
    stub(401)
    expect((await auth.verifySid('sid-401')).status).toBe(401)
    stub(500)
    await expect(auth.verifySid('sid-500')).rejects.toThrow()
  })

  it('caches a verdict briefly and forgets it on demand', async () => {
    const fetchMock = stub(200, user({ role: 'user', status: 'active', joinedAt: 'x' }))
    await auth.verifySid('sid-cache')
    await auth.verifySid('sid-cache')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    auth.forgetSid('sid-cache')
    await auth.verifySid('sid-cache')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
