## Context

Notification은 loose `source_id`를 가지므로 unavailable row가 남을 수 있다. API와 cleanup은 이미 core로 공통화한 viewer-independent source·Related availability predicate를 함께 사용한다.

## Goals / Non-Goals

**Goals:**

- 한 실행의 DB 작업을 작은 batch로 제한한다.
- 삭제 경계에서 unavailable을 다시 확인한다.
- 반복 Schedule 실행으로 backlog가 best-effort 수렴하게 한다.

**Non-Goals:**

- 한 실행에서 전체 backlog 완료
- cursor, checkpoint, continue-as-new, rate limit
- 정확한 실행별 삭제 개수 또는 처리량 회계
- custom metrics와 별도 metrics endpoint
- 기존 Schedule drift 교정 또는 pause 상태 관리

## Implementation Guidance

Activity는 unavailable predicate로 최대 batch size의 Notification ID를 고르고, 같은 transaction의 delete 조건에서 ID와 unavailable predicate를 다시 확인한다. Workflow는 이 Activity를 한 번 호출한다. Activity 응답이 commit 뒤 유실되어 retry가 다음 batch를 추가 삭제해도 허용한다.

Schedule command는 deterministic ID로 24시간 interval, cleanup Workflow, 공용 task queue와 `SKIP` overlap을 가진 활성 Schedule을 생성한다. 이미 같은 ID가 있으면 아무것도 바꾸지 않는다.

## Known Traps

- 전체 API visibility를 부정해 Recipient 자체 inactivity를 삭제 원인으로 삼지 않는다.
- candidate ID만 믿고 availability 재확인 없이 삭제하지 않는다.
- 한 Workflow에서 반복 loop를 만들지 않는다.
- 기존 Schedule을 update, pause 또는 unpause하지 않는다.

## Risks / Trade-offs

- available row가 대부분이면 candidate 조회가 비쌀 수 있다. 우선 bounded transaction으로 운영하고 실제 근거가 생길 때 index나 event-driven 구조를 별도 검토한다.
- retry가 한 Schedule 실행에서 batch size보다 더 많이 삭제할 수 있다. 정확한 개수는 요구사항이 아니며 available row 보존만 보장한다.
- 실행이 누락되면 수렴이 다음 실행까지 늦어진다. API 즉시 숨김은 cleanup과 독립이다.

## Migration Plan

1. #665에서 bounded Activity와 단일 Activity Workflow를 구현한다.
2. #666에서 create-if-missing Schedule Job을 활성 상태로 배포한다.
3. focused tests와 dev 실행으로 삭제 안전성 및 Schedule 생성을 확인한다.

## Open Questions

없음.
