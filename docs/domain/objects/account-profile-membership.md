# Account-Profile Membership 객체

## 정의

Account-Profile Membership은 Account와 Local Profile의 역할 기반 관계다. Profile 운영 권한과 소셜 행동
권한을 분리한다.

## 상태

별도 상태 차원은 두지 않는다. 현재 권한은 role과 마지막 `Owner` 불변 조건으로 판단한다.

### Account Profile Role

| 값     | 의미                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Owner  | Profile 삭제, role 변경, Account 초대, Owner 지위 양도, Profile 전환 가능 |
| Member | Profile 전환과 소셜 행동 가능, Profile 운영 권한 없음                     |

## 속성

| 속성      | 타입/nullability           | 검증 정책                    | 상태별 존재 조건 | 조회 권한       |
| --------- | -------------------------- | ---------------------------- | ---------------- | --------------- |
| role      | Account Profile Role, 필수 | `Owner` 또는 `Member`만 허용 | 항상             | `Profile.Owner` |
| 연결 시각 | 시각, 필수                 | 미정                         | 항상             | `Profile.Owner` |

## 관계

| 관계    | 대상                    | 조건                            | 조회 권한       |
| ------- | ----------------------- | ------------------------------- | --------------- |
| Account | [Account](./account.md) | membership owner                | `Profile.Owner` |
| Profile | [Profile](./profile.md) | Local Profile인 membership 대상 | `Profile.Owner` |

## 행동

| 행동            | 행동 주체 Account | 대상 객체  | 입력값        | 권한                                 | 결과                          |
| --------------- | ----------------- | ---------- | ------------- | ------------------------------------ | ----------------------------- |
| Account 초대    | Owner             | Membership | Account, role | `Profile.Owner`                      | 새 Membership이 생성된다      |
| role 변경       | Owner             | Membership | role          | `Profile.Owner`                      | Membership role이 바뀐다      |
| Owner 지위 양도 | Owner             | Membership | 대상 Account  | `Profile.Owner`                      | 대상 Account가 `Owner`가 된다 |
| 연결 해제       | Owner             | Membership | 없음          | `Profile.Owner`                      | Membership이 제거된다         |
| 자기 연결 해제  | 대상 Account      | Membership | 없음          | `Profile.MembershipSelfNonLastOwner` | Membership이 제거된다         |

## 권한

| 권한                                 | 종류      | 성립 조건                                                                | 대표 참조                 |
| ------------------------------------ | --------- | ------------------------------------------------------------------------ | ------------------------- |
| `Profile.MembershipSelfNonLastOwner` | 객체 종속 | Account가 Local Profile Membership의 Account이며 마지막 `Owner`가 아니다 | 자기 Membership 연결 해제 |

## 불변 조건

- 하나의 Account는 여러 Profile과 연결될 수 있다.
- 하나의 Local Profile은 여러 Account와 역할 기반으로 연결될 수 있다.
- Remote Profile은 Account-Profile Membership을 가질 수 없다.
- Local Profile에는 항상 최소 1명의 `Owner`가 있어야 한다.
- 마지막 `Owner`는 탈퇴, role 변경, 연결 해제할 수 없다.
- 초대, 수락, 연결 해제 흐름은 별도 상태 기계로 두지 않는다.

## 확정 용어

- Account-Profile 관계: Account-Profile Membership
- Owner: Owner
- Member: Member

## 제외/보류

- 초대 수락 대기, 연결 해제 대기 같은 상태 차원은 현재 범위에서 제외한다.
