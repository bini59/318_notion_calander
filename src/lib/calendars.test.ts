import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

let calendars: typeof import('./calendars')
let users: typeof import('./users')
let db: typeof import('./db').db

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendars-test-'))
  process.env.NOTION_CLIENT_ID = 'cid'
  process.env.NOTION_CLIENT_SECRET = 'sec'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'https://cal.example.com'
  process.env.DATABASE_URL = join(dir, 'app.db')
  calendars = await import('./calendars')
  users = await import('./users')
  db = (await import('./db')).db
})

describe('createCalendar', () => {
  it('inserts a calendar row with mapping "{}" and a well-formed feed URL', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-cal' })
    const { feedToken, feedUrl } = calendars.createCalendar({ userId, databaseId: 'db-1' })

    expect(feedUrl).toBe(`https://cal.example.com/feed/${feedToken}.ics`)

    const row = db
      .prepare('SELECT user_id, notion_database_id, feed_token, mapping FROM calendar WHERE feed_token = ?')
      .get(feedToken) as {
      user_id: string
      notion_database_id: string
      feed_token: string
      mapping: string
    }
    expect(row.user_id).toBe(userId)
    expect(row.notion_database_id).toBe('db-1')
    expect(row.mapping).toBe('{}')
  })

  it('generates unguessable, unique feed tokens', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-cal2' })
    const a = calendars.createCalendar({ userId, databaseId: 'db-2' })
    const b = calendars.createCalendar({ userId, databaseId: 'db-2' })

    expect(a.feedToken).not.toBe(b.feedToken)
    expect(a.feedToken.length).toBeGreaterThanOrEqual(43) // 32 bytes base64url
  })

  it('rejects a calendar for a non-existent user (FK enforced)', () => {
    expect(() => calendars.createCalendar({ userId: 'ghost', databaseId: 'db-x' })).toThrow()
  })
})
