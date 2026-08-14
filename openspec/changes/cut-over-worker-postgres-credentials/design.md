## Context

PROD-709와 PR #564는 API와 Worker 역할별 password selector를 만들고 Web/Worker에 별도 `WORKER_DATABASE_*` env를 준비했다. Runtime은 이 env를 소비하지 않으며 Web과 Worker의 process 기본 `DATABASE_*`는 owner connection에 남아 있다.

최신 Linear 계약은 GraphQL Query/Mutation에만 operation `ctx.db`/RLS를 적용하고, Web trusted federation ingress와 Temporal Worker를 비GraphQL trusted workload로 분류한다. 두 workload는 별도 application pool/handle 없이 process 기본 `db`를 사용하며, 기존 CloudNativePG PgBouncer와 Vault/VSO-backed `kosmo_worker` SCRAM credential로 인증한다. PROD-369 역할/Secret과 PROD-724 공통 CRUD ACL은 dev와 production에 적용됐다.

## Goals

- `worker` selector를 Web/Worker process 기본 `DATABASE_*` source로 소비한다.
- 기존 전역 `db`, Fedify listener와 core service callsite를 보존한다.
- API GraphQL operation connection, migration, MessageQueue database와 PgBouncer를 보존한다.
- selector-off rollback과 production 승인 경계를 명확히 한다.

## Non-goals

- DatabaseRole, VaultStaticSecret과 password 생성·회전 provisioning(PROD-369).
- 객체 GRANT(PROD-724), 별도 Worker application pool/handle 또는 explicit SQL handle 이전(PROD-710).
- PgBouncer 우회, 전용 Pooler와 custom authentication.
- Vault Dynamic Secret/임시 login lease(PROD-744).
- API cutover, Temporal domain Workflow와 Fedify MessageQueue.

## Current Constraints

- Worker selector는 URL/password Secret atomic trio다.
- Web process의 비GraphQL trusted 경로는 process 기본 `DATABASE_*`/전역 `db`를 공유한다.
- Worker Deployment는 default-disabled이며 실제 DB Activity가 등록되기 전에는 connection을 열지 않는다.
- API에는 Worker source가 없어야 한다.
- `kosmo_fedify_queue`는 MessageQueue 전용 별도 database/role이며 Worker principal과 무관하다.
- production sync/apply는 별도 사용자 승인 대상이다.

## Recommended Approach

1. 기존 `worker` atomic trio를 Web/Worker 기본 `DATABASE_URL`/`DATABASE_PASSWORD`로 선택하는 helper를 둔다.
2. selector가 비활성일 때 두 workload만 기존 owner source로 돌아가게 한다. API selector는 Web/Worker fallback에 사용하지 않는다.
3. Web/Worker template의 별도 `WORKER_DATABASE_*` env를 제거하고 application code·DB handle은 변경하지 않는다.
4. URL은 기존 PgBouncer Service를 가리키고 password는 SecretKeyRef에서만 읽는다.
5. selector matrix에서 API, migration과 MessageQueue documents가 불변이고 Worker Secret이 API에 유입되지 않는지 검증한다.
6. merge 뒤 비운영 exact revision에서 Web principal과 대표 SQL, Worker manifest source를 검증한다. production sync/apply는 별도 승인 운영 절차로 남긴다.

## Known Traps

- Helm env source 변경만으로 live SQL principal이 바뀌었다고 판단하면 안 된다. exact deployed revision과 `current_user` evidence가 필요하다.
- PgBouncer의 `cnpg_pooler_pgbouncer` 인증서는 workload 역할 credential이 아니다.
- password를 URL, values, rendered manifest나 로그에 넣지 않는다.
- 공용 `envFrom`에 `WORKER_DATABASE_*`/legacy env가 별도 유입되지 않는지 비운영 검증과 production preflight에서 확인한다.
- `BYPASSRLS`는 객체 ACL을 대체하지 않는다.
- CI green이나 PR merge를 production 승인으로 해석하지 않는다.

## Risks / Mitigations

- [Worker foundation의 지연 connection] → chart에서는 기본 source와 API 음성 경계를 검증하고 실제 business DB consumer가 활성화될 때 process 기본 `db`를 그대로 사용한다.
- [부분 selector로 principal 혼합] → atomic trio validation을 유지한다.
- [인증 실패의 owner 은폐] → 자동 fallback을 금지하고 selector 변경만 rollback으로 인정한다.
- [Secret rotation 순서] → PROD-369의 VSO destination과 CNPG reload를 소비하고 workload cutover는 selector source만 바꾼다.
- [장기 rotation 요구의 범위 확장] → Vault dynamic credential은 PROD-744로 분리한다.

## Deployment Order

1. Selector/env migration과 render 검증.
2. PROD-369 passwordSecret과 PROD-724 application CRUD ACL 완료.
3. Web/Worker 기본 DB source wiring과 정적 검증.
4. merge 뒤 비운영 exact revision에서 기존 PgBouncer 경로, `current_user = 'kosmo_worker'`, `rolbypassrls = true`, 대표 SQL, API 비주입과 queue/migration 불변을 검증한다.
5. OpenSpec을 sync/archive하고 PROD-715 완료 여부를 판단한다.
6. production은 별도 사용자 승인과 운영 절차에서 exact diff, Vault source metadata, rollback과 live query를 다시 제시한 뒤에만 sync/apply한다.
