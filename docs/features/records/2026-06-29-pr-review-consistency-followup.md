# 2026-06-29 PR 리뷰 정합성 후속 기록

## 배경

PR #176의 unresolved review thread를 다시 확인했다. resolved thread는 제외했고, 문서가 바뀌며
outdated가 된 thread도 같은 불일치가 남아 있으면 함께 점검했다.

## 확인한 리뷰 thread

- [Publishing 컨텍스트](../contexts/publishing.md): 팔로워 공개 요약에 작성자가 빠져 있었다.
- [Post List 컨텍스트](../contexts/post-list.md): Home Post List 후보 집합에 Reply Post 후보가 빠져
  있었다.
- [Identity 컨텍스트](../contexts/identity.md): Profile State 목록에 정지가 빠져 있었다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md): Profile mute가 Notification 삭제처럼 읽혔다.
- [Discovery 컨텍스트](../contexts/discovery.md): 신고만으로 검색 색인에서 제외되는 것처럼 읽혔다.
- [Discovery 컨텍스트](../contexts/discovery.md): 검색 scope와 무관한 Word/Hashtag Mute까지 검색 제외에
  적용되는
  것처럼 읽혔다.

## 확정된 결정

- 팔로워 공개 Post의 접근 가능 대상에는 작성자를 포함한다.
- Home Post List 후보 집합에는 Home Post List 답글 정책에 맞는 Reply Post를 포함한다.
- Profile State에는 `정지`를 포함한다.
- Profile mute는 Notification을 삭제하지 않고 숨기거나 억제한다.
- 검색에는 검색에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만 반영한다.
- 신고 제출만으로 검색 색인이나 검색 노출은 바뀌지 않는다. 실제 moderation action으로 제한, 정지,
  삭제된 Post와 Profile만 검색 색인에서 제외한다.

## 문서 반영

- 확정 결정은 [ADR 0004](../decisions/0004-review-consistency-clarifications.md)에 남겼다.
- 각 컨텍스트 문서의 요약 문장과 정책 문장을 같은 의미로 맞췄다.
