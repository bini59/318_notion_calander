import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest'

let route: typeof import('./route')
let db: typeof import('@/lib/db').db
let users: typeof import('@/lib/users')
let calendars: typeof import('@/lib/calendars')
let feeds: typeof import('@/lib/feed-cache')
let store: typeof import('@/lib/membership-store')
let state = { userId: 'self', clientId: 'test-client', purpose: 'membership-lifecycle', state: 'active', version: 0, cleanupId: null as string | null, cleanupPending: false }
let calls: string[]
let fail = ''
let loseRejoin = false
const request = (body: object, headers: Record<string, string> = {}) => new NextRequest('http://localhost:3000/api/membership', {
  method: 'POST', headers: { origin: 'http://localhost:3000', cookie: 'sid=real; csrf=browser-token', 'x-csrf-token': 'browser-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
})
const submit = (action = 'withdraw', version = state.version) => route.POST(request({ action, version, consent: true }))
beforeAll(async () => {
  Object.assign(process.env, { NOTION_CLIENT_ID: 'x', NOTION_CLIENT_SECRET: 'x', TOKEN_ENC_KEY: 'ab'.repeat(32), BASE_URL: 'http://localhost:3000', DATABASE_URL: join(mkdtempSync(join(tmpdir(), 'withdraw-')), 'app.db') })
  route = await import('./route')
  db = (await import('@/lib/db')).db
  users = await import('@/lib/users')
  calendars = await import('@/lib/calendars')
  feeds = await import('@/lib/feed-cache')
  store = await import('@/lib/membership-store')
})
beforeEach(() => {
  db.exec('DELETE FROM calendar; DELETE FROM user; DELETE FROM membership_state;')
  state = { ...state, state: 'active', version: 0, cleanupId: null, cleanupPending: false }
  calls = []; fail = ''; loseRejoin = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    calls.push(path)
    if (!init?.headers || !(init.headers as Record<string, string>).cookie.includes('sid=real')) return new Response('{}', { status: 401 })
    if (path === fail) throw new Error('network down')
    if (path === '/me') return new Response('{}', { headers: { 'set-cookie': 'csrf=from-auth; Path=/; SameSite=Lax' } })
    if (init?.method === 'POST') {
      const headers = init.headers as Record<string, string>
      expect(headers['x-csrf-token']).toBe('browser-token')
      expect(headers.origin).toBe('http://localhost:3000')
      expect(headers['x-app-secret']).toBe('test-secret')
      const body = JSON.parse(init.body as string)
      if (body.version !== state.version) return new Response('{}', { status: 409 })
      if (path.endsWith('/withdraw')) state = { ...state, state: 'withdrawn', version: state.version + 1, cleanupId: 'receipt', cleanupPending: true }
      if (path.endsWith('/ack')) {
        expect(db.prepare("SELECT id FROM user WHERE auth_user_id='self'").get()).toBeUndefined()
        state.cleanupPending = false
      }
      if (path.endsWith('/rejoin')) {
        expect(body.consent).toBe(true)
        state = { ...state, state: 'active', version: state.version + 1, cleanupId: null }
        if (loseRejoin) throw new Error('response lost')
      }
    }
    return Response.json(state)
  }))
})
afterEach(() => vi.unstubAllGlobals())
function seed(authId: string, token: string) {
  const id = users.upsertUser({ authUserId: authId, accessToken: 'notion-secret', workspaceId: 'ws' })
  db.prepare("INSERT INTO calendar(id,user_id,notion_database_id,feed_token,mapping) VALUES (?,?, 'db',?, '{}')").run(`cal-${authId}`, id, token)
  feeds.setCachedFeed(token, 'cached calendar')
  return id
}
it('GET authenticates without provisioning and relays auth-issued CSRF and verified portal URL', async () => {
  const result = await route.GET(new NextRequest('http://localhost:3000/api/membership', { headers: { cookie: 'sid=real' } }))
  expect(result.status).toBe(200)
  expect(result.headers.get('set-cookie')).toContain('csrf=from-auth')
  expect(await result.json()).toMatchObject({ accountUrl: 'https://auth.bini59.dev/client', state: 'active' })
  expect(calls).toEqual(['/memberships/identity', '/me'])
})
it('rejects unauthenticated, forged, foreign-origin and target-user requests before deletion', async () => {
  seed('self', 'old')
  expect((await route.POST(request({ action: 'withdraw', version: 0, consent: true }, { cookie: 'csrf=browser-token' }))).status).toBe(401)
  expect((await route.POST(request({ action: 'withdraw', version: 0, consent: true }, { 'x-csrf-token': 'bad' }))).status).toBe(403)
  expect((await route.POST(request({ action: 'withdraw', version: 0, consent: true }, { origin: 'https://evil.example' }))).status).toBe(403)
  expect((await route.POST(request({ action: 'withdraw', version: 0, consent: true, userId: 'other' }))).status).toBe(400)
  expect(users.getUserByAuthId('self')).toBeDefined()
})
it('withdraws only self, deletes settings and feed cache, and remains withdrawn on repeat', async () => {
  seed('self', 'old'); seed('other', 'kept')
  expect((await submit()).status).toBe(200)
  expect(state.state).toBe('withdrawn')
  expect(feeds.getCachedFeed('old')).toBeUndefined()
  expect(calendars.getCalendarByFeedToken('old')).toBeUndefined()
  expect(calendars.getCalendarByFeedToken('kept')).toBeDefined()
  expect(users.getUserByAuthId('other')).toBeDefined()
  expect((await submit('cleanup')).status).toBe(200)
  expect(calls.filter(p => p.endsWith('/ack'))).toHaveLength(1)
  expect(() => seed('self', 'forbidden')).toThrow()
})
it('does not delete when auth fails; blocks old feeds and writes until explicit retry', async () => {
  seed('self', 'old')
  fail = '/memberships/withdraw'
  expect((await submit()).status).toBe(503)
  expect(db.prepare("SELECT id FROM user WHERE auth_user_id='self'").get()).toBeDefined()
  expect(calendars.getCalendarByFeedToken('old')).toBeUndefined()
  fail = ''
  expect((await submit()).status).toBe(200)
})
it('does not ack local deletion failure and recovers after process/request restart', async () => {
  seed('self', 'old')
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'disk failure'); END;")
  try {
    expect((await submit()).status).toBe(503)
    expect(state.cleanupPending).toBe(true)
    expect(calls).not.toContain('/memberships/cleanup/ack')
  } finally { db.exec('DROP TRIGGER fail_delete') }
  expect((await submit('cleanup')).status).toBe(200)
  expect(state.cleanupPending).toBe(false)
})
it('retries lost ack without accepting stale withdrawal after explicit rejoin', async () => {
  seed('self', 'old'); fail = '/memberships/cleanup/ack'
  expect((await submit()).status).toBe(503)
  fail = ''
  expect((await submit('rejoin')).status).toBe(409)
  expect((await submit('cleanup')).status).toBe(200)
  expect((await route.POST(request({ action: 'rejoin', version: state.version, consent: false }))).status).toBe(400)
  expect((await submit('rejoin')).status).toBe(200)
  seed('self', 'new')
  expect((await submit('withdraw', 0)).status).toBe(409)
  expect(calendars.getCalendarByFeedToken('new')).toBeDefined()
})
it('recovers a successful rejoin with a lost response without a second destructive request', async () => {
  seed('self', 'old'); await submit()
  loseRejoin = true
  expect((await submit('rejoin')).status).toBe(503)
  expect(state.state).toBe('active')
  expect((await submit('rejoin')).status).toBe(200)
  expect(() => seed('self', 'new')).not.toThrow()
})
it('shares lease fencing and rejects duplicate requests while another request owns it', async () => {
  const owner = store.claimMembership('self')!
  expect((await submit()).status).toBe(409)
  db.prepare("UPDATE membership_state SET expires=0 WHERE auth_user_id='self'").run()
  const newer = store.claimMembership('self')!
  expect(newer).not.toBe(owner)
  expect(() => store.blockMembership('self', owner, 0, null)).toThrow()
  store.releaseMembership('self', owner)
  expect(() => store.fenceMembership('self', newer)).not.toThrow()
})
it('fences already-authorized writes in SQLite and old user IDs cannot mutate a new signup', async () => {
  const oldId = seed('self', 'old')
  const owner = store.claimMembership('self')!
  store.blockMembership('self', owner, 0, null)
  expect(() => db.prepare("UPDATE calendar SET name='late' WHERE user_id=?").run(oldId)).toThrow('membership blocked')
  expect(() => db.prepare("INSERT INTO calendar(id,user_id,notion_database_id,feed_token,mapping) VALUES ('late',?, 'db','late','{}')").run(oldId)).toThrow('membership blocked')
  store.releaseMembership('self', owner)
  await submit()
  await submit('rejoin')
  const newId = seed('self', 'new')
  expect(newId).not.toBe(oldId)
  expect(() => db.prepare("INSERT INTO calendar(id,user_id,notion_database_id,feed_token,mapping) VALUES ('late',?, 'db','late','{}')").run(oldId)).toThrow('FOREIGN KEY')
  expect(calendars.renameCalendar('cal-self', oldId, 'stale')).toBeUndefined()
  expect(calendars.getCalendarByFeedToken('new')).toBeDefined()
})
