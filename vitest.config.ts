import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// vitest는 tsconfig paths를 읽지 않는다 — Next.js 소스가 쓰는 '@/*' 별칭을 여기서 맞춘다.
export default defineConfig({
  // env.ts가 요구하는 SSO 값 — 테스트는 auth 서버를 부르지 않으므로 더미면 충분.
  test: { env: { CLIENT_ID: 'test-client', APP_SECRET: 'test-secret' } },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
