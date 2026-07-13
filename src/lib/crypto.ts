import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getEnv } from './env'

// Notion access token 암호화 (PLAN §7). 포맷: base64url(iv).base64url(authTag).base64url(ct)
// ponytail: 키 버전/로테이션 없음 — 필요해지면 payload에 버전 프리픽스 추가.

const key = () => Buffer.from(getEnv().TOKEN_ENC_KEY, 'hex')

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.')
}

export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split('.').map((p) => Buffer.from(p, 'base64url'))
  if (!iv || !tag || !ct) throw new Error('Invalid encrypted payload format')
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// .ics 구독 URL용 — 랜덤·추측 불가 (PLAN §7)
export function generateFeedToken(): string {
  return randomBytes(32).toString('base64url')
}
