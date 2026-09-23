# ADR 0003: Policy Ownership Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 후속 결정

File 표현과 Media 생성 시점에 관한 결정은 [ADR 0018](./0018-media-upload-lifecycle-without-file.md)가 대체한다.
Post Content revision의 Media·Alt Text·Sensitive Media 소유권과 편집에 관한 결정은
[ADR 0022](./0022-post-content-revision-media-nodes.md)가 대체한다.

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
- Media는 Profile, Local Upload Account, Alt Text를 소유한다. Media의 Instance는 Media Profile에서 파생한다.
- File은 Original/Derived 표현을 소유하고 저장소 위치와 공개 URL은 소유하지 않는다. 이 항목은 ADR 0018로
  대체됐다.
- Post/Reply/Quote 작성은 Attached Media 관계를 원자적으로 생성하며 게시 뒤 연결을 바꾸지 않는다.
- Profile Block 생성 transaction은 새 Profile Block 관계를 저장하는 경우에만 두 Profile 사이의 현재 Follow Request와 Follow
  Relationship을 제거하고, 제거된 Follow 객체를 직접 원인으로 가진 Notification도 같은 transaction에서 제거한다. 새 관계가
  commit된 결과가 성공이며, commit 뒤 별도 effect의 성공·실패는 관계 성공을 바꾸지 않는다. 같은 조합을 다시 요청하면 기존
  관계를 성공 결과로 관찰하고 새 cleanup을 실행하지 않는다. 이미 관계가 존재한 뒤 동시성이나 후속 경로로 뒤늦게 관찰되는 Follow·Request·
  Notification은 Active Block 정책으로 처리하며 duplicate 관찰이나 Unblock의 보상 cleanup으로 확장하지 않는다. 기존 Reaction,
  Repost Post, Bookmark, 다른 기존 Notification과 Read State는 유지한다. Profile Block 해제는 Owner가 지정한 정확한 Profile Block ID
  관계만 제거하며 Follow Request·Follow Relationship·Notification을 추가로 정리하거나 복구하지 않는다.
- Account 삭제는 Membership을 모두 정리하고 Local Profile의 마지막 Owner를 제거하지 않을 때만 가능하다.
- Account 요청에서 Profile 또는 Account가 주체인 행동은 관계 권한과 별도로 `Account.Active`를 요구한다.
  Account 삭제와 Account 대상 Operational Notification 읽음은 명시적 예외다. Profile Origin은 Account 요청
  여부를 대신 결정하지 않는다.

## 문서 반영

- 객체별 소유권은 각 `objects/*.md` 문서의 관계와 행동에 기록한다.
- 비객체 교차 조회 규칙만 `policies/`에 둔다.
