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

| 행동               | 행동 주체 Profile | 대상 객체     | 입력값           | 권한                 | 조건                                                      | 결과                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------- | ------------- | ---------------- | -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile Block 생성 | Owner Profile     | Profile Block | Target Profile   | 없음                 | Owner와 Target이 다르다                                   | 같은 조합의 Block이 없을 때에만 현재 양방향 Follow Request·Follow Relationship과 이를 직접 원인으로 하는 Notification을 같은 transaction에서 제거하고 Profile Block 관계를 생성한다. 새로 생성된 관계가 성공 결과이며, commit 뒤 effect의 성공·실패는 관계 성공을 바꾸지 않는다. 같은 조합의 Block이 이미 있으면 기존 관계를 성공 결과로 반환하고 새 cleanup을 실행하지 않는다. 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification·Read State는 변경하지 않는다 |
| Profile Block 제거 | Owner Profile     | Profile Block | Profile Block ID | `ProfileBlock.Owner` | 입력한 ID의 Profile Block이 Owner Profile에 속해 존재한다 | 입력한 Profile Block 관계만 제거된다. Follow Request·Follow Relationship·Notification을 추가로 정리하거나 차단 생성 때 제거된 관계를 복구하지 않는다                                                                                                                                                                                                                                                                                                                                 |

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
- 새 QuoteRequest와 새 인용 승인은 양방향 차단 관계를 우선 확인한다. 기존 승인에 따른 Quote Source 조회는
  별도 양방향 제한을 만들지 않고 위의 방향별 Post 조회 정책을 그대로 적용한다. 따라서 Owner가 Target을
  차단한 경우 Owner의 Target Source 직접 조회는 허용될 수 있지만, Target이 Owner를 차단했거나 상호 차단한
  경우 Owner에게 Source를 제공하지 않는다. 차단 자체로 기존 QuoteAuthorization을 자동 철회하지 않으며,
  제3자에게도 Source를 숨기려면 [Post](./post.md)의 명시적 인용 승인 철회를 사용한다.
- 이번 Block transaction에서 제거한 Follow Request/Relationship을 원인으로 가진 Notification도 같은 transaction에서 함께 제거한다.
  다른 기존 Notification Item과 Read State는 Block action에서 변경하지 않으며, Notification 조회는 Recipient·Related
  Profile pair 정책과 Recipient 기준 Related Post/Profile 조회 정책을 적용한다. commit 뒤 별도 effect가 실패해도
  이미 성공한 Profile Block 관계는 유지된다.
- Active Block 동안 양방향 보호 정책은 후속 경로에서 남은 Follow/Request와 Notification을 inactive/invisible로 취급한다.
  동시성이나 후속 경로로 뒤늦게 관찰되는 관계도 이 Active Block 정책으로 처리하며, duplicate Block 관찰이나 Unblock이 보상 cleanup을
  소유하는 것으로 확장하지 않는다. 차단 뒤 모든 Notification source에 신규 생성 억제 정책을 연결하는 일은 `PROD-327`의 후속 범위다.
  이 객체의 현재 cleanup·조회 계약은 해당 source 연결을 전제로 하지 않는다.

## 확정 용어

- Profile Block: Profile Block
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- 커뮤니티 관리와 신고 처리는 현재 범위에서 제외한다.
- Reaction cleanup은 현재 Profile Block action에 포함하지 않으며, 필요하면 별도 후속 계약에서 정한다.
