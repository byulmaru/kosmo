# Profile Block 객체

## 정의

Profile Block은 Owner Profile과 Target Profile 사이의 조회와 상호작용을 차단하는 관계다.

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

| 행동               | 행동 주체 Profile | 대상 객체     | 입력값         | 권한                 | 조건                                             | 결과                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------- | ------------- | -------------- | -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile Block 생성 | Owner Profile     | Profile Block | Target Profile | 없음                 | Owner와 Target이 다르고 같은 조합의 Block이 없다 | Block이 생성된다. 필요한 Follow Request·Follow Relationship 제거와 제거된 Follow 객체의 직접 원인 Notification 정리는 내구성 있는 cleanup orchestration으로 수행하며, 필수 정리가 완료되기 전에는 Block action을 성공으로 확정하지 않는다. 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification은 이번 action에서 변경하지 않는다 |
| Profile Block 제거 | Owner Profile     | Profile Block | 없음           | `ProfileBlock.Owner` | Profile Block이 존재한다                         | Profile Block이 제거된다                                                                                                                                                                                                                                                                                                                             |

Profile Block의 도메인 계약은 Owner Profile이 Local인지 Remote인지 또는 Account·Membership 상태를 일반 조건으로
요구하지 않는다. 각 ingress는 자체 인증·admission 경계를 검증한다. 현재 GraphQL ingress는 검증된 Session의 selected
Local Profile만 actor로 사용하며, remote ActivityPub ingress와 Block/Undo 전달은 `PROD-818`의 후속 범위다.

## 권한

| 권한                 | 종류      | 성립 조건                                             |
| -------------------- | --------- | ----------------------------------------------------- |
| `ProfileBlock.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Block의 Owner Profile이다 |

## 조회 정책

- Owner와 Target은 서로의 Profile, Post, Media와 Follow 후보를 직접 조회할 수 없다.
- 모든 Post List와 검색 결과에서 상대 Profile의 콘텐츠를 Exclude한다.
- 제거된 Follow Request/Relationship을 원인으로 가진 Notification은 필수 cleanup orchestration에서 함께 제거한다.
  다른 기존 Notification Item은 Block action에서 동기적으로 바꾸지 않지만, 상대 Profile을 조회할 수 없어지면
  Notification 조회에서 없는 것으로 취급하고 후속 비동기 cleanup 전까지 저장 상태가 남을 수 있다.
- Block 해제는 차단 생성 시 제거된 Follow Request·Follow Relationship을 자동으로 복구하지 않는다.

차단 뒤 모든 Notification source에 신규 생성 억제 정책을 연결하는 일은 `PROD-327`의 후속 범위다. 이 객체의 현재
cleanup·조회 계약은 해당 source 연결을 전제로 하지 않는다.

## 확정 용어

- Profile Block: Profile Block
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- 커뮤니티 관리와 신고 처리는 현재 범위에서 제외한다.
- Reaction cleanup은 현재 Profile Block action에 포함하지 않으며, 필요하면 별도 후속 계약에서 정한다.
