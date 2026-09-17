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

| 행동              | 행동 주체      | 대상 객체 | 입력값 | 권한                                 | 조건                                                                                     | 결과                                                                                                                        |
| ----------------- | -------------- | --------- | ------ | ------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Account 삭제      | Account        | Account   | 없음   | `Account.Self`                       | Account State가 Active이고 연결된 모든 Profile의 Profile Lifecycle State가 Deactivated다 | Account State가 Deleted가 되고 연결된 Profile·Membership과 Account 속성은 보존되며, Kosmo 인증·Session·기기 연결이 폐기된다 |
| Account 정지      | 운영자 Account | Account   | 사유   | `Account.Active`, `Account.Operator` | 대상 Account State가 Active다                                                            | Account State가 Suspended가 된다                                                                                            |
| Account 정지 해제 | 운영자 Account | Account   | 사유   | `Account.Active`, `Account.Operator` | 대상 Account State가 Suspended다                                                         | Account State가 Active가 된다                                                                                               |

탈퇴 허용 여부는 연결된 모든 Profile State를 요청 시점에 서버가 다시 확인하며, 하나라도 Deactivated가
아니면 Account와 관계를 변경하지 않고 거부한다.

Deleted Account는 되돌릴 수 없는 terminal 상태이며 공개 인증과 탈퇴 재요청을 허용하지 않는다.

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
