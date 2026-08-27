## Why

필수 원인 관계가 없거나 Recipient 기준 Related Post/Profile을 조회할 수 없어진 Notification은 API에서 즉시 숨겨지지만, 저장 row와 Read State는 남아 장기 orphan이 될 수 있다. PROD-328은 이미 확정된 visibility 계약을 바꾸지 않으면서, 24시간 주기의 Temporal Schedule이 이 row들을 best-effort로 반복 가능하고 재시작 가능하게 물리 정리하는 운영 경계를 추가한다.

## What Changes

- Temporal Schedule이 bounded cursor page 단위의 cleanup Workflow를 주기적으로 시작한다.
- Worker Activity가 canonical Notification visibility/source 계약에 따라 unavailable row를 다시 판정하고 멱등 삭제한다.
- source missing, source/Recipient 불일치와 Related Post/Profile 비가시성을 같은 generic cleanup 대상으로 처리한다.
- Recipient Profile 자체의 복구 가능한 일시 비활성화·정지만으로는 row를 삭제하지 않는다.
- retry, timeout, heartbeat, rate limit와 checkpoint를 통해 Worker 종료·DB 일시 장애·부분 page 실패 뒤에도 수렴한다.
- schedule/run/page 상관관계와 실행 성공·실패, scanned/deleted/skipped/error 수 및 page duration을 관측하고 dev에서 schedule, restart, retry와 대량 page를 검증한다.
- API connection, Unread count, Node와 Read mutation의 즉시 숨김 계약은 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`
- Linear Contract: `PROD-328`
- Linear Implementations: `PROD-328`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: 기존 unavailable Notification의 즉시 비노출 계약에 24시간 주기의 bounded, 멱등, 재시작 가능한 best-effort Temporal 물리 cleanup과 관측 계약을 추가한다.

## Impact

- `packages/core`: API와 Worker가 공유하는 viewer-independent Notification source/related availability predicate
- `apps/worker`: Notification cleanup candidate 판정, bounded page와 조건부 멱등 삭제 저장 경계 및 cleanup Workflow/Activity 등록, retry·timeout·heartbeat·관측
- `apps/helm`: 환경별 Temporal Schedule provisioning과 Worker cleanup 설정
- 테스트: Worker DB integration, Temporal Workflow integration, Worker 재시작·부분 실패·대량 backlog·Helm render/dev 검증
- 외부 GraphQL schema와 앱 UI에는 변경이 없다.
