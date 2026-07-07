# ADR 0004: Review Consistency Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

PR 리뷰에서 확인된 문서 간 불일치를 다음처럼 확정한다.

- 팔로워 공개 Post의 접근 가능 대상에는 작성자, 작성자를 수락된 상태로 팔로우한 Profile, 멘션된
  Profile이 포함된다.
- Home Post List 후보 집합의 일반 Post 후보는 원본 Post로 한정하고, Home Post List 답글 정책에 맞는
  Reply Post만 별도 후보로 포함한다.
- Profile State에는 `정지`를 포함한다. 정지는 운영자 action으로 Profile 사용과 표시가 정지된 상태다.
- Profile mute는 Notification을 삭제하거나 상태를 바꾸지 않는다. 뮤트된 Profile의 새 알림은 숨기거나
  억제한다.
- [Search Index](../objects/search-index.md)는 검색에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만
  검색 결과 제외에 사용한다.
- 검색 색인 제외는 실제 moderation action으로 제한, 정지, 삭제된 Post와 Profile에만 적용한다.
- Notification은 알림에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만 멘션 알림 제한에 사용한다.
- Post List는 현재 Post List Definition의 적용 위치와 일치하는 Word Mute 또는 Hashtag Mute만 적용하고,
  upstream hide/collapse 결정을 소비한다.
- Repost Post 후보에는 Repost를 작성한 Profile과 source Post의 Author Profile 모두에 Profile block/mute control을
  적용한다.
- Hashtag Post List는 공개 원본 Post만 대상으로 한다.

## 문서 반영

- [Post](../objects/post.md)는 팔로워 공개 요약에도 작성자를 포함한다.
- [Post List Definition](../objects/post-list-definition.md)은 Home Post List 후보 집합에서 Original Post와
  Reply Post를 분리하고, Repost source Author Profile과 mute 적용 위치/결정을 명시한다.
- [Profile](../objects/profile.md)은 Profile State에 정지를 포함한다.
- [Profile Relation Rule](../objects/profile-relation-rule.md), [Word Mute Rule](../objects/word-mute-rule.md),
  [Hashtag Mute Rule](../objects/hashtag-mute-rule.md)은 mute의 알림 처리를 숨김/억제로 정의한다.
- [Search Index](../objects/search-index.md)는 검색 scope에 적용된 mute와 실제 moderation action만 검색
  제외 조건으로 사용하고, [Hashtag](../objects/hashtag.md)는 해시태그 목록 후보를 공개 원본 Post로
  제한한다.
