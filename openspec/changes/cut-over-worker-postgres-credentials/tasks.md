# Tasks

## 1. Historical Worker selector 준비

### Deliverable

PR #564가 당시 `worker` 역할 URL/password trio baseline을 준비하고 legacy Fedify selector를 제거했다. 이 historical seam은 2단계의 최신 최소 selector가 대체한다.

### Guardrails

- Secret value를 values나 manifest에 넣지 않는다.
- 이 단계의 URL/password Secret name/key partial validation은 historical evidence이며 최신 Worker 입력 계약이 아니다.
- legacy `fedify` key 전용 fail이나 alias를 추가하지 않는다.

### Verification

- 당시 Worker trio의 complete/partial/absent render를 비교한다.
- legacy input이 Worker source로 소비되지 않는지 확인한다.

- [x] 1.1 PROD-709 capability spec이 sync/archive되어 modified delta baseline이 존재하는지 확인한다.
- [x] 1.2 historical `worker` atomic trio를 구현하고 legacy `fedify` 전용 validation을 제거한다.
- [x] 1.3 Web과 기본 비활성 Worker component에 Worker selector env seam을 준비한다.
- [x] 1.4 selector 조합·rollback·partial failure·legacy 비소비·API/migration 음성 경계를 검증한다.

Evidence (2026-08-10): PR #564 merge `2c65b6dc`; Helm selector matrix, partial failure, legacy 비소비, API env 부재와 migration 불변을 검증했다. 별도 `WORKER_DATABASE_*` seam은 이번 change의 최신 기본 DB 계약에 따라 제거 대상이다.

## 2. Web/Temporal Worker 기본 DB principal 전환

### Authority / Provenance

- Linear `PROD-715`
- Related boundary: `PROD-716`, canceled `PROD-710`, `PROD-448`

### Deliverable

Web과 활성화된 Temporal Worker workload의 process 기본 `DATABASE_*`가 최소 Worker selector와 chart-derived URL을 사용하고, selector-off에서는 승인된 owner source로 독립 rollback한다.

### Guardrails

- 완료된 PROD-369 role/Secret과 PROD-724 application CRUD ACL을 그대로 소비한다.
- 별도 `WORKER_DATABASE_*` application pool/handle, request-owned client 또는 Fedify DB context를 만들지 않는다.
- application SQL, 전역 `db`, API `DATABASE_*`/`OPERATION_DATABASE_*`, migration과 queue database를 변경하지 않는다.
- API Rollout에 Worker Secret/env를 주입하지 않는다.
- 인증 실패 중 owner connection으로 자동 fallback하지 않는다.

### Verification

- default, API-only, Worker-only, 양쪽과 Worker rollback render를 비교한다.
- Web/Worker 기본 `DATABASE_*`만 Worker source를 사용하고 API/migration/queue documents가 불변인지 확인한다.
- 어떤 workload에도 `WORKER_DATABASE_*`가 없고 API에 Worker Secret ref가 없는지 확인한다.
- 활성 Worker selector의 partial/missing Secret ref가 source 이름을 포함해 실패하고, 비활성 selector의 남은 Secret ref가 owner rollback을 막지 않는지 확인한다.

- [x] 2.1 최신 Linear에서 PROD-369/724/709 완료와 PROD-710 취소, 역할·ACL·selector 경계를 독립 확인한다.
- [x] 2.2 Web/Worker 기본 DB URL/password helper와 template wiring을 구현하고 별도 Worker env를 제거한다. 사용자 단순화 결정에 따라 Worker 임의 URL을 제거하고 `enabled` + password Secret ref와 chart-derived URL로 줄인다.
- [x] 2.3 selector matrix·rollback·partial failure·API/migration/queue 음성 경계를 검증한다.
- [x] 2.4 적용되는 운영 문서와 OpenSpec artifacts를 최신 기본 DB 계약으로 정렬한다.

Evidence (2026-08-14): default/API-only/Worker-only/both selector render에서 Web/Worker 기본 `DATABASE_*` source와 owner rollback을 확인했다. 최종 단순화에서는 Worker 임의 URL을 제거하고 `enabled` + password Secret ref만 남겼으며, 활성 selector가 chart-derived `kosmo_worker` PgBouncer URL을 사용하고 비활성 selector의 남은 partial Secret ref도 owner rollback을 막지 않는지 확인했다. 어떤 workload에도 `WORKER_DATABASE_*`가 없고 API에는 Worker Secret ref가 없으며, migration과 Fedify consumer documents는 Worker selector 전후 byte-identical하고 `FEDIFY_QUEUE_DATABASE_*`는 `kosmo_fedify_queue` source를 유지한다. dev/prod Helm lint, 관련 change strict와 전체 OpenSpec strict 98/98, Prettier와 diff check를 통과했다.

## 3. 비운영 integration과 completion

### Deliverable

merge된 exact revision의 비운영 환경에서 Web의 실제 Worker principal과 대표 application SQL을 확인하고 Worker manifest가 같은 source를 사용하는지 검증한 뒤 change를 완료한다.

### Guardrails

- PR readiness와 OpenSpec 전체 완료를 분리한다.
- PR/CI/render는 live principal 증거가 아니다.
- Worker foundation이 business DB connection을 열지 않는 상태를 억지로 바꾸거나 진단용 runtime connection을 추가하지 않는다.
- production sync/apply/cutover/live verification은 별도 사용자 승인 없이는 수행하지 않는다.

### Verification

- exact deployed revision, Argo/rollout readiness와 Web `current_user = 'kosmo_worker'`, `rolbypassrls = true`, 대표 CRUD를 확인한다.
- Worker Deployment의 기본 Secret/URL source, API Worker Secret 부재와 `kosmo_fedify_queue` 분리를 확인한다.
- selector-off rollback manifest가 Web/Worker만 owner source로 되돌리고 API/migration/queue를 유지하는지 재확인한다.

- [ ] 3.1 Ready PR merge 뒤 비운영 exact revision과 workload readiness를 확인한다.
- [ ] 3.2 Web live principal·대표 SQL과 Worker manifest/API·queue 음성 경계를 검증한다.
- [ ] 3.3 Active specs를 동기화하고 change를 archive한 뒤 전체 OpenSpec strict validation을 통과한다.
- [ ] 3.4 완료 evidence를 Linear에 남기고 PROD-715 상태를 갱신한다.

## 4. Production 운영 절차

Production sync/apply/cutover/live verification은 이 change의 구현·archive 완료 조건이 아니다. 별도 사용자 승인을 받은 운영 절차에서 exact production diff, Vault source metadata, rollback 입력과 live query를 다시 제시하고 승인된 범위만 수행한다.
