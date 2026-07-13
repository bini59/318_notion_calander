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
  return db
}

// dev HMR이 모듈을 재평가해도 연결 1개 유지
const g = globalThis as typeof globalThis & { __db?: Database.Database }

export const db = (g.__db ??= open())
