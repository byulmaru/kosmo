# Profile Domain Block 객체

## 정의

Profile Domain Block은 Owner Profile이 Target Instance 전체를 개인적으로 차단한 관계다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 적용 중인 Domain Block을 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건    | 조회 권한                  |
| --------- | ---------------- | ------------------------------ | --------- | ------------ | -------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Owner만 조회 | `ProfileDomainBlock.Owner` |

## 관계

| 관계            | 대상                      | 방향                             | cardinality | 존재 조건 | 조회 조건    | 조회 권한                  |
| --------------- | ------------------------- | -------------------------------- | ----------- | --------- | ------------ | -------------------------- |
| Owner Profile   | [Profile](./profile.md)   | Profile Domain Block -> Profile  | 1 -> 1      | 항상      | Owner만 조회 | `ProfileDomainBlock.Owner` |
| Target Instance | [Instance](./instance.md) | Profile Domain Block -> Instance | 1 -> 1      | 항상      | Owner만 조회 | `ProfileDomainBlock.Owner` |

같은 Owner Profile과 Target Instance 조합에는 Profile Domain Block이 하나만 존재한다. Target Domain 문자열은
별도 속성으로 중복하지 않고 Target Instance의 Domain에서 파생한다.

## 행동

| 행동                      | 행동 주체 Profile | 대상 객체            | 입력값          | 권한                                         | 조건                                                                                               | 결과                                                       |
| ------------------------- | ----------------- | -------------------- | --------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Profile Domain Block 생성 | Owner Profile     | Profile Domain Block | Target Instance | `Account.Active`, `Profile.Member`           | Owner는 Active/Normal Local Profile이고 Target Instance Type이 Remote이며 같은 조합의 Block이 없다 | Owner/Instance 관계를 가진 Profile Domain Block이 생성된다 |
| Profile Domain Block 제거 | Owner Profile     | Profile Domain Block | 없음            | `Account.Active`, `ProfileDomainBlock.Owner` | Profile Domain Block이 존재한다                                                                    | Profile Domain Block이 제거된다                            |

## 권한

| 권한                       | 종류      | 성립 조건                                                    |
| -------------------------- | --------- | ------------------------------------------------------------ |
| `ProfileDomainBlock.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Domain Block의 Owner Profile이다 |

## 조회 정책

- Target Instance의 Profile, Post, Media는 Owner Profile에게 직접 접근, Post List, 검색, Notification에서
  없는 것처럼 취급한다.
- 기존 Notification Item의 존재와 Read State는 바꾸지 않는다.

## 확정 용어

- Profile Domain Block: Profile Domain Block

## 제외/보류

- 운영자 Domain Block은 [Instance](./instance.md)의 Instance Safety State로 다룬다.
