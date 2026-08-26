# Post List Policy

## 정의

Post List Policy는 durable 객체가 아니라 Post, Profile 관계, 개인 제어 규칙, Instance 상태를 소비해 목록별
Post 후보와 Control Decision을 계산하는 조회 정책이다.

## Post List Type

| 값      | 의미                                       |
| ------- | ------------------------------------------ |
| Home    | viewer Profile의 기본 Post List            |
| Local   | configured Local Instance의 공개 Post List |
| Profile | Target Profile이 작성한 Post List          |
| Hashtag | Target Hashtag가 포함된 공개 Post List     |

## Control Decision

| 값       | 의미                               |
| -------- | ---------------------------------- |
| Include  | 후보 Post를 목록에 노출한다        |
| Collapse | 후보 Post를 접힌 상태로 노출한다   |
| Exclude  | 후보 Post를 목록에 노출하지 않는다 |

여러 제어가 동시에 적용되면 `Exclude > Collapse > Include` 순서로 가장 제한적인 결정을 사용한다.

## 후보 정책

### Home Post List

- viewer Profile이 작성한 eligible Content Post 중 Reply Parent가 없는 Post를 포함한다.
- viewer Profile이 팔로우한 Active/Normal Profile의 eligible Content Post 중 Reply Parent가 없는 Post를
  포함한다.
- viewer Profile의 Post에 달린 Reply, viewer Profile이 작성한 Reply, viewer Profile이 팔로우한 Profile의
  Post에 viewer Profile이 팔로우한 Profile이 작성한 Reply를 포함한다.
- viewer Profile 또는 viewer Profile이 팔로우한 Active/Normal Profile이 작성한 Repost를 포함한다.
- Author 또는 Mentioned Profile이 아닌 viewer Profile은 Author Profile과 현재 Follow Relationship이 없을 때
  Followee가 작성한 Followers Only Post의 후보가 될 수 없다. 기존 Post Visibility가 Author 또는 Mentioned
  Profile에 부여한 접근은 유지한다.

### Profile Post List

- Target Profile이 작성한 eligible Post 중 Reply Parent가 없는 Content Post와 Repost를 포함한다.
- Reply Parent가 있는 Post는 Quote이기도 하더라도 포함하지 않는다.

### Local Post List

- configured Local Instance에 속한 Active/Normal Local Profile이 작성한 Public Post 중 Content가 있고 Reply
  Parent가 없는 eligible Post를 포함한다.
- Content와 Repost Source를 함께 가진 Quote는 포함한다.
- Reply Parent가 있는 Post와 Content 없는 Repost는 포함하지 않는다.

### Hashtag Post List

- Post Visibility가 Public이고 Content가 있으며 Reply Parent가 없고 Target Hashtag가 포함된 eligible Post만
  포함한다.
- Reply Parent가 있는 Post와 Content 없는 Repost는 포함하지 않는다.

## 제어 정책

| Control              | Home                           | Local                      | Profile                    | Hashtag                    |
| -------------------- | ------------------------------ | -------------------------- | -------------------------- | -------------------------- |
| Profile Block        | Exclude                        | Exclude                    | Exclude                    | Exclude                    |
| Profile Mute         | Exclude                        | Exclude                    | Collapse                   | Exclude                    |
| Word Mute Rule       | Scope와 Mute Decision 적용     | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용 |
| Hashtag Mute Rule    | Scope와 Mute Decision 적용     | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용 |
| Profile Domain Block | Exclude                        | Exclude                    | Exclude                    | Exclude                    |
| Domain Limit         | Include                        | Include                    | Include                    | Exclude                    |
| Sensitive Media      | Collapse                       | Collapse                   | Collapse                   | Collapse                   |
| 조회할 수 없는 Media | Exclude                        | Exclude                    | Exclude                    | Exclude                    |
| Reply Parent 있음    | Home 후보 정책 통과 시 Include | Exclude                    | Exclude                    | Exclude                    |
| Content 없는 Repost  | Home 후보 정책 통과 시 Include | Exclude                    | Target 작성 시 Include     | Exclude                    |

- 모든 후보는 먼저 Post Visibility와 Post Eligibility를 통과해야 한다.
- Followers Only 후보는 Author/Mentioned Profile이 아닌 viewer에게 viewer Profile과 Author Profile 사이의
  현재 established Follow Relationship을 추가로 요구하며, pending·rejected Follow Request 또는 unfollow로
  removed된 관계와 guest에는 접근 범위를 넓히지 않는다.
- Repost에는 Repost Author와 Source Post Author에 대한 Profile Block/Profile Mute를 모두 적용한다.
- Post List 제어는 Post Visibility가 허용하지 않은 viewer에게 접근 범위를 넓히지 않는다.

## 제외/보류

- Cursor는 조회 입력 값이며 durable 객체 속성이 아니다.
- viewer별 읽기 위치는 독립 생명주기와 제품 요구가 확정될 때 별도 durable 객체로 추가한다.
- Custom, Federated, List 기반, 키워드 수집형 Post List는 현재 범위에서 제외한다.
