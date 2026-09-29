import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const verifySid = vi.fn()
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  verifySid,
}))

let proxy: typeof import('./proxy').proxy

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'https://n2c.bini59.dev'
  process.env.DATABASE_URL = './data/app.db'
  ;({ proxy } = await import('./proxy'))
})

beforeEach(() => {
  verifySid.mockReset()
})

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://internal:3000${path}`, { headers })

describe('proxy', () => {
  it('redirects a page visit without sid to auth login, returning to the public origin', async () => {
    const res = await proxy(req('/setup?x=1'))
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://auth.bini59.dev/login')
    expect(loc.searchParams.get('client_id')).toBe('test-client')
    expect(loc.searchParams.get('return_to')).toBe('https://n2c.bini59.dev/setup?x=1')
  })

  it('answers JSON 401 for API calls, but redirects the OAuth start to login', async () => {
    expect((await proxy(req('/api/calendars'))).status).toBe(401)
    expect((await proxy(req('/api/auth/notion'))).status).toBe(307)
  })

  it('403s an authenticated user without membership', async () => {
    verifySid.mockResolvedValue({ status: 403, user: null })
    expect((await proxy(req('/setup', { cookie: 'sid=s' }))).status).toBe(403)
  })

  it('503s when auth is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    verifySid.mockImplementation(() => {
      throw new Error('down')
    })
    expect((await proxy(req('/setup', { cookie: 'sid=s' }))).status).toBe(503)
  })

  it('lets a verified user through and overwrites a spoofed x-user-id', async () => {
    verifySid.mockResolvedValue({ status: 200, user: { userId: 'real' } })
    const res = await proxy(req('/api/calendars', { cookie: 'sid=s', 'x-user-id': 'attacker' }))
    expect(res.headers.get('x-middleware-request-x-user-id')).toBe('real')
  })
})
