# Account 객체

## 정의

Account는 로그인, Profile Owner/Member 관계, 운영자 권한의 기준 객체다. 일반 소셜 행동의 기본 주체는
Account가 아니라 Profile이다.

## 상태

### Account State

| 값        | 의미                          |
| --------- | ----------------------------- |
| Active    | Account를 사용할 수 있는 상태 |
| Suspended | Account 사용이 정지된 상태    |
| Deleted   | 되돌릴 수 없는 terminal 상태  |

## 속성

| 속성         | 타입/nullability | 검증 정책                                                              | 존재 조건 | 조회 조건                | 조회 권한                              |
| ------------ | ---------------- | ---------------------------------------------------------------------- | --------- | ------------------------ | -------------------------------------- |
| OIDC subject | 문자열, 필수     | 신뢰한 OIDC 인증 결과의 subject를 보존하며 하나의 Account에만 연결한다 | 항상      | 대상 Account의 내부 조회 | `Account.Self` 또는 `Account.Operator` |
| 표시 이름    | 문자열, 필수     | 신뢰한 OIDC 인증 결과에서 제공된 표시 값을 보존한다                    | 항상      | 대상 Account의 내부 조회 | `Account.Self` 또는 `Account.Operator` |
| 생성 시각    | 시각, 필수       | 생성 결과로 기록하며 변경 불가                                         | 항상      | 대상 Account의 내부 조회 | `Account.Self` 또는 `Account.Operator` |

Admin Console의 Account 목록·상세는 일반 Account 조회 권한을 확장하지 않고
[Admin Console Read Policy](../policies/admin-console-read.md)의 Admin Console Viewer projection으로만 제공한다.

## 관계

| 관계               | 대상                                                          | 방향                  | cardinality | 존재 조건 | 조회 조건                | 조회 권한                              |
| ------------------ | ------------------------------------------------------------- | --------------------- | ----------- | --------- | ------------------------ | -------------------------------------- |
| Profile membership | [Account-Profile Membership](./account-profile-membership.md) | Account -> Membership | 1 -> 0..N   | 항상      | 대상 Account의 운영 관계 | `Account.Self` 또는 `Account.Operator` |
| Session            | [Session](./session.md)                                       | Account <- Session    | 1 <- 0..N   | 항상      | 현재 Session 내부 조회   | `Session.Self`                         |

## 행동

| 행동              | 행동 주체      | 대상 객체 | 입력값 | 권한                                 | 조건                                                                                     | 결과                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------- | --------- | ------ | ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account 삭제      | Account        | Account   | 없음   | `Account.Self`, `Account.Active`     | Account State가 Active이고 연결된 모든 Profile의 Profile Lifecycle State가 Deactivated다 | Account State가 Deleted가 되고 연결된 Profile·Membership과 Account 속성은 보존되며, 모든 Active Session은 Revoked가 된다. 연결된 ApplicationAuthorization은 revokedAt이 설정되고, OAuthTokens는 REVOKED 및 revokedAt으로 갱신되며, OAuthAuthorizationCodes와 PushInstallations는 물리 삭제된다 |
| Account 정지      | 운영자 Account | Account   | 사유   | `Account.Active`, `Account.Operator` | 대상 Account State가 Active다                                                            | Account State가 Suspended가 된다                                                                                                                                                                                                                                                               |
| Account 정지 해제 | 운영자 Account | Account   | 사유   | `Account.Active`, `Account.Operator` | 대상 Account State가 Suspended다                                                         | Account State가 Active가 된다                                                                                                                                                                                                                                                                  |

클라이언트는 이미 조회한 자기 Account의 Profile 목록(예: `me.profiles`)으로 활성 Profile 개수와 탈퇴 차단
이유를 사전 표시할 수 있다. 이 표시는 참고용이며 탈퇴 허용 판정이 아니다. Account 삭제 요청은 검증된
`Account.Self`를 대상으로 account-deletion Workflow의 transaction Activity가 연결된 모든 Profile State를
다시 확인하고, 하나라도 Deactivated가 아니면 Account와 관계를 변경하지 않고 거부한다. Workflow는 현재 이
transaction Activity의 결과를 동기적으로 반환하며, 향후 외부 효과가 추가될 수 있는 실행 경계를 보존한다.

Deleted Account는 되돌릴 수 없는 terminal 상태이며 공개 인증과 `deleteAccount` mutation을 허용하지 않는다.
이미 인증·승인된 account-deletion Workflow가 DB commit 후 결과 acknowledgement를 잃고 재시도되는 내부 경로에
한해서는 transaction Activity가 storage `DISABLED`를 멱등 성공으로 처리하고 명세된 인증·기기 정리를 다시
적용할 수 있다. 이 내부 재시도도 Account를 Active로 되돌리지 않는다. 완료된 Workflow가 `BLOCKED`를 반환한
경우에는 Account가 Active인 동안 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작해 현재 Profile 조건을 다시
판정할 수 있으며, 이 정책은 Deleted Account의 공개 재탈퇴를 허용하지 않는다.
Account를 Deleted로 전환하는 탈퇴는 Active Account에서만 요청할 수 있으며 `Account.Active`를 요구한다.

## 권한

| 권한               | 종류      | 성립 조건                               |
| ------------------ | --------- | --------------------------------------- |
| `Account.Self`     | 객체 종속 | 요청 Account가 대상 Account와 같다      |
| `Account.Active`   | 객체 종속 | 요청 Account의 Account State가 Active다 |
| `Account.Operator` | 독립      | 요청 Account가 운영자다                 |

## 확정 용어

- 계정: Account
- 계정 상태: Account State

## 제외/보류

- OIDC 인증 수단 자체와 Session credential은 Account 속성이 아니며 [Session](./session.md)과 인증 경계가
  소유한다.
