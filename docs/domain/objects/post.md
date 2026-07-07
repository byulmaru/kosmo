# Post 객체

## 정의

Post는 Profile이 작성하고 배포하는 짧은 게시 단위다. 게시 본문, Post Form, Post Visibility, 답글/Repost
구조, Content Warning, Sensitive Media, Tombstone, Post Eligibility 정책을 소유한다.

## 상태

### Post State

| 값        | 의미                               |
| --------- | ---------------------------------- |
| 활성      | 조회와 전파 후보가 될 수 있는 상태 |
| Tombstone | 삭제된 Post를 표현하는 상태        |

### Post Form

| 값       | 의미                                                            |
| -------- | --------------------------------------------------------------- |
| Original | 일반 원본 Post                                                  |
| Reply    | 다른 Post에 답하는 Post                                         |
| Repost   | 원본 Post를 Repost 작성자의 Post List 후보로 다시 포함하는 Post |

### Post Visibility

| 값                 | 의미                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| Public             | 모든 viewer가 볼 수 있고 검색/해시태그 목록 후보가 된다                      |
| Quiet Public       | 모든 viewer가 볼 수 있지만 검색/해시태그 목록에는 노출하지 않는다            |
| Followers Only     | 작성자, 작성자를 수락된 상태로 팔로우한 Profile, 멘션된 Profile이 볼 수 있다 |
| Mentioned Profiles | 작성자와 Post에서 멘션한 Profile만 볼 수 있다                                |

## 속성

| 속성            | 타입/nullability      | 검증 정책                                         | 상태별 존재 조건 | 조회 권한      |
| --------------- | --------------------- | ------------------------------------------------- | ---------------- | -------------- |
| 작성자          | Profile 관계, 필수    | 유효한 Profile이어야 한다                         | 항상             | `Post.Visible` |
| 본문            | 문자열, nullable      | 500자 이하, 첨부 Media가 없으면 비어 있을 수 없음 | Original, Reply  | `Post.Visible` |
| Post Visibility | Post Visibility, 필수 | 위 네 값만 허용, 게시 후 변경 불가                | 항상             | `Post.Visible` |
| Content Warning | 문자열, nullable      | 미정                                              | Original, Reply  | `Post.Visible` |
| Sensitive Media | boolean, 필수         | Post 단위로 적용                                  | Original, Reply  | `Post.Visible` |
| 생성 시각       | 시각, 필수            | 미정                                              | 항상             | `Post.Visible` |
| 삭제 시각       | 시각, nullable        | Tombstone 상태와 함께 사용                        | Tombstone        | `Post.Visible` |

## 관계

| 관계              | 대상                      | 조건                                         | 조회 권한        |
| ----------------- | ------------------------- | -------------------------------------------- | ---------------- |
| Author Profile    | [Profile](./profile.md)   | Post 작성자                                  | `Post.Visible`   |
| Reply parent      | [Post](./post.md)         | Post Form이 Reply                            | `Post.Visible`   |
| Repost source     | [Post](./post.md)         | Post Form이 Repost                           | `Post.Visible`   |
| Mentioned Profile | [Profile](./profile.md)   | Original 또는 Reply에서 멘션한 Profile       | `Post.Visible`   |
| Attached Media    | [Media](./media.md)       | Original 또는 Reply에 연결된 Media, 최대 4개 | `Post.Visible`   |
| Reaction          | [Reaction](./reaction.md) | Post에 남겨진 반응                           | `Post.Visible`   |
| Bookmark          | [Bookmark](./bookmark.md) | Profile의 개인 저장                          | `Bookmark.Owner` |

## 행동

