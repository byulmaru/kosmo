# ADR 0003: Policy Ownership Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

- Content Warning, Sensitive Media, Post Visibility, Post Eligibility는 [Post](../objects/post.md)가 소유한다.
- Post List 후보/제어 계산은 [Post List Policy](../policies/post-list.md)가 수행하지만 원본 상태와 개인 제어
  객체를 소유하지 않는다.
- 검색 가능성은 기술 색인 객체가 아니라 [Post](../objects/post.md), [Profile](../objects/profile.md),
  [Hashtag](../objects/hashtag.md), [Instance](../objects/instance.md)의 조회 정책이 소유한다.
- Follow Approval Policy는 Profile이 소유하고 승인 대기는 [Follow Request](../objects/follow-request.md)가
  소유한다.
- 관계별 새 Post Notification Preference는 [Follow Relationship](../objects/follow-relationship.md)이
  소유한다.
- Post thread 알림 억제는 [Post Notification Mute](../objects/post-notification-mute.md)가 소유한다.
- Profile 대상 제어는 [Profile Mute](../objects/profile-mute.md)와 [Profile Block](../objects/profile-block.md)으로
  분리한다.
- Word, Hashtag, Instance 단위 개인 제어는 [Word Mute Rule](../objects/word-mute-rule.md),
  [Hashtag Mute Rule](../objects/hashtag-mute-rule.md), [Profile Domain Block](../objects/profile-domain-block.md)이
  각각 소유한다.
- Instance 전역 safety, reachability, service 상태는 [Instance](../objects/instance.md)가 소유한다.
- Media는 Profile, Local Upload Account, Alt Text를 소유한다. Remote Media의 Origin Instance는 Media의 Remote
  Profile에서 파생한다.
- File은 Original/Derived 표현을 소유하고 저장소 위치와 공개 URL은 소유하지 않는다.
- Post 작성/Reply 작성은 Attached Media 관계를 원자적으로 생성하며 게시 뒤 연결을 바꾸지 않는다.
- Profile Block 생성은 두 Profile 사이의 Follow Request와 Follow Relationship, Target이 Owner의 Post에 남긴
  Reaction을 제거한다. Repost Post, Bookmark, 기존 Notification Item은 유지한다.
- Account 삭제는 Membership을 모두 정리하고 Local Profile의 마지막 Owner를 제거하지 않을 때만 가능하다.

## 문서 반영

- 객체별 소유권은 각 `objects/*.md` 문서의 관계와 행동에 기록한다.
- 비객체 교차 조회 규칙만 `policies/`에 둔다.
