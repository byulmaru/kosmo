## Context

PROD-709는 API와 Fedify 역할별 password selector를 만들었고 Worker foundation도 Fedify env를 받는다. Runtime은 아직 이 env를 소비하지 않으며 trusted ingress와 Worker DB Activity는 owner connection에 남아 있다.

최신 Linear 계약은 기존 CloudNativePG PgBouncer와 TLS를 유지하고 `kosmo_worker`를 Vault/VSO-backed SCRAM credential로 인증한다. PROD-369은 passwordSecret provisioning을 복구하기 위해 재개됐고, direct client-certificate 대안 PROD-470은 취소됐다.

## Goals

- `fedify` selector/env를 `worker`/`WORKER_DATABASE_*`로 정렬한다.
- Web trusted ingress와 Temporal Worker DB Activity의 명시적 connection만 같은 Worker source를 사용한다.
- API/Web BFF 기본 connection, migration과 PgBouncer를 보존한다.
- selector-off rollback과 production 승인 경계를 명확히 한다.

## Non-goals

- DatabaseRole, VaultStaticSecret과 password 생성·회전 provisioning(PROD-369).
- 객체 GRANT(PROD-724) 또는 explicit SQL handle 이전(PROD-710).
- PgBouncer 우회, 전용 Pooler와 custom authentication.
- Vault Dynamic Secret/임시 login lease(PROD-744).
- API cutover, Temporal domain Workflow와 Fedify MessageQueue.

## Current Constraints

- Worker selector는 URL/password Secret atomic trio다.
- Web process는 BFF 기본 `DATABASE_*`와 trusted ingress `WORKER_DATABASE_*`를 동시에 가질 수 있다.
- Worker Deployment는 default-disabled이며 실제 DB Activity가 등록되기 전에는 connection을 열지 않는다.
- API에는 Worker source가 없어야 한다.
- production sync/apply는 별도 사용자 승인 대상이다.

## Recommended Approach

1. Helm selector/env 이름을 Worker로 바꾸고 partial trio만 명확하게 거부한다. Legacy key 전용 fail은 두지 않는다.
2. PROD-369/724/710이 완료될 때까지 rename-only seam을 독립 검증 상태로 유지한다.
3. Web trusted ingress와 실제 Temporal Worker DB Activity bootstrap에서 `WORKER_DATABASE_*`로 별도 connection을 생성해 PROD-710 handle에 전달한다.
4. URL은 기존 PgBouncer Service를 가리키고 password는 SecretKeyRef에서만 읽는다.
5. production 승인 뒤 두 connection의 Pooler endpoint, `current_user`, `rolbypassrls`와 API 음성 경계를 검증한다.
6. 실패하면 Worker selector를 명시적으로 비활성화해 owner handle로 rollback한다. 인증 실패 중 자동 fallback하지 않는다.

## Known Traps

- Helm env rename만으로 SQL principal이 바뀌었다고 판단하면 안 된다. Runtime consumer와 explicit handle evidence가 필요하다.
- PgBouncer의 `cnpg_pooler_pgbouncer` 인증서는 workload 역할 credential이 아니다.
- password를 URL, values, rendered manifest나 로그에 넣지 않는다.
- 공용 `envFrom`에 남은 legacy env가 별도 유입되지 않는지 production preflight에서 확인한다.
- `BYPASSRLS`는 객체 ACL을 대체하지 않는다.
- CI green이나 PR merge를 production 승인으로 해석하지 않는다.

## Risks / Mitigations

- [일시적 미소비 Worker env] → blocker 완료 전 actual cutover task를 미완료로 둔다.
- [부분 selector로 principal 혼합] → atomic trio validation을 유지한다.
- [인증 실패의 owner 은폐] → 자동 fallback을 금지하고 selector 변경만 rollback으로 인정한다.
- [Secret rotation 순서] → PROD-369에서 VSO destination과 CNPG reload를 먼저 검증하고 workload cutover는 이후 수행한다.
- [장기 rotation 요구의 범위 확장] → Vault dynamic credential은 PROD-744로 분리한다.

## Deployment Order

1. Selector/env migration과 render 검증.
2. PROD-369 passwordSecret, PROD-724 GRANT와 PROD-710 explicit connection/SQL 완료.
3. Web/Worker runtime wiring과 non-production integration 검증.
4. 사용자에게 exact production diff, Vault source metadata, rollback과 live query를 제시한다.
5. 별도 승인 뒤에만 production sync/apply와 rollout을 수행한다.
6. 기존 PgBouncer 경로, `current_user = 'kosmo_worker'`, `rolbypassrls = true`, API 비주입과 migration 불변을 검증한다.
