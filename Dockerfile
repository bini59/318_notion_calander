# 전 스테이지 node:22-alpine(musl) 통일 — better-sqlite3 네이티브 바이너리 libc 일치 보장
FROM node:22-alpine AS base
# pnpm은 모든 스테이지에서 필요(deps 설치 + build). corepack 활성화를 base에 둬야 build 스테이지에도 있다.
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# deps: better-sqlite3 컴파일 툴체인 필요 (musl용 .node 빌드)
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
# pnpm 설정과 lockfile을 함께 복사해 재현 가능한 설치를 유지한다.
# pnpm-workspace.yaml(onlyBuiltDependencies: better-sqlite3)이 없으면 pnpm 10이 네이티브 빌드를 건너뛴다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# 이미지에서만 평탄한 node_modules(npm과 동일 배치): runner 단계가 better-sqlite3/bindings/file-uri-to-path를
# 최상위 경로로 복사하는데, pnpm 기본(격리형) 레이아웃에서는 그 경로가 없다.
RUN pnpm install --frozen-lockfile --node-linker=hoisted

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
    CLIENT_ID=build \
    APP_SECRET=build \
    DATABASE_URL=:memory: \
    pnpm build

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
