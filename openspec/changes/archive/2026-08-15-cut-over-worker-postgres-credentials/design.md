## Context

PROD-709와 PR #564는 API와 Worker 역할별 password selector를 만들고 Web/Worker에 별도 `WORKER_DATABASE_*` env를 준비했다. Runtime은 이 env를 소비하지 않으며 process 기본 DB 입력이 URL과 password 조합에 의존했다.

최신 Linear 계약은 GraphQL Query/Mutation에만 operation `ctx.db`/RLS를 적용하고, Web trusted federation ingress와 Temporal Worker를 비GraphQL trusted workload로 분류한다. 모든 process-wide application workload는 별도 application pool/handle 없이 process 기본 `db`를 사용하며 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`만 기본 DB source로 읽는다. API, Fedify consumer와 dev migration은 `kosmo` owner source를, Web과 Temporal Worker는 Vault/VSO-backed `kosmo_worker` SCRAM credential을 사용한다. GraphQL operation PgBouncer URL과 Fedify MessageQueue URL/password는 별도 secondary connection으로 남긴다. PROD-369 역할/Secret과 PROD-724 공통 CRUD ACL은 dev와 production에 적용됐다.

## Goals

- API, Fedify consumer와 dev migration을 포함한 process-wide 기본 DB를 chart-derived 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source로 통일한다. API/Fedify/dev migration은 `kosmo`, Web/Worker는 `kosmo_worker`를 사용한다.
- 기존 전역 `db`, Fedify listener와 core service callsite를 보존한다.
- API GraphQL operation connection의 `OPERATION_DATABASE_URL`, migration과 MessageQueue database/`FEDIFY_QUEUE_DATABASE_URL`을 보존한다.
- Git revert rollback과 production 승인 경계를 명확히 한다.

## Non-goals

- DatabaseRole, VaultStaticSecret과 password 생성·회전 provisioning(PROD-369).
- 객체 GRANT(PROD-724), 별도 Worker application pool/handle 또는 explicit SQL handle 이전(PROD-710).
- GraphQL operation 또는 Fedify MessageQueue의 secondary URL/password 경계를 process 기본 DB로 합치지 않는다.
- 전용 Worker Pooler와 custom authentication.
- Vault Dynamic Secret/임시 login lease(PROD-744).
- API cutover, Worker runtime registration/singleton startup/activation lifecycle(PROD-722), Temporal domain Workflow와 Fedify MessageQueue.

## Current Constraints

- process-wide 기본 DB에는 URL, password 조합, `hasComplete...` 같은 source 선택 또는 compatibility flag가 없다. 각 template이 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`를 고정하고 해당 principal Secret의 `PGPASSWORD`만 SecretKeyRef로 투영한다.
- API, Fedify consumer와 dev migration은 기존 owner direct read-write Service의 `PG*` source를 공유한다. Web process의 비GraphQL trusted 경로와 enabled Temporal Worker는 같은 endpoint의 `kosmo_worker` source를 공유한다.
- Worker Deployment는 기존 `workloads.enabled && worker.enabled` activation gate에서만 렌더된다. `worker.enabled`의 기본값과 `apps/worker` registration·startup·shutdown 동작은 이 change에서 변경하지 않는다.
- API에는 Worker source가 없어야 한다. API의 process 기본 DB는 owner `kosmo` source이며 Worker Secret을 참조하지 않는다.
- `kosmo_fedify_queue`는 MessageQueue 전용 별도 database/role이며 Worker principal과 무관하다.
- `OPERATION_DATABASE_URL`과 `FEDIFY_QUEUE_DATABASE_URL`은 각각 GraphQL operation과 MessageQueue 전용 secondary connection으로 유지한다.
- production sync/apply는 별도 사용자 승인 대상이다.

## Recommended Approach

