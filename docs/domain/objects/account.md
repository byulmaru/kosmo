# Account 객체

## 정의

Account는 로그인, Profile Owner/Member 권한, 운영자 권한의 기준 객체다. 일반 소셜 행동의 기본 주체는
Account가 아니라 Profile이다.

## 상태

### Account State

| 값     | 의미                          |
| ------ | ----------------------------- |
| 활성   | Account를 사용할 수 있는 상태 |
| 정지   | Account 사용이 정지된 상태    |
| 삭제됨 | terminal 상태                 |

## 속성

| 속성      | 타입/nullability    | 검증 정책         | 상태별 존재 조건 | 조회 권한      |
| --------- | ------------------- | ----------------- | ---------------- | -------------- |
| 표시 이름 | 문자열, 필수        | 미정              | 모든 상태        | `Account.Self` |
| 상태      | Account State, 필수 | 위 상태 값만 허용 | 모든 상태        | `Account.Self` |
| 생성 시각 | 시각, 필수          | 미정              | 모든 상태        | `Account.Self` |

## 관계

| 관계               | 대상                                                          | 조건                          | 조회 권한      |
| ------------------ | ------------------------------------------------------------- | ----------------------------- | -------------- |
| Profile membership | [Account-Profile Membership](./account-profile-membership.md) | Account가 연결한 Profile 관계 | `Account.Self` |

## 행동

| 행동              | 행동 주체      | 대상 객체 | 입력값 | 권한               | 결과                                                                                       |
| ----------------- | -------------- | --------- | ------ | ------------------ | ------------------------------------------------------------------------------------------ |
| Account 삭제      | Account        | Account   | 없음   | `Account.Self`     | 마지막 `Owner` 조건을 지키며 Account-Profile 관계가 정리된 Account의 State가 삭제됨이 된다 |
| Account 정지      | 운영자 Account | Account   | 사유   | `Account.Operator` | Account State가 정지가 되고 Profile 전환과 Account 기준 행동을 막는다                      |
| Account 정지 해제 | 운영자 Account | Account   | 사유   | `Account.Operator` | Account State가 활성으로 돌아간다                                                          |

## 권한

| 권한               | 종류      | 성립 조건                          | 대표 참조                                 |
| ------------------ | --------- | ---------------------------------- | ----------------------------------------- |
| `Account.Self`     | 객체 종속 | 요청 Account가 대상 Account와 같다 | Account 속성/관계 조회, 본인 Account 행동 |
| `Account.Active`   | 객체 종속 | 요청 Account가 활성 상태다         | Profile 생성                              |
| `Account.Operator` | 독립      | 요청 Account가 운영자다            | 운영자 moderation action, 시스템 처리     |

## 불변 조건

- Account 정지는 Account 상태이고 Profile 정지는 Profile 상태다.

## 확정 용어

- 계정: Account

## 제외/보류

- 인증 수단의 구체 구현은 도메인 명세에서 정의하지 않는다.
