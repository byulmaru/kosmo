# Profile Domain Block 객체

## 정의

Profile Domain Block은 owner Profile이 원격 Instance 전체를 개인적으로 차단한 결과다.

## 상태

명시된 상태 차원은 없다.

## 속성

| 속성        | 타입/nullability | 검증 정책            | 상태별 존재 조건 | 조회 권한                        |
| ----------- | ---------------- | -------------------- | ---------------- | -------------------------------- |
| 대상 Domain | 문자열, 필수     | 원격 Instance 식별자 | 항상             | `Safety.ProfileDomainBlockOwner` |
| 생성 시각   | 시각, 필수       | 미정                 | 항상             | `Safety.ProfileDomainBlockOwner` |

## 관계

| 관계           | 대상                                              | 조건                 | 조회 권한                                                                  |
| -------------- | ------------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| owner Profile  | [Profile](./profile.md)                           | block을 가진 Profile | `Safety.ProfileDomainBlockOwner`                                           |
| 대상 Instance  | [Instance](./instance.md)                         | 차단 대상 원격 서버  | `Safety.ProfileDomainBlockOwner`                                           |
| 게시 목록 정책 | [Post List Definition](./post-list-definition.md) | Post List 적용       | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| 검색 정책      | [Search Index](./search-index.md)                 | Search 적용          | `Search.SafeScope`                                                         |

## 행동

| 행동                   | 행동 주체 Profile | 대상 객체            | 입력값 | 권한                             | 결과                                                                                                                         |
| ---------------------- | ----------------- | -------------------- | ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Profile Domain block   | Profile           | Profile Domain Block | Domain | `Safety.ProfileDomainBlockOwner` | Profile Domain Block이 생성되고, 대상 Instance 콘텐츠를 owner Profile에게 없는 것처럼 취급하며, 기존 Notification을 보존한다 |
| Profile Domain unblock | owner Profile     | Profile Domain Block | 없음   | `Safety.ProfileDomainBlockOwner` | Profile Domain Block이 제거된다                                                                                              |

## 권한

| 권한                             | 종류      | 성립 조건                                                                                                              | 대표 참조                 |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Safety.ProfileDomainBlockOwner` | 객체 종속 | 행동 주체 Profile이 개인 Domain block의 owner Profile이다. 생성 시에는 생성될 Profile Domain Block의 owner Profile이다 | Profile 개인 Domain block |

## 불변 조건

- 추가 전역 불변 조건은 두지 않는다. 행동별 제약은 행동 결과에 둔다.

## 확정 용어

- Profile Domain Block: Profile Domain Block

## 제외/보류

- 운영자 Domain Block은 [Instance](./instance.md)의 Instance Safety State로 다룬다.