1. 각 process-wide template이 기존 direct read-write Service와 고정 principal/database를 표준 `PG*` env로 투영한다. API/Fedify consumer/dev migration은 `kosmo`와 app Secret, Web/enabled Worker는 `kosmo_worker`와 Worker Secret을 사용한다. Runtime은 이 process 기본 경계에서 `DATABASE_URL`을 해석하거나 source를 선택하지 않는다. PgBouncer URL과 queue URL/password는 각 secondary client에서만 사용한다.
2. 기존 API selector와 URL/password trio를 제거하고, API/Fedify consumer/dev migration의 process 기본 DB를 같은 owner `PG*` source로 고정한다. Rollback은 전체 PROD-715 merge/squash revision을 Git revert한다.
3. 모든 process-wide workload template의 `DATABASE_URL`/`DATABASE_PASSWORD`, `WORKER_DATABASE_*`, `FEDIFY_DATABASE_*`를 제거하고 application SQL·callsite·DB handle 구조는 변경하지 않는다.
4. workload별 `PG*` env와 Secret ref는 values 입력으로 받지 않고 release naming과 고정 principal 계약에서 생성한다.
5. 기존 `worker.enabled` activation gate를 유지하고, enabled Worker template에만 Worker source와 conditional restart target을 연결한다.
6. legacy API selector/trio 입력을 제거한 render에서 API, Fedify consumer, migration과 MessageQueue secondary documents가 정합하고 Worker Secret이 API에 유입되지 않는지 검증한다.
7. merge 뒤 비운영 exact revision에서 Web direct Service의 principal과 대표 SQL, enabled Worker manifest source와 `worker-database` Secret 변경 시 restart target을 검증한다. Worker runtime registration/lifecycle은 검증하지 않는다. production sync/apply는 별도 승인 운영 절차로 남긴다.

## Known Traps

- Helm env source 변경만으로 live SQL principal이 바뀌었다고 판단하면 안 된다. exact deployed revision과 `current_user` evidence가 필요하다.
- PgBouncer의 `cnpg_pooler_pgbouncer` 인증서는 GraphQL operation용 `kosmo_worker` workload 역할 credential이 아니다.
- password를 URL, values, rendered manifest나 로그에 넣지 않고 `PGPASSWORD` SecretKeyRef로만 주입한다.
- 공용 `envFrom`에 legacy DB key가 남지 않는지 확인하고, process-wide 기본 DB에서 URL/password fallback이나 완전성 flag가 없는지 검색한다. 비운영 검증과 production preflight에는 충돌 key 이름만 기록한다.
- `BYPASSRLS`는 객체 ACL을 대체하지 않는다.
- CI green이나 PR merge를 production 승인으로 해석하지 않는다.

## Risks / Mitigations

- [Worker activation과 credential wiring drift] → 기존 `workloads.enabled && worker.enabled` gate를 정적 render에서 확인하고, Web restart target은 유지하되 Worker target은 enabled render에만 둔다.
- [PG env와 Secret naming drift] → DatabaseRole과 workload가 같은 release-derived Secret-name helper를 사용한다.
- [process-wide source drift] → API, Fedify consumer와 dev migration의 owner `PG*`, Web/Worker의 Worker `PG*`를 정적 render에서 확인하고 URL/password fallback이나 완전성 flag가 없는지 검색한다.
- [인증 실패의 owner 은폐] → 자동 fallback을 금지하고 전체 PROD-715 merge/squash revision의 Git revert만 rollback으로 인정한다.
- [Secret rotation 순서] → `worker-database` VSO destination 변경의 Web Rollout·Worker Deployment restart target을 소비해 새 SecretKeyRef를 적용하고, CNPG reload는 provisioning 경계로 남긴다.
- [장기 rotation 요구의 범위 확장] → Vault dynamic credential은 PROD-744로 분리한다.

## Deployment Order

1. Process-wide URL/selector 제거와 workload별 표준 `PG*` env migration 및 render 검증.
2. PROD-369 passwordSecret과 PROD-724 application CRUD ACL 완료.
3. API/Fedify consumer/dev migration owner source와 Web/enabled Worker 기본 DB source wiring 및 정적 검증.
4. merge 뒤 비운영 exact revision에서 각 workload의 direct read-write Service 경로와 principal, 대표 SQL, API Worker Secret 비주입과 queue/migration 불변, `worker-database` Secret 변경 시 restart target을 검증한다. GraphQL operation만 PgBouncer 경로를 사용한다.
5. OpenSpec을 sync/archive하고 PROD-715 완료 여부를 판단한다.
6. production은 별도 사용자 승인과 운영 절차에서 exact diff, Vault source metadata, rollback과 live query를 다시 제시한 뒤에만 sync/apply한다.
