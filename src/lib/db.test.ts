import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('opens the DATABASE_URL file in WAL mode (creating the directory)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-test-'))
  process.env.NOTION_CLIENT_ID = 'x'
  process.env.NOTION_CLIENT_SECRET = 'x'
  process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = join(dir, 'nested', 'app.db')

  const { db } = await import('./db')
  expect(db.pragma('journal_mode', { simple: true })).toBe('wal')

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .pluck()
    .all()
  expect(tables).toContain('user')
  expect(tables).toContain('calendar')

  db.prepare(
    "INSERT INTO user (id, notion_access_token, notion_workspace_id) VALUES ('u1', 'enc', 'ws')",
  ).run()
  db.prepare(
    "INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping) VALUES ('c1', 'u1', 'db1', 'tok1', '{}')",
  ).run()

  // FK 강제 확인 — 없는 user를 참조하면 거부
  expect(() =>
    db
      .prepare(
        "INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping) VALUES ('c2', 'nope', 'db1', 'tok2', '{}')",
      )
      .run(),
  ).toThrow(/FOREIGN KEY/)

  // feed_token 유일성 강제
  expect(() =>
    db
      .prepare(
        "INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping) VALUES ('c3', 'u1', 'db1', 'tok1', '{}')",
      )
      .run(),
  ).toThrow(/UNIQUE/)
})
