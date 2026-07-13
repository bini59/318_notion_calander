import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// vitest는 tsconfig paths를 읽지 않는다 — Next.js 소스가 쓰는 '@/*' 별칭을 여기서 맞춘다.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
