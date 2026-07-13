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

describe('upsertUserByWorkspace', () => {
  it('creates a user with the access token stored encrypted (not plaintext)', () => {
    const id = users.upsertUserByWorkspace({ accessToken: 'secret_ntn_1', workspaceId: 'ws-a' })
    const row = db
      .prepare('SELECT notion_access_token, notion_workspace_id FROM user WHERE id = ?')
      .get(id) as { notion_access_token: string; notion_workspace_id: string }

    expect(row.notion_workspace_id).toBe('ws-a')
    expect(row.notion_access_token).not.toBe('secret_ntn_1')
    expect(crypto.decrypt(row.notion_access_token)).toBe('secret_ntn_1')
  })

  it('reuses the same user id and updates the token on reconnect (no duplicate)', () => {
    const first = users.upsertUserByWorkspace({ accessToken: 'tok-1', workspaceId: 'ws-b' })
    const second = users.upsertUserByWorkspace({ accessToken: 'tok-2', workspaceId: 'ws-b' })

    expect(second).toBe(first)
    const count = db
      .prepare('SELECT COUNT(*) FROM user WHERE notion_workspace_id = ?')
      .pluck()
      .get('ws-b') as number
    expect(count).toBe(1)

    const token = db
      .prepare('SELECT notion_access_token FROM user WHERE id = ?')
      .pluck()
      .get(first) as string
    expect(crypto.decrypt(token)).toBe('tok-2')
  })
})

describe('getDecryptedTokenByUserId', () => {
  it('returns the plaintext token for an existing user', () => {
    const id = users.upsertUserByWorkspace({ accessToken: 'secret_ntn_x', workspaceId: 'ws-tok' })
    expect(users.getDecryptedTokenByUserId(id)).toBe('secret_ntn_x')
  })

  it('throws for an unknown user id (stale/forged session)', () => {
    expect(() => users.getDecryptedTokenByUserId('does-not-exist')).toThrow()
  })
})
