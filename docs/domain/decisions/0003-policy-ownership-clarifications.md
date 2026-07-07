# ADR 0003: Policy Ownership Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

도메인 문서의 정책 소유권, 제외 범위, 미결정 항목을 다음처럼 확정한다.

- 민감한 미디어 상태는 Post가 가진다. Post가 민감한 미디어로 설정되면 해당 Post에 연결된 모든
  Media 표시가 가려진다.
- Content Warning은 Post가 소유하는 속성이다.
- Post Eligibility는 데이터를 가지는 Post 속성이나 값 객체가 아니라 Post가 소유하는 후보성
  정책이다.
- Post List는 목록별 Post List Control을 적용하지만 block, mute, moderation, Sensitive Media 같은
  정책 원본은 소유하지 않는다.
- 이미지 변환 실패 미디어 정책은 도메인 결정사항으로 두지 않는다.
- Profile의 팔로우 승인 정책은 [Profile](../objects/profile.md)이 소유하고, Follow Request는
  [Follow Request](../objects/follow-request.md)가 소유한다.
- 특정 Profile 새 Post 알림 preference는 Follow Relationship이 소유하고, Notification Item은 이를
  소비한다.
- Thread mute는 safety rule 객체가 아니라 [Notification Item](../objects/notification-item.md)이
  소유한다.
- 원격 delivery 실패, 원격 서버 전달 실패, 원격 서버 삭제/정지 신호 적용 순서는 구현/연합 스펙으로
  분리하고 현재 도메인 명세에서 제외한다.
- 제한 또는 정지된 Account/Profile에서 발생한 소셜 알림은 노출하지 않는다.
- Post 첨부 제한은 초기값으로 Post당 이미지 최대 4개로 둔다. Media 파일은 검증 정책의 대상이지만,
  구체 파일 형식, 파일 크기 수치, Hash, EXIF 처리 같은 기술 세부는 구현/OpenSpec으로 분리한다.
- Avatar 표시 crop은 400x400, header image 표시 crop은 1500x500을 기준으로 둔다.
- Post 수정은 현재 지원하지 않는다.
- Account 삭제 전에는 해당 Account가 가진 Account-Profile 관계를 정리해야 하며, 어떤 Profile의 마지막
  `Owner`도 제거할 수 없다.
- Block 발생 시 기존 Follow Request, Follow Relationship, Reaction, Repost Post, Bookmark는 삭제한다. 기존
  Notification은 삭제하거나 상태를 바꾸지 않는다.
- 이미 확정된 용어는 `미결정 네이밍`에 남기지 않고 `확정된 용어`로 이동한다.

## 문서 반영

- [Post](../objects/post.md)는 Post Form, Sensitive Media, Content Warning, Post Visibility, Post Eligibility
  정책을 소유한다.
- [Post List Definition](../objects/post-list-definition.md)은 참조 정책 결과를 목록별로 적용한다.
- [Profile](../objects/profile.md)과 [Account](../objects/account.md)는 Profile 팔로우 승인 정책과
  Account/Profile 삭제 제약을 소유한다.
- [Follow Relationship](../objects/follow-relationship.md)은 성립된 팔로우 관계와 관계별 새 Post 알림
  preference를 소유한다.
- [Follow Request](../objects/follow-request.md)는 팔로우 요청 상태와 승인/거절 처리를 소유한다.
- [Notification Item](../objects/notification-item.md)은 thread mute와 알림 억제를 소유한다.
- [Profile Relation Rule](../objects/profile-relation-rule.md)은 Profile 차단/뮤트 관계를 소유한다.
- [Word Mute Rule](../objects/word-mute-rule.md), [Hashtag Mute Rule](../objects/hashtag-mute-rule.md),
  [Profile Domain Block](../objects/profile-domain-block.md)은 각각 단어 뮤트, 해시태그 뮤트, 개인 Domain
  block을 소유한다.
- [Instance](../objects/instance.md)는 서버 safety 상태와 reachability 상태를 소유한다. 이 객체들은 thread
  mute와 연합 delivery 실패 처리는 소유하지 않는다.
- [Media](../objects/media.md)와 [File](../objects/file.md)은 파일 원본, 파생 이미지, Alt Text,
  Media Proxy, 파일 검증 정책을 소유하지만 Media 접근 권한의 원본 판단과 Post 단위 Sensitive Media
  상태는 소유하지 않는다.
