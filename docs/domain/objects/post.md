# Post 객체

## 정의

Post는 Profile이 작성하고 배포하는 짧은 게시 단위다. 게시 본문, Post Form, Post Visibility, 답글/Repost/Quote
구조, Content Warning, Sensitive Media, Tombstone, Post Eligibility 정책을 소유한다.

## 상태

### Post Lifecycle State

| 값        | 의미                                 |
| --------- | ------------------------------------ |
| Active    | 조회와 전파 후보가 될 수 있는 상태   |
| Tombstone | 삭제된 Post를 나타내는 terminal 상태 |

### Post Form

| 값       | 의미                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Original | 일반 원본 Post                                                          |
| Reply    | 다른 Post에 답하는 Post                                                 |
| Repost   | 다른 Post를 자체 본문 없이 작성자의 Post List 후보로 다시 포함하는 Post |
| Quote    | 다른 Post를 인용하면서 자체 본문 또는 Media를 가지는 Post               |

### Post Visibility

| 값                 | 의미                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| Public             | 모든 viewer가 볼 수 있고 검색/Hashtag Post List 후보가 된다          |
| Unlisted           | 모든 viewer가 볼 수 있지만 검색/Hashtag Post List 후보가 되지 않는다 |
| Followers Only     | 작성자, 작성자를 팔로우한 Profile, 멘션된 Profile이 볼 수 있다       |
| Mentioned Profiles | 작성자와 Post에서 멘션한 Profile만 볼 수 있다                        |

## 속성

| 속성            | 타입/nullability | 검증 정책                                       | 존재 조건                         | 조회 조건           | 조회 권한 |
| --------------- | ---------------- | ----------------------------------------------- | --------------------------------- | ------------------- | --------- |
| 본문            | 문자열, nullable | 500자 이하이며 Media가 없으면 비어 있을 수 없다 | Form이 Original, Reply 또는 Quote | Post 조회 정책 통과 | 없음      |
| Content Warning | 문자열, nullable | 존재할 때 빈 문자열이 아니다                    | Form이 Original, Reply 또는 Quote | Post 조회 정책 통과 | 없음      |
| Sensitive Media | boolean, 필수    | Post에 연결된 모든 Media 표시에 함께 적용한다   | Form이 Original, Reply 또는 Quote | Post 조회 정책 통과 | 없음      |
| 생성 시각       | 시각, 필수       | 생성 결과로 기록하며 변경 불가                  | 항상                              | Post 조회 정책 통과 | 없음      |
| 삭제 시각       | 시각, nullable   | Tombstone 전이 결과로 기록하며 변경 불가        | Lifecycle이 Tombstone             | Tombstone 조회 정책 | 없음      |

## 관계

| 관계              | 대상                      | 방향             | cardinality | 존재 조건                         | 조회 조건                   | 조회 권한        |
| ----------------- | ------------------------- | ---------------- | ----------- | --------------------------------- | --------------------------- | ---------------- |
| Author Profile    | [Profile](./profile.md)   | Post -> Profile  | 1 -> 1      | 항상                              | Post 조회 정책 통과         | 없음             |
| Reply Parent      | [Post](./post.md)         | Post -> Post     | 1 -> 1      | Form이 Reply                      | 두 Post 조회 정책 통과      | 없음             |
| Repost Source     | [Post](./post.md)         | Post -> Post     | 1 -> 1      | Form이 Repost                     | 두 Post 조회 정책 통과      | 없음             |
| Quote Source      | [Post](./post.md)         | Post -> Post     | 1 -> 1      | Form이 Quote                      | 두 Post 조회 정책 통과      | 없음             |
| Mentioned Profile | [Profile](./profile.md)   | Post -> Profile  | 1 -> 0..N   | Form이 Original, Reply 또는 Quote | Post 조회 정책 통과         | 없음             |
| Attached Media    | [Media](./media.md)       | Post -> Media    | 1 -> 0..4   | Form이 Original, Reply 또는 Quote | Post와 Media 조회 정책 통과 | 없음             |
| Hashtag           | [Hashtag](./hashtag.md)   | Post -> Hashtag  | 1 -> 0..N   | 본문에 Hashtag가 있을 때          | Post 조회 정책 통과         | 없음             |
| Reaction          | [Reaction](./reaction.md) | Post <- Reaction | 1 -> 0..N   | Reaction이 존재할 때              | Post 조회 정책 통과         | 없음             |
| Bookmark          | [Bookmark](./bookmark.md) | Post <- Bookmark | 1 -> 0..N   | Bookmark가 존재할 때              | 저장한 Profile의 개인 조회  | `Bookmark.Owner` |

## 행동

