# 배포 (Docker + docker-compose)

Notion→iCal 브릿지는 **영속 디스크가 있는 호스트**에서 `docker compose up` 한 번으로 셀프호스팅한다.

## 1. 사전 준비

- Docker Engine 20.10+ 와 Docker Compose v2
- Notion public integration (https://www.notion.so/my-integrations)
  - **OAuth redirect URI** 를 `${BASE_URL}/api/auth/notion/callback` 로 등록

## 2. 환경 변수

`.env.example` 를 복사해 `.env` 를 만들고 값을 채운다. 5개 모두 필수 — 누락 시 부팅이 즉시 실패한다(zod 검증).

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `NOTION_CLIENT_ID` | Notion integration의 OAuth client ID |
| `NOTION_CLIENT_SECRET` | Notion integration의 OAuth client secret |
| `TOKEN_ENC_KEY` | 저장 토큰 암호화 키. **hex 64자** — `openssl rand -hex 32` 로 생성 |
| `BASE_URL` | 공개 접속 주소 (피드 URL·OAuth redirect 구성용). 예: `https://cal.example.com` |
| `DATABASE_URL` | SQLite 파일 경로. **compose가 `/app/data/app.db` 로 덮어씀** — `.env` 값은 무시된다(로컬 `npm run dev` 시에만 사용) |

```bash
# TOKEN_ENC_KEY 생성 예시
openssl rand -hex 32
```

> `DATABASE_URL` 은 `docker-compose.yml` 에서 `/app/data/app.db` 로 고정되며, 이 경로는 `./data` 바인드 마운트에 매핑된다. SQLite WAL 파일(`-wal`/`-shm`)도 같은 디렉토리에 생성되어 함께 영속화된다.

## 3. 기동

```bash
docker compose up -d --build
```

- 앱: http://localhost:3000 (또는 `BASE_URL`)
- DB 파일: `data` 명명 볼륨 안의 `app.db` (+ WAL `app.db-wal`/`app.db-shm`)

> 컨테이너는 non-root(`node`) 유저로 돌아간다. bind mount(`./data`)는 호스트에서 root 소유로 생성돼 권한 충돌(`SQLITE_CANTOPEN`)이 나므로, compose는 컨테이너 소유권을 그대로 seed하는 **명명 볼륨**을 쓴다.

로그 확인 / 종료:

```bash
docker compose logs -f
docker compose down
```

## 4. 첫 연결 (OAuth → 피드)

1. `BASE_URL` 접속 → Notion 연결(OAuth) 진행
2. 공유된 Notion DB 선택 → 캘린더 생성 → 필드 매핑
3. 발급된 `.ics` 피드 URL(`${BASE_URL}/feed/<token>.ics`)을 캘린더 앱에서 구독

## 서버리스 배포 불가

이 앱은 **로컬 파일시스템의 SQLite** 에 상태(토큰·매핑)를 저장한다. Vercel / Netlify / AWS Lambda 등 stateless 서버리스 환경은 요청 간 파일시스템이 보존되지 않으므로 **사용할 수 없다**.

영속 디스크를 제공하는 호스트만 사용 가능:

- Docker 를 돌리는 VPS / 베어메탈 (권장)
- Fly.io (볼륨 attach)
- Railway / Render (persistent disk)

## 백업

`data` 명명 볼륨을 통째로 백업한다(앱 정지 후 권장 — WAL 정합성):

```bash
docker compose stop app
docker run --rm -v 318_notion_calander_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/data-backup.tar.gz -C /data .
docker compose start app
```

> 볼륨 이름은 `docker compose config --volumes` 로 확인(프로젝트 디렉토리명이 prefix 됨).

Notion 이 항상 원본이므로 DB 유실 시 재연결·재매핑으로 복구 가능하다.
