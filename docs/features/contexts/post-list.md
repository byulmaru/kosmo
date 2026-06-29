# Post List 컨텍스트: 게시 목록

## 목표

Profile이 팔로우한 Profile, 특정 Profile, 해시태그 기반 게시 목록에서 Post를 탐색할 수 있어야 한다.
Post List는 Post와 Repost의 목록이며, 어떤 Post와 Repost가 후보가 되고 어떤 제어 정책을 거쳐 어떤
순서로 노출되는지 정의하는 읽기 규칙이다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Publishing](./publishing.md), [Identity](./identity.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md), [Media](./media.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: 없음. Post List는 주로 읽기 projection을 제공한다.
- peer: [Discovery](./discovery.md), [Notification](./notification.md)

## DDD 명세

- 컨텍스트 경계: 홈, 프로필, 해시태그 게시 목록을 구성하는 visible eligible Post와 Repost 후보의
  선택 규칙, viewer/list 수준 제어 적용, 정렬, 페이지네이션, 읽기 위치를 정의한다. Post
  Eligibility, Post Visibility, 게시 원본, 팔로우 관계 원본, 차단/뮤트 원본, moderation 원본은
  소유하지 않는다.
- 보편 언어: Post List, Home Post List, Profile Post List, Hashtag Post List, Cursor, Read Position,
  Post List Definition, Post List Control.
- 핵심 모델: Post List Definition, Post List Projection, Post List Subscription을 aggregate 후보로
  둔다.
- 값 객체 후보: Cursor, Post List Control, Sort Order, Read Position, Control Decision.
- 불변 조건: 게시 목록은 viewer가 볼 수 없는 Post를 노출하면 안 된다. 모든 Post List는 적용할
  viewer/list control set을 명시해야 한다. Post List는 Publishing이 Post Visibility를 먼저 적용하고
  Post Eligibility를 그 다음 적용해 제공한 visible eligible Post만 후보로 삼는다.
- 도메인 이벤트 후보: PostListCandidateIncluded, PostListCandidateHidden, PostListReadPositionUpdated,
  PostListSubscriptionChanged.
- 정책 후보: 각 Post List Definition별 답글 포함 여부, Repost 포함 여부, control별 숨김/접힘/경고
  처리.

## Post List Definition

Post List Definition은 하나의 게시 목록이 Post와 Repost를 선택하고 노출하는 규칙이다.

- Post List Definition은 visible eligible Post 중 어떤 원본 Post를 후보로 삼을지 정의한다.
- Post List Definition은 Engagement의 Repost 중 어떤 Repost를 목록 후보로 합칠지 정의한다.
- Post List Definition은 viewer Profile 기준으로 적용할 Post List Control 목록을 가진다.
- Post List Definition은 후보 항목을 제외할지, 접어서 보여줄지, 경고와 함께 보여줄지 결정하는
  Control Decision을 만든다.
- Post List Definition은 정렬 기준과 pagination 기준을 가진다.
- Post List Definition은 답글과 Repost 포함 정책을 게시 목록별로 명시한다.
- Post List 정책은 Home Post List, Profile Post List, Hashtag Post List만 다룬다.

### 후보 항목 집합

- Home Post List: viewer Profile이 작성한 visible eligible Post, viewer Profile이 수락된 상태로
  팔로우한 Profile의 visible eligible Post, Home Post List 답글 정책에 맞는 Reply Post, viewer
  Profile 또는 팔로우한 Profile이 만든 Repost.
- Home Post List의 Reply Post 후보는 viewer Profile의 Post에 달린 답글, viewer Profile이 작성한
  답글, viewer Profile이 팔로우한 Profile의 Post에 viewer Profile이 팔로우한 Profile이 단 답글로
  제한한다.
- Profile Post List: 대상 Profile이 작성한 visible eligible 원본 Post와 대상 Profile이 만든 Repost.
- Hashtag Post List: visible eligible 원본 Post 중 Post Visibility가 공개이고 대상 해시태그가
  포함된 Post. 답글과 Repost는 포함하지 않는다.

### Post List Control

Post List Control은 각 upstream 컨텍스트가 소유한 정책과 상태를 목록별로 적용하는 규칙이다. Post
List는 차단, 뮤트, 민감한 미디어, moderation의 원본 정책을 소유하지 않는다.

- Profile block control: Trust & Safety의 block 결과를 적용해 viewer가 차단한 Profile, viewer를
  차단한 Profile의 Post를 제외한다.
- Profile mute control: Trust & Safety의 Profile mute 결과를 적용해 뮤트한 Profile의 Post를 숨기거나
  접는다.
- Word mute control: Trust & Safety의 Word Mute, Hashtag Mute 결과를 적용한다.
- Media control: Publishing의 민감한 미디어 상태와 Media 접근 가능 상태를 목록별로 접거나 제외한다.
- Reply control: 해당 Post List Definition이 답글을 포함할지, 원본 작성자와 관계가 없는 답글을
  제외할지 결정한다.
- Repost control: 해당 Post List Definition이 Repost를 포함할지, 특정 Profile의 Repost를 받을지
  결정한다.

### Control Decision

각 Post List Control은 후보 항목마다 다음 중 하나의 결과를 낼 수 있다.

- Include: 후보 Post 또는 Repost를 목록에 노출한다.
- Collapse: 후보 Post 또는 Repost를 경고 또는 접힘 상태로 노출한다.
- Exclude: 후보 Post 또는 Repost를 목록에 노출하지 않는다.

Exclude는 viewer/list 수준에서 노출하면 안 되는 상태에 사용한다. Post Visibility,
삭제, 정지, tombstone, 서버 moderation처럼 Post 자체 또는 Post 접근 정책에서 결정되는 상태는 Post
List Control이 아니라 Publishing의 Post Visibility 또는 Post Eligibility에서 처리한다. Collapse는 단어
뮤트, 민감한 미디어처럼 Profile이 숨김 사유를 보고 펼칠 수 있는 정책에 사용한다.

### Post List Control 적용 정책

| Control               | Home Post List                                          | Profile Post List                | Hashtag Post List                 |
| --------------------- | ------------------------------------------------------- | -------------------------------- | --------------------------------- |
| Publishing visibility | visible eligible Post만 후보                            | visible eligible Post만 후보     | visible eligible 공개 Post만 후보 |
| Profile block         | Exclude                                                 | Exclude                          | Exclude                           |
| Profile mute          | Exclude                                                 | Collapse                         | Exclude                           |
| Word/Hashtag Mute     | 적용 위치가 Home이면 Collapse                           | 적용 위치가 Profile이면 Collapse | 적용 위치가 Hashtag이면 Collapse  |
| Sensitive Media       | Collapse                                                | Collapse                         | Collapse                          |
| Inaccessible Media    | Exclude                                                 | Exclude                          | Exclude                           |
| Reply                 | Home Post List 답글 정책에 맞는 Reply만 Include         | Exclude                          | Exclude                           |
| Repost                | viewer Profile 또는 팔로우한 Profile의 Repost만 Include | 대상 Profile의 Repost만 Include  | Exclude                           |

Publishing visibility와 Post Eligibility에서 제외된 Post는 Post List Control 이전에 후보에서 제외한다.
Profile block은 모든 Post List에서 Exclude로 적용한다. Profile mute와 Word/Hashtag Mute는 목록별 적용
위치에 따라 Exclude 또는 Collapse를 만든다.

## 핵심 게시 목록

### Home Post List

- viewer Profile이 작성한 Post와 viewer Profile이 수락된 상태로 팔로우한 Profile의 Post를 보여준다.
- 답글은 viewer Profile의 Post에 달린 답글, viewer Profile이 작성한 답글, viewer Profile이
  팔로우한 Profile의 Post에 viewer Profile이 팔로우한 Profile이 단 답글만 포함한다.
- Repost는 viewer Profile이 만든 Repost와 viewer Profile이 팔로우한 Profile이 만든 Repost를
  포함한다.
- block, Profile mute, word mute, media, reply, Repost control 적용 여부는 Home Post List Definition에
  명시한다.

### Profile Post List

- 특정 Profile이 작성한 원본 Post와 해당 Profile이 만든 Repost를 보여준다.
- 방문자와 작성자의 관계에 따라 보이는 게시가 달라진다.
- Profile Post List는 원본 Post와 Repost를 표시한다.

### Hashtag Post List

- Post Visibility가 공개인 원본 Post만 보여준다.
- 답글은 포함하지 않는다.
- Repost는 포함하지 않는다.
- 해시태그 검색과 이동은 Discovery가 소유하고, Post List는 해당 해시태그의 Post 목록 projection을
  제공한다.

## 게시 목록별 제어 정책

Post List에는 전역 기본 정책을 두지 않는다. 각 Post List Definition은 어떤 Post List Control을
적용하고 어떤 Control Decision을 만들지 명시해야 한다.

- Home Post List, Profile Post List, Hashtag Post List는 각각 답글 포함 여부와 Repost 포함 여부를
  명시한다.
- viewer의 block, Profile mute, word mute, media control은 upstream 정책 결과를 목록별로 적용해
  Include, Collapse, Exclude 중 하나의 결과를 만든다.
- Publishing이 판단한 현재 Post Eligibility 상태는 후보 계산보다 먼저 적용된다.

## 도메인 속성/정책 메모

- 게시 목록은 게시 원본과 목록 노출 결과를 분리해서 생각해야 한다.
- Repost는 원본 Post를 참조하는 Engagement 행동이고, Post List는 Repost를 별도 후보로 합친다.
- 커서 pagination은 삭제/삽입에 안정적이어야 한다.
- Post List 정책 결정은 Home Post List, Profile Post List, Hashtag Post List로 제한한다.

## 제외/보류 범위

- Custom Post List와 키워드 수집형 Post List는 현재 Post List 컨텍스트의 핵심 범위에서 제외한다.
- Local, Federated, List 기반 Post List는 현재 Post List 컨텍스트의 핵심 범위에서 제외한다.

## 확정된 용어

- 게시 목록: Post List
- 홈 게시 목록: Home Post List
- 프로필 게시 목록: Profile Post List
- 해시태그 게시 목록: Hashtag Post List
