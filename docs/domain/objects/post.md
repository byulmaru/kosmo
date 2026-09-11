# Post 객체

## 정의

Post는 Profile이 작성하고 배포하는 짧은 게시 단위다. 현재 Post Content, Post Visibility, Reply Parent와
Repost Source 관계, Tombstone, Post Eligibility 정책을 소유한다. 작성 내용의 revision과 그 안의 Content
Warning, Sensitive Media, Media 구성은 [Post Content](./post-content.md)가 소유한다.

## 상태

### Post Lifecycle State

| 값        | 의미                                 |
| --------- | ------------------------------------ |
| Active    | 조회와 전파 후보가 될 수 있는 상태   |
| Tombstone | 삭제된 Post를 나타내는 terminal 상태 |

### Post Visibility

| 값                 | 의미                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| Public             | 모든 viewer가 볼 수 있고 검색/Hashtag Post List 후보가 된다          |
| Unlisted           | 모든 viewer가 볼 수 있지만 검색/Hashtag Post List 후보가 되지 않는다 |
| Followers Only     | 작성자, 작성자를 팔로우한 Profile, 멘션된 Profile이 볼 수 있다       |
| Mentioned Profiles | 작성자와 Post에서 멘션한 Profile만 볼 수 있다                        |

## 속성

| 속성           | 타입/nullability            | 검증 정책                                | 존재 조건                 | 조회 조건           | 조회 권한 |
| -------------- | --------------------------- | ---------------------------------------- | ------------------------- | ------------------- | --------- |
| 생성 시각      | 시각, 필수                  | 생성 결과로 기록하며 변경 불가           | 항상                      | Post 조회 정책 통과 | 없음      |
| 삭제 시각      | 시각, nullable              | Tombstone 전이 결과로 기록하며 변경 불가 | Lifecycle이 Tombstone     | Tombstone 조회 정책 | 없음      |
| 인용 허용 정책 | Quote Approval Policy, 필수 | 모두, 팔로워, 본인만 중 하나             | Content가 있는 Local Post | Post 조회 정책 통과 | 없음      |

인용 허용 정책은 Content가 있는 Local Post에 적용하며, `모두`, `팔로워`, `본인만` 중 하나다.
새 Post와 정책 도입 전 작성한 Local Post의 초기값은 `모두`다. 이 값은 이후 인용 요청을 판단하는 기준이며
이미 발급한 인용 승인을 변경하지 않는다.

Local Post의 ActivityPub Note는 이 정책을 `interactionPolicy.canQuote`에 광고한다. `모두`는
`automaticApproval`에 ActivityStreams Public collection을, `팔로워`는 Author의 followers collection과
Author Actor를, `본인만`은 Author Actor만 제공한다. Kosmo는 건별 수동 승인 기능을 제공하지 않으므로 세
정책 모두 `manualApproval`을 제공하지 않는다. 이 광고는 원격 서버의 예상 eligibility를 위한 힌트이며 개별
QuoteAuthorization을 대신하지 않는다. 정책 변경 뒤에는 같은 Note identity의 갱신된 표현을 전달한다.

## 관계

| 관계              | 대상                              | 방향                 | cardinality | 존재 조건                                             | 조회 조건                                             | 조회 권한        |
| ----------------- | --------------------------------- | -------------------- | ----------- | ----------------------------------------------------- | ----------------------------------------------------- | ---------------- |
| Author Profile    | [Profile](./profile.md)           | Post -> Profile      | 1 -> 1      | 항상                                                  | Post 조회 정책 통과                                   | 없음             |
| Current Content   | [Post Content](./post-content.md) | Post -> Post Content | 1 -> 0..1   | Repost가 아닐 때                                      | Post 조회 정책 통과                                   | 없음             |
| Reply Parent      | [Post](./post.md)                 | Post -> Post         | 1 -> 0..1   | Post와 Parent에 Content가 있을 때                     | Post와 Parent가 각각 조회 정책을 통과할 때 표시       | 없음             |
| Repost Source     | [Post](./post.md)                 | Post -> Post         | 1 -> 0..1   | Source에 Content가 있고 Post가 Repost 또는 Quote일 때 | Post와 Source를 독립 판정해 조회 가능한 Source만 표시 | 없음             |
| Mentioned Profile | [Profile](./profile.md)           | Post -> Profile      | 1 -> 0..N   | Post에 Content가 있을 때                              | Post 조회 정책 통과                                   | 없음             |
| Hashtag           | [Hashtag](./hashtag.md)           | Post -> Hashtag      | 1 -> 0..N   | 본문에 Hashtag가 있을 때                              | Post 조회 정책 통과                                   | 없음             |
| Reaction          | [Reaction](./reaction.md)         | Post <- Reaction     | 1 -> 0..N   | Reaction이 존재할 때                                  | Post 조회 정책 통과                                   | 없음             |
| Bookmark          | [Bookmark](./bookmark.md)         | Post <- Bookmark     | 1 -> 0..N   | Bookmark가 존재할 때                                  | 저장한 Profile의 개인 조회                            | `Bookmark.Owner` |