| 행동        | 행동 주체 Profile | 대상 객체 | 입력값                                                              | 권한                                | 결과                                             |
| ----------- | ----------------- | --------- | ------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Post 작성   | Profile           | Post      | 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록 | `Profile.ActiveMember`              | Post Form이 Original인 활성 Post가 생성된다      |
| Reply 작성  | Profile           | Post      | 원본 Post, 본문, Media 목록                                         | `Post.Repliable`                    | Post Form이 Reply인 활성 Post가 생성된다         |
| Repost 작성 | Profile           | Post      | 원본 Post                                                           | `Post.RepostSource`                 | Post Form이 Repost인 활성 Post가 생성된다        |
| Repost 취소 | Author Profile    | Post      | 없음                                                                | `Post.Author`                       | Repost Post가 Tombstone으로 바뀐다               |
| Post 삭제   | Author Profile    | Post      | 없음                                                                | `Post.Author`                       | Post가 Tombstone으로 바뀐다                      |
| Media 연결  | Profile           | Post      | Media, 순서                                                         | `Post.Author`, `Media.OwnerProfile` | Original 또는 Reply Post와 Media 관계가 생성된다 |
| Media 해제  | Profile           | Post      | Media                                                               | `Post.Author`                       | Post와 Media 관계가 제거된다                     |

## 권한

| 권한                | 종류      | 성립 조건                                                         | 대표 참조             |
| ------------------- | --------- | ----------------------------------------------------------------- | --------------------- |
| `Post.Visible`      | 객체 종속 | Post Visibility와 Post Eligibility가 viewer에게 노출을 허용한다   | Post 조회, 알림 생성  |
| `Post.Repliable`    | 객체 종속 | viewer Profile이 원본 Post를 볼 수 있고 답글 제한 정책을 통과한다 | Reply 생성            |
| `Post.RepostSource` | 객체 종속 | 대상 Post가 Public 또는 Quiet Public이고 viewer에게 보인다        | Repost 작성           |
| `Post.Author`       | 객체 종속 | 행동 주체 Profile이 Post의 Author Profile이다                     | Post 삭제, Media 해제 |

## 불변 조건

### Post Eligibility 정책

Post Eligibility는 별도 데이터를 가지는 Post 속성이나 값 객체가 아니라 Post가 소유한 후보성 정책이다.

| 조건                               | 후보성 영향                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| Post State가 Tombstone             | 조회와 전파 후보에서 제외한다                                        |
| Author Profile이 정지 또는 삭제됨  | 조회와 전파 후보에서 제외한다                                        |
| 연결 Media 접근 결과가 접근 불가   | 해당 Media가 필요한 목록, 검색, 미디어 표시 후보에서 제외한다        |
| 운영자 action으로 제한 또는 삭제됨 | action 결과에 따라 조회, 검색, 목록 후보에서 제외한다                |
| Domain Block 상태인 Instance       | 전역 제외 정책으로 없는 것처럼 취급한다                              |
| Domain Limit 상태인 Instance       | 전역 제외는 아니며 공개 탐색 성격의 Post List와 Search 후보에서 뺀다 |

- 작성자는 유효한 Profile이어야 한다.
- 빈 게시 판단은 본문과 첨부 Media를 함께 본다.
- 답글의 기본 Post Visibility는 원본 Post의 Post Visibility를 넘지 않아야 한다.
- Repost는 Post Form의 상태 값이며 별도 durable 객체가 아니다.
- Repost Post는 Repost source를 가져야 하고 자체 본문과 Attached Media를 가지지 않는다.
- Repost source는 Public 또는 Quiet Public Post여야 하며, Repost Post Visibility는 source Post Visibility를
  넘지 않아야 한다.
- Repost source가 Tombstone이면 해당 Repost Post는 노출 후보가 아니다.
- 게시 후 Post Visibility는 변경할 수 없다.
- Sensitive Media가 true인 Post의 모든 첨부 Media는 가려져야 한다.
- 삭제된 Post, 정지된 Author Profile의 Post, 차단 관계 때문에 접근할 수 없는 Post에는 답글을 작성할
  수 없다.
- Post Eligibility는 Post Visibility를 넓히거나 우회할 수 없다.
- Post Eligibility는 Author Profile 상태, 연결 Media 접근 결과, 운영자 action, Instance Safety State
  결과를 반영해야 한다.

## 확정 용어

- 게시: Post
- Post Form: Post Form
- 재게시: Repost
- 공개 범위: Post Visibility
- 내용 경고: Content Warning
- 민감한 미디어: Sensitive Media
- Tombstone: Tombstone

## 제외/보류

- 설문, 예약 게시, 임시 저장, 동영상/GIF 첨부, URL 미리보기, Post 수정은 현재 범위에서 제외한다.
- 작성 화면 상태와 업로드 실패 표시 방식은 도메인 명세에서 제외한다.
