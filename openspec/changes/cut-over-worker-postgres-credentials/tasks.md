# Tasks

## 1. Historical Worker selector 준비

### Deliverable

PR #564가 당시 `worker` 역할 URL/password trio baseline을 준비하고 legacy Fedify selector를 제거했다. 이 historical seam은 2단계에서 process-wide 표준 PG source와 values selector 없는 고정 workload source로 대체한다.

### Guardrails

- Secret value를 values나 manifest에 넣지 않는다.
- 이 단계의 URL/password Secret name/key partial validation은 historical evidence이며 최신 Worker 입력 계약이 아니다.
- legacy `fedify` key 전용 fail이나 alias를 추가하지 않는다.

### Verification

- 당시 Worker trio의 complete/partial/absent render를 비교한다.
- legacy input이 Worker source로 소비되지 않는지 확인한다.

- [x] 1.1 PROD-709 capability spec이 sync/archive되어 modified delta baseline이 존재하는지 확인한다.
- [x] 1.2 historical `worker` atomic trio를 구현하고 legacy `fedify` 전용 validation을 제거한다.
- [x] 1.3 Web과 당시 기본 비활성 Worker component에 Worker selector env seam을 준비한다.
- [x] 1.4 selector 조합·rollback·partial failure·legacy 비소비·API/migration 음성 경계를 검증한다.

Evidence (2026-08-10): PR #564 merge `2c65b6dc`; Helm selector matrix, partial failure, legacy 비소비, API env 부재와 migration 불변을 검증했다. 별도 `WORKER_DATABASE_*` seam은 이번 change의 최신 기본 DB 계약에 따라 제거 대상이다.

## 2. Web/Temporal Worker 기본 DB principal 전환

### Authority / Provenance

- Linear `PROD-715`
- Related boundary: `PROD-716`, canceled `PROD-710`, `PROD-448`

### Deliverable

Web과 enabled Temporal Worker workload의 process 기본 DB가 values selector 없이 chart-derived 표준 PG env Worker source를 사용하고, Git revert로 승인된 owner source에 rollback한다. 기존 `workloads.enabled && worker.enabled` activation gate는 유지한다.

### Guardrails

- 완료된 PROD-369 role/Secret과 PROD-724 application CRUD ACL을 그대로 소비한다.
- 별도 `WORKER_DATABASE_*` application pool/handle, request-owned client 또는 Fedify DB context를 만들지 않는다.
- application SQL과 전역 `db` handle 구조는 변경하지 않는다. process 기본 DB만 표준 `PG*`로 통일하고 operation/queue secondary connection과 production migration role 경계는 유지한다.
- API Rollout에 Worker Secret/env를 주입하지 않는다.
- 인증 실패 중 owner connection으로 자동 fallback하지 않는다.

### Verification

- default와 legacy API selector/trio 제거, PROD-715 적용 전후와 Git revert render를 비교한다.
- API/Fedify consumer/dev migration owner `PG*`와 Web/enabled Worker Worker `PG*` env가 각각의 고정 source를 사용하고 operation/queue secondary documents가 정합한지 확인한다.
- process-wide workload에 `DATABASE_URL`/`DATABASE_PASSWORD`, `WORKER_DATABASE_*`, `FEDIFY_DATABASE_*`, `hasComplete...` 또는 충돌하는 `PG*` key가 없고 API에 Worker Secret ref가 없는지 확인한다.
- Worker credential values가 없고 표준 `PG*` env/Secret ref가 PROD-369 release naming에서 함께 생성되는지 확인한다.
- default `worker.enabled=false` render에서 Worker ServiceAccount/Deployment와 Worker restart target이 부재하고, 명시적으로 `worker.enabled=true`를 준 render에서만 Worker ServiceAccount/Deployment·direct source·Worker restart target이 존재하는지 확인한다.

