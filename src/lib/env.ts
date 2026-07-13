import { z } from 'zod'

// 서버 전용 — 클라이언트 코드에서 import 금지 (시크릿이 번들에 샌다)
const schema = z.object({
  NOTION_CLIENT_ID: z.string().min(1),
  NOTION_CLIENT_SECRET: z.string().min(1),
  TOKEN_ENC_KEY: z.string().min(1),
  BASE_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
})

export type Env = z.infer<typeof schema>

export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source)
  if (!result.success) {
    const missing = Object.keys(result.error.format()).filter((k) => k !== '_errors')
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See .env.example.`,
    )
  }
  return result.data
}

let cached: Env | undefined

export function getEnv(): Env {
  return (cached ??= validateEnv())
}
