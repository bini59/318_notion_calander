import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// 배포 중인 구스키마(user.notion_workspace_id UNIQUE, auth_user_id 없음) → 부팅 시 마이그레이션 + 데이터/FK 보존.
it('migrates a pre-SSO database without losing users or calendars', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'db-migrate-')), 'app.db')
  const old = new Database(path)
  old.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, notion_access_token TEXT NOT NULL,
      notion_workspace_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE calendar (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id),
      notion_database_id TEXT NOT NULL, feed_token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT 'Notion Calendar', mapping TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO user (id, notion_access_token, notion_workspace_id) VALUES ('u-old', 'enc', 'ws');
    INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping) VALUES ('c-old', 'u-old', 'db', 'tok', '{}');
  `)
  old.close()

  process.env.NOTION_CLIENT_ID = 'x'
  process.env.NOTION_CLIENT_SECRET = 'x'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = path
  const { db } = await import('./db')
  const { upsertUser } = await import('./users')

  const cols = (db.pragma('table_info(user)') as { name: string }[]).map((c) => c.name)
  expect(cols).toContain('auth_user_id')
  expect(db.prepare('SELECT user_id FROM calendar WHERE id = ?').pluck().get('c-old')).toBe('u-old')

  // 기존 사용자를 SSO 로그인으로 이어받으면 캘린더 소유가 그대로 유지된다.
  expect(upsertUser({ authUserId: 'auth-1', accessToken: 't', workspaceId: 'ws' })).toBe('u-old')

  // FK는 여전히 강제되고, 한 워크스페이스를 여러 사용자가 쓸 수 있다(UNIQUE 제거).
  expect(() =>
    db.prepare("INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping) VALUES ('c2','nope','d','t2','{}')").run(),
  ).toThrow(/FOREIGN KEY/)
  expect(() => upsertUser({ authUserId: 'auth-2', accessToken: 't', workspaceId: 'ws' })).not.toThrow()
})
