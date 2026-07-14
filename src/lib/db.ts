import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getEnv } from './env'

// ponytail: 모듈 스코프 단일 인스턴스 — better-sqlite3는 동기 API라 풀 불필요
function open() {
  const path = getEnv().DATABASE_URL
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON') // 연결 단위 pragma — 매 open마다 필요
  db.exec(schema)
  migrate(db)
  return db
}

// ponytail: 첫 스키마 변경 — guarded ALTER 1개로 충분. 두 번째가 생기면 번호달린 마이그레이션 러너로 승격.
// 기존 배포 DB(name 컬럼 없음)에 name을 채운다. CREATE 스키마엔 이미 name이 있으므로 신규 DB는 no-op.
function migrate(db: Database.Database) {
  const cols = db.pragma('table_info(calendar)') as { name: string }[]
  if (!cols.some((c) => c.name === 'name')) {
    db.exec(`ALTER TABLE calendar ADD COLUMN name TEXT NOT NULL DEFAULT 'Notion Calendar'`)
  }
}

// PLAN §4 — 이벤트 테이블 없음, Notion이 원본. 멱등 DDL이라 부팅마다 실행해도 안전.
// ponytail: 마이그레이션 프레임워크 없음 — 스키마 변경이 실제로 생기면 번호달린 마이그레이션으로 승격.
const schema = `
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    notion_access_token TEXT NOT NULL,
    notion_workspace_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS calendar (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    notion_database_id TEXT NOT NULL,
    feed_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Notion Calendar',
    mapping TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

// dev HMR이 모듈을 재평가해도 연결 1개 유지
const g = globalThis as typeof globalThis & { __db?: Database.Database }

export const db = (g.__db ??= open())