Reply Parent가 Tombstone으로 전이되어도 저장된 직접 관계를 유지한다. 현재 Parent Post row를 물리적으로
제거하는 행동은 제공하지 않지만, Reply Parent FK는 향후 실제 row 제거 시 Reply Post를 cascade 삭제하지 않고
관계만 `null`로 만드는 참조 동작을 가진다.

Post의 게시 구조는 다음 관계 조합으로 정의한다.

| Content | Reply Parent | Repost Source | 구조              |
| ------- | ------------ | ------------- | ----------------- |
| 있음    | 없음         | 없음          | 일반 Post         |
| 있음    | 있음         | 없음          | Reply             |
| 있음    | 없음         | 있음          | Quote             |
| 있음    | 있음         | 있음          | Reply이면서 Quote |
| 없음    | 없음         | 있음          | Repost            |

Content와 Repost Source가 모두 없는 Post, 또는 Content 없이 Reply Parent가 있는 Post는 생성할 수 없다. 같은
Author Profile/Repost Source 조합에는 Lifecycle State가 Active이고 Content와 Reply Parent가 없는 Repost가
하나만 존재한다.

## 행동

| 행동                                | 행동 주체 Profile     | 대상 객체   | 입력값                                                                           | 권한                               | 조건                                                                                                                                                                                                                                                                                                                                           | 결과                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------- | ----------- | -------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post 작성                           | Profile               | Post        | 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록              | `Account.Active`, `Profile.Member` | 행동 주체는 선택된 Active/Normal Profile이다. 본문과 Media가 모두 비어 있을 수 없으며 Media는 최대 4개다                                                                                                                                                                                                                                       | Lifecycle=Active이고 Current Content가 있으며 Reply Parent와 Repost Source가 없는 Post, 첫 Post Content, Author/Hashtag 관계가 원자적으로 생성된다                                                                      |
| Reply 작성                          | Profile               | Post        | Parent Post, 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록 | `Account.Active`, `Profile.Member` | 행동 주체는 선택된 Active/Normal Profile이고 Content가 있는 Parent를 볼 수 있다. Post Visibility는 Parent와 독립적으로 행동 주체가 선택하며 본문/Media 조건은 Post 작성과 같다                                                                                                                                                                 | Lifecycle=Active이고 Current Content와 입력 Reply Parent가 있으며 Repost Source가 없는 Post, 첫 Post Content, Author/Hashtag 관계가 원자적으로 생성된다                                                                 |
| Quote 작성                          | Profile               | Post        | Source Post, 본문, Post Visibility, Content Warning, Sensitive Media, Media 목록 | `Account.Active`, `Profile.Member` | 행동 주체는 선택된 Active/Normal Profile이고 Content가 있는 Source를 볼 수 있다. Source는 아래 Quote Source 조건을 통과하며, 인용 정책이 자동 승인하거나 원격 승인 요청을 허용한다. 원격 승인 대기는 작성 거부 조건이 아니다. Post Visibility는 Source와 독립적으로 선택하되 원문 접근 범위를 넓히지 않으며 본문/Media 조건은 Post 작성과 같다 | Lifecycle=Active이고 Current Content와 입력 Source의 인용 정보를 기록하며 Reply Parent가 없는 Post, 첫 Post Content, Author/Hashtag 관계가 원자적으로 생성된다. 승인이 필요한 Source 관계는 승인 전까지 표시하지 않는다 |
| 인용 허용 정책 변경                 | Author Profile        | Post        | 모두, 팔로워 또는 본인만                                                         | `Account.Active`, `Post.Author`    | Content가 있는 Active Local Post다                                                                                                                                                                                                                                                                                                             | 이후 요청에 적용할 정책이 변경된다. 기존 QuoteAuthorization은 유지한다                                                                                                                                                  |
| 인용 승인 철회                      | Source Author Profile | Source Post | 승인을 철회할 Quote                                                              | `Account.Active`, `Post.Author`    | 해당 Source를 대상으로 발급한 인용 승인이 존재한다                                                                                                                                                                                                                                                                                             | 해당 승인을 무효로 만들고 Quote 자체 Content를 유지한 채 Source를 비노출한다. 원격에는 승인 철회를 전달한다                                                                                                             |
| Post Content 수정                   | Author Profile        | Post        | 본문, Content Warning, Sensitive Media, Media 목록                               | `Account.Active`, `Post.Author`    | Lifecycle State가 Active이고 Content가 있다. 새 document와 참조 Media가 [Post Content](./post-content.md)의 검증을 통과한다                                                                                                                                                                                                                    | 새 immutable Post Content revision이 생성되고 Current Content가 같은 transaction에서 새 revision을 가리킨다. Post Visibility와 구조 관계는 바뀌지 않는다                                                                |
| Repost 작성                         | Profile               | Post        | Source Post                                                                      | `Account.Active`, `Profile.Member` | 행동 주체는 선택된 Active/Normal Profile이고 Content가 있는 입력 Source를 볼 수 있다. Source Visibility는 Public, Unlisted, Followers Only 중 하나이며 같은 Author Profile/Source 조합의 Active Repost가 없다. Followers Only Source는 Source Author만 Repost할 수 있다                                                                        | Lifecycle=Active이고 Content와 Reply Parent 없이 입력 Repost Source를 직접 참조하는 Post와 Author 관계가 생성된다. Visibility는 Public/Unlisted Source이면 Unlisted, Followers Only Source이면 Followers Only가 된다    |
| Post 삭제 (Account 요청)            | Author Profile        | Post        | 없음                                                                             | `Account.Active`, `Post.Author`    | Lifecycle State가 Active다                                                                                                                                                                                                                                                                                                                     | Lifecycle State가 Tombstone이 되고 삭제 시각이 기록된다                                                                                                                                                                 |
| Post 삭제 (검증된 ActivityPub 요청) | Author Profile        | Post        | 없음                                                                             | `Post.Author`                      | Lifecycle State가 Active이고 Author Profile Origin이 Remote다. 서명 검증된 요청 Actor가 Author Profile에 연결된 저장 Actor와 같고, 요청 object가 Current Content를 가진 Post의 저장된 ActivityPub identity와 정확히 일치한다                                                                                                                   | Lifecycle State가 Tombstone이 되고 삭제 시각이 기록된다                                                                                                                                                                 |

