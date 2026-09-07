## Context

이 기록은 `docs/domain/objects/notification.md`와 최신 `PROD-328`을 입력으로 cleanup의 최소 실행 계약을 남긴다.

## Decision Records

### cleanup 대상은 source·Related availability 실패로 한정한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: missing source, source/Recipient 불일치와 Recipient 기준 Related Post/Profile unavailable만 삭제한다. Recipient 자체의 일시 비활성·정지는 삭제 원인에서 제외한다.
- Consequences: API와 cleanup은 viewer-independent availability predicate를 공유하고, cleanup은 삭제 경계에서 이를 다시 확인한다.

### 각 Schedule 실행은 한 bounded batch만 시도한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: Workflow는 bounded cleanup Activity를 한 번 호출한다. 전체 sweep, cursor, checkpoint, continue-as-new와 rate limit은 두지 않는다.
- Alternatives Considered: 한 Workflow가 전체 backlog를 순회하는 구조는 필요한 보장보다 복잡해 사용하지 않는다.
- Consequences: backlog는 Schedule 반복 실행으로 best-effort 수렴한다.

### 실행별 정확한 삭제 개수는 보장하지 않는다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: Activity retry가 commit 뒤 다음 batch를 추가 삭제하거나 응답 유실로 관측 개수가 달라져도 허용한다.
- Alternatives Considered: Schedule 실행별 idempotency ledger는 이 cleanup의 정확성에 필요하지 않아 추가하지 않는다.
- Consequences: available row 보존과 bounded DB 시도는 유지하지만 실행별 처리량은 회계값이 아니다.

### Worker 시작 시 Schedule은 create-if-missing 하고 즉시 활성화한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: Worker 시작 시 missing Schedule은 24시간 기본 interval로 활성 생성한다. 기존 Schedule은 timing, action, overlap과 pause 상태를 포함해 그대로 둔다.
- Alternatives Considered: paused 생성과 drift reconciliation은 운영 요구가 아니므로 제거한다.
- Consequences: dev/prod 모두 같은 Worker 시작 등록 동작을 사용하며, 이후 변경은 운영자가 소유한다.

### Schedule 등록 실패는 Worker 시작을 막지 않는다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: Worker 시작 시 Schedule 등록이 실패하면 실패를 structured log에 남기고 Worker 시작을 계속한다. 다음 Worker 시작에서 등록을 다시 시도한다.
- Alternatives Considered: Schedule 등록 실패로 Worker 시작을 중단하거나 별도 지속 retry loop를 두는 방식은 cleanup이 best-effort라는 범위보다 강하고 Worker liveness를 Schedule 등록에 결합하므로 사용하지 않는다.
- Consequences: 일시적인 Temporal 오류가 있으면 Schedule이 다음 Worker 시작 전까지 없을 수 있다. cleanup의 즉시 실행은 보장하지 않으며 별도 등록 retry 프로세스도 두지 않는다.
- Confirmation / Follow-up: Worker 시작의 등록 실패 경로가 log를 남기고 startup을 계속하는지, 이후 재시작에서 등록을 재시도하는지 test와 dev 실행으로 확인한다.

### 관측은 structured log와 Temporal 기본 상태만 사용한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- Status: Active
- Decision Outcome: Activity 결과를 structured log에 남기고 Workflow/Schedule 성공·실패는 Temporal 기본 상태로 확인한다.
- Alternatives Considered: cleanup 전용 counter, histogram, Prometheus endpoint와 scrape metadata는 요구사항이 아니므로 제거한다.
- Consequences: 별도 처리량 대시보드나 정확한 삭제 회계는 제공하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-25~28의 cursor sweep, checkpoint, rate limit, custom metrics, Schedule drift/pause reconciliation 결정은 2026-09-04 사용자 결정으로 대체됐다.
