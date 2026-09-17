## 1. PROD-970 서버 Account 탈퇴 Workflow와 인증·기기 정리

**Authority / Provenance**

- `docs/domain/objects/account.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/session.md`
- `docs/design/settings.md`
- `PROD-970`

**Deliverable**

GraphQL `deleteAccount` mutation과 account-deletion Workflow의 Account eligibility·원자적 관계 정리·login
차단과 API 계약이다.

**Guardrails**

- Account를 Deleted로 전환하는 탈퇴는 Account State가 Active이고 연결 Profile이 없거나 모두 storage `DISABLED`일
  때만 허용한다. 클라이언트 precheck는 `me.profiles`에서 파생하고, account-deletion Workflow의 transaction
  Activity가 하나의 동기 DB transaction에서 다시 확인한다. Deleted Account는 공개 인증과 `deleteAccount`
  mutation을 허용하지 않는다. 이미 인증·승인된 Workflow 실행이 DB commit 후 결과 acknowledgement를 잃고
  재시도되는 내부 경로에 한해서는 Activity가 `DISABLED`를 멱등 성공으로 처리해 정리를 다시 적용할 수 있으며,
  Account를 Active로 되돌리지 않는다.
- Account storage `DISABLED`를 canonical Deleted로 사용하며 새 `DELETED` enum이나 schema migration을 추가하지 않는다.
- Profile·Membership·Account 속성을 삭제·변경하지 않는다.
- 모든 Active Session(현재 Session 포함)을 `REVOKED`로 전환하고, `ApplicationAuthorization.revokedAt`을
  기록하며, `OAuthTokens`를 `REVOKED`와 `revokedAt`으로 전환한다.
- `OAuthAuthorizationCodes`와 `PushInstallation`은 물리적으로 삭제한다. 이번 탈퇴 정리 대상은 Account state,
  Active Sessions, `ApplicationAuthorization`, `OAuthTokens`, `OAuthAuthorizationCodes` 및 `PushInstallation`으로
  한정한다.
- 일반 current-session logout으로 축소하지 않으며, 정리 결과가 불명확할 때 성공이나 부분 탈퇴를 반환하지 않는다.
- Deleted Account의 동일 OIDC subject login은 새 Account·Session을 만들지 않고 임시 차단한다. Byulmaru ID 상태는
  변경하지 않는다.
- GraphQL resolver는 검증된 Account ID만 stable Workflow input으로 전달하고 `runWorkflow`의 `execute` 결과를
  기다려 `completed`만 반환한다. 동일 실행은 `USE_EXISTING`, Account가 Active인 동안 완료된 `BLOCKED` 실행의
  재시도는 `ALLOW_DUPLICATE`를 사용하며, 이 정책은 Deleted Account의 공개 재탈퇴를 허용하지 않는다.
- Workflow는 현재 하나의 transaction Activity만 실행하며, 향후 외부 효과가 추가될 수 있는 경계를 유지하되
  현재 외부 효과나 speculative side effect는 추가하지 않는다.
- 별도 Core account-deletion service, Native 전용 login 오류 타입·문구는 추가하지 않는다.

**Verification**

- Worker integration에서 Profile이 0개인 경우, 모든 Profile이 `DISABLED`인 경우, Active Profile이 남은 경우의
  transaction Activity 결과와 no-op을 database-backed test로 검증한다.
- Worker integration에서 둘 이상의 Active Session과 authorization/token/code/push fixture의 성공 후 각 상태·물리
  삭제·Profile/Membership/Account 속성 보존을 검증한다.
- Worker integration에서 상태 전이 또는 관계 정리 실패를 주입해 Workflow가 성공을 반환하지 않고 부분 탈퇴를
  노출하지 않는지 검증한다.
- 공통 Session 생성 경계에서 동일 OIDC subject가 새 Account·Session을 만들지 못하는지 검증한다.
- API integration에서 인증된 Account ID가 Workflow input으로 전달되고 true/false Workflow 결과를 mutation이
  기다려 `completed`로 반환하는지 검증하며, Worker DB 검증을 중복하지 않는다.

