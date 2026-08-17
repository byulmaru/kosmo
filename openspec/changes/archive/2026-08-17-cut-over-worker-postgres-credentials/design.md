> **Reconciliation (PROD-780, 2026-08-17):** The owner `kosmo` source and shared-Worker target below are historical PROD-715/724 baseline claims. The current application-runtime contract uses new `kosmo_runtime LOGIN NOBYPASSRLS` standard `PG*` for API/Web/Temporal Worker/Fedify application consumers; migration owner and queue credentials remain separate. Legacy `kosmo_worker BYPASSRLS` and `kosmo_api` role/ACL/default ACL/Vault/CNPG Secret provisioning remain until PROD-782/PROD-781 respectively, and owner `kosmo` credential retirement remains PROD-712. The historical body below is preserved as implementation evidence.

## Context

PROD-709와 PR #564는 API와 Worker 역할별 password selector를 만들고 Web/Worker에 별도 `WORKER_DATABASE_*` env를 준비했다. Runtime은 이 env를 소비하지 않으며 process 기본 DB 입력이 URL과 password 조합에 의존했다.

PROD-779 이후 GraphQL Query/Mutation도 별도 operation DB session이나 `ctx.db` 없이 API process 기본 `db`를 사용한다. 모든 process-wide application workload는 별도 application pool/handle 없이 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`만 기본 DB source로 읽는다. API GraphQL, Fedify consumer, Web과 Temporal Worker는 Vault/VSO-backed `kosmo_worker` SCRAM credential을 사용하고 migration owner와 Fedify MessageQueue URL/password는 각각 별도 경계로 남긴다. 기존 Pooler resource는 이 Worker credential change에서 변경하지 않는다. PROD-369 역할/Secret과 PROD-724 공통 CRUD ACL은 dev와 production에 적용됐다.

## Goals

- API, Web, Temporal Worker와 Fedify application consumer를 포함한 process-wide 기본 DB를 chart-derived 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` shared Worker source로 통일한다. migration owner와 MessageQueue source는 각자의 별도 경계를 유지한다.
- 기존 전역 `db`, Fedify listener와 core service callsite를 보존한다.
- API GraphQL이 process 기본 표준 `PG*` source를 공유하는 경계와 migration 및 MessageQueue database/`FEDIFY_QUEUE_DATABASE_URL`을 보존한다.
- Git revert rollback과 production 승인 경계를 명확히 한다.

## Non-goals

- DatabaseRole, VaultStaticSecret과 password 생성·회전 provisioning(PROD-369).
- 객체 GRANT(PROD-724), 별도 Worker application pool/handle 또는 explicit SQL handle 이전(PROD-710).
- Fedify MessageQueue의 secondary URL/password 경계를 process 기본 DB로 합치지 않는다.
- 전용 Worker Pooler와 custom authentication.
- Vault Dynamic Secret/임시 login lease(PROD-744).
- API cutover, Worker runtime registration/singleton startup/activation lifecycle(PROD-722), Temporal domain Workflow와 Fedify MessageQueue.

## Current Constraints

