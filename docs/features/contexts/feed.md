# Feed 컨텍스트: 피드

## 목표

Profile이 팔로우한 Profile, 같은 서버의 Profile, 연합 네트워크, 주제 기반 피드에서 게시를 탐색할 수
있어야 한다. Feed는 Post 목록이며, 어떤 Post가 후보가 되고 어떤 제어 정책을 거쳐
어떤 순서로 노출되는지 정의하는 읽기 규칙이다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Publishing](./publishing.md), [Identity](./identity.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: 없음. Feed는 주로 읽기 projection을 제공한다.
- peer: [Discovery](./discovery.md), [Notification](./notification.md)

## DDD 명세

- 컨텍스트 경계: 홈, 로컬, 연합, 프로필, 해시태그, 리스트 피드를 구성하는 visible eligible Post
  집합의 선택 규칙, viewer/feed 수준 제어 정책, 정렬, 페이지네이션, 읽기 위치를 정의한다. Post
  Eligibility, Post Visibility, 게시 원본, 팔로우 관계 원본, 차단/뮤트 원본, moderation 원본은
  소유하지 않는다.
- 보편 언어: Feed, Home Feed, Local Feed, Federated Feed, Feed Item, Cursor, Read Position, Feed
  Definition, Feed Control.
- 핵심 모델: Feed Definition, Feed Projection, Feed Subscription을 aggregate 후보로 둔다. Feed
  Item은 다른 컨텍스트의 이벤트를 반영한 읽기 모델이다.
- 값 객체 후보: Cursor, Feed Filter, Feed Control, Sort Order, Read Position, Control Decision.
- 불변 조건: 피드는 viewer가 볼 수 없는 Post를 노출하면 안 된다. 모든 Feed는 적용할 viewer/feed
  control set을 명시해야 한다. Feed는 Publishing이 Post Visibility를 먼저 적용하고 Post
  Eligibility를 그 다음 적용해 제공한 visible eligible Post만 후보로 삼는다.
- 도메인 이벤트 후보: FeedItemAdded, FeedItemHidden, FeedReadPositionUpdated,
  FeedSubscriptionChanged.
- 정책 후보: 각 Feed Definition별 답글 포함 여부, Repost 포함 여부, 새 게시 자동 삽입, 로컬/연합
  피드 노출 범위, 추천 정렬 포함 여부, control별 숨김/접힘/경고 처리.

## Feed Definition

Feed Definition은 하나의 피드가 Post를 선택하고 노출하는 규칙이다.

- Feed Definition은 visible eligible Post 중 어떤 Post를 후보로 삼을지 정의한다.
- Feed Definition은 viewer Profile 기준으로 적용할 Feed Control 목록을 가진다.
- Feed Definition은 후보 Post를 제외할지, 접어서 보여줄지, 경고와 함께 보여줄지 결정하는 Control
  Decision을 만든다.
- Feed Definition은 정렬 기준과 pagination 기준을 가진다.
- Feed Definition은 빈 상태, 필터로 모두 숨겨진 상태, 새 Post 도착 상태를 어떻게 보여줄지 가진다.
- Feed Definition은 답글, Repost, 새 Post 자동 삽입, 로컬/연합 노출 같은 정책을 피드별로 명시한다.
- Feed 정책은 Home Feed와 Profile Feed부터 확정한다. Local Feed, Federated Feed, Hashtag Feed,
  List Feed의 세부 정책은 이후 결정한다.

### 후보 Post 집합

- 홈 피드: visible eligible Post 중 viewer Profile이 작성한 Post와 viewer Profile이 수락된 상태로
  팔로우한 Profile의 Post.
- 프로필 피드: visible eligible Post 중 대상 Profile이 작성한 Post.
- 해시태그 피드: visible eligible Post 중 Post Visibility가 공개이고 대상 해시태그가 포함된 Post.
- 리스트 피드: visible eligible Post 중 리스트에 포함된 Profile이 작성한 Post.

### Feed Control

Feed Control은 Publishing이 visible eligible 상태로 제공한 후보 Post에 viewer/feed 수준 제어를
적용하는 규칙이다.

- Profile block control: viewer가 차단한 Profile, viewer를 차단한 Profile의 Post를 제외한다.
- Profile mute control: viewer가 뮤트한 Profile의 Post를 숨기거나 접는다.
- Word mute control: viewer가 설정한 단어, 문구, 해시태그 필터를 적용한다.
- Media control: 민감한 미디어, 차단된 미디어, 변환 실패 미디어의 표시 정책을 적용한다.
- Reply control: 답글을 포함할지, 원본 작성자와 관계가 없는 답글을 제외할지 결정한다.
- Repost control: Repost를 포함할지, 특정 Profile의 Repost를 받을지 결정한다.
- Language control: 관계별 또는 피드별 언어 제한을 적용한다.

### Control Decision

각 Feed Control은 Post마다 다음 중 하나의 결과를 낼 수 있다.

- Include: Feed Item으로 노출한다.
- Collapse: Feed Item은 남기되 경고 또는 접힘 상태로 노출한다.
- Exclude: Feed Item으로 노출하지 않는다.

Exclude는 viewer 차단처럼 viewer/feed 수준에서 노출하면 안 되는 상태에 사용한다. Post Visibility,
삭제, 정지, tombstone, 서버 moderation처럼 Post 자체 또는 Post 접근 정책에서 결정되는 상태는 Feed
Control이 아니라 Publishing의 Post Visibility 또는 Post Eligibility에서 처리한다. Collapse는 단어
뮤트, 민감한 미디어처럼 Profile이 숨김 사유를 보고 펼칠 수 있는 정책에 사용한다.

## 핵심 피드

### 홈 피드

- viewer Profile이 작성한 Post와 viewer Profile이 수락된 상태로 팔로우한 Profile의 Post를 보여준다.
- 답글 포함 여부는 Home Feed Definition이 정한다.
- Repost 포함 여부는 Home Feed Definition과 관계별 수신 설정이 함께 정한다.
- block, Profile mute, word mute, media, reply, Repost control 적용 여부는 Home Feed Definition에
  명시한다.
- 새 게시가 있을 때 자동 삽입할지, 수동으로 불러오게 할지는 Home Feed Definition이 정한다.

### 프로필 게시 목록

- 특정 프로필이 작성한 게시 목록을 보여준다.
- 고정 게시, 답글 포함 여부, 미디어만 보기 같은 필터를 제공할 수 있다.
- 방문자와 작성자의 관계에 따라 보이는 게시가 달라진다.
- 로컬 프로필과 원격 프로필 표시 정책을 분리해야 한다.
- Profile Feed의 답글 포함 여부, Repost 표시 여부, 탭 분리 여부는 먼저 확정할 Feed 정책 범위에
  포함한다.

## Feed별 제어 정책

Feed에는 전역 기본 정책을 두지 않는다. 각 Feed Definition은 다음 Feed Control 중 무엇을 적용하고
어떤 Control Decision을 만들지 명시해야 한다.

- viewer와 차단 관계가 있는 Profile의 Post를 Exclude할지 여부와 처리 방식을 정한다.
- viewer가 뮤트한 Profile의 Post를 숨길지 접을지 정한다.
- viewer가 설정한 단어, 문구, 해시태그 필터를 적용할지 정한다.
- 민감한 미디어와 표시 제한 미디어의 표시 정책을 정한다.
- Publishing이 판단한 현재 Post Eligibility 상태를 후보 계산에 반영한다.
- Feed별 선택 control은 Feed Definition에 명시한다.

## 상태와 에러

(이곳의 내용들은 디자인적 결정에 가까움. 추후 이관할 것)

- 빈 피드: 팔로우 추천, 검색, 로컬 피드 진입을 제안.
- 추가 로드 실패: 현재 목록은 보존하고 재시도 버튼 제공.
- 새 게시 있음: 자동 스크롤하지 않고 새 게시 로드 버튼 제공.
- 필터로 모두 숨겨진 상태: 숨김 사유를 노출할지 정책으로 정한다.

## 도메인 속성/정책 메모

- 피드는 게시 원본과 Feed Item 삽입 이벤트를 분리해서 생각해야 한다.
- Repost는 원본 Post 재사용과 Feed Item 삽입 이벤트를 함께 가진다.
- 커서 pagination은 삭제/삽입에 안정적이어야 한다.
- 연합 피드는 수집 범위를 화면에 과장해서 보여주면 안 된다.
- Feed 정책 결정은 Home Feed와 Profile Feed를 우선한다.

## 제외/보류 범위

- Custom Feed와 키워드 수집형 Feed는 현재 Feed 컨텍스트의 핵심 범위에서 제외한다.

## 미결정 네이밍

- 홈: Home, Following
- 로컬: Local, Server
- 연합: Federated, Network
