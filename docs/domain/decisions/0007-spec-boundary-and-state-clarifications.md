# ADR 0007: Spec Boundary and State Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

서브에이전트 검수 후 남은 도메인 경계와 상태/알림 정책을 다음처럼 확정한다.

- Media는 URL 발급, Media Proxy, 파일 원본, 파생 이미지, 변환 결과 제공을 소유한다.
- Media는 Media 접근 권한의 원본 판단을 소유하지 않는다. Post Media 접근 판단은 [Post](../objects/post.md)의
  Post Visibility와 Post Eligibility를 따르고, Profile Media 접근 판단은 [Profile](../objects/profile.md)의
  표현 정책을 따른다. [Instance](../objects/instance.md)의 safety 상태 결과는 Media 접근 결과에 반영된다.
  Instance reachability 상태는 새 원격 fetch와 원본 재검증 요청 여부에만 반영된다.
- Media는 파일 검증 정책을 가진다. 구체 MIME type, Hash, EXIF 처리, 파일 크기 수치, 파생
  이미지 생성 방식 같은 기술 세부는 도메인 명세가 아니라 구현/OpenSpec에서 다룬다.
- Follow Relationship은 요청 대기 상태를 갖지 않고 성립된 팔로우 관계만 표현한다. 요청 대기, 수락, 거절은
  [Follow Request](../objects/follow-request.md)의 Follow Request State로 둔다. 요청 취소, 언팔로우, 차단
  삭제의 이력 보존 방식은 도메인 상태로 확장하지 않고 구현 스펙으로 분리한다.
- [Account](../objects/account.md)는 Account State를 소유한다. Account State는 활성, 정지, 삭제됨 세
  상태를 가진다.
- Account 정지와 정지 해제는 운영자 Account의 action 결과다.
- Account 삭제 전에는 Account-Profile 관계가 모두 정리되어야 하며, 그 과정에서 어떤 Profile의 마지막
  `Owner`도 제거할 수 없다.
- block, mute, Muted Thread에 걸린 새 Notification Item은 생성하지 않는다.
- block, mute, limit, suspend가 발생해도 기존 Notification Item은 삭제하거나 읽음 상태를 바꾸지 않는다.

## 문서 반영

- [Media](../objects/media.md)와 [File](../objects/file.md)은 파일 표현과 Media Proxy를 소유하고 접근
  권한 원본 판단은 참조 정책으로 분리한다.
- [Follow Relationship](../objects/follow-relationship.md)은 성립된 팔로우 관계만 다룬다.
- [Follow Request](../objects/follow-request.md)는 요청 대기, 수락, 거절 상태를 다룬다.
- [Account](../objects/account.md)는 Account State와 상태 변경 행동을 명시한다.
- [Notification Item](../objects/notification-item.md)은 block/mute 대상 새 Notification Item을 생성하지
  않는다고 명시한다.
