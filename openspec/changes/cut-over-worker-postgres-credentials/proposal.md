## Why

Web의 trusted federation ingress와 Temporal Worker DB Activity는 owner credential에서 분리된 비소유 `kosmo_worker` 실행 경계가 필요하다. PROD-715는 완료된 PROD-709의 Fedify 전용 selector 명칭을 실제 신뢰 실행 경계인 Worker로 정정하고, API/Web BFF 기본 연결과 독립적으로 전환·rollback할 수 있게 한다.

## What Changes

- `postgres.credentials.fedify`와 `FEDIFY_DATABASE_*` seam을 `postgres.credentials.worker`와 `WORKER_DATABASE_*`로 migration한다.
- Worker selector의 atomic URL·password Secret trio를 Web Rollout의 trusted federation ingress와 Temporal Worker Deployment에만 주입하되, 이를 실제 `kosmo_worker` credential이 아닌 기존 owner/password fallback source로 유지한다.
- PROD-470이 제공하는 Worker client certificate selector·mount·connection parameter를 PROD-710의 명시적 Worker connection seam과 이전된 SQL callsite에 wiring해 Web trusted federation ingress와 Temporal Worker DB Activity가 password 없는 `kosmo_worker` credential을 사용하게 한다.
- API Rollout에는 Worker credential을 주입하지 않고, API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD`는 기존 owner/API selector 경계를 유지한다.
- `kosmo_worker` certificate source만 독립적으로 선택하거나 기존 owner/password fallback으로 되돌릴 수 있게 하며, production 전환은 PROD-369 역할·certificate, PROD-470 certificate authentication, PROD-724 객체 GRANT, PROD-710 명시적 connection/SQL 경계가 준비된 뒤 별도 사용자 승인으로 수행한다.
- **BREAKING** Helm values와 workload runtime의 아직 미전환된 `fedify` selector/`FEDIFY_DATABASE_*` 이름을 제거하고 `worker`/`WORKER_DATABASE_*`로 대체한다. PROD-709 seam은 production credential cutover 전이므로 구·신 이름을 병행 지원하지 않는다.
- Temporal domain Workflow, Fedify MessageQueue runtime(PROD-448), API/Web BFF `kosmo_api` cutover(PROD-716), 역할·certificate 발급(PROD-369), `pg_hba`·certificate mount와 공통 TLS connection 구현(PROD-470), 객체 GRANT 생성과 production sync/apply는 포함하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. Workload credential과 trusted DB execution connection은 내부 배포·보안 경계다.
- Linear Contract: `PROD-715`
- Linear Implementations: `PROD-715`
- Required predecessors: `PROD-369`, `PROD-470`, `PROD-724`, `PROD-710`, 완료된 `PROD-709`
- Related foundation: 완료된 `PROD-730`; 취소된 `PROD-706`의 실제 caller 책임은 `PROD-710`으로 이동했다.

## Capabilities

### New Capabilities

- `worker-postgres-credential-cutover`: Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 `kosmo_worker` client-certificate connection, 독립 cutover·rollback 및 production 검증 계약.

### Modified Capabilities

- `workload-postgres-credential-selection`: `fedify` selector와 `FEDIFY_DATABASE_*`를 `worker` selector와 `WORKER_DATABASE_*`로 대체하고 Web trusted ingress와 Worker에만 투영한다.
- `temporal-worker-runtime-foundation`: 기본 비활성 Worker Deployment가 API/Fedify 입력 대신 기본 `DATABASE_*`와 Worker 전용 `WORKER_DATABASE_*` 입력을 받도록 역할 명칭을 정렬한다.

## Impact

- `apps/helm/values.yaml`, `apps/helm/templates/_helpers.tpl`, `apps/helm/templates/web/rollout.yaml`, `apps/helm/templates/worker.yaml`: Worker selector validation과 env 투영.
- Web trusted federation ingress bootstrap과 Temporal Worker DB Activity bootstrap: PROD-710이 제공한 명시적 Worker connection factory/handle에 PROD-470의 Worker certificate input을 wiring한다. Connection 경계와 SQL callsite 이전 자체는 PROD-710, certificate selector·mount·`pg_hba`와 공통 TLS parameter 구현은 PROD-470의 선행 결과다.
- 관련 Helm render, Web ingress, Worker Activity 테스트: API 비주입, 기본 연결 불변, partial trio 거부, Worker-only rollback, `current_user`/`rolbypassrls` production 검증 절차.
- PROD-369/470/724/710 blocker가 남아 있는 동안 OpenSpec·Helm 역할명 seam migration처럼 독립 검증 가능한 준비만 진행하며 실제 credential cutover와 live connection 검증은 완료 처리하지 않는다.
- production sync/apply는 이 change나 PR의 merge·CI로 승인되지 않으며 사용자의 별도 명시적 승인 없이는 수행하지 않는다.
