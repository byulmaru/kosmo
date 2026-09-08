## 1. PROD-328 공통 availability 계약 — PR [#661](https://github.com/byulmaru/kosmo/pull/661)

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)

**Deliverable**

API의 connection, count, Node와 Read가 공통 availability 계약을 사용하고 Recipient Profile 자체의 복구 가능한 inactive/suspended 상태는
cleanup 대상에서 제외한다. 구현·검증 소유: PR #661.

**Guardrails**

- cleanup 지연·실패와 관계없이 API는 unavailable Notification을 즉시 숨긴다.
- Recipient Profile 자체의 일시 비활성화·정지만으로 Notification을 물리 제거하지 않는다.

**Verification**

- API connection, count, Node와 Read의 기존 visible 결과와 API·cleanup 경계를 확인한다.

- [x] 1.1 viewer-independent source·Related availability SQL을 core 경계로 공통화한다.
- [x] 1.2 API connection, count, Node와 Read가 기존 결과를 유지하는지 검증한다.
- [x] 1.3 Recipient 자체 inactive/suspended는 API에서 숨기되 cleanup 대상에서 제외한다.

## 2. PROD-328 Bounded cleanup 실행 — PR [#665](https://github.com/byulmaru/kosmo/pull/665)

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)

**Deliverable**

한 Workflow 실행이 unavailable Notification을 한 bounded batch로 정리하고, retry·반복 실행 뒤에도 available 및 대상 외 row를 보존한다.
구현·검증 소유: PR #665.

**Guardrails**

- 삭제 경계에서 source 및 Recipient 기준 Related availability를 다시 확인해 회복된 row를 삭제하지 않는다.
- Recipient Profile 자체의 복구 가능한 일시 비활성화·정지는 cleanup 대상에서 제외한다.
- 실행별 정확한 삭제 개수와 전체 backlog의 단일 실행 완료를 보장하지 않는다.

**Verification**

- source missing·mismatch·Related unavailable 삭제, available·Recipient inactive 보존과 retry·반복 실행 경계를 DB/Workflow test로 확인한다.

- [x] 2.1 Activity가 unavailable candidate를 한 bounded batch만 선택한다.
- [x] 2.2 같은 transaction의 delete 조건에서 ID와 unavailable을 다시 확인한다.
- [x] 2.3 Workflow는 cleanup Activity를 한 번만 호출한다.
- [x] 2.4 source missing·mismatch·Related unavailable 삭제와 available·Recipient inactive 보존을 DB test로 검증한다.
- [x] 2.5 cursor, checkpoint, loop, rate limit, custom metrics와 관련 테스트를 제거한다.

## 3. PROD-328 Schedule 연결 — PR [#666](https://github.com/byulmaru/kosmo/pull/666)

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- [PROD-719](https://linear.app/byulmaru/issue/PROD-719/kosmo-temporal-logical-namespace를-presync에서-프로비저닝한다)
- [PROD-730](https://linear.app/byulmaru/issue/PROD-730/kosmo-temporal-worker-runtime-foundation을-준비한다)

**Deliverable**

namespace가 준비된 뒤 Worker 시작 시 환경별 deterministic ID로 활성 Schedule을 create-if-missing 하고 기존 Schedule을 보존한다. 등록 실패는 structured log로 남기고 Worker 시작을 계속하며, 다음 Worker 시작 때 다시 시도한다. 구현·검증 소유: PR #666.

**Guardrails**

- missing Schedule은 24시간 기본 interval과 `SKIP` overlap으로 활성 생성한다.
- existing Schedule의 timing, action, overlap과 pause 상태를 변경하지 않는다.
- best-effort 주기를 drift reconciliation이나 정확한 실행 간격 보장으로 해석하지 않는다.
- Worker metrics endpoint와 Helm metrics metadata를 추가하지 않는다.
- Schedule 전용 Helm PreSync Job과 별도 CLI 진입점을 사용하지 않는다.

**Verification**

- Worker 시작 시 Schedule create/already-exists 경계, active 상태·Workflow 연결과 기존 Schedule 보존을 확인한다.
- Schedule 등록 실패가 structured log를 남기고 Worker 시작을 계속하며, 다음 시작에서 재시도되는지 확인한다.

- [x] 3.1 missing Schedule을 24시간 기본 interval과 `SKIP` overlap으로 활성 생성한다.
- [x] 3.2 existing Schedule은 아무것도 변경하지 않는다.
- [ ] 3.3 namespace가 준비된 뒤 Worker 시작 시 Schedule을 등록하고, 등록 실패 시 시작을 계속하며 다음 시작에서 재시도한다.
- [x] 3.4 pause/enabled reconciliation, Worker metrics endpoint와 Helm metrics metadata를 제거한다.
- [ ] 3.5 Worker 시작의 create/already-exists/등록 실패 경계를 의미 있는 동작 test로 검증한다.

## 4. PROD-328 통합 검증과 OpenSpec archive — PR [#666](https://github.com/byulmaru/kosmo/pull/666)

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- [PROD-328](https://linear.app/byulmaru/issue/PROD-328/unavailable-notification을-비동기-정리한다)
- `memory/issue-openspec-workflow.md`

**Deliverable**

PR #661·#665·#666의 전체 범위를 통합 검증하고 최신 계약·canonical 문서·delta spec이 정합할 때 change를 archive한다.
통합 검증·archive 소유: PR #666.

**Guardrails**

- 미완료 검증이 남아 있는 동안 PROD-328을 완료로 표시하지 않는다.
- PR readiness와 OpenSpec completion을 별도로 판단한다.
- 계약 충돌이 발견되면 canonical 문서와 Linear 계약을 먼저 정렬한 뒤 OpenSpec을 갱신한다.

**Verification**

- focused Worker/DB/Worker-start Schedule/Helm·workspace 검증, dev 동작, 전체 task·delta spec 정합성과 `openspec validate --strict`를 확인한다.

- [ ] 4.1 focused Worker/DB/Worker-start Schedule/Helm 검증과 workspace 필수 검증을 실행한다.
- [ ] 4.2 dev에서 API 즉시 비노출과 cleanup 삭제, available row 보존을 확인한다.
- [ ] 4.3 dev에서 active Schedule 생성과 Workflow 실행 상태를 확인한다.
- [x] 4.4 최신 Linear 계약과 OpenSpec artifacts를 동기화한다.
- [ ] 4.5 전체 범위 완료 뒤 strict validation과 canonical sync를 확인하고 change를 archive한다.

> Archive note (2026-09-08): 이 change는 명시적인 사용자 승인에 따라 canonical spec 동기화 뒤 보관한다. 3.3, 3.5, 4.1, 4.2, 4.3, 4.5의 미완료 표시는 유지하며, archive 자체는 PROD-328 완료나 dev 배포·실행 증명을 의미하지 않는다. Worker 시작 경계 직접 검증은 미실행 후속 항목으로 남기고, dev 동작 확인은 merge·배포 이후 수행한다.
