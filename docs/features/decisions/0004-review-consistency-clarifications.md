# ADR 0004: Review Consistency Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

PR 리뷰에서 확인된 문서 간 불일치를 다음처럼 확정한다.

- 팔로워 공개 Post의 접근 가능 대상에는 작성자, 작성자를 수락된 상태로 팔로우한 Profile, 멘션된
  Profile이 포함된다.
- Home Post List 후보 집합에는 원본 Post와 Repost뿐 아니라 Home Post List 답글 정책에 맞는 Reply
  Post도 포함한다.
- Profile State에는 `정지`를 포함한다. 정지는 Trust & Safety의 moderation action으로 Profile 사용과
  표시가 정지된 상태다.
- Profile mute는 Notification을 삭제하지 않는다. 뮤트된 Profile의 알림은 숨기거나 억제하고,
  Notification 삭제는 Block 정책으로만 다룬다.
- Discovery는 검색에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만 검색 결과 제외에 사용한다.
- 신고 제출만으로 검색 색인이나 검색 노출은 바뀌지 않는다. 검색 색인 제외는 실제 moderation action으로
  제한, 정지, 삭제된 Post와 Profile에만 적용한다.

## 문서 반영

- [Publishing 컨텍스트](../contexts/publishing.md)는 팔로워 공개 요약에도 작성자를 포함한다.
- [Post List 컨텍스트](../contexts/post-list.md)는 Home Post List 후보 집합에 Reply Post 후보를
  명시한다.
- [Identity 컨텍스트](../contexts/identity.md)는 Profile State에 정지를 포함한다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md)는 mute의 알림 처리를 숨김/억제로 정의한다.
- [Discovery 컨텍스트](../contexts/discovery.md)는 검색 scope에 적용된 mute와 실제 moderation action만
  검색 제외 조건으로 사용한다.
