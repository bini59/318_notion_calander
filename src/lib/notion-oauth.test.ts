import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let oauth: typeof import('./notion-oauth')

beforeAll(async () => {
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = './data/app.db'
  oauth = await import('./notion-oauth')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('REDIRECT_URI', () => {
  it('is BASE_URL + the callback path', () => {
    expect(oauth.REDIRECT_URI).toBe('http://localhost:3000/api/auth/notion/callback')
  })
})

describe('buildAuthUrl', () => {
  it('sets the OAuth params and carries the state', () => {
    const url = new URL(oauth.buildAuthUrl('st4te'))
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('owner')).toBe('user')
    expect(url.searchParams.get('redirect_uri')).toBe(oauth.REDIRECT_URI)
    expect(url.searchParams.get('state')).toBe('st4te')
  })
})

describe('exchangeCodeForToken', () => {
  it('sends Basic auth + the code and returns the parsed token', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ access_token: 'tok', workspace_id: 'ws', extra: 'ignored' }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await oauth.exchangeCodeForToken('the-code')
    expect(result).toEqual({ accessToken: 'tok', workspaceId: 'ws' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.notion.com/v1/oauth/token')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`)
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: oauth.REDIRECT_URI,
    })
  })

  it('throws on a non-2xx response (no token/body leak)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 400 })),
    )
    await expect(oauth.exchangeCodeForToken('bad')).rejects.toThrow(/400/)
  })

  it('throws when the response is missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })),
    )
    await expect(oauth.exchangeCodeForToken('x')).rejects.toThrow()
  })
})