| 행동        | 행동 주체 Profile | 대상 객체 | 입력값                                                                           | 권한                               | 조건                                                                                                                                                                                                                                                                                                                                              | 결과                                                                                                                                                                         |
| ----------- | ----------------- | --------- | -------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post 작성   | Profile           | Post      | 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록              | `Account.Active`, `Profile.Member` | 행동 주체는 Active/Normal Local Profile이다. 본문과 Media가 모두 비어 있지 않으며 Media는 최대 4개다                                                                                                                                                                                                                                              | Form=Original, Lifecycle=Active인 Post와 Author/Media/Hashtag 관계가 원자적으로 생성된다                                                                                     |
| Reply 작성  | Profile           | Post      | Parent Post, 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록 | `Account.Active`, `Profile.Member` | 행동 주체는 Active/Normal Local Profile이고 Parent를 볼 수 있다. Post Visibility는 Parent와 독립적으로 행동 주체가 선택하며 본문/Media 조건은 Post 작성과 같다                                                                                                                                                                                    | Form=Reply, Lifecycle=Active인 Post와 Parent/Author/Media/Hashtag 관계가 원자적으로 생성된다                                                                                 |
| Quote 작성  | Profile           | Post      | Source Post, 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록 | `Account.Active`, `Profile.Member` | 행동 주체는 Active/Normal Local Profile이고 Source를 볼 수 있다. Source Form과 관계없이 입력한 Source 자체를 인용하며 Post Visibility는 Source와 독립적으로 선택한다. 본문/Media 조건은 Post 작성과 같다                                                                                                                                          | Form=Quote, Lifecycle=Active인 Post와 Quote Source/Author/Media/Hashtag 관계가 원자적으로 생성된다                                                                           |
| Repost 작성 | Profile           | Post      | Source Post                                                                      | `Account.Active`, `Profile.Member` | 행동 주체는 Active/Normal Local Profile이고 입력 Source를 볼 수 있다. 입력 Source의 Form이 Repost면 유효 Source는 입력 Source의 Repost Source이고, 아니면 입력 Source 자체다. 유효 Source Form은 Original, Reply 또는 Quote이며 Visibility는 Public, Unlisted, Followers Only 중 하나다. Followers Only Source는 Source Author만 Repost할 수 있다 | Form=Repost, Lifecycle=Active인 Post와 유효 Source/Author 관계가 생성된다. Visibility는 Public/Unlisted Source이면 Unlisted, Followers Only Source이면 Followers Only가 된다 |
| Post 삭제   | Author Profile    | Post      | 없음                                                                             | `Account.Active`, `Post.Author`    | Lifecycle State가 Active다                                                                                                                                                                                                                                                                                                                        | Lifecycle State가 Tombstone이 되고 삭제 시각이 기록된다                                                                                                                      |

Original/Reply/Quote에서 다른 Profile의 Media를 연결할 수 있는지는 후속 결정 대상으로 둔다. Tombstone Post에는
다른 상태 전이를 적용하지 않는다.

## 권한

| 권한                    | 종류      | 성립 조건                                               |
| ----------------------- | --------- | ------------------------------------------------------- |
| `Post.Author`           | 객체 종속 | 행동 주체 Profile이 Post의 Author Profile이다           |
| `Post.MentionedProfile` | 객체 종속 | 요청 Profile이 Post의 Mentioned Profile 관계에 포함된다 |

## 조회 정책

### Post Visibility

| Visibility         | viewer 조건                                                |
| ------------------ | ---------------------------------------------------------- |
| Public             | 추가 관계 조건 없음                                        |
| Unlisted           | 추가 관계 조건 없음                                        |
| Followers Only     | Author, Mentioned Profile 또는 Author를 팔로우하는 Profile |
| Mentioned Profiles | Author 또는 Mentioned Profile                              |

### Post Eligibility

- Lifecycle State가 Active여야 한다.
- Author Profile의 Lifecycle State가 Active이고 Suspension State가 Normal이어야 한다.
- 필요한 Attached Media가 Media 조회 정책을 통과해야 한다.
- viewer가 Author Profile을 차단했거나 Author Profile의 Instance를 Profile Domain Block한 경우 없는 것처럼
  취급한다.
- Author Profile의 Instance Safety State가 Domain Block이면 없는 것처럼 취급한다.
- Repost Source가 Tombstone이거나 조회 정책을 통과하지 못하면 Repost도 후보가 아니다.
- Quote Source가 Tombstone이거나 조회 정책을 통과하지 못하면 Quote도 후보가 아니다.
- Post Eligibility는 Post Visibility가 허용하지 않은 viewer에게 접근 범위를 넓히지 않는다.

### 검색

- 검색 후보는 Post Visibility가 Public이고 Post Eligibility를 통과한 Post다.
- Unlisted, Followers Only, Mentioned Profiles Post는 검색 후보가 아니다.
- Domain Limit Instance의 Post는 공개 검색 후보에서 제외한다.
- Word Mute Rule과 Hashtag Mute Rule은 Search Scope를 포함한 경우에만 viewer별 결과에 적용한다.

## 확정 용어

- 게시: Post
- Post Lifecycle State: Post Lifecycle State
- Post Form: Post Form
- 재게시: Repost
- 인용 게시: Quote
- 재게시 원본: Repost Source
- 인용 원본: Quote Source
- 비목록 공개: Unlisted
- 공개 범위: Post Visibility
- 내용 경고: Content Warning
- 민감한 미디어: Sensitive Media
- Tombstone: Tombstone

## 제외/보류

- Repost 취소는 별도 행동이 아니라 Repost Form Post에 대한 Post 삭제다.
- Mentioned Profiles Post는 Repost할 수 없다.
- 게시 후 Media 연결/해제와 Post Visibility 변경은 지원하지 않는다.
- 설문, 예약 게시, 임시 저장, 동영상/GIF 첨부, URL 미리보기, Post 수정은 현재 범위에서 제외한다.