- [x] 1.1 Profile 0개·전체 `DISABLED` eligibility를 허용하고 Active Profile이 남은 요청은 변경 없이 거부하는 서버 동작을 구현한다.
- [x] 1.2 Account를 storage `DISABLED`로 전환하면서 모든 Active Session, `ApplicationAuthorization`, `OAuthTokens`, `OAuthAuthorizationCodes` 및 `PushInstallation` 정리를 원자적 결과로 확정하고 Profile·Membership·Account 속성을 보존한다.
- [x] 1.3 결과 불명 실패와 중복 요청을 안전하게 처리하고, 이미 인증·승인된 Workflow 실행이 commit acknowledgement를 잃고 재시도될 때만 `DISABLED` Account 정리를 멱등적으로 다시 적용하며 Account를 Active로 되돌리지 않는 Account 탈퇴 의미를 유지한다. Deleted Account의 공개 인증·재탈퇴는 허용하지 않으며, Account가 Active인 동안 완료된 `BLOCKED` 실행은 `ALLOW_DUPLICATE`로 재시도한다.
- [x] 1.4 공통 Session 생성 경계에서 Deleted Account의 동일 OIDC subject 재가입을 임시 차단하고 새 Account·Session을 만들지 않는다.
- [ ] 1.5 서버 eligibility·cleanup·실패 atomicity·재가입 차단 integration/API 검증을 추가해 통과시킨다.
- [x] 1.6 API mutation의 Workflow input·동기 결과 전달·인증 경계를 integration test로 검증한다.

## 2. PROD-970 Settings·public 안내·cross-platform lifecycle

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/profile-lifecycle.md`
- `docs/domain/objects/account.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/session.md`
- `PROD-970`
- `PROD-872`

**Deliverable**

Web·Android·iOS Settings lifecycle, 성공 후 login 전환, public in-app-only 안내와 runtime evidence다.

**Guardrails**

- Settings root/master 마지막 행을 항상 노출하고 `/settings/account-deletion`으로 이동한다. Byulmaru ID 외부
  `계정 설정`과 Profile action을 변경하거나 대체하지 않는다.
- eligibility 실패 시 `me.profiles`에서 계산한 Active Profile 개수와 이유만 표시하고 Profile 목록·action·Membership
  cleanup 진입점을 제공하지 않는다. 이 값은 서버 mutation의 원자적 재확인을 대체하지 않는다.
- acknowledgement checkbox만 사용하고 재인증·유예기간·이유 입력·이유 설문을 추가하지 않는다. checkbox 전 확정
  action은 disabled다.
- pending 중 중복 실행·checkbox 변경·dismiss·navigation을 막고, error에서는 확인 내용과 checkbox를 유지한 채
  안전한 오류와 `다시 시도`를 제공한다.
- server 성공 확정 뒤에만 credential과 viewer 상태를 정리하고 login으로 이동한다. 결과 불명 상태에서는 성공을
  추측하지 않는다.
- 공개 `/account-deletion`은 앱 Settings에서만 가능한 경로를 안내하며 이메일 삭제 요청, 수동 외부 삭제,
  retention/grace/recovery 내용을 탈퇴 경로로 제공하지 않는다.
- Byulmaru ID, Profile/Post/Media 정책, OpenPanel 분석, 새 Figma source와 별도 migration은 범위에 포함하지 않는다.

**Verification**

- Web E2E에서 마지막 root row, blocker count/reason, checkbox disabled/enabled, pending lock, error/retry,
  success 후 login 전환과 stale viewer 미표시를 검증한다.
- Android/iOS 공용 route와 native runtime에서 동일 lifecycle, touch target·screen reader 상태, login 전환을
  확인한다. iOS device/store evidence는 `PROD-872`에 연결한다.
- public `/account-deletion`에서 in-app-only 안내와 이메일 form/link 부재를 browser test로 검증한다.
- Web·Native API 결과와 client 상태가 일치하는지 cross-slice E2E 및 targeted type/lint/test check로 검증한다.

- [x] 2.1 Settings root/master에 항상 보이는 마지막 `코스모 탈퇴` row와 `/settings/account-deletion` detail을 기존 shell/header/back 규칙으로 연결한다.
- [x] 2.2 eligibility blocker와 acknowledgement checkbox, pending 중 조작 잠금, safe error/retry, server-confirmed success UI를 Web·Android·iOS에서 구현한다.
- [x] 2.3 Web·Native client가 성공 확정 뒤 credential·viewer 상태를 정리하고 login route로 이동하며, 실패 시 확인 상태를 보존하도록 연결한다.
- [x] 2.4 public `/account-deletion`을 Settings in-app-only 안내로 갱신하고 이메일 삭제 요청·보관/유예 경로를 제거한다.
- [ ] 2.5 Web E2E, Android/iOS runtime·접근성 검증과 iOS device evidence를 `PROD-872`에 연결하고, OpenSpec·canonical·Linear 계약을 최종 정합화한다.
