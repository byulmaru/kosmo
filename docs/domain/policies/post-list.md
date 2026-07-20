# Post List Policy

## 정의

Post List Policy는 durable 객체가 아니라 Post, Profile 관계, 개인 제어 규칙, Instance 상태를 소비해 목록별
Post 후보와 Control Decision을 계산하는 조회 정책이다.

## Post List Type

| 값      | 의미                                   |
| ------- | -------------------------------------- |
| Home    | viewer Profile의 기본 Post List        |
| Profile | Target Profile이 작성한 Post List      |
| Hashtag | Target Hashtag가 포함된 공개 Post List |

## Control Decision

| 값       | 의미                               |
| -------- | ---------------------------------- |
| Include  | 후보 Post를 목록에 노출한다        |
| Collapse | 후보 Post를 접힌 상태로 노출한다   |
| Exclude  | 후보 Post를 목록에 노출하지 않는다 |

여러 제어가 동시에 적용되면 `Exclude > Collapse > Include` 순서로 가장 제한적인 결정을 사용한다.

## 후보 정책

### Home Post List

- viewer Profile이 작성한 eligible Original/Quote Post를 포함한다.
- viewer Profile이 팔로우한 Active/Normal Profile의 eligible Original/Quote Post를 포함한다.
- viewer Profile의 Post에 달린 Reply, viewer Profile이 작성한 Reply, viewer Profile이 팔로우한 Profile의
  Post에 viewer Profile이 팔로우한 Profile이 작성한 Reply를 포함한다.
- viewer Profile 또는 viewer Profile이 팔로우한 Active/Normal Profile이 작성한 Repost를 포함한다.

### Profile Post List

- Target Profile이 작성한 eligible Original/Quote Post와 Repost를 포함한다.
- Reply는 포함하지 않는다.

### Hashtag Post List

- Post Visibility가 Public이고 Kind가 Original 또는 Quote이며 Target Hashtag가 포함된 eligible Post만 포함한다.
- Reply와 Repost는 포함하지 않는다.

## 제어 정책

| Control              | Home                           | Profile                    | Hashtag                           |
| -------------------- | ------------------------------ | -------------------------- | --------------------------------- |
| Profile Block        | Exclude                        | Exclude                    | Exclude                           |
| Profile Mute         | Exclude                        | Collapse                   | Exclude                           |
| Word Mute Rule       | Scope와 Mute Decision 적용     | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용        |
| Hashtag Mute Rule    | Scope와 Mute Decision 적용     | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용        |
| Profile Domain Block | Exclude                        | Exclude                    | Exclude                           |
| Domain Limit         | Include                        | Include                    | Exclude                           |
| Sensitive Media      | Collapse                       | Collapse                   | Collapse                          |
| 조회할 수 없는 Media | Exclude                        | Exclude                    | Exclude                           |
| Reply                | Home 후보 정책 통과 시 Include | Exclude                    | Exclude                           |
| Post Kind = Repost   | Home 후보 정책 통과 시 Include | Target 작성 시 Include     | Exclude                           |
| Post Kind = Quote    | Home 후보 정책 통과 시 Include | Target 작성 시 Include     | Hashtag 후보 정책 통과 시 Include |

- 모든 후보는 먼저 Post Visibility와 Post Eligibility를 통과해야 한다.
- Repost에는 Repost Author와 Source Post Author에 대한 Profile Block/Profile Mute를 모두 적용한다.
- Post List 제어는 Post Visibility가 허용하지 않은 viewer에게 접근 범위를 넓히지 않는다.

## 제외/보류

- Cursor는 조회 입력 값이며 durable 객체 속성이 아니다.
- viewer별 읽기 위치는 독립 생명주기와 제품 요구가 확정될 때 별도 durable 객체로 추가한다.
- Custom, Local, Federated, List 기반, 키워드 수집형 Post List는 현재 범위에서 제외한다.