- process-wide 기본 DB에는 URL, password 조합, `hasComplete...` 같은 source 선택 또는 compatibility flag가 없다. 각 template이 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`를 고정하고 해당 principal Secret의 `PGPASSWORD`만 SecretKeyRef로 투영한다.
- API, Fedify consumer, Web process와 Temporal Worker는 기존 direct read-write Service의 `kosmo_worker` `PG*` source를 공유한다. migration owner와 MessageQueue는 해당 application source를 재사용하지 않는다.
- Worker Deployment는 유효한 release image가 있는 모든 application render에 함께 렌더된다. workload activation key의 기본값이나 존재 여부로 Worker를 숨기지 않으며, `apps/worker` registration·startup·shutdown 동작은 PROD-722가 소유한다.
- API와 Fedify application consumer는 Worker source와 Worker Secret을 사용한다. `kosmo_api` role/Secret provisioning은 PROD-781까지 유지되지만 application workload consumer가 아니다.
- `kosmo_fedify_queue`는 MessageQueue 전용 별도 database/role이며 Worker principal과 무관하다.
- GraphQL은 API process 기본 표준 `PG*` connection을 사용하고 `OPERATION_DATABASE_URL`을 만들지 않는다. `FEDIFY_QUEUE_DATABASE_URL`은 MessageQueue 전용 secondary connection으로 유지한다.
- production sync/apply는 별도 사용자 승인 대상이다.

## Recommended Approach

1. 각 application workload template이 기존 direct read-write Service와 shared `kosmo_worker` principal을 표준 `PG*` env로 투영한다. Migration owner와 MessageQueue source는 각각 별도 경계를 유지한다. Runtime은 process 기본 경계에서 `DATABASE_URL`을 해석하거나 source를 선택하지 않는다. queue URL/password만 secondary client에서 사용한다.
2. 기존 API selector와 URL/password trio를 제거하고, API/Web/Worker/Fedify consumer의 process 기본 DB를 같은 Worker `PG*` source로 고정한다. Rollback은 전체 PROD-780 merge/squash revision을 Git revert한다.
3. 모든 process-wide workload template의 `DATABASE_URL`/`DATABASE_PASSWORD`, `WORKER_DATABASE_*`, `FEDIFY_DATABASE_*`를 제거하고 application SQL·callsite·DB handle 구조는 변경하지 않는다.
4. workload별 `PG*` env와 Secret ref는 values 입력으로 받지 않고 release naming과 고정 principal 계약에서 생성한다.
5. Worker template은 항상 render되는 application workload로 취급하고 Worker source와 restart target을 조건 없이 연결한다. 별도 workload activation key는 사용하지 않는다.
6. legacy API selector/trio 입력을 제거한 render에서 API/Web/Worker/Fedify consumer가 같은 Worker Secret을 사용하고 migration과 MessageQueue secondary documents가 분리되는지 검증한다.
7. merge 뒤 비운영 exact revision에서 application workload의 shared principal과 대표 SQL, `worker-database` Secret 변경 시 네 application restart target을 검증한다. Worker runtime registration/lifecycle은 검증하지 않는다. production sync/apply는 별도 승인 운영 절차로 남긴다.

## Known Traps

- Helm env source 변경만으로 live SQL principal이 바뀌었다고 판단하면 안 된다. exact deployed revision과 `current_user` evidence가 필요하다.
- PgBouncer의 `cnpg_pooler_pgbouncer` 인증서는 `kosmo_worker` workload 역할 credential이 아니며, 기존 Pooler resource 보존은 GraphQL consumer 사용을 의미하지 않는다.
- password를 URL, values, rendered manifest나 로그에 넣지 않고 `PGPASSWORD` SecretKeyRef로만 주입한다.
- 공용 `envFrom`에 legacy DB key가 남지 않는지 확인하고, process-wide 기본 DB에서 URL/password fallback이나 완전성 flag가 없는지 검색한다. 비운영 검증과 production preflight에는 충돌 key 이름만 기록한다.
- `NOBYPASSRLS`도 객체 ACL을 대체하지 않으며, `kosmo_worker`의 RLS 속성 변경은 이 credential transition의 명시된 role contract로만 검증한다.
- CI green이나 PR merge를 production 승인으로 해석하지 않는다.

## Risks / Mitigations

- [Worker credential wiring drift] → 유효한 release image의 정적 render에서 Web과 Worker source 및 두 workload의 restart target을 확인한다. activation key로 Worker target을 숨기는 분기를 두지 않는다.
- [PG env와 Secret naming drift] → DatabaseRole과 workload가 같은 release-derived Secret-name helper를 사용한다.
- [process-wide source drift] → API/Web/Worker/Fedify application consumer의 shared Worker `PG*`, migration/queue의 별도 source와 URL/password fallback 또는 완전성 flag 부재를 정적 render에서 확인한다.
- [인증 실패의 owner 은폐] → 자동 fallback을 금지하고 전체 PROD-715 merge/squash revision의 Git revert만 rollback으로 인정한다.
- [Secret rotation 순서] → `worker-database` VSO destination 변경의 API Rollout·Web Rollout·Worker Deployment·Fedify consumer Deployment restart target을 소비해 새 SecretKeyRef를 적용하고, CNPG reload는 provisioning 경계로 남긴다.
- [장기 rotation 요구의 범위 확장] → Vault dynamic credential은 PROD-744로 분리한다.

## Deployment Order

1. Process-wide URL/selector 제거와 workload별 표준 `PG*` env migration 및 render 검증.
2. PROD-369 passwordSecret과 PROD-724 application CRUD ACL 완료.
3. API/Web/Worker/Fedify application consumer의 shared Worker source와 migration/queue 경계 wiring 및 정적 검증.
4. merge 뒤 비운영 exact revision에서 각 workload의 direct read-write Service 경로와 principal, 대표 SQL, `kosmo_api` provisioning 보존과 queue/migration 불변, `worker-database` Secret 변경 시 네 application restart target을 검증한다. GraphQL은 API process 기본 shared Worker `PG*` source를 공유한다.
5. Runtime delta sync/archive는 PROD-780 `unify-application-runtime-postgres-role`에서 수행하고, 이 change에는 PROD-715 historical evidence만 유지한다.
6. production은 별도 사용자 승인과 운영 절차에서 exact diff, Vault source metadata, rollback과 live query를 다시 제시한 뒤에만 sync/apply한다.