- [x] 2.1 최신 Linear에서 PROD-369/724/709 완료와 PROD-710 취소, 역할·ACL·selector 경계를 독립 확인한다.
- [x] 2.2 Web과 enabled Worker 기본 DB의 표준 `PG*` env와 Secret ref wiring을 구현하고 별도 Worker env를 제거한다. 사용자 단순화 결정에 따라 Worker values selector 전체를 제거하고 source를 chart-derived 값으로 고정한다.
- [x] 2.3 고정 Worker source·Git revert rollback·API/migration/queue 음성 경계를 검증한다.
- [x] 2.4 적용되는 운영 문서와 OpenSpec artifacts를 최신 기본 DB 계약으로 정렬한다.
- [x] 2.5 기존 `worker.enabled` default-disabled activation gate를 유지하고, 명시적으로 enabled된 Worker template에만 direct Worker source와 conditional Secret restart target을 연결한다.
- 2.6 이전 초안의 always-render/healthy-idle Worker runtime task는 PROD-722가 소유하는 registration·singleton lifecycle 범위로 이동했으며 PROD-715 task와 완료 evidence에서 제거한다.
- [x] 2.7 Web/Worker process 기본 DB를 `DATABASE_URL`/`DATABASE_PASSWORD` 조립 없이 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` env로 전달하고 URL 특수문자 의존을 제거한다.
- [x] 2.8 API/Fedify consumer/dev migration process 기본 DB도 owner `PG*` env로 전환하고, `postgres.credentials.api` trio 및 `hasComplete...`/`DATABASE_URL` fallback contract를 제거한다. `OPERATION_DATABASE_URL`과 `FEDIFY_QUEUE_DATABASE_URL`/password는 secondary connection으로 유지한다.

Evidence (2026-08-14): Web과 enabled Worker template의 기본 DB가 별도 Worker values 없이 chart-derived direct read-write `PGHOST`/`PGPORT`, 고정 `PGUSER`/`PGDATABASE`와 PROD-369의 release별 Worker `PGPASSWORD` Secret ref를 사용하고, DatabaseRole과 workload가 같은 Secret-name helper를 공유하는지 정적 render로 확인했다. default `worker.enabled=false` render에서는 Worker resource와 Worker restart target이 없고, 명시적 `worker.enabled=true` render에서만 Worker ServiceAccount/Deployment·direct source·Worker restart target이 존재하는지 확인했다. 어떤 workload에도 `WORKER_DATABASE_*`가 없고 API에는 Worker Secret ref가 없으며, migration과 Fedify consumer documents는 PROD-715 wiring 전후 byte-identical하고 `FEDIFY_QUEUE_DATABASE_*`는 `kosmo_fedify_queue` source를 유지한다. `worker-database` Secret 변경 시 Web Rollout은 유지되고 enabled Worker Deployment만 restart target을 사용하며, Git revert diff가 Web 기본 DB와 enabled Worker source를 pre-PROD-715 manifest로 복구하는지 확인한다. Worker runtime registration/lifecycle 또는 Worker package runtime test는 이 change의 evidence가 아니다. 관련 change strict, 운영 문서 assertion의 Helm lint/render, Prettier와 diff check를 통과했다.

Evidence (2026-08-14 follow-up): merge SHA `54ff6880` dev preview에서 raw password URL이 `ERR_INVALID_URL`로 실패함을 확인했다. 사용자 결정에 따라 Web/Worker의 URL/password 조립을 제거하고 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` env로 전환했다. Live readiness/principal 재검증은 fix 배포 뒤 3단계에서 완료한다.

Decision (2026-08-15): process-wide application DB의 source를 모든 workload에 표준 PG env 하나로 통일한다. API, Fedify consumer와 dev migration은 owner `kosmo`, Web/enabled Worker는 `kosmo_worker`를 사용한다. `postgres.credentials.api` URL/password trio와 `hasComplete...`/`DATABASE_URL` fallback은 제거 대상이며, `OPERATION_DATABASE_URL`과 `FEDIFY_QUEUE_DATABASE_URL`/password는 각각 GraphQL operation과 MessageQueue secondary boundary로 남긴다. 구현과 render/회귀 검증 evidence는 2.8에 추가한다.

Evidence (2026-08-15): process 기본 postgres.js client를 조건 없는 표준 PG env client로 단순화하고 API/Fedify consumer/dev migration Helm source를 owner `kosmo`의 direct `PG*`로 전환했다. API custom trio와 관련 helper/validation을 제거했으며 operation URL은 passwordless Pooler endpoint, queue URL/password는 별도 `kosmo_fedify_queue` source로 유지했다. 중앙 test DB wrapper가 격리 URL을 child process의 `PG*`로 투영한다. Core unit 54개·migration 19개·service 177개, API integration 228개(1 skip), Fedify suite, dev/prod Helm lint/render, OpenSpec strict 99/99, ESLint, Prettier와 diff check를 통과했다. 이는 code/render evidence이며 merge 뒤 비운영 live principal 검증을 대체하지 않는다.

## 3. 비운영 integration과 completion

### Deliverable

merge된 exact revision의 비운영 환경에서 Web의 실제 Worker principal과 대표 application SQL을 확인하고 Worker manifest가 같은 source를 사용하는지 검증한 뒤 change를 완료한다.

### Guardrails

- PR readiness와 OpenSpec 전체 완료를 분리한다.
- PR/CI/render는 live principal 증거가 아니다.
- Worker runtime registration, singleton startup/shutdown과 readiness/drain은 PROD-722 소유이며 이 change에서 변경하거나 테스트하지 않는다.
- production sync/apply/cutover/live verification은 별도 사용자 승인 없이는 수행하지 않는다.

### Verification

- exact deployed revision, Argo/rollout readiness와 Web `current_user = 'kosmo_worker'`, `rolbypassrls = true`, 대표 CRUD를 확인한다.
- enabled Worker Deployment의 기본 Secret/URL source, API Worker Secret 부재와 `kosmo_fedify_queue` 분리를 확인한다.
- Git revert manifest가 Web 기본 DB와 enabled Worker resource/source를 pre-PROD-715 상태로 되돌리고 API/migration/queue를 유지하는지 재확인한다.

- [ ] 3.1 Ready PR merge 뒤 비운영 exact revision과 workload readiness를 확인한다.
- [ ] 3.2 Web live principal·대표 SQL과 Worker manifest/API·queue 음성 경계를 검증한다.
- [ ] 3.3 이번 delta가 제거하는 기존 API/Fedify/Worker selector와 process-wide URL fallback 요구사항을 Active specs에 동기화하고 change를 archive한 뒤 전체 OpenSpec strict validation을 통과한다.
- [ ] 3.4 완료 evidence를 Linear에 남기고 PROD-715 상태를 갱신한다.

## 4. Production 운영 절차

Production sync/apply/cutover/live verification은 이 change의 구현·archive 완료 조건이 아니다. 별도 사용자 승인을 받은 운영 절차에서 exact production diff, Vault source metadata, rollback 입력과 live query를 다시 제시하고 승인된 범위만 수행한다.
