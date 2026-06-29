# Engagement 컨텍스트: 상호작용

## 목표

Profile이 게시에 반응하고, 재게시하고, 저장할 수 있어야 한다. 기능 이름보다
Profile 행동 단위를 기준으로 정리한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Publishing](./publishing.md), [Identity](./identity.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Notification](./notification.md), [Post List](./post-list.md), [Discovery](./discovery.md)
- peer: [Social Graph](./social-graph.md)

## DDD 명세

- 컨텍스트 경계: 게시에 대한 반응, 재게시, 북마크 같은 사회적 행동을 정의한다. 게시 본문,
  공개 범위 원본, 답글 Post 생성과 thread 관계는 Publishing이 소유한다.
- 보편 언어: Reaction, Repost, Bookmark.
- 핵심 모델: Post Engagement를 aggregate root 후보로 둔다. Reaction, Repost, Bookmark는 행동별
  entity 후보로 둔다.
- 값 객체 후보: Reaction Type, Repost Scope, Bookmark Privacy, Engagement Count.
- 불변 조건: 행동 주체는 Profile 단위다. Repost는 원본 게시의 공개 범위를 넘지 않아야 한다.
  Reaction은 Post 하나에 Profile당 여러 개를 허용한다. 북마크는 기본적으로 비공개다.
- 도메인 이벤트 후보: ReactionAdded, ReactionRemoved, PostReposted, RepostRemoved, BookmarkAdded,
  BookmarkRemoved.
- 정책 후보: count/list 공개 범위, 삭제/제한 공개 게시의 행동 표시, Block 이후 행동 삭제 또는
  무효화 방식.

## 핵심 기능

### 이모지 반응

- Profile은 Post에 여러 종류의 이모지 Reaction을 남길 수 있다.
- Post 하나에 대해 같은 Profile은 같은 이모지 Reaction을 하나만 남길 수 있다.
- Post 하나에 대해 같은 Profile이 서로 다른 이모지 Reaction을 여러 개 남길 수 있다.
- 유니코드 이모지만 허용한다.

### 재게시

- Profile은 Post를 자기 팔로워에게 다시 노출할 수 있다.
- 재게시 취소가 가능해야 한다.
- Repost는 원본 Post의 Post Visibility를 변경하지 않는다.
- 원본 Post가 삭제되면 Repost를 제거하거나 숨긴다.
- 공개 / 조용한 공개 Post만 재게시할 수 있다.

### 북마크

- Profile은 Post를 개인적으로 저장할 수 있다.
- 북마크는 타인에게 보여지지 않는다.
- Post 작성자에게 북마크 알림을 보내지 않는다.
- 북마크 목록은 저장한 Profile만 볼 수 있다.

## 카운트와 목록

- 답글 수, 반응한 Profile 수, 재게시한 Profile 수를 표시한다.
- 반응자 목록과 재게시자 목록은 공개 범위와 차단 상태를 반영한다.
- 답글 수는 Publishing이 소유한 thread 관계를 반영한 읽기 지표로 다룬다.

## 도메인 속성/정책 메모

- 상호작용은 Profile 단위다.
- Block 발생 시 기존 Reaction, Repost, Bookmark는 삭제 또는 무효화 방향으로 본다.

## 미결정 네이밍

- 반응: Reaction
- 재게시: Repost
- 북마크: Bookmark
