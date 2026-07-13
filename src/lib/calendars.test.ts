import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getCachedFeed, setCachedFeed } from './feed-cache'

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

describe('rotateFeedToken (feed token re-issue, IDOR boundary)', () => {
  it('invalidates the old token and activates a new one (완료조건)', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-rot' })
    const { id, feedToken: oldToken, feedUrl: oldUrl } = calendars.createCalendar({
      userId,
      databaseId: 'db-rot',
      mapping,
    })

    const result = calendars.rotateFeedToken(id, userId)
    expect(result).toBeDefined()
    expect(result!.feedUrl).not.toBe(oldUrl)

    // 옛 토큰 → undefined (즉시 무효), 새 토큰 → resolve.
    expect(calendars.getCalendarByFeedToken(oldToken)).toBeUndefined()
    const newToken = result!.feedUrl.match(/\/feed\/(.+)\.ics$/)![1]
    expect(calendars.getCalendarByFeedToken(newToken)).toEqual({
      userId,
      databaseId: 'db-rot',
      mapping,
    })
  })

  it('refuses to rotate a calendar owned by another user (IDOR → undefined, no change)', () => {
    const owner = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-owner' })
    const attacker = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-attacker' })
    const { id, feedToken } = calendars.createCalendar({ userId: owner, databaseId: 'db-idor', mapping })

    expect(calendars.rotateFeedToken(id, attacker)).toBeUndefined()
    // 남의 재발급 시도는 토큰을 바꾸지 않아야 한다 — 소유자 URL은 여전히 유효.
    expect(calendars.getCalendarByFeedToken(feedToken)).toBeDefined()
  })

  it('returns undefined for a non-existent calendar id', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-ghost-cal' })
    expect(calendars.rotateFeedToken('no-such-id', userId)).toBeUndefined()
  })

  // getCalendarByFeedToken(oldToken)===undefined는 DB만 읽어 invalidateFeed 호출과 무관하게 통과 →
  // 캐시를 직접 심고 확인해야 line이 삭제되면 빨간불이 뜬다(#8 stale .ics 회귀 가드).
  it('rotate invalidates the old token feed cache (#8 no stale .ics)', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-rot-cache' })
    const { id, feedToken: oldToken } = calendars.createCalendar({
      userId,
      databaseId: 'db-rc',
      mapping,
    })
    setCachedFeed(oldToken, 'STALE-ICS')

    calendars.rotateFeedToken(id, userId)

    expect(getCachedFeed(oldToken)).toBeUndefined()
  })
})

describe('listCalendarsByUser (owner isolation)', () => {
  it('returns only the session user calendars, with well-formed feed URLs and parsed mapping', () => {
    const owner = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-list' })
    const other = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-list-other' })
    const a = calendars.createCalendar({ userId: owner, databaseId: 'db-a', mapping })
    const b = calendars.createCalendar({ userId: owner, databaseId: 'db-b', mapping })
    calendars.createCalendar({ userId: other, databaseId: 'db-c', mapping })

    const list = calendars.listCalendarsByUser(owner)
    expect(list).toEqual([
      { id: a.id, databaseId: 'db-a', feedUrl: a.feedUrl, mapping },
      { id: b.id, databaseId: 'db-b', feedUrl: b.feedUrl, mapping },
    ])
    // 다른 유저 캘린더는 노출되지 않는다.
    expect(list.some((c) => c.databaseId === 'db-c')).toBe(false)
  })

  it('returns an empty array for a user with no calendars', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-empty' })
    expect(calendars.listCalendarsByUser(userId)).toEqual([])
  })
})

describe('deleteCalendar (IDOR + cache invalidation)', () => {
  it('deletes the row and returns true for the owner', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-del' })
    const { id, feedToken } = calendars.createCalendar({ userId, databaseId: 'db-del', mapping })

    expect(calendars.deleteCalendar(id, userId)).toBe(true)
    expect(calendars.getCalendarByFeedToken(feedToken)).toBeUndefined()
  })

  it('invalidates the deleted token feed cache (#11 no stale .ics)', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-del-cache' })
    const { id, feedToken } = calendars.createCalendar({ userId, databaseId: 'db-dc', mapping })
    setCachedFeed(feedToken, 'STALE-ICS')

    calendars.deleteCalendar(id, userId)

    expect(getCachedFeed(feedToken)).toBeUndefined()
  })

  it('refuses to delete a calendar owned by another user (IDOR → false, row kept)', () => {
    const owner = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-del-owner' })
    const attacker = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-del-attacker' })
    const { id, feedToken } = calendars.createCalendar({ userId: owner, databaseId: 'db-di', mapping })

    expect(calendars.deleteCalendar(id, attacker)).toBe(false)
    // 남의 삭제 시도는 행을 지우지 않아야 한다 — 소유자 피드는 여전히 유효.
    expect(calendars.getCalendarByFeedToken(feedToken)).toBeDefined()
  })

  it('returns false for a non-existent calendar id', () => {
    const userId = users.upsertUserByWorkspace({ accessToken: 'tok', workspaceId: 'ws-del-ghost' })
    expect(calendars.deleteCalendar('no-such-id', userId)).toBe(false)
  })
})
