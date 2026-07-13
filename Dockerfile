# 전 스테이지 node:22-alpine(musl) 통일 — better-sqlite3 네이티브 바이너리 libc 일치 보장
FROM node:22-alpine AS base

# deps: better-sqlite3 컴파일 툴체인 필요 (musl용 .node 빌드)
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
# .npmrc 포함 — legacy-peer-deps=true (React 19 + radix/lucide peer 충돌 회피). 없으면 npm ci가 ERESOLVE로 실패.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# build: standalone 출력 생성
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build가 페이지 데이터 수집 시 모듈을 import → db.ts가 env를 검증 → 값 필요.
# 빌드 전용 플레이스홀더 (이 스테이지는 폐기됨, runner엔 미포함, NEXT_PUBLIC 없음 → 런타임 노출 0).
RUN NOTION_CLIENT_ID=build \
    NOTION_CLIENT_SECRET=build \
    TOKEN_ENC_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    BASE_URL=http://localhost:3000 \
    DATABASE_URL=/tmp/build.db \
    npm run build

# runner: 툴체인 미포함 경량 이미지
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# standalone 트레이싱이 better_sqlite3.node를 누락할 수 있어 명시 복사 (ERR_DLOPEN_FAILED 방지).
# 런타임 로드 체인 전체 필요: better-sqlite3 → bindings → file-uri-to-path (하나라도 빠지면 MODULE_NOT_FOUND)
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build /app/node_modules/bindings ./node_modules/bindings
COPY --from=build /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
