# Profile Relation Rule 객체

## 정의

Profile Relation Rule은 owner Profile이 대상 Profile에 적용한 mute 또는 block 관계 규칙이다.

## 상태

명시된 상태 차원은 없다.

### Profile Relation Rule Type

| 값    | 의미                           |
| ----- | ------------------------------ |
| Mute  | 대상 Profile을 조용히 숨긴다   |
| Block | 대상 Profile과의 관계를 막는다 |

## 속성

| 속성      | 타입/nullability                 | 검증 정책        | 상태별 존재 조건 | 조회 권한                         |
| --------- | -------------------------------- | ---------------- | ---------------- | --------------------------------- |
| rule type | Profile Relation Rule Type, 필수 | Mute 또는 Block  | 항상             | `Safety.ProfileRelationRuleOwner` |
| 만료 시각 | 시각, nullable                   | 영구 또는 기간제 | Mute             | `Safety.ProfileRelationRuleOwner` |

## 관계

| 관계           | 대상                                              | 조건                 | 조회 권한                                                                  |
| -------------- | ------------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| owner Profile  | [Profile](./profile.md)                           | rule을 가진 Profile  | `Safety.ProfileRelationRuleOwner`                                          |
| 대상 Profile   | [Profile](./profile.md)                           | mute 또는 block 대상 | `Safety.ProfileRelationRuleOwner`                                          |
| 게시 목록 정책 | [Post List Definition](./post-list-definition.md) | 목록별 control 소비  | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |

## 행동

| 행동               | 행동 주체 Profile | 대상 객체             | 입력값             | 권한                              | 결과                                                                                                                                                     |
| ------------------ | ----------------- | --------------------- | ------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile mute 생성  | Profile           | Profile Relation Rule | 대상 Profile, 기간 | `Safety.ProfilePeer`              | Mute rule이 생성되고, 대상 통지 없이 기존 Notification을 보존한다                                                                                        |
| Profile block 생성 | Profile           | Profile Relation Rule | 대상 Profile       | `Safety.ProfilePeer`              | Block rule이 생성되고, 기존 Follow Request, Follow Relationship, Reaction, Repost Post, Bookmark를 제거하며, 대상 통지 없이 기존 Notification을 보존한다 |
| Relation rule 해제 | owner Profile     | Profile Relation Rule | 없음               | `Safety.ProfileRelationRuleOwner` | Rule이 제거된다                                                                                                                                          |

## 권한

| 권한                              | 종류      | 성립 조건                                                     | 대표 참조                  |
| --------------------------------- | --------- | ------------------------------------------------------------- | -------------------------- |
| `Safety.ProfilePeer`              | 객체 종속 | 행동 주체 Profile이 대상 Profile과 다르다                     | Profile mute/block         |
| `Safety.ProfileRelationRuleOwner` | 객체 종속 | 행동 주체 Profile이 Profile Relation Rule의 owner Profile이다 | Profile Relation Rule 조회 |

## 불변 조건

- 추가 전역 불변 조건은 두지 않는다. 행동별 제약은 행동 결과에 둔다.

## 확정 용어

- Profile 관계 규칙: Profile Relation Rule
- 뮤트: Mute
- 차단: Block

## 제외/보류

- 커뮤니티 모더레이션은 현재 범위에서 제외한다.
