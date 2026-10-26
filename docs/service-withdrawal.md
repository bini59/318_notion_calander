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
