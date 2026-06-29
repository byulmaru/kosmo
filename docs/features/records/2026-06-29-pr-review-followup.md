# 2026-06-29 PR 리뷰 반영 기록

## 배경

PR #176의 unresolved review thread를 확인하고, 답글에 남은 결정을 포함해 DDD 도메인 명세에 반영했다.
이미 resolved된 thread는 반영 대상에서 제외했다.

## 반영한 결정

- `Feed` 용어를 `Post List`로 대체했다.
- Home/Profile Post List에서 Repost 후보가 어디서 합쳐지는지 명시했다.
- Hashtag Post List는 공개 원본 Post만 포함하고 답글과 Repost를 제외한다고 확정했다.
- Post Visibility 변경은 게시 후 허용하지 않는다고 확정했다.
- 팔로워 공개 Post도 멘션된 Profile에게 보인다고 확정했다.
- 본문 길이는 500자, 미디어만 있는 Post는 허용으로 확정했다.
- 설문, 예약 게시, 임시 저장, 동영상, GIF, 개인 파일함, 리스트, 추천 팔로우, Followed Hashtag,
  서클, Labeler, 커뮤니티 moderation은 현재 범위에서 제외했다.
- Reaction은 Profile당 이모지별 1개, 여러 이모지 허용으로 확정했다.
- Repost는 공개 또는 조용한 공개 Post만 대상으로 확정했다.
- 단어/해시태그 제어는 Filter가 아니라 Word Mute, Hashtag Mute로 확정했다.
- 신고 제출 주체는 Account로 확정하고, 신고자에게 처리 결과와 상태 목록을 제공하지 않기로 했다.
- thread mute와 Notification 읽음 상태를 도메인 규칙으로 정리했다.

## 문서 반영

- 확정 결정은 [ADR 0002](../decisions/0002-pr-review-domain-adjustments.md)에 남겼다.
- 컨텍스트 문서의 링크와 용어를 `Post List` 기준으로 맞췄다.
- 도메인 스펙이 아닌 화면 상태, 구현 실패 처리, 업로드 세부 제한, 캐시 만료, dedupe 같은 문구는
  제거하거나 제외/보류 범위로 이동했다.

## 후속 처리

아래 항목은 [2026-06-29 정책 소유권 후속 결정 기록](./2026-06-29-policy-ownership-followup.md)과
[ADR 0003](../decisions/0003-policy-ownership-clarifications.md)에서 닫혔다.

- Post 수정은 현재 지원하지 않는다.
- Profile이 남아 있으면 Account를 삭제할 수 없다.
- 원격 follow delivery 실패 상태는 구현/연합 스펙으로 분리한다.
