# 서비스 탈퇴 연동 (#26)

## 인증 계약

321_auth main `9eafdd80d3d32170ca218922883e8966563d3a5b`의 [membership lifecycle v1](https://github.com/bini59/321_auth/blob/9eafdd80d3d32170ca218922883e8966563d3a5b/docs/membership-lifecycle.md)을 확인해 연동했다. 이전 차단 사유였던 서비스별 탈퇴·정리 ack·명시적 재가입 API가 추가되었다.

- 서버 전용 `GET /memberships/identity`, `POST /memberships/withdraw`, `POST /memberships/cleanup/ack`, `POST /memberships/rejoin`을 사용한다. client는 환경 설정, 사용자는 auth 세션으로 결정한다. 브라우저의 사용자 ID는 받지 않는다.
- 탈퇴는 membership tombstone을 유지한다. 로그인·`/verify`·일반 membership 생성은 탈퇴를 취소하지 않는다. n2c의 auto_provision 설정 변경은 필요하지 않다.
- 브라우저의 CSRF 쿠키는 auth `GET /me`가 발급한 것을 그대로 전달한다. 변경 요청은 앱의 정확한 Origin 및 double-submit 토큰을 검증하고, 쿠키·헤더·Origin을 auth에 전달한다. secret은 서버에만 있다.
- 전체 계정 관리 주소는 auth origin의 `/client`다. 전체 계정 삭제는 공통 사용자, 로그인 수단, 모든 membership과 세션을 삭제하며 서비스 로컬 정리는 기존 전체 계정 삭제 큐로 비동기 진행된다. 서비스별 탈퇴에서는 전체 계정 삭제 API를 호출하지 않는다. Notion 원본은 변경하지 않는다.

## 로컬 정리와 경합 방지

`membership_state`는 기존 SQLite DB에 생성되며 사용자 행 삭제 후에도 남는다. 서비스별 전이는 DB의 60초 lease로 직렬화하고, 로컬 삭제와 상태 변경은 트랜잭션 안에서 owner와 만료 시각을 재검증한다. lease를 잃은 요청은 로컬 데이터를 변경할 수 없다. 프로세스 종료 시 최대 60초 뒤 재시도할 수 있다. 잠금 키는 사용자 단위이며 서비스별 SQLite DB를 공유하는 인스턴스 모두 같은 경계를 사용한다.

원격 탈퇴 요청 전에 영속 blocked 상태와 epoch를 기록한다. SQLite trigger가 Notion 연결과 캘린더 생성·변경을 차단하며, 기존 피드는 캐시 확인 전에 DB에서 차단한다. 진행 중인 피드 생성은 응답·캐시 저장 전에 다시 확인한다. OAuth 교환은 시작/완료 epoch를 비교해 탈퇴나 재가입을 가로질러 연결을 다시 만들지 못한다. 캘린더 요청이 이전 사용자 ID로 뒤늦게 완료되면 삭제된 사용자에 대한 FK와 소유권 조건으로 새 가입의 데이터에 접근할 수 없다.

원격 성공 receipt를 영속 저장한 뒤 현재 auth 회차를 재확인하고 `deleteUserByAuthId`를 호출한다. 로컬 삭제 성공 후에만 같은 회차를 ack한다. 실패하면 성공 응답이나 랜딩 이동 없이 차단 상태를 유지한다. `/api/membership`는 일반 membership 접근 게이트에서 분리되며 매번 auth identity로 본인을 인증하므로 탈퇴 후나 재로그인 후에도 정리를 재시도할 수 있다. 이미 ack된 회차의 삭제는 반복하지 않는다.

명시적 재가입은 정리 완료 후에만 가능하다. 원격 재가입 전에 기대하는 새 version을 영속 저장한다. 응답이 유실되면 다음 본인 상태 조회와 명시적 재시도에서 해당 active version을 확인해 로컬 차단을 해제한다. 오래된 version으로 파괴적 동작을 자동 재발행하지 않는다.

기존 전체 계정 삭제 큐는 변경하지 않는다. 전체 계정 삭제는 공통 사용자 UUID를 제거하며 다시 생성되는 계정은 새 UUID이므로 과거 전체 삭제 이벤트가 새 계정 데이터를 삭제하지 않는다. 서비스별 삭제 이벤트는 이 auth 계약에서 발행되지 않는다.

## 배포 전 확인

운영 데이터·설정·인프라는 변경하지 않았다. 운영 auth에 위 계약과 `007_membership_withdrawal.sql`이 포함된 버전이 배포되어 있어야 한다. n2c의 Origin 허용 설정과 공유 sid/csrf 쿠키 설정은 실제 환경에서 확인해야 한다. API가 없거나 실패하면 성공으로 표시하지 않는다. 기존 SQLite 영속 디스크 운영 전제를 유지한다.

티켓: https://github.com/bini59/318_notion_calander/issues/26

## 운영 진단 (이슈 #28)

`[membership]` 로그는 `stage` (identity, me 또는 lifecycle 경로), `kind` (network, http, json, schema), HTTP 상태만 기록한다. 응답 본문, 쿠키, 토큰과 사용자 식별자는 기록하지 않는다. 401은 로그인 또는 서비스 인증 문제로 안내하며, 나머지 조회 실패는 재시도 안내를 표시한다. HTTP 403/404나 schema 오류는 배포 계약, CLIENT_ID 및 설정을 확인해야 하며 배포 누락을 뜻한다고 단정할 수 없다.

운영 로그인 세션과 서버 로그에 접근할 수 없어 실제 실패 지점은 아직 확인되지 않았다. 운영 담당자가 별도 테스트 계정으로 `/account`와 `/api/membership`을 재현하고 위 로그와 auth 측 응답 상태를 대조해야 한다. auth 배포 버전과 `007_membership_withdrawal.sql` 적용, CLIENT_ID/Origin, 공유 sid/csrf 쿠키 및 `/me`를 확인한 뒤 원인을 수정하고 브라우저 화면과 모바일/데스크톱 스크린샷을 검증해야 한다. 운영 데이터나 설정은 변경하지 않았다.

### 2026-10-27 코드 및 공개 엔드포인트 대조

321_auth main `9eafdd80d3d32170ca218922883e8966563d3a5b`의 `AuthController`는 `GET /memberships/identity`에 `AppSecretGuard`를 적용한다. secret 없는 요청은 이 구현에서 401이어야 한다. 실제 `https://auth.bini59.dev/memberships/identity?client_id=n2c`의 secret 없는 GET은 Nest의 `Cannot GET` 404를 반환했고, 같은 호스트의 `/verify`는 401을 반환했다. 따라서 현재 공개 경로에서 lifecycle 엔드포인트가 제공되지 않는다는 직접적인 증거가 있다. 로그인 세션의 실패를 재현한 것은 아니며 실제 실행 이미지나 라우팅을 이 결과만으로 확정할 수는 없다.

읽기 가능한 `bini59/homelab`의 `apps/auth/auth.yaml`은 `321_auth:sha-9f9b18812009fbe81061126527c58ed0bc90bbf5`를 지정한다. 해당 커밋은 lifecycle 구현 `9eafdd80` 이전이다. 이는 Git에 선언된 설정이며 현재 클러스터의 실제 상태 확인을 대신하지 않는다. 현재 auth main의 lifecycle 구현은 SQLite 트랜잭션과 마이그레이션을 사용하지만, 위 선언에는 PostgreSQL이 포함되어 있다. 운영 담당자는 실제 실행 이미지와 라우팅, DB 종류 및 마이그레이션 호환성을 확인하고 배포된 버전과 공개 경로의 차이를 해결해야 한다. 배포나 DB 변경은 이 저장소에서 수행하지 않았다.

또한 auth의 401은 만료된 세션뿐 아니라 잘못된 client secret이나 비활성 client에도 사용된다. 따라서 identity 401 하나만으로 로그인 만료라고 확정할 수 없다. 실제 client 설정과 `/me` 결과를 함께 확인해야 한다.

### 운영 재확인

운영 수정 후 비로그인 `GET /memberships/identity?client_id=n2c`는 404 대신 401을, n2c의 비로그인 `/api/membership`도 502 대신 401을 반환한다. `homelab`의 auth 이미지 선언은 lifecycle 구현을 포함한 `9eafdd80d3d32170ca218922883e8966563d3a5b`로 바뀌었다. 이는 공개 경로와 비로그인 동작이 개선된 증거이며 실제 로그인 상태의 조회 성공, 쿠키 전달, 정리 흐름 및 화면 검증을 증명하지는 않는다.
