## Context

PROD-709와 PR #564는 API와 Worker 역할별 password selector를 만들고 Web/Worker에 별도 `WORKER_DATABASE_*` env를 준비했다. Runtime은 이 env를 소비하지 않으며 Web과 Worker의 process 기본 `DATABASE_*`는 owner connection에 남아 있다.

최신 Linear 계약은 GraphQL Query/Mutation에만 operation `ctx.db`/RLS를 적용하고, Web trusted federation ingress와 Temporal Worker를 비GraphQL trusted workload로 분류한다. 두 workload는 별도 application pool/handle 없이 process 기본 `db`를 사용하며, 기존 PostgreSQL direct read-write Service와 Vault/VSO-backed `kosmo_worker` SCRAM credential로 인증한다. PgBouncer는 GraphQL operation connection에만 사용한다. PROD-369 역할/Secret과 PROD-724 공통 CRUD ACL은 dev와 production에 적용됐다.

## Goals

- Web/Worker process 기본 `DATABASE_*`를 chart-derived 고정 Worker source로 전환한다.
- 기존 전역 `db`, Fedify listener와 core service callsite를 보존한다.
- API GraphQL operation connection의 PgBouncer, migration과 MessageQueue database를 보존한다.
- Git revert rollback과 production 승인 경계를 명확히 한다.

## Non-goals

- DatabaseRole, VaultStaticSecret과 password 생성·회전 provisioning(PROD-369).
- 객체 GRANT(PROD-724), 별도 Worker application pool/handle 또는 explicit SQL handle 이전(PROD-710).
- 전용 Worker Pooler와 custom authentication.
- Vault Dynamic Secret/임시 login lease(PROD-744).
- API cutover, Worker runtime registration/singleton startup/activation lifecycle(PROD-722), Temporal domain Workflow와 Fedify MessageQueue.

## Current Constraints

- Worker credential에는 values 입력이 없다. URL은 chart가 고정된 principal/database와 기존 direct read-write Service endpoint로 생성하고 Secret ref는 PROD-369의 release naming을 재사용한다.
- Web process의 비GraphQL trusted 경로는 process 기본 `DATABASE_*`/전역 `db`를 공유한다.
- Worker Deployment는 기존 `workloads.enabled && worker.enabled` activation gate에서만 렌더된다. `worker.enabled`의 기본값과 `apps/worker` registration·startup·shutdown 동작은 이 change에서 변경하지 않는다.
- API에는 Worker source가 없어야 한다.
- `kosmo_fedify_queue`는 MessageQueue 전용 별도 database/role이며 Worker principal과 무관하다.
- production sync/apply는 별도 사용자 승인 대상이다.

## Recommended Approach

1. Chart가 `postgres://kosmo_worker@<release>-postgres-rw:5432/kosmo` URL과 `<release>-postgres-worker` / `password` Secret ref를 생성해 Web과 enabled Worker 기본 `DATABASE_*`로 사용한다. Runtime은 password를 URL userinfo에 보간하지 않고 `DATABASE_PASSWORD`를 postgres client option으로 전달한다. PgBouncer URL은 GraphQL operation connection에서만 사용한다.
2. API selector는 Web/Worker source에 사용하지 않는다. Rollback은 전체 PROD-715 merge/squash revision을 Git revert한다.
3. Web/Worker template의 별도 `WORKER_DATABASE_*` env를 제거하고 application SQL·callsite·DB handle 구조는 변경하지 않는다. 기존 전역 client는 `DATABASE_PASSWORD`를 별도 password option으로 소비한다.
4. Worker URL과 Secret ref 모두 values로 받지 않고 release naming에서 생성한다.
5. 기존 `worker.enabled` activation gate를 유지하고, enabled Worker template에만 Worker source와 conditional restart target을 연결한다.
6. API selector 활성/비활성 및 PROD-715 적용 전후 render에서 API, migration과 MessageQueue documents가 불변이고 Worker Secret이 API에 유입되지 않는지 검증한다.
7. merge 뒤 비운영 exact revision에서 Web direct Service의 principal과 대표 SQL, enabled Worker manifest source와 `worker-database` Secret 변경 시 restart target을 검증한다. Worker runtime registration/lifecycle은 검증하지 않는다. production sync/apply는 별도 승인 운영 절차로 남긴다.

## Known Traps

- Helm env source 변경만으로 live SQL principal이 바뀌었다고 판단하면 안 된다. exact deployed revision과 `current_user` evidence가 필요하다.
- PgBouncer의 `cnpg_pooler_pgbouncer` 인증서는 GraphQL operation용 `kosmo_worker` workload 역할 credential이 아니다.
- password를 URL, values, rendered manifest나 로그에 넣지 않는다.
- 공용 `envFrom`에 `WORKER_DATABASE_*`/legacy env가 별도 유입되지 않는지 비운영 검증과 production preflight에서 확인한다.
- `BYPASSRLS`는 객체 ACL을 대체하지 않는다.
- CI green이나 PR merge를 production 승인으로 해석하지 않는다.

## Risks / Mitigations

- [Worker activation과 credential wiring drift] → 기존 `workloads.enabled && worker.enabled` gate를 정적 render에서 확인하고, Web restart target은 유지하되 Worker target은 enabled render에만 둔다.
- [URL과 Secret naming drift] → DatabaseRole과 workload가 같은 release-derived Secret-name helper를 사용한다.
- [인증 실패의 owner 은폐] → 자동 fallback을 금지하고 전체 PROD-715 merge/squash revision의 Git revert만 rollback으로 인정한다.
- [Secret rotation 순서] → `worker-database` VSO destination 변경의 Web Rollout·Worker Deployment restart target을 소비해 새 SecretKeyRef를 적용하고, CNPG reload는 provisioning 경계로 남긴다.
- [장기 rotation 요구의 범위 확장] → Vault dynamic credential은 PROD-744로 분리한다.

## Deployment Order

1. Selector/env migration과 render 검증.
2. PROD-369 passwordSecret과 PROD-724 application CRUD ACL 완료.
3. Web과 enabled Worker 기본 DB source wiring 및 정적 검증.
4. merge 뒤 비운영 exact revision에서 기존 direct read-write Service 경로, `current_user = 'kosmo_worker'`, `rolbypassrls = true`, 대표 SQL, API 비주입과 queue/migration 불변, `worker-database` Secret 변경 시 Web restart와 enabled Worker restart target을 검증한다. GraphQL operation만 PgBouncer 경로를 사용한다.
5. OpenSpec을 sync/archive하고 PROD-715 완료 여부를 판단한다.
6. production은 별도 사용자 승인과 운영 절차에서 exact diff, Vault source metadata, rollback과 live query를 다시 제시한 뒤에만 sync/apply한다.
