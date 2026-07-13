# Notion → iCal 캘린더 브릿지 — 기획문서

## 1. 한 줄 요약

사용자가 Notion 워크스페이스 권한을 위임하면, 지정한 데이터베이스를 읽어 캘린더로
구성하고, 표준 iCal(.ics) 구독 URL로 배포하는 셀프호스팅 오픈소스 서비스.

## 2. 목표 / 비목표

**목표**
- Notion DB를 구글/애플/기타 캘린더 앱에서 **구독 가능한 .ics 피드**로 노출
- 다중 사용자 지원 (각자 자기 Notion 연결)
- 셀프호스팅 가능 — 남에게 Notion 토큰을 넘기지 않아도 됨

**비목표 (YAGNI)**
- 캘린더 → Notion 역방향 쓰기 (읽기 전용 브릿지)
- 반복 일정(RRULE) 지원 — Notion에 반복 규칙 개념이 없음
- 이벤트 자체 DB 저장 — Notion이 항상 원본(source of truth)

## 3. 핵심 흐름

```
[사용자] --OAuth--> [Notion] --access_token + 공유된 DB 목록--> [우리 서버]
   → 캘린더 생성 (DB 선택 + 필드 매핑) → 고유 피드 URL 발급
[캘린더 앱] --주기적 GET--> /feed/{feed_token}.ics
   → feed_token으로 토큰·매핑 조회 → Notion 실시간 쿼리 → .ics 응답
```

이벤트를 저장하지 않고 피드 요청 시마다 Notion을 실시간 조회한다.
캘린더 앱이 몇 시간 주기로 폴링하므로 별도 동기화 잡(cron)이 불필요하다.

## 4. 데이터 모델 (SQLite)

```
User
  id
  notion_access_token   -- 암호화 저장 (credential)
  notion_workspace_id
  created_at

Calendar
  id
  user_id               -- FK User
  notion_database_id
  feed_token            -- 랜덤·추측 불가, .ics URL에 사용
  mapping               -- JSON, 아래 매핑 규칙 참조
  created_at
```

이벤트 테이블 없음. Notion이 원본.

## 5. 필드 매핑 규칙

캘린더 이벤트 필드:

| 필드        | 필수 | Notion 속성 타입      |
|-------------|------|-----------------------|
| start       | O    | date                  |
| title       | O    | title                 |
| end         | X    | date (범위의 끝)      |
| description | X    | text / rich_text 등   |
| location    | X    | text / select 등      |

**Default 자동감지**
- `title`: Notion DB는 title 프로퍼티가 항상 정확히 1개 → 그것을 SUMMARY로.
- `start`/`end`: 첫 번째 `date` 타입 속성 → DTSTART(/DTEND). Notion date는 범위를 지원.

**필수 매칭 강제**
- DB에 `date` 타입 속성이 하나도 없으면 → 캘린더 생성 **차단**, "날짜 속성 필요" 안내.
- date 속성이 여러 개라 자동감지가 애매하면 → 매핑 화면에서 사용자가 **필수 선택**.
- 사용자 override는 `Calendar.mapping`(JSON)에 저장.

## 6. .ics 생성 규칙

- 표준 iCal 라이브러리 사용 (RFC 5545 직접 구현하지 않음).
- `UID = notion_page_id` — 안정적 UID라야 캘린더 앱이 수정/삭제를 정확히 반영.
- 시간 성분 없는 date → all-day 이벤트로.
- `URL = Notion 페이지 링크`, `DESCRIPTION`은 매핑된 속성 값.
- **Notion 쿼리 페이지네이션 필수** (100개/페이지) — 누락 방지.

## 7. 보안 (건너뛰지 않을 것)

1. `notion_access_token`은 **암호화 저장**. 키는 `TOKEN_ENC_KEY` env, 없으면 부팅 시 throw.
2. `feed_token`은 **랜덤**(user id 등 유추 가능한 값 금지).
   - 피드는 **인증 없이 공개** 접근된다 (오픈캘린더의 본질). URL을 아는 사람은 일정 내용을 모두 볼 수 있음.
   - → 사용자에게 명시하고, **피드 토큰 재발급** 기능 제공.
3. OAuth `state` 파라미터로 CSRF 방어.

## 8. 기술 스택

- **Next.js** — OAuth 콜백 + 매핑 설정 UI + `/feed/*.ics` 엔드포인트를 단일 앱/배포로.
- **SQLite (WAL 모드)** — 쓰기는 셋업 때만 드물게, 피드 조회는 인덱스 1회 + Notion API 호출이라 DB 부하가 낮음.
- **Docker + docker-compose** — 기본 배포물. `docker compose up`으로 끝나게.

> SQLite ⇒ 서버리스(Vercel/Netlify) 배포 불가 (파일시스템 휘발성). **영속 디스크가 있는
> 호스트**(Docker/Fly/Railway/VPS)로 배포한다.

## 9. 설정 (env)

```
NOTION_CLIENT_ID       # 셀프호스터가 자기 Notion integration에서 발급
NOTION_CLIENT_SECRET
TOKEN_ENC_KEY          # 토큰 암호화 키, 배포마다 생성 (없으면 throw)
BASE_URL               # 피드 URL · OAuth redirect 구성용
DATABASE_URL           # SQLite 파일 경로
```

셀프호스터는 각자 **자기 Notion public integration**을 등록한다.
README에 "Notion 통합 만들기" 가이드를 포함한다.

## 10. 라이선스

MIT. (추후 유료 호스팅 SaaS를 병행한다면 AGPL 재검토.)

## 11. MVP 컷

OAuth → DB 1개 선택 → 자동매핑(+최소 override) → 피드 URL 발급 → 실시간 .ics.

**이후로 미룸**: 다중 캘린더 관리 UI, Notion rate limit 대비 응답 캐시(5분),
필터/뷰(속성 조건으로 이벤트 필터링), 다국어.
