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

const mapping = { title: 'Name', start: 'When', description: 'Notes' }

describe('createCalendar', () => {
  it('inserts a calendar row storing the mapping JSON and a well-formed feed URL', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-cal' })
    const { feedToken, feedUrl } = calendars.createCalendar({ userId, databaseId: 'db-1', mapping })

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
    // 저장된 mapping은 JSON 라운드트립으로 원본과 동일해야 한다.
    expect(JSON.parse(row.mapping)).toEqual(mapping)
  })

  it('generates unguessable, unique feed tokens', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-cal2' })
    const a = calendars.createCalendar({ userId, databaseId: 'db-2', mapping })
    const b = calendars.createCalendar({ userId, databaseId: 'db-2', mapping })

    expect(a.feedToken).not.toBe(b.feedToken)
    expect(a.feedToken.length).toBeGreaterThanOrEqual(43) // 32 bytes base64url
  })

  it('rejects a calendar for a non-existent user (FK enforced)', () => {
    expect(() =>
      calendars.createCalendar({ userId: 'ghost', databaseId: 'db-x', mapping }),
    ).toThrow()
  })
})

describe('getCalendarByFeedToken (feed auth boundary)', () => {
  it('round-trips a valid token → {userId, databaseId, mapping}', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-feed' })
    const { feedToken } = calendars.createCalendar({ userId, databaseId: 'db-feed', mapping })

    expect(calendars.getCalendarByFeedToken(feedToken)).toEqual({
      userId,
      databaseId: 'db-feed',
      mapping,
    })
  })

  it('returns undefined for an unknown token (404 contract, not throw)', () => {
    expect(calendars.getCalendarByFeedToken('does-not-exist')).toBeUndefined()
  })

  it('throws on corrupted mapping JSON (502 contract — DB tampering)', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-bad' })
    db.prepare(
      `INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('cal-bad', userId, 'db-bad', 'tok-bad', '{not valid json')

    expect(() => calendars.getCalendarByFeedToken('tok-bad')).toThrow()
  })
})
