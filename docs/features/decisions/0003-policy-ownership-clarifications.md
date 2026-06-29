# ADR 0003: Policy Ownership Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

도메인 문서의 정책 소유권, 제외 범위, 미결정 항목을 다음처럼 확정한다.

- 민감한 미디어 상태는 Post가 가진다. Post가 민감한 미디어로 설정되면 해당 Post에 연결된 모든
  Media 표시가 가려진다.
- Content Warning은 Publishing이 소유하는 Post 속성이다.
- Post Eligibility는 데이터를 가지는 Post 속성이나 값 객체가 아니라 Publishing이 소유하는 후보성
  정책이다.
- Post List는 목록별 Post List Control을 적용하지만 block, mute, moderation, Sensitive Media 같은
  정책 원본은 소유하지 않는다.
- 이미지 변환 실패 미디어 정책은 도메인 결정사항으로 두지 않는다.
- Profile의 팔로우 승인 정책은 Identity가 소유하고, Follow Request는 Social Graph가 소유한 Follow
  Relationship의 요청 대기 상태로 다룬다.
- 특정 Profile 새 Post 알림 preference는 Social Graph가 소유하고, Notification은 이를 소비한다.
- Thread mute는 Trust & Safety가 아니라 Notification이 소유한다.
- 원격 delivery 실패, 원격 서버 전달 실패, 원격 서버 삭제/정지 신호 적용 순서는 구현/연합 스펙으로
  분리하고 현재 도메인 명세에서 제외한다.
- 제한 또는 정지된 Account/Profile에서 발생한 소셜 알림은 별도 요청함으로 분리하지 않고 노출하지
  않는다. 신고 제출만으로는 대상의 노출, 알림, 라우팅이 바뀌지 않는다.
- Post 첨부 제한은 초기값으로 Post당 이미지 최대 4개로 둔다. Media 파일 제한은 이미지당 최대 10
  MiB, MIME type `image/avif`, `image/jpeg`, `image/png`, `image/webp`, 가로/세로 각각 최대 4096px로
  둔다.
- Avatar 표시 crop은 400x400, header image 표시 crop은 1500x500을 기준으로 둔다.
- Post 수정은 현재 지원하지 않는다.
- Profile이 남아 있으면 Account를 삭제할 수 없다.
- Block 발생 시 기존 follow, Reaction, Repost, Bookmark는 삭제한다. 기존 Notification은 삭제하거나
  상태를 바꾸지 않는다.
- 이미 확정된 용어는 `미결정 네이밍`에 남기지 않고 `확정된 용어`로 이동한다.

## 문서 반영

- [Publishing 컨텍스트](../contexts/publishing.md)는 Sensitive Media, Content Warning, Post
  Visibility, Post Eligibility 정책을 소유한다.
- [Post List 컨텍스트](../contexts/post-list.md)는 upstream 정책 결과를 목록별로 적용한다.
- [Identity 컨텍스트](../contexts/identity.md)는 Profile 팔로우 승인 정책과 Account/Profile 삭제
  제약을 소유한다.
- [Social Graph 컨텍스트](../contexts/social-graph.md)는 Follow Relationship, Follow Request 상태,
  관계별 새 Post 알림 preference를 소유한다.
- [Notification 컨텍스트](../contexts/notification.md)는 thread mute와 알림 억제를 소유한다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md)는 신고, 차단, 뮤트, 운영자 moderation 정책을
  소유하지만 thread mute와 연합 delivery 실패 처리는 소유하지 않는다.
- [Media 컨텍스트](../contexts/media.md)는 파일 원본, 파생 이미지, 접근성 설명, 업로드 제한을
  소유하지만 Post 단위 민감한 미디어 상태는 소유하지 않는다.
