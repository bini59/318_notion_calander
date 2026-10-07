import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

let users: typeof import('./users')
let crypto: typeof import('./crypto')
let db: typeof import('./db').db

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'users-test-'))
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = join(dir, 'app.db')
  users = await import('./users')
  crypto = await import('./crypto')
  db = (await import('./db')).db
})

describe('upsertUser', () => {
  it('creates a user with the access token stored encrypted (not plaintext)', () => {
    const id = users.upsertUser({ authUserId: 'auth-a', accessToken: 'secret_ntn_1', workspaceId: 'ws-a' })
    const row = db
      .prepare('SELECT auth_user_id, notion_access_token, notion_workspace_id FROM user WHERE id = ?')
      .get(id) as { auth_user_id: string; notion_access_token: string; notion_workspace_id: string }

    expect(row.auth_user_id).toBe('auth-a')
    expect(row.notion_workspace_id).toBe('ws-a')
    expect(row.notion_access_token).not.toBe('secret_ntn_1')
    expect(crypto.decrypt(row.notion_access_token)).toBe('secret_ntn_1')
  })

  it('reuses the same row and updates the token when the same auth user reconnects', () => {
    const first = users.upsertUser({ authUserId: 'auth-b', accessToken: 'tok-1', workspaceId: 'ws-b' })
    const second = users.upsertUser({ authUserId: 'auth-b', accessToken: 'tok-2', workspaceId: 'ws-b' })

    expect(second).toBe(first)
    const count = db.prepare('SELECT COUNT(*) FROM user WHERE auth_user_id = ?').pluck().get('auth-b')
    expect(count).toBe(1)
    expect(users.getUserByAuthId('auth-b')).toEqual({ id: first, accessToken: 'tok-2' })
  })

  it('gives two auth users of the same workspace separate rows', () => {
    const a = users.upsertUser({ authUserId: 'auth-c1', accessToken: 't1', workspaceId: 'ws-shared' })
    const b = users.upsertUser({ authUserId: 'auth-c2', accessToken: 't2', workspaceId: 'ws-shared' })
    expect(b).not.toBe(a)
  })

  it('adopts a pre-SSO row (auth_user_id NULL) of the same workspace exactly once', () => {
    db.prepare(
      "INSERT INTO user (id, notion_access_token, notion_workspace_id) VALUES ('legacy', ?, 'ws-legacy')",
    ).run(crypto.encrypt('old'))

    const first = users.upsertUser({ authUserId: 'auth-d1', accessToken: 'new', workspaceId: 'ws-legacy' })
    expect(first).toBe('legacy')
    const second = users.upsertUser({ authUserId: 'auth-d2', accessToken: 'x', workspaceId: 'ws-legacy' })
    expect(second).not.toBe('legacy')
  })
})

describe('getUserByAuthId / getDecryptedTokenByUserId', () => {
  it('returns id + plaintext token, and the token is reachable by internal id', () => {
    const id = users.upsertUser({ authUserId: 'auth-e', accessToken: 'secret_ntn_x', workspaceId: 'ws-tok' })
    expect(users.getUserByAuthId('auth-e')).toEqual({ id, accessToken: 'secret_ntn_x' })
    expect(users.getDecryptedTokenByUserId(id)).toBe('secret_ntn_x')
  })

  it('throws when the auth user has not connected Notion yet', () => {
    expect(() => users.getUserByAuthId('never-connected')).toThrow()
    expect(() => users.getDecryptedTokenByUserId('does-not-exist')).toThrow()
  })
})

describe('deleteUserByAuthId', () => {
  it('removes the user, their calendars, and leaves other users alone', () => {
    const gone = users.upsertUser({ authUserId: 'auth-del', accessToken: 't1', workspaceId: 'ws-del' })
    const kept = users.upsertUser({ authUserId: 'auth-keep', accessToken: 't2', workspaceId: 'ws-keep' })
    const addCal = db.prepare(
      "INSERT INTO calendar (id, user_id, name, notion_database_id, mapping, feed_token) VALUES (?, ?, 'c', 'db', '{}', ?)",
    )
    addCal.run('cal-del', gone, 'tok-del')
    addCal.run('cal-keep', kept, 'tok-keep')

    users.deleteUserByAuthId('auth-del')
    users.deleteUserByAuthId('never-existed')

    expect(() => users.getUserByAuthId('auth-del')).toThrow()
    expect(db.prepare('SELECT id FROM calendar WHERE user_id = ?').all(gone)).toEqual([])
    expect(users.getUserByAuthId('auth-keep').id).toBe(kept)
    expect(db.prepare('SELECT id FROM calendar WHERE user_id = ?').pluck().all(kept)).toEqual(['cal-keep'])
  })
})
