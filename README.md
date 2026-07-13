# Notion → iCal 브릿지

Notion 데이터베이스를 표준 iCal(`.ics`) 구독 피드로 노출하는 **셀프호스팅 오픈소스** 서비스입니다.
읽기 전용 브릿지이며 Notion이 항상 원본(source of truth)입니다. 이벤트를 저장하지 않고 피드 요청마다 Notion을 실시간 조회합니다.

> 이 저장소는 셀프호스팅용입니다. 각자 자기 서버에 배포하고, **자기 Notion public integration을 직접 등록**해야 합니다. 누구에게도 Notion 토큰을 넘길 필요가 없습니다.

## 동작 방식

```
[사용자] --OAuth--> [Notion]  →  공유된 DB 목록 + access_token
   → DB 선택 → 필드 매핑 → 고유 피드 URL 발급
[캘린더 앱] --주기적 GET--> {BASE_URL}/feed/{token}.ics
   → token으로 매핑 조회 → Notion 실시간 쿼리 → .ics 응답
```

1. `BASE_URL`에 접속해 **Notion 연결(OAuth)**
2. 통합에 공유된 **DB를 선택**
3. Notion 속성을 캘린더 필드에 **매핑** (제목/시작일 필수, 종료일·설명·장소 선택)
4. 발급된 `.ics` **피드 URL을 캘린더 앱에서 구독**

## 1. Notion public integration 만들기

셀프호스터마다 자기 integration이 필요합니다.

1. https://www.notion.so/my-integrations 접속 → **New integration**
2. **Type: Public** 선택 (OAuth를 쓰려면 Public이어야 함)
3. **OAuth Domain & URIs**의 **Redirect URIs**에 아래를 정확히 등록:

   ```
   {BASE_URL}/api/auth/notion/callback
   ```

   예: `BASE_URL`이 `https://cal.example.com`이면 → `https://cal.example.com/api/auth/notion/callback`
   (start·token 교환 양쪽에서 동일하게 쓰이므로 오타·경로 불일치가 대표적 OAuth 실패 원인입니다.)
4. 저장 후 **OAuth client ID**와 **client secret**을 복사 → 각각 `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`에 넣습니다.

> DB를 피드로 만들려면, 연결한 뒤 Notion에서 해당 **DB를 이 integration에 공유**(Connections)해야 목록에 나타납니다.

## 2. 환경 변수

`.env.example`를 복사해 채웁니다. 5개 모두 필수 — 누락·형식 오류 시 부팅이 즉시 실패합니다(zod 검증).

```bash
cp .env.example .env
```

| 변수 | 필수 | 설명 | 예시 / 생성법 |
|------|:---:|------|------|
| `NOTION_CLIENT_ID` | ✅ | Notion integration의 OAuth client ID | 통합 설정에서 복사 |
| `NOTION_CLIENT_SECRET` | ✅ | Notion integration의 OAuth client secret | 통합 설정에서 복사 |
| `TOKEN_ENC_KEY` | ✅ | 저장되는 Notion 토큰의 암호화 키. **hex 64자(32바이트)** | `openssl rand -hex 32` |
| `BASE_URL` | ✅ | 공개 접속 주소(피드 URL·OAuth redirect 구성용). 유효한 URL이어야 함 | `https://cal.example.com` |
| `DATABASE_URL` | ✅ | SQLite 파일 경로 | `./data/app.db` (Docker는 `/app/data/app.db`로 덮어씀) |

```bash
# TOKEN_ENC_KEY 생성
openssl rand -hex 32
```

## 3. 퀵스타트 (Docker)

```bash
cp .env.example .env          # 위 값들을 채운다
docker compose up -d --build
```

- 앱: `http://localhost:3000` (또는 `BASE_URL`)
- 상태(토큰·매핑)는 `data` 명명 볼륨의 SQLite에 영속화됩니다.

**서버리스(Vercel/Netlify/Lambda)는 사용할 수 없습니다** — 로컬 파일시스템 SQLite에 상태를 저장하므로 영속 디스크가 있는 호스트가 필요합니다.
상세 배포·볼륨 백업·호스트 선택지는 **[docs/DEPLOY.md](docs/DEPLOY.md)** 참조.

첫 실행 후:

1. `BASE_URL` 접속 → **Notion 연결**
2. `/setup`에서 DB 선택 → 필드 매핑 → **캘린더 만들기**
3. 발급된 `{BASE_URL}/feed/{token}.ics`를 캘린더 앱에서 구독

## 4. 피드 구독

발급되는 피드 URL 형식: `{BASE_URL}/feed/{token}.ics`

- **Google Calendar**: 좌측 "다른 캘린더" → **URL로 추가** → 피드 URL 붙여넣기
- **Apple Calendar**: **File → New Calendar Subscription** → 피드 URL 붙여넣기

> 갱신 주기는 **캘린더 앱이 결정**합니다(보통 수 시간 단위). 이 서비스에는 별도 동기화 잡이 없으며, 앱이 폴링할 때마다 Notion을 실시간 조회합니다.

## 5. 보안 특성

- **피드 URL은 인증이 없습니다.** URL(토큰)을 아는 사람은 누구나 해당 캘린더의 일정 전체를 볼 수 있습니다 — 토큰 자체가 접근권입니다. 공개적으로 공유하지 마세요.
- **URL이 유출되면 `/setup`에서 재발급**하세요. 기존 URL은 즉시 무효화되고 새 URL이 발급됩니다.
- **`TOKEN_ENC_KEY`는 저장된 Notion 토큰의 암호화 키**입니다. 안전하게 보관하고 유출·분실하지 마세요. 키를 바꾸면 기존 토큰을 복호화할 수 없어 사용자가 Notion을 다시 연결해야 합니다.

## 라이선스 / 기여

MIT License. 이슈·PR 환영합니다. 기획 배경은 [docs/PLAN.md](docs/PLAN.md) 참조.
