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
  적용되는 것처럼 읽혔다.
- [Notification 컨텍스트](../contexts/notification.md): 알림 scope와 무관한 Word/Hashtag Mute까지 멘션
  알림에 적용되는 것처럼 읽혔다.
- [Post List 컨텍스트](../contexts/post-list.md): Post List별 mute 적용 위치와 hide/collapse 결정이
  보존되지 않았다.
- [Post List 컨텍스트](../contexts/post-list.md): Home Post List의 일반 Post 후보가 Reply Post까지
  포함하는 것처럼 읽혔다.
- [Post List 컨텍스트](../contexts/post-list.md): Repost 후보에서 원본 Author Profile에 Profile
  block/mute control을 적용하는지 불명확했다.
- [Discovery 컨텍스트](../contexts/discovery.md): 해시태그 게시 목록이 공개 Reply Post까지 포함하는
  것처럼 읽혔다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md): Domain Limit이 전역 Post Eligibility 제외처럼
  읽혔다.

## 확정된 결정

- 팔로워 공개 Post의 접근 가능 대상에는 작성자를 포함한다.
- Home Post List 후보 집합의 일반 Post 후보는 원본 Post로 한정하고, Home Post List 답글 정책에 맞는
  Reply Post만 별도 후보로 포함한다.
- Profile State에는 `정지`를 포함한다.
- Profile mute는 기존 Notification을 삭제하거나 상태를 바꾸지 않는다. 뮤트된 Profile의 새 알림은
  숨기거나 억제한다.
- 검색에는 검색에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만 반영한다.
- 신고 제출만으로 검색 색인이나 검색 노출은 바뀌지 않는다. 실제 moderation action으로 제한, 정지,
  삭제된 Post와 Profile만 검색 색인에서 제외한다.
- Notification은 알림에 적용하도록 설정된 Word Mute 또는 Hashtag Mute만 멘션 알림 제한에 사용한다.
- Post List는 현재 Post List Definition의 적용 위치와 일치하는 Word Mute 또는 Hashtag Mute만 적용하고,
  upstream hide/collapse 결정을 소비한다.
- Repost 후보에는 Repost를 만든 Profile과 원본 Author Profile 모두에 Profile block/mute control을
  적용한다.
- Hashtag Post List와 Discovery의 해시태그 게시 목록은 공개 원본 Post만 대상으로 한다.
- Domain Limit은 전역 Post Eligibility를 false로 만들지 않고 공개 Post List와 Discovery 같은 surface별
  후보 제한으로 적용한다.

## 문서 반영

- 확정 결정은 [ADR 0004](../decisions/0004-review-consistency-clarifications.md)에 남겼다.
- Domain Limit과 Domain Block의 분리는 [ADR 0006](../decisions/0006-state-machine-and-domain-moderation.md)에
  남겼다.
- 각 컨텍스트 문서의 요약 문장과 정책 문장을 같은 의미로 맞췄다.
