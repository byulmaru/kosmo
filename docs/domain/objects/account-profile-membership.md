# Account-Profile Membership 객체

## 정의

Account-Profile Membership은 Account와 Local Profile의 역할 기반 관계다. Profile 운영 권한과 소셜 행동
주체 자격을 분리한다.

## 상태

### Account Profile Role

| 값     | 의미                                           |
| ------ | ---------------------------------------------- |
| Owner  | Profile 운영과 Membership 변경의 책임을 가진다 |
| Member | Profile의 소셜 행동 주체가 될 수 있다          |

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건               | 조회 권한                                 |
| --------- | ---------------- | ------------------------------ | --------- | ----------------------- | ----------------------------------------- |
| 연결 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Local Profile 운영 관계 | `Profile.Owner` 또는 `Membership.Account` |

## 관계

| 관계    | 대상                    | 방향                  | cardinality | 존재 조건 | 조회 조건               | 조회 권한                                 |
| ------- | ----------------------- | --------------------- | ----------- | --------- | ----------------------- | ----------------------------------------- |
| Account | [Account](./account.md) | Membership -> Account | 1 -> 1      | 항상      | Local Profile 운영 관계 | `Profile.Owner` 또는 `Membership.Account` |
| Profile | [Profile](./profile.md) | Membership -> Profile | 1 -> 1      | 항상      | Profile Origin이 Local  | `Profile.Owner` 또는 `Membership.Account` |

같은 Account와 Profile 조합에는 Membership이 하나만 존재한다. Local Profile에는 Owner Role Membership이
항상 하나 이상 존재한다.

## 행동

| 행동                   | 행동 주체 Account | 대상 객체  | 입력값          | 권한                 | 조건                                                                                         | 결과                                                 |
| ---------------------- | ----------------- | ---------- | --------------- | -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Account 연결           | Owner Account     | Membership | Account, Role   | `Profile.Owner`      | 대상 Account가 Active이고 같은 Account/Profile Membership이 없으며 Profile이 삭제되지 않았다 | 새 Membership이 생성된다                             |
| Role 변경              | Owner Account     | Membership | Role            | `Profile.Owner`      | 현재 Role과 다르고 Owner를 Member로 바꾼 뒤에도 Owner가 한 명 이상 남는다                    | Membership Role이 바뀐다                             |
| Owner 지위 양도        | Owner Account     | Membership | 대상 Membership | `Profile.Owner`      | 대상은 같은 Profile의 Member이고 행동 주체의 Membership은 Owner다                            | 대상은 Owner, 행동 주체는 Member로 원자적으로 바뀐다 |
| 다른 Account 연결 해제 | Owner Account     | Membership | 없음            | `Profile.Owner`      | 대상 Account가 행동 주체와 다르고 제거 후에도 Owner가 한 명 이상 남는다                      | 대상 Membership이 제거된다                           |
| 자기 연결 해제         | 대상 Account      | Membership | 없음            | `Membership.Account` | 제거 후에도 Owner가 한 명 이상 남는다                                                        | 대상 Membership이 제거된다                           |

## 권한

| 권한                 | 종류      | 성립 조건                                  |
| -------------------- | --------- | ------------------------------------------ |
| `Membership.Account` | 객체 종속 | 요청 Account가 Membership의 Account와 같다 |

## 확정 용어

- Account-Profile 관계: Account-Profile Membership
- Account Profile Role: Account Profile Role
- Owner: Owner
- Member: Member

## 제외/보류

- 초대 수락 대기나 연결 해제 대기 상태는 현재 범위에서 제외한다.
