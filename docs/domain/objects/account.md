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

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건                | 조회 권한                              |
| --------- | ---------------- | ------------------------------ | --------- | ------------------------ | -------------------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 대상 Account의 내부 조회 | `Account.Self` 또는 `Account.Operator` |

## 관계

| 관계               | 대상                                                          | 방향                  | cardinality | 존재 조건 | 조회 조건                | 조회 권한                              |
| ------------------ | ------------------------------------------------------------- | --------------------- | ----------- | --------- | ------------------------ | -------------------------------------- |
| Profile membership | [Account-Profile Membership](./account-profile-membership.md) | Account -> Membership | 1 -> 0..N   | 항상      | 대상 Account의 운영 관계 | `Account.Self` 또는 `Account.Operator` |

## 행동

| 행동              | 행동 주체      | 대상 객체 | 입력값 | 권한               | 조건                                                                                   | 결과                             |
| ----------------- | -------------- | --------- | ------ | ------------------ | -------------------------------------------------------------------------------------- | -------------------------------- |
| Account 삭제      | Account        | Account   | 없음   | `Account.Self`     | Account State가 Deleted가 아니고 모든 Membership을 제거해도 마지막 Owner 조건을 지킨다 | Account State가 Deleted가 된다   |
| Account 정지      | 운영자 Account | Account   | 사유   | `Account.Operator` | 대상 Account State가 Active다                                                          | Account State가 Suspended가 된다 |
| Account 정지 해제 | 운영자 Account | Account   | 사유   | `Account.Operator` | 대상 Account State가 Suspended다                                                       | Account State가 Active가 된다    |

Deleted Account에는 다른 상태 전이를 적용하지 않는다.

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

- 인증 수단과 Account 표시 이름은 현재 도메인 명세에서 정의하지 않는다.
