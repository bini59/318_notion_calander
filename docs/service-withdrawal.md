# 서비스 탈퇴 연계 선행 조건 (#26)

현재 상태: **인증 서비스 선행 작업으로 구현 차단**. 동작하지 않는 탈퇴 버튼이나 추정한 API는 추가하지 않는다. 기존 삭제 큐 동기화는 유지한다.

## 확인 근거

2026-10-26에 321_auth main 커밋 `e7cd1fe9f82c420ffed1ebd94a0c080df88373ae`를 읽기 전용으로 확인했다. 운영 배포 버전과 실제 n2c의 `auto_provision` 값은 확인하지 않았으며 변경하지 않았다.

- [AuthController](https://github.com/bini59/321_auth/blob/e7cd1fe9f82c420ffed1ebd94a0c080df88373ae/apps/api/src/auth/auth.controller.ts): `POST /memberships`는 생성만 지원한다. 사용자용 서비스별 해지 API는 없다. `/verify`와 OAuth 콜백은 `auto_provision`이 켜져 있으면 membership을 생성한다.
- [MembershipsService](https://github.com/bini59/321_auth/blob/e7cd1fe9f82c420ffed1ebd94a0c080df88373ae/apps/api/src/memberships/memberships.service.ts): `ensure`는 INSERT/ON CONFLICT DO NOTHING이며 탈퇴 상태나 명시적 재가입 처리가 없다. 단순 membership 삭제는 자동 재가입을 막지 못한다.
- [AccountController](https://github.com/bini59/321_auth/blob/e7cd1fe9f82c420ffed1ebd94a0c080df88373ae/apps/api/src/auth/account.controller.ts): 전체 계정 관리 목적지는 `https://auth.bini59.dev/client`. `POST /account/delete`는 공통 계정 삭제이므로 서비스 탈퇴에 사용할 수 없다.
- [UsersService](https://github.com/bini59/321_auth/blob/e7cd1fe9f82c420ffed1ebd94a0c080df88373ae/apps/api/src/users/users.service.ts) 및 [스키마](https://github.com/bini59/321_auth/blob/e7cd1fe9f82c420ffed1ebd94a0c080df88373ae/apps/api/src/db/migrations/001_init.sql): 전체 계정 삭제는 공통 사용자와 연결된 로그인 식별자·모든 서비스 membership을 삭제하고, 전체 세션을 해지하며 프로필 이미지를 정리한다. 삭제 큐를 소비하는 서비스의 로컬 데이터는 각 서비스 동기화 시 삭제되므로 즉시 삭제를 보장하는 안내를 해서는 안 된다. Notion 원본 삭제 호출은 없다.

## Kevin에게 필요한 선행 작업

321_auth에서 아래 계약을 먼저 구현·검증하고, 배포 버전과 API 계약을 이 이슈에 연결해야 한다. 아래는 요구 사항이며 기존 API나 확정된 URL을 뜻하지 않는다.

1. 세션 본인의 해당 서비스 membership만 해지하는 API. 서비스 secret의 서비스 범위와 사용자 인증을 확인하고 다른 사용자·다른 서비스·공통 계정을 변경하지 않아야 한다. 중복 요청과 네트워크 응답 유실 후 재시도도 안전해야 한다.
2. 탈퇴를 유지하는 상태와 명시적 동의에 의한 재가입 계약. `/verify`, 로그인 콜백, 일반 membership 생성이 탈퇴를 자동 취소하지 않도록 해야 한다. 기존 `auto_provision` 사용자에 대한 동작 및 n2c 설정 전환 여부도 확정해야 한다.
3. 해지 성공 후 로컬 삭제 실패 시, membership이 비활성이어도 본인을 인증해 로컬 정리를 재시도할 방법. 현재 앱 proxy는 비활성 membership을 403으로 막으므로 일반 보호 API만으로 재시도할 수 없다.
4. 서비스별 삭제 이벤트를 제공할 경우 기존 전체 계정 삭제 큐와의 범위·ack·재가입 순서를 명시해야 한다. 과거 이벤트가 재가입 후 새 데이터를 지우지 않도록 해야 한다.

## 선행 작업 이후 이 저장소 구현 범위

- 설정 계정 영역에 `캘린더 서비스 탈퇴`와 취소 가능한 최종 확인 화면을 추가한다. Notion 연결 정보·캘린더 설정 삭제, 기존 구독 URL 중단, Notion 원본·공통 계정·다른 서비스 가입 유지 내용을 표시한다.
- 확인 화면 하단에 `다른 서비스에서도 탈퇴하려면 전체 계정 관리로 이동하세요`와 검증된 `/client` 링크를 제공하고 전체 계정 삭제의 별도 영향을 설명한다.
- 서버에서 본인을 확인하고 요청 위조·중복 제출을 차단한다. 서비스 해지와 `deleteUserByAuthId`(로컬 데이터 및 피드 캐시 삭제)가 모두 성공한 후 랜딩으로 이동한다. 실패는 완료로 표시하지 않고 안전하게 재시도한다.
- 취소, 미인증, 타 사용자, 요청 위조, 중복 요청, 양쪽 실패 및 재시도, 이전 피드 차단, 다른 사용자 데이터 유지, 로그인 후 자동 재가입 방지, 명시적 재가입, 기존 삭제 큐를 검증한다.

티켓: https://github.com/bini59/318_notion_calander/issues/26
