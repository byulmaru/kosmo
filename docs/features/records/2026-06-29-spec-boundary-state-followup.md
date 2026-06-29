# 2026-06-29 명세 경계와 상태 후속 결정 기록

## 배경

서브에이전트 검수 후 남은 Media 접근 정책 소유권, Media 기술 세부의 위치, Follow Relationship 상태,
Account 상태 기계, Notification 생성 억제 정책을 제품 방향 질문으로 확인했다. 답변은
[ADR 0007](../decisions/0007-spec-boundary-and-state-clarifications.md)에 장기 결정으로 남겼다.

## 질문별 결정

1. Media 접근 정책 소유권은 Media가 URL 발급/프록시/변환만 소유하고, 접근 가능 여부 원본 판단은
   Publishing, Identity, Trust & Safety가 소유하는 방향으로 확정했다.
2. MIME type, Hash, EXIF 처리, 파생 이미지 생성 방식 같은 Media 기술 세부는 구현/OpenSpec으로 내리고
   contexts에는 검증 정책만 남긴다.
3. Follow Relationship 상태는 요청 대기, 수락, 거절만 도메인 명세에 둔다. 요청 취소, 언팔로우, 차단
   삭제의 이력 보존 방식은 구현 스펙으로 분리한다.
4. Account State Machine을 Identity에 둔다. Account State는 활성, 정지, 삭제됨 세 상태를 가진다.
5. block, mute, Muted Thread에 걸린 새 Notification Item은 생성하지 않는다. 기존 Notification Item은
   삭제하거나 읽음 상태를 바꾸지 않는다.

## 문서 반영 원칙

- `records/`는 이 결정 과정의 이력으로 보존한다.
- 현재 canonical 명세는 `contexts/`와 accepted ADR을 기준으로 읽는다.
- 구체 파일 형식, 파일 크기 수치, Hash, EXIF 처리, 파생 이미지 생성 방식은 도메인 명세 본문에 다시
  넣지 않는다.
