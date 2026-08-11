## Why

RLS 전환의 첫 단계인 `PROD-369`은 API와 trusted federation/Temporal Worker가 사용할 비소유 PostgreSQL LOGIN을 선언적으로 준비해야 한다. 현재 저장소의 runtime 연결은 CloudNativePG가 제공하는 기존 PgBouncer 경로를 사용하고, 비밀번호는 Vault의 정적 KV 값에서 Kubernetes basic-auth Secret으로 동기화한다. 역할 생성과 workload principal 전환을 한 배포에 묶으면 rollback과 승인 경계가 불필요하게 커진다.

이 change는 역할과 정적 SCRAM credential source만 additive하게 provision한다. 실제 workload selector/cutover와 SQL·권한 변경은 각자의 후속 이슈가 소유하며, 이번 change가 certificate/direct PostgreSQL 대안으로 확장되지 않도록 경계를 고정한다.

## What Changes

- 모든 Helm 배포 환경에 `kosmo_api`와 `kosmo_worker` DatabaseRole을 선언한다. API는 `BYPASSRLS=false`, Worker는 `BYPASSRLS=true`로 둔다.
- 각 DatabaseRole의 `passwordSecret`은 release별 role Secret(`*-postgres-api`, `*-postgres-worker`)을 가리킨다. 두 Secret은 role별 VaultStaticSecret이 정적 KV 경로에서 `username`/`password`를 동기화하는 Kubernetes `basic-auth` destination이다.
- 기존 CloudNativePG PgBouncer와 direct/owner·migration·replication·local/legacy SCRAM 경계, 기존 workload URL/selector는 변경하지 않는다. 이 change는 새 역할을 workload에 주입하거나 cutover하지 않는다.
- `PROD-724` 객체 GRANT, `PROD-710` handle/SQL, `PROD-715` Worker cutover, `PROD-716` API cutover와 `PROD-744` dynamic secret은 이 change의 구현·검증 범위가 아니다.
- 취소된 `PROD-470` client-certificate/direct PostgreSQL 설계는 active contract가 아니며, 관련 결정은 `decisions.md`의 Superseded 기록에만 보존한다.
- PR merge·CI·manifest 준비는 production preflight/sync/apply/live 승인이 아니다. Production 실행은 사용자의 별도 명시적 운영 authorization 없이 수행하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 제품 도메인 문서는 없다. PostgreSQL migration identity와 rollout 규칙은 `docs/operations/production-migrations.md`, `memory/database-migrations.md`를 따른다.
- Linear Contract / Implementation: `PROD-369` (runtime role와 static SCRAM credential provisioning).
- Superseded alternative: 취소된 `PROD-470` (client certificate/direct PostgreSQL authentication).
- Implementation ownership: `PROD-369`이 DatabaseRole, role attribute, role별 VaultStaticSecret/passwordSecret과 정적 검증 및 non-prod live completion evidence를 소유한다. Production preflight/sync/apply/live는 별도의 운영 authorization boundary이며 이 change의 task나 completion evidence가 아니다.
- Archive ownership: PROD-369의 구현·검증 책임자가 static validation과 non-prod live completion evidence를 확보한 뒤 archive를 담당한다. Production authorization은 archive의 선행 조건이 아니며, completion·merge·archive 어느 것도 production 실행을 승인하지 않는다.

## Capabilities

### New Capabilities

- `runtime-postgres-scram-credential-provisioning`: API/Worker 비소유 LOGIN과 role별 Vault/VSO static SCRAM credential을 모든 Helm 환경에 additive하게 provision하는 계약.

### Modified Capabilities

없음. 기존 workload credential selector·PgBouncer·migration 계약은 이 change에서 변경하지 않는다.

## Impact

- `apps/helm`: 두 standalone DatabaseRole에 static `passwordSecret`을 연결하고 role별 VaultStaticSecret/basic-auth destination을 추가한다. 기존 공용 env·production migration Secret과 workload template은 유지한다.
- PostgreSQL authorization: `kosmo_api`와 `kosmo_worker`의 LOGIN/attribute/inRoles 선언만 준비한다. 객체 GRANT, default privilege, ownership, RLS policy와 SQL은 포함하지 않는다.
- Kubernetes Secret: VSO가 role별 `username`/`password`를 정적 KV source에서 destination Secret으로 동기화하고 CNPG DatabaseRole이 그 Secret을 사용한다. 비밀번호 값은 OpenSpec·manifest·로그에 기록하지 않는다.
- Rollout: 이 change는 workload restart, URL/selector 변경, PgBouncer 우회 또는 direct client-certificate 설정을 하지 않는다. Non-prod live verification은 completion evidence로 기록한다. Production preflight/sync/apply/live는 외부 운영 authorization boundary이며 OpenSpec task·completion·archive criterion이 아니다. Completion·merge·archive 어느 것도 production 실행을 승인하지 않는다.
