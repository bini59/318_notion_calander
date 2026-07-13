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
})
