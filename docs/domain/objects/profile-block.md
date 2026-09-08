# Profile Block 객체

## 정의

Profile Block은 Owner Profile과 Target Profile 사이의 콘텐츠 조회와 상호작용 정책을 정하는 방향성 관계다.
Profile의 기본 정보는 Profile 조회 정책을 따르고, Post·Media 콘텐츠와 상호작용은 이 관계의 방향과 양쪽 관계
상태를 함께 적용한다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 적용 중인 Block을 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건    | 조회 권한            |
| --------- | ---------------- | ------------------------------ | --------- | ------------ | -------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Owner만 조회 | `ProfileBlock.Owner` |

## 관계

| 관계           | 대상                    | 방향                     | cardinality | 존재 조건 | 조회 조건    | 조회 권한            |
| -------------- | ----------------------- | ------------------------ | ----------- | --------- | ------------ | -------------------- |
| Owner Profile  | [Profile](./profile.md) | Profile Block -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileBlock.Owner` |
| Target Profile | [Profile](./profile.md) | Profile Block -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileBlock.Owner` |

같은 Owner/Target 조합에는 Profile Block이 하나만 존재한다.

## 행동

| 행동               | 행동 주체 Profile | 대상 객체     | 입력값         | 권한                 | 조건                                             | 결과                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ----------------- | ------------- | -------------- | -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile Block 생성 | Owner Profile     | Profile Block | Target Profile | 없음                 | Owner와 Target이 다르고 같은 조합의 Block이 없다 | Block이 생성된다. 이번 실행이 포착한 Follow Request·Follow Relationship 제거와 제거된 Follow 객체의 직접 원인 Notification 정리는 내구성 있는 cleanup orchestration으로 수행하며, 필수 정리가 완료되기 전에는 Block action을 성공으로 확정하지 않는다. 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification은 이번 action에서 변경하지 않는다 |
| Profile Block 제거 | Owner Profile     | Profile Block | 없음           | `ProfileBlock.Owner` | Profile Block이 존재한다                         | 현재 남아 있는 양방향 Follow Request·Follow Relationship과 그 직접 원인 Notification을 정리한 뒤 Profile Block이 제거된다. 차단 생성 때 제거된 Follow Request·Follow Relationship은 복구하지 않는다                                                                                                                                                              |

Profile Block의 도메인 계약은 Owner Profile이 Local인지 Remote인지 또는 Account·Membership 상태를 일반 조건으로
요구하지 않는다. 각 ingress는 자체 인증·admission 경계를 검증한다. 현재 GraphQL ingress는 검증된 Session의 selected
Local Profile만 actor로 사용하며, remote ActivityPub ingress와 Block/Undo 전달은 `PROD-818`의 후속 범위다.

## 권한

| 권한                 | 종류      | 성립 조건                                             |
| -------------------- | --------- | ----------------------------------------------------- |
| `ProfileBlock.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Block의 Owner Profile이다 |

## 조회 정책

- Profile Node, handle route와 일반 Profile 검색은 [Profile](./profile.md)의 공개 조회 정책을 적용해 조회 가능한
  기본 Profile 정보를 제공한다.
- Owner Profile이 Target Profile의 Post를 직접 조회하는 경우에는 Post Visibility·Post Eligibility와 Media 조회
  정책을 적용한다. Target Profile의 Post List, Post detail과 첨부 Media도 같은 정책을 따른다.
- Target Profile이 Owner Profile의 Post를 조회하는 경우에는 Post와 첨부 Media를 모든 직접 API 조회 표면에서
  제공하지 않는다. 두 Profile이 서로 Block한 경우에는 양쪽 방향의 콘텐츠 조회를 제공하지 않으며, 상대 Profile이
  나를 Block한 상태의 콘텐츠 제한을 우선한다.
- Home·Local·Hashtag 타임라인과 Post 콘텐츠 검색은 각 viewer가 상대 Profile의 콘텐츠를 양방향으로 필터링한다.
  Profile Post List는 방향별 Post 조회 정책을 적용해 Owner의 Target Post 접근과 Target의 Owner Post 제한을 각각
  적용한다.
- Follow 후보와 Follow·Follow Request·Reply·Quote·Repost·Reaction 상호작용은 기존 양방향 Profile Block 조건을
  유지한다.
- 이번 Block 실행이 포착해 제거한 Follow Request/Relationship을 원인으로 가진 Notification은 필수 cleanup orchestration에서 함께 제거한다.
  다른 기존 Notification Item은 Block action에서 동기적으로 바꾸지 않으며, Notification 조회는 Recipient·Related
  Profile pair 정책과 Recipient 기준 Related Post/Profile 조회 정책을 적용한다. 후속 비동기 cleanup 전까지 저장
  상태가 남을 수 있다.
- Block 실행 중 이미 진입한 Follow transition이 cleanup 뒤 Follow/Request 또는 그 직접 원인 Notification을 남길 수 있다. Active Block 동안
  공통 정책은 이 잔존 row를 inactive/invisible로 취급한다.
  차단 뒤 모든 Notification source에 신규 생성 억제 정책을 연결하는 일은 `PROD-327`의 후속 범위다. 이 객체의 현재
  cleanup·조회 계약은 해당 source 연결을 전제로 하지 않는다.

## 확정 용어

- Profile Block: Profile Block
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- 커뮤니티 관리와 신고 처리는 현재 범위에서 제외한다.
- Reaction cleanup은 현재 Profile Block action에 포함하지 않으며, 필요하면 별도 후속 계약에서 정한다.
