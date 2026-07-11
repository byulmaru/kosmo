# ADR 0007: Spec Boundary and State Clarifications

## 상태

Accepted

## 날짜

2026-06-29

## 결정

- Media 접근 결과는 연결 Post 또는 Profile의 조회 정책을 따른다. Remote Media의 Instance 상태는 Media의
  Remote Profile 관계에서 파생한다.
- Media URL과 File 저장 위치는 영구 도메인 속성이 아니다.
- File 형식, Hash, EXIF, 크기 제한, 이미지 생성 방식은 구현/OpenSpec에서 다룬다.
- Follow Relationship은 성립된 관계만 표현하고 Follow Request는 Pending/Accepted/Rejected 상태를 가진다.
- Follow Request 승인/거절/취소는 Pending 상태에만 적용한다.
- Account State는 Active, Suspended, Deleted 값을 가지며 Deleted는 terminal 상태다.
- Account 정지/해제는 운영자 행동이고 삭제는 마지막 Profile Owner를 제거하지 않을 때만 가능하다.
- Notification Item은 Read State와 Notification Type을 가진다.
- Follow Request Notification 표시는 원본 Follow Request State에서 파생하며 별도 처리 상태를 복제하지 않는다.
- Pending Follow Request 취소는 대응하는 Follow Request Notification Item을 제거한다.
- Post Notification Mute, Profile Mute/Block, 개인 Domain Block에 걸린 새 Notification Item은 만들지 않는다.
- 기존 Notification Item은 이후 제어 객체나 Instance 상태가 바뀌어도 삭제하거나 Read State를 바꾸지 않는다.
- 물리 색인 유지/삭제, 원격 delivery 실패, 재시도, 동기화 순서는 구현/연합 스펙으로 분리한다.

## 문서 반영

- [Media](../objects/media.md)와 [File](../objects/file.md)은 도메인 표현과 구현 저장 경계를 구분한다.
- [Follow Relationship](../objects/follow-relationship.md)과 [Follow Request](../objects/follow-request.md)는
  각자의 생명주기를 정의한다.
- [Account](../objects/account.md)은 terminal 상태를 포함한 상태 Mutation 조건을 정의한다.
- [Notification Item](../objects/notification-item.md)은 원본 객체 상태를 복제하지 않는다.
