# ADR 0007: Spec Boundary and State Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

서브에이전트 검수 후 남은 도메인 경계와 상태/알림 정책을 다음처럼 확정한다.

- Media는 URL 발급, Media Proxy, 파일 원본, 파생 이미지, 변환 결과 제공을 소유한다.
- Media는 Media 접근 권한의 원본 판단을 소유하지 않는다. Post Media 접근 판단은 Publishing의 Post
  Visibility와 Post Eligibility를 따르고, Profile Media 접근 판단은 Identity의 Profile 표현 정책을
  따른다. Trust & Safety의 moderation 결과는 Media 접근 결과에 반영된다.
- Media 컨텍스트는 파일 검증 정책을 가진다. 구체 MIME type, Hash, EXIF 처리, 파일 크기 수치, 파생
  이미지 생성 방식 같은 기술 세부는 도메인 명세가 아니라 구현/OpenSpec에서 다룬다.
- Follow Relationship의 상태는 요청 대기, 수락, 거절만 도메인 상태로 둔다. 요청 취소, 언팔로우, 차단
  삭제의 이력 보존 방식은 Follow State로 확장하지 않고 구현 스펙으로 분리한다.
- Identity는 Account State Machine을 소유한다. Account State는 활성, 정지, 삭제됨 세 상태를 가진다.
- Account 정지와 정지 해제는 Trust & Safety moderation action의 결과다.
- Account 삭제 전에는 Account-Profile 관계가 모두 정리되어야 하며, 그 과정에서 어떤 Profile의 마지막
  `Owner`도 제거할 수 없다.
- block, mute, Muted Thread에 걸린 새 Notification Item은 생성하지 않는다.
- block, mute, limit, suspend가 발생해도 기존 Notification Item은 삭제하거나 읽음 상태를 바꾸지 않는다.

## 문서 반영

- [Media 컨텍스트](../contexts/media.md)는 파일 표현과 Media Proxy를 소유하고 접근 권한 원본 판단은
  upstream 정책으로 분리한다.
- [Social Graph 컨텍스트](../contexts/social-graph.md)는 Follow Relationship 상태를 요청 대기, 수락,
  거절로 제한한다.
- [Identity 컨텍스트](../contexts/identity.md)는 Account State Machine을 명시한다.
- [Notification 컨텍스트](../contexts/notification.md)는 block/mute 대상 새 Notification Item을 생성하지
  않는다고 명시한다.