Post/Reply/Quote 작성과 Post Content 수정에서 Media node는 입력 순서를 유지한다. 모든 참조 Media는
Source=Local, State=Ready이고 Media의 Upload Account가 행동을 요청한 Account와 같아야 한다. Media의
Profile은 Author Profile과 달라도 같은 Upload Account를 가지면 참조할 수 있다. State=Uploading인 Media는
사용할 수 없다. Tombstone Post에는 다른 상태 전이를 적용하지 않는다.

Reply·Quote·Repost 작성은 각 입력 Parent·Source Post의 Author Profile과 행동 주체 Profile 사이에 Profile Block이
없어야 한다. 이 상호작용 조건은 Post Visibility·Post Eligibility와 별도로 양방향 적용한다.

Local 작성과 Remote 수신의 Quote는 direct Repost Source Author를 수신자로 하는
[Quote Notification](./notification.md#quote-notification)의 원인이다. 알림의 생성 조건과 중복 처리는
Notification이 소유하며, Quote·Reply Parent·Repost Source의 구조와 독립적인 조회 정책은 바뀌지 않는다.

### Quote Source 조건과 승인

- 타인의 Source는 Public 또는 Unlisted이고 Content와 조회 권한이 있어야 한다. 타인의 Followers Only
  Source는 established Follower라도 Quote 대상으로 선택할 수 없다. 이 조건은 Local·Remote Source에
  모두 적용한다.
- Source Author와 Quote Author가 같으면 자기 인용이다. 자신의 Followers Only Source는 인용할 수 있지만
  Source의 기존 접근 범위를 넓히지 않는다. Direct에 해당하는 Mentioned Profiles Source와 조회 불가
  Source는 인용할 수 없다.
- 로컬 Quote 작성은 Reply Parent 없이 Source를 선택한다. Reply+Quote 동시 작성 UI·API와 본문 링크의
  인용 카드 전환은 제공하지 않는다. 기존 저장 데이터와 원격 수신에서의 독립 관계 조합·조회·표시는 유지한다.
- `모두`는 위 조건을 통과한 Profile의 요청을 자동 승인하고, `팔로워`는 established Follower와 Source
  Author의 요청을 자동 승인하며, `본인만`은 Source Author만 허용한다. 차단과 Source 조회 제한이 모든
  허용 선택지에 우선한다.
- Kosmo 원문의 건별 수동 승인 설정·승인 UI는 제공하지 않는다.
- 자기 인용은 QuoteRequest 없이 허용한다. 타인의 원격 Source는 `interactionPolicy`가 automatic 또는
  manual approval을 광고하거나, 정책이 없거나 유효하게 해석되지 않는 경우에도 QuoteRequest를 보낸다.
  `interactionPolicy`는 작성 전 UI·정책 힌트로만 사용하고 승인 근거로 사용하지 않는다.
- 타인의 원격 Quote는 자체 Content를 먼저 로컬에 게시하고 기존 Visibility에 따른 일반 전달도 수행한다.
  승인 전에는 Source를 정상 인용으로 노출하지 않고 원문 서버에 QuoteRequest를 별도로 전달한다.
- 검증된 승인을 받으면 승인과 Source 관계를 연결하고 이미 전달한 Quote를 갱신한다. 거절·승인 철회 또는
  Source 삭제 시에는 Quote 자체 Content를 유지하고 Source 카드·관계는 비노출한다. 비노출을 위해 저장
  관계를 물리적으로 제거해야 하는지는 도메인 계약으로 고정하지 않는다.
- Local Source가 삭제되면 그 Source에 발급된 각 유효한 QuoteAuthorization을 철회하고, 승인에 결속된
  Quote Author의 inbox 또는 Quote 소유 서버가 수신하는 inbox로 `Delete(QuoteAuthorization)`을 전달한다.
  Quote 소유 서버는 이를 기존 Quote audience에 전달해 원문 작성자를 팔로우하지 않는 수신자도 Source
  비노출로 수렴시킨다. 일반 Source Post audience에만 보내는 `Delete(Note)`로 이 경로를 대신하지 않는다.
- 전송 실패나 응답 부재를 승인으로 간주하지 않는다. 늦게 도착한 응답이나 중복 전달이 더 최신의 거절·철회를
  무효화하지 않도록 한다. 세부 재시도와 전달 순서는 해당 lifecycle의 구현 계약에서 정한다.
- 게시글별 인용 허용 설정의 변경은 이후 요청에만 적용한다. 기존 승인을 없애려면 별도 인용 승인 철회를
  사용하며, 설정 변경 자체로 기존 Quote의 Source를 일괄 숨기지 않는다.
- 차단은 새 인용 요청·승인을 양방향으로 막지만 기존 승인을 자동 철회하지 않는다. 기존 승인 Source 표시는
  Viewer별 방향별 Post 조회 정책을 적용하며, 제3자에게도 Source를 숨기려면 원문 작성자가 별도 승인 철회를
  사용한다.

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
- 현재 Post Content가 참조하는 Media가 Media 조회 정책을 통과해야 한다.
- viewer Profile과 Author Profile 사이의 Profile Block은 조회 방향에 따라 적용한다. viewer가 Profile Block의
  Owner이고 역방향 Block이 없으면 기존 Post Visibility·Post Eligibility에 따라 Post를 조회할 수 있다. viewer가
  Profile Block의 Target이면 Post를 조회할 수 없으며, 양방향 Block이면 이 제한을 양쪽 viewer에 적용한다.
- viewer가 Author Profile의 Instance를 Profile Domain Block한 경우 없는 것처럼 취급한다.
- Author Profile의 Instance Safety State가 Domain Block이면 없는 것처럼 취급한다.
- Content 없는 Repost는 Repost Source가 Tombstone이거나 조회 정책을 통과하지 못하면 후보가 아니다.
- Quote와 Reply이면서 Quote인 Post는 Repost Source가 Tombstone이거나 조회 정책을 통과하지 못해도 자체
  Content, Visibility와 Eligibility를 기준으로 후보를 유지하며 `Repost Source` 관계만 표시하지 않는다.
- 승인 대기·거절·철회된 Source도 같은 비노출 원칙을 적용한다. 유효한 인용 승인이나 자기 인용이라는 사실은
  viewer별 Source Visibility·Eligibility·Profile Block 검사를 대신하지 않는다.
- Reply Parent가 Tombstone이거나 조회 정책을 통과하지 못해도 Reply 자체의 Post Eligibility는 바뀌지 않는다.
- Post Eligibility는 Post Visibility가 허용하지 않은 viewer에게 접근 범위를 넓히지 않는다.

### Post 상세

- 모든 Post 상세는 조회할 수 있는 모든 하위 Reply를 제공한다.
- Reply 상세는 조회할 수 있는 Reply Parent의 조상 경로를 함께 제공한다.
- 조상 경로는 조회할 수 없는 Parent에서 중단하고, 하위 Reply는 각 Reply의 Post Visibility와 Post
  Eligibility를 독립적으로 적용한다.
- Reply는 입력 Parent를, Repost와 Quote는 입력 Repost Source를 직접 참조하며 다른 Post로 평탄화하지 않는다.
- Content와 Reply Parent가 없고 Repost Source가 있는 순수 Repost의 상세 affordance와 순수 Repost ID의 직접
  상세 URL은 Repost Source Author의 `relativeHandle`과 Source Post ID를 사용하는 canonical Post route로
  이동하거나 replace redirect한다. Repost 자체의 별도 상세 화면은 표시하지 않는다.
- Content와 Repost Source가 있는 Quote는 Quote 자체의 canonical Post 상세를 유지하고, Quote 안의 Source
  preview를 활성화했을 때만 Source의 canonical Post route로 이동한다.
- 순수 Repost의 직접 Repost Source가 Quote이면 재게시한 Quote의 Author와 Content를 주된 표시 대상으로
  유지하고, 그 Quote가 직접 참조한 조회 가능한 Source를 preview로 함께 표시한다. Content 없는 Repost를
  거치는 것만으로 Quote의 Source preview를 생략하지 않는다.
- Quote의 Source preview는 표시 중인 Content Post를 기준으로 한 단계까지만 제공한다. preview 대상이
  Quote여도 그 대상의 Author와 Content까지만 표시하고, 그 아래 Source나 이를 대신하는 placeholder·별도
  진입 안내를 추가하지 않는다. 각 Source의 조회 정책은 독립적으로 적용한다.
- 이 표시 깊이와 이동 대상의 구분은 [ADR 0027](../decisions/0027-repost-of-quote-source-presentation.md)과
  [Post Action Bar의 Source가 Quote인 순수 Repost](../../design/post-action-bar.md#source가-quote인-순수-repost)를
  따른다. PROD-828의 Domain Gate 전환 승인은 해당 ADR에서 별도로 추적한다.
- Post의 Repost 수는 해당 Post를 Repost Source로 직접 참조하면서 Content와 Reply Parent가 없는 eligible
  Active Repost만 포함하고 Quote는 포함하지 않는다.

### Post 공유 참조

- Content가 있는 Post의 공유 참조는 Web에서 현재 browser origin, Android와 iOS에서 configured Local
  Instance의 canonical origin과 `/{relativeHandle}/{postId}` 경로를 결합한 절대 URL이다.
- Content 없는 Repost의 공유 참조는 Repost 자신의 식별자가 아니라 조회 가능한 직접 Repost Source의 공유
  참조다. 클라이언트는 Repost 자신의 상세 참조를 노출하지 않고, 그 식별자로 직접 진입해도 Source 공유
  참조로 canonicalize한다.
- Repost Source가 조회 정책을 통과하지 못하면 Content 없는 Repost 자체도 후보가 아니므로 공유 참조를
  제공하지 않는다.
- 공유 참조에는 현재 화면의 query와 hash를 포함하지 않고 API origin이나 플랫폼 전용 native deep link를
  사용하지 않는다.
- Web은 현재 접속한 deployment의 origin을 유지하고 Android와 iOS는 configured Web origin을 사용하되, 같은
  Post 공유 경로 선택 규칙을 적용한다.
- 인증하지 않은 guest도 조회할 수 있는 Post의 공유 참조를 복사할 수 있다.
- 공유 참조는 Post Visibility와 Post Eligibility가 허용하지 않은 viewer에게 조회 범위를 넓히지 않는다.

### 원격 Note의 최초 materialization과 Reply Parent

- 검증된 Public/Unlisted 원격 Note는 `inReplyTo` 유무와 관계없이 최초 저장한다. 요청 URI와 Note
  identity, 단일 attribution과 작성자 검증, 지원되는 Content 및 수신 한계를 통과해야 한다. PUBLIC/UNLISTED 신규 원문 조회 경로는
  Followers Only/DIRECT Note를 허용하지 않으며, 기존 Create의 Followers Only 수신 계약은 유지한다.
- Reply Parent는 기존 DB의 Local canonical identity 또는 Remote exact URI mapping으로만 조회한다.
  Parent identity가 모호하거나 지원되지 않거나, Parent가 없거나 기존 Post 생성 계약상 부적합하면
  `replyParentId = null`로 Note 자체를 저장한다. DB 장애와 예상하지 못한 오류는 fallback 조건이 아니다.
- 최초 수신·materialization은 Parent를 원격 fetch하거나 재귀 materialize하지 않는다. 중복 입력은 기존
  `replyParentId`를 변경하지 않으며, fallback Post의 후속 Parent 연결·update/backfill은 별도 lifecycle이다.
- Quote Source가 Reply이면 Source Note 자체의 identity·author·audience를 기준으로 처리한다. Parent나 Parent
  작성자로 대체하지 않는다. Source 저장은 Quote 승인이나 viewer의 Source 조회 권한을 부여하지 않는다.
- 현재 raw `inReplyTo`를 별도로 보존하지 않으므로 null Parent로 저장된 Reply의 자동 관계 복구를 보장할 수
  없다. 후속 복구는 대상 식별·검증 근거·재조회 가능성 및 historical backfill 한계를 먼저 확정해야 한다.
  이 후속 과제는 현재 최초 materialization의 완료 조건이 아니다.

### 원격 원문의 Media와 작성자 저장 경계

- Public/Unlisted 신규 원문 조회는 기존 [원격 Media 계약](./media.md)을 그대로 적용한다. embedded Image와
  지원되는 image Document 중 원래 순서의 앞 4개 후보만 선택한다. IRI-only·지원하지 않는 attachment와
  초과분은 추가 fetch 없이 제외한다. 선택된 후보의 필수 URL 검증이 실패하면 Note 전체를 거부하며 본문이나
  일부 유효 이미지로 축소 저장하지 않는다. nullable Media Type·Alt Text와 attachment별 Media identity를 보존한다.
- attachment-only Note는 하나 이상의 유효한 이미지가 있으면 허용한다. 신규 원문 조회에서 본문과 유효한
  이미지가 모두 없는 Note는 저장하지 않는다. 이 조건을 기존 Create에 일괄 적용해 기존 동작을 바꾸지 않는다.
- Note identity·attribution·Public/Unlisted audience·content/media·수신 한계 검증은 신규 작성자 persistence보다
  먼저 수행한다. Note의 `attributedTo`와 실제 저장할 Actor의 exact URI 일치는 Actor persistence 전에 검증한다.
  불일치한 Actor를 저장하거나 기존 Profile을 그 Actor에 재연결한 뒤 실패 처리하지 않는다.
- Remote Actor/Profile과 Post는 독립된 원자적 저장 경계다. Actor 내부 Profile·Actor metadata·Profile 표현의
  원자성을 유지한다. 유효한 작성자가 commit된 뒤 Post가 실패하거나 duplicate로 종료돼도 작성자와 그 표현을
  보상 삭제하지 않는다. Instance 확보도 기존 독립 경계를 유지하며 Note/Post 실패를 이유로 삭제하지 않는다.
- Post·PostContent·currentContent·ActivityPub mapping·첨부 Media·최초 Reply Parent 관계는 같은 Post
  transaction에서 commit/rollback한다. DB 장애와 예상하지 못한 오류는 전파한다. Post effects는 성공한 Post
  commit 뒤에만 실행하고, 실패·duplicate에서는 시작하지 않는다. commit 뒤 effects 실패는 저장 결과를 되돌리지 않는다.

### ActivityPub Local Note 표현

- Content가 있는 Local Post의 ActivityPub identity는 Author Profile이 연결된 Local Instance의 canonical
  origin과 `/ap/note/{postId}` 경로를 결합한 절대 URI다. `postId`는 Post의 immutable DB UUID이며 Author
  Profile의 handle이나 GraphQL global ID를 사용하지 않는다. Activity를 실행하는 deployment의 configured
  Local Instance가 다르더라도 이 identity를 대체하지 않는다.
- 같은 Local Post는 프로세스 재시작, 역참조 요청 경로와 후속 Activity 종류에 관계없이 같은 Note URI를
  가진다. Local Post를 위해 remote ActivityPub Post mapping을 만들지 않는다.
- ActivityPub `Note`는 위 URI를 `id`, Author Profile의 canonical ActivityPub URI를 `attributedTo`, Post
  생성 시각을 `published`, Post 공유 참조를 `url`로 제공한다.
- canonical PostContent 계약이 정의한 paragraph, text, hard break와 안전한 link 의미를 ActivityPub HTML
  `content`에 투영한다. Content Warning은 있으면 안전한 `summary`로 투영한다. Media node는 HTML에 `<img>`로
  중복하지 않고 document 순서대로 `attachment` Image에 투영하며 Alt Text와 조회 시점의 접근 가능한 URL·MIME
  type을 제공한다. document root의 Sensitive Media는 지원하는 ActivityPub sensitive 속성으로 투영한다. 이
  Local Note 계약은 PostContent node, mark, canonicalization 또는 validation을 다시 정의하지 않는다. Mention,
  custom emoji는 이 표현에 포함하지 않는다. Quote 전용 표현은 아래 Quote federation 정책을 따른다.
- Reply Parent 관계가 있으면 Parent의 ActivityPub Post identity를 `inReplyTo`로 제공한다. Local Parent는
  같은 local Note URI 규칙을 사용하고 remote Parent는 저장된 ActivityPub Post URI를 사용한다. `inReplyTo`는
  requester별 Parent 조회 가능성에 따라 달라지지 않으며, Parent의 실제 표현은 Parent 자체의 역참조 권한으로
  보호한다. Tombstone Parent도 저장 관계가 유지되는 동안 같은 identity를 제공하며, Parent row의 물리적
  제거로 Reply Parent 관계가 `null`이 된 뒤에는 `inReplyTo`를 제공하지 않는다.
- Content와 Reply Parent 없이 Repost Source만 있는 Repost는 Note로 표현하지 않는다. 후속 Announce와
  Reaction Activity는 대상 Post의 같은 ActivityPub Post identity를 `object`로 재사용한다.
- Local Note는 FEP-c0e0 `emojiReactions` collection URI를 광고한다. collection projection은 현재 Note에
  연결된 Reaction 중 ActivityPub identity로 표현할 수 있는 Local Profile과 Remote Profile의 Reaction을 포함하며,
  collection 접근은 Note 역참조와 같은 Post Visibility, Post Eligibility와 Author Profile/Instance availability
  조건을 따른다. Tombstone, Content가 없는 Post 또는 unavailable Post는 Note와 collection을 제공하지 않는다.
- collection item의 `object`는 항상 대상 Local Note URI다. Reaction별 ActivityPub item identity와 `Like`·`EmojiReact`
  투영은 [Reaction](./reaction.md)의 collection projection 계약을 따른다. Remote Note를 새로 fetch하거나
  collection을 backfill해 item을 만들지 않는다.

ActivityPub audience는 Post Visibility에서 다음과 같이 투영한다.

| Post Visibility    | `to`                        | `cc`                        | Note 역참조 조건                                       |
| ------------------ | --------------------------- | --------------------------- | ------------------------------------------------------ |
| Public             | ActivityStreams Public      | Author followers collection | 인증 없이 허용                                         |
| Unlisted           | Author followers collection | ActivityStreams Public      | 인증 없이 허용                                         |
| Followers Only     | Author followers collection | 없음                        | Author 또는 established Follower의 signed fetch만 허용 |
| Mentioned Profiles | 지원하지 않음               | 지원하지 않음               | 제공하지 않음                                          |

- 수신 `Create(Note)`는 Note의 `to`·`cc`에서 인식 가능한 audience marker를 다음 우선순위로 분류한다. `to`에
  ActivityStreams Public이 있으면 Public, `to`에는 없고 `cc`에 Public이 있으면 Unlisted, 둘 다 없고 검증된
  remote author의 canonical followers URI가 `to` 또는 `cc`에 있으면 Followers Only다. Public/Unlisted는
  canonical followers URI의 존재를 요구하지 않으며, 이 분류는 Note가 personal/shared inbox로 전달된 경로와
  독립적이다.
- 인식된 marker가 있으면 그 밖의 구문상 유효하게 파싱된 actor/collection URI(공식 ActivityPub/Mastodon
  addressing으로 추가된 Mention addressee 포함), URI의 순서·중복과 foreign/unknown/spoofed-looking followers URI는
  audience를 바꾸거나 Note 전체를 무효화하지 않는다. author canonical followers URI가 있는 경우 foreign
  collection을 분류하려고 network dereference하거나 `/followers` 경로 휴리스틱을 사용하지 않고 추가 addressee로
  무시한다. raw malformed audience syntax는 기존 ActivityPub vocabulary hydration과 top-level Note 기본 검증에서
  처리하며, 이 무시 규칙은 구문상 유효하게 파싱된 extra IRI에만 적용한다.
- Public marker와 author canonical followers marker가 모두 없으면 actor-only DIRECT/limited audience와 foreign
  followers-looking URI만 있는 audience는 지원하지 않으며 Post side effect 없이 건너뛴다. 이런 추가 actor URI와
  spoofed-looking URI 자체로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는
  viewer access를 만들지 않는다. body/tag Mention 보존과 파싱은 이 수신 계약에 포함하지 않는다.
- actor·object·attribution과 top-level Note의 기본 검증은 여전히 materialization 전에 통과해야 한다. 이 검증은
  audience marker가 인식된 Note의 추가 actor URI를 근거 없이 거부하기 위한 검사가 아니라 저장할 Post Visibility와
  local 수신 관련성을 결정하기 위한 경계다.
- Followers Only Note의 inbound local 수신 대상은 Active local Profile·Active local Instance에 연결된 follower와
  remote followee 사이의 현재 established Follow Relationship으로 확인한다. pending·rejected Follow Request,
  unfollow로 removed된 관계 또는 follower Profile/Instance가 inbound eligibility를 통과하지 못하면 수신 대상이
  아니다. GraphQL 조회는 기존 viewer→author established 관계와 Post/Author Profile·Instance eligibility 정책을
  사용하며, 이 inbound local 조건을 일반 viewer locality 조건으로 확장하지 않는다.
- 수신 `Delete(Note)`는 저장된 ActivityPub Post mapping의 정확한 object URI와 Author Profile에 연결된
  ActivityPub Actor URI가 모두 일치할 때만 기존 Post 삭제 행동으로 해당 remote Post를 Tombstone 전이한다.
  mapping의 Post는 Current Content가 있는 Note 구조여야 하며, Content 없는 Repost의 Announce mapping은
  `Delete(Note)` 대상이 아니다.
  object는 직접 IRI 또는 같은 `id`의 embedded `Tombstone`만 지원하며, 삭제 처리를 위해 원격 object를
  역참조하지 않는다. mapping이 없거나 actor·object·author가 일치하지 않으면 아무 상태도 만들거나 변경하지
  않는다.
- remote Post의 Tombstone 전이는 Post, Current Content, 모든 Post Content revision과 ActivityPub Post
  mapping을 보존한다. 반복·동시 Delete는 최초 삭제 시각을 보존하고, 이후 같은 object의 중복 `Create(Note)`는
  Tombstone을 다시 Active로 만들지 않는다. 수신 remote Delete는 Local `Delete` delivery, Repost `Undo` 또는
  local notification cleanup의 원인이 아니다.

- Followers Only signed fetch는 서명으로 검증된 요청 Profile이 Author이거나 저장된 established Follow 관계의
  Follower일 때만 허용한다. 인증되지 않았거나 식별되지 않은 요청 주체와 Follower가 아닌 Profile에게는 Post가
  없는 것처럼 응답한다.
- Post가 Tombstone이거나 Content가 없거나, Author Profile 또는 Author Profile이 연결된 Local Instance가
  unavailable이거나, 지원하지 않는 Visibility이면 Note를 제공하지 않는다. Author Local Instance의 HTTP
  경계는 그 Instance origin의 Author Profile과 Note를 역참조할 수 있어야 한다. 이 unavailable 응답은 Post의
  존재를 노출하지 않는다.
- Local Note의 ActivityPub Tombstone, `Delete`, `Create`, `Announce`, `Like`, `EmojiReact`, `Undo` delivery와
  `emojiReactions` collection projection은 각 lifecycle과 delivery 계약이 소유한다.

### Quote federation 정책

- FEP-044f의 `quote`와 `QuoteAuthorization`을 정식 경로로 사용한다. 자기 인용 외에는 원문 작성자가 발급한
  유효한 개별 승인을 검증해야 하며, `interactionPolicy` 광고만으로 승인을 대체하지 않는다.
- `QuoteAuthorization` dispatcher는 Source를 조회할 수 있는 요청자에게 승인 객체를 제공한다. 승인 객체의
  `interactingObject`는 URI 참조로만 제공하고 embed하지 않는다. 요청자의 Source 조회 권한이 없거나 이를
  확인할 수 없으면 승인 객체 자체를 제공하지 않는다.
- Kosmo 원문에 들어오는 `QuoteRequest`는 요청 주체·인용 Post·Source의 대응과 원문 정책·조회·차단 조건을
  확인해 자동 승인하거나 거절한다. 승인에는 `Accept`와 해당 `QuoteAuthorization`을 연결하고 거절에는
  `Reject`를 사용한다.
- 자기 인용은 QuoteRequest 없이 허용한다. 타인의 원격 Source를 인용하면 `interactionPolicy`의
  automatic/manual 여부, 정책 부재 또는 해석 실패와 관계없이 원문 서버에 `QuoteRequest`를 보낸다.
  본문만 먼저 전달한 뒤 검증된 `Accept`와 유효한 승인 객체를 받으면
  `quote`·`quoteAuthorization`을 반영한 `Update`를 전달한다.
- `interactionPolicy`는 작성 전 UI·eligibility 힌트로 사용할 수 있다. 요청자가
  `automaticApproval`과 `manualApproval` 어느 쪽에도 명백히 포함되지 않으면 승인되지 않을 것으로
  예상된다는 정보를 제공할 수 있지만, 정책 자체를 승인 증거로 사용하지 않는다.
- 승인 전·거절·철회 상태에서는 일반 Note 표현이나 자동 생성한 레거시 호환 표현을 통해 정상 인용인 것처럼
  Source 관계를 노출하지 않는다. Quote 작성자가 직접 작성한 Content를 Source lifecycle 때문에 삭제하지
  않는다.
- 명시적 인용 승인 철회는 `QuoteAuthorization`을 무효로 만들고 `Delete(QuoteAuthorization)`를 전달한다.
  이를 수신하는 경계도 철회 주체와 승인의 대응을 검증한 뒤 Source를 비노출한다. 수신자가 Quote의 소유
  서버라면 기존 Quote audience에도 검증된 `Delete(QuoteAuthorization)`을 전달한다. 발신·전달하는 철회
  `Delete`의 `object`와 `target`에는 객체를 embed하지 않고 URI 참조만 제공한다.
- 레거시 Quote 속성의 상호운용을 지원하되 FEP 형식이 존재하지만 유효하지 않은 경우 레거시 형식으로
  강등하지 않는다. 승인된 인용에는 `quoteUrl`, `quoteUri`, `_misskey_quote`와 원문 링크의 본문 fallback을
  발신 표현으로 제공한다. 승인 전·거절·철회 상태에서는 자동 생성한 이 표현을 숨기되 직접 작성한 본문은
  유지한다. PROD-902의 OpenSpec을 따라 PROD-924가 구현하고, 기존 원격 Quote 수신 책임은 PROD-792가 유지한다.
- 기존 저장·원격 수신의 Reply+Quote는 `inReplyTo`와 Quote 관계를 독립적으로 표현한다. Source의 승인은
  Parent 또는 다른 Source의 조회 권한이나 인용 승인을 부여하지 않는다.

### 검색

- 검색 후보는 Post Visibility가 Public이고 Post Eligibility를 통과한 Post다.
- Unlisted, Followers Only, Mentioned Profiles Post는 검색 후보가 아니다.
- Domain Limit Instance의 Post는 공개 검색 후보에서 제외한다.
- Profile Block 관계에서 각 viewer의 상대 Profile이 작성한 콘텐츠는 viewer 방향에 관계없이 검색 후보에서
  제외한다.
- Word Mute Rule과 Hashtag Mute Rule은 Search Scope를 포함한 경우에만 viewer별 결과에 적용한다.

## 확정 용어

- 게시: Post
- Post Lifecycle State: Post Lifecycle State
- 답글: Reply
- 답글 부모: Reply Parent
- 재게시: Repost
- 인용 게시: Quote
- 재게시 원본: Repost Source
- 재게시·인용 원본: Repost Source
- 비목록 공개: Unlisted
- 공개 범위: Post Visibility
- 내용 경고: Content Warning
- 민감한 미디어: Sensitive Media
- Tombstone: Tombstone
- 게시 공유 참조: Post Share Reference
- ActivityPub 게시 정체성: ActivityPub Post Identity
- 로컬 Note 표현: Local Note Representation
- `emojiReactions` collection: Local Note가 광고하는 FEP-c0e0 Reaction collection projection

## 제외/보류

- Repost 취소는 별도 행동이 아니라 Content와 Reply Parent 없이 Repost Source를 가진 Post에 대한 Post 삭제다.
- Mentioned Profiles Post는 Repost할 수 없다.
- 새 Post Content revision으로 본문, Content Warning, Sensitive Media와 Media 구성·순서·참조를
  바꾸는 도메인 방향은 정의되어 있지만 현재 사용자용 Post 수정 기능은 제공하지 않는다. 이 기능은 이미지가
  있는 새 Post 작성과 독립된 후속 계약이다. Post Visibility 변경도 현재 지원하지 않는다.
- 본문의 canonical 표현은 schema version이 식별된 document다. Plain Text는 작성 입력과 읽기·검색·접근성 projection이며 별도 canonical 저장값이 아니다.
- 현재 document V1은 paragraph, text, hard break, 안전한 HTTP(S) link와 Media node를 지원한다. `pre`와
  일반 rich-text editor는 지원하지 않는다.
- Mentioned Profiles audience와 ActivityPub Mention·custom emoji는 후속 계약에서 정의한다.
- Quote 정책은 [ADR 0029](../decisions/0029-quote-consent-and-federation.md)과
  [PROD-902](https://linear.app/byulmaru/issue/PROD-902)를 따른다. 로컬 작성은 PROD-431,
  federation·승인 발급·철회는 PROD-924, 원격 Quote 수신·검증은 PROD-792가 구현한다.
- 이번 사이클에는 게시글별 인용 허용 설정만 제공한다. Profile의 새 Post 인용 허용 기본값 설정은
  [PROD-925](https://linear.app/byulmaru/issue/PROD-925)의 Backlog 범위이며 현재 출시를 막지 않는다.
- Post Content 수정 후 원격 수신자에게 `Update(Note)`를 전달하는 lifecycle은 후속 계약에서 정의한다.
