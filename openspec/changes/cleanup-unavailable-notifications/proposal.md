## Why

필수 source 또는 Recipient 기준 Related 객체가 unavailable인 Notification은 API에서 즉시 숨겨지지만 저장 row와 Read State는 남는다. PROD-328은 visibility 계약을 바꾸지 않고 이 orphan row를 작은 반복 작업으로 물리 정리한다.

## What Changes

- 활성 Temporal Schedule이 cleanup Workflow를 대략 하루에 한 번 시작한다.
- 각 Workflow 실행은 현재 unavailable인 Notification을 한 번의 bounded batch로 삭제한다.
- 삭제 시점에 availability를 다시 확인해 회복된 row를 보존한다.
- Schedule이 없으면 활성 상태로 만들고, 이미 있으면 변경하지 않는다.
- structured log와 Temporal 기본 실행 상태만 사용한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`
- Linear Contract: `PROD-328`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: unavailable Notification을 한 번에 제한된 수만 삭제하고, 반복 실행으로 best-effort 수렴한다.

## Impact

- `apps/worker`: bounded cleanup Activity와 단일 Activity Workflow
- `apps/helm`: 활성 Schedule을 create-if-missing 하는 one-shot Job
- 외부 GraphQL schema와 앱 UI에는 변경이 없다.
