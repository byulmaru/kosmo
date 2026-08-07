## Context

이 기록은 최신 Linear PROD-369/470/724와 PROD-709/713/714/715/716의 경계, 기존 production owner·migration identity, CloudNativePG 1.30 DatabaseRole/VaultStaticSecret 제약과 2026-08-07 사용자 선택을 반영한다.

## Decision Records

### API와 system database LOGIN을 분리한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, 정렬된 Linear `PROD-470`; 2026-08-07 사용자 결정
- Status: Active
- Context / Problem: 이전 PROD-470은 API와 web/federation이 하나의 `kosmo_runtime` LOGIN을 공유하도록 했지만, 최신 RLS 전환은 API viewer와 federation/system policy·credential을 서로 독립적으로 배포하고 가장을 방지해야 한다.
- Decision Outcome: API LOGIN은 `kosmo_api`, federation/system LOGIN은 `kosmo_system`, migration LOGIN은 기존 `kosmo_migration`으로 고정한다.
- Alternatives Considered: shared `kosmo_runtime`은 credential과 policy rollout 경계를 결합하므로 supersede했다. 더 긴 `kosmo_api_runtime`/`kosmo_system_runtime`은 명시적이지만 downstream SQL·운영 식별자가 불필요하게 길어 선택하지 않았다.
- Consequences: PROD-724, 713/714, 709와 715/716은 두 이름을 안정적인 role identifier로 사용한다. PROD-470의 미병합 branch/OpenSpec은 재개할 때 shared-login 결정을 정렬해야 한다.
- Confirmation / Follow-up: Helm render와 실제 `current_user`, `pg_roles`, `pg_auth_members`로 두 LOGIN의 분리와 상호 membership 부재를 확인한다.

### API와 system password credential을 별도 Vault path로 관리한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-369`; 2026-08-07 사용자 결정
- Status: Active
- Context / Problem: 두 role이 한 Vault 객체나 Kubernetes Secret lifecycle을 공유하면 credential source와 회전 경계가 다시 결합된다.
- Decision Outcome: API는 `kubernetes/kosmo/prod/api-database`, system은 `kubernetes/kosmo/prod/system-database`를 사용하고 각각 `<release>-postgres-api`, `<release>-postgres-system` basic-auth Secret으로 투영한다.
- Alternatives Considered: 한 Vault path의 여러 credential key는 source object와 회전을 공유해 선택하지 않았다. 기존 공용 `env` 또는 migration path 재사용은 runtime/migration 경계를 위반한다.
- Consequences: 운영자가 두 Vault 객체를 별도로 준비·회전해야 한다. VSO와 DatabaseRole readiness도 role별로 독립 관측할 수 있다. 두 projection은 현재 공용 `vso-kubernetes-sync` VaultAuth를 사용하므로 이 결정 자체가 path-level Vault ACL을 제공하지는 않는다.
- Confirmation / Follow-up: Render에서 path, destination type/key filter와 CNPG reload label을 확인하고 Secret value는 출력하지 않는다.

### 객체 authorization은 role provisioning에서 분리한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-724`, `PROD-713`, `PROD-714`
- Status: Active
- Context / Problem: DatabaseRole은 schema/table/sequence GRANT와 default privilege를 관리하지 않으며, production PreSync migration은 Sync 단계의 새 role보다 먼저 실행될 수 있다. Local/dev full migration replay에도 새 production role이 없다.
- Decision Outcome: PROD-369은 role과 credential만 선언한다. 공통 비RLS 객체 GRANT/default privilege와 role-readiness 순서는 PROD-724, Post/PostContent role별 grant와 RLS policy는 PROD-713/714가 소유한다.
- Alternatives Considered: 이번 PR에 conditional GRANT migration을 넣으면 role 부재 시 조용히 누락되거나 full replay가 실패한다. same-release role+GRANT Job은 기존 migration ownership 경계를 중복하므로 선택하지 않았다.
- Consequences: 새 credential은 처음에는 객체 privilege가 없고 어떤 workload도 사용하지 않는다. 후속 authorization 이슈가 준비되기 전 transition할 수 없다.
- Confirmation / Follow-up: Diff와 render에 migration SQL, GRANT/default privilege, RLS policy와 workload Secret 선택이 없는지 확인한다.

### DatabaseRole 제거 시 PostgreSQL role을 retain한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-369`; 2026-08-07 사용자 결정
- Status: Active
- Context / Problem: Git/Argo rollback이 production identity를 자동 DROP하면 후속 배포가 이미 참조하는 시점에 장애나 ACL cleanup 교착을 만들 수 있다.
- Decision Outcome: role과 credential resource에 `Prune=confirm`을 적용하고 DatabaseRole은 `databaseRoleReclaimPolicy: retain`을 사용한다.
- Alternatives Considered: reclaim `delete`는 초기 미사용 단계에는 깨끗하지만 후속 GRANT/transition 뒤 과거 chart rollback이 role을 제거할 위험이 있어 선택하지 않았다.
- Consequences: rollback 뒤 PostgreSQL에 unused role이 남을 수 있으나 workload와 객체 privilege에는 연결되지 않는다. 완전 제거는 별도 확인·cleanup 절차가 필요하다.
- Confirmation / Follow-up: Render annotation/reclaim policy와 rollback 시 기존 workload Secret 무변경을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Linear `PROD-470`의 2026-07-24 shared `kosmo_runtime` 결정은 2026-08-07 `API와 system database LOGIN을 분리한다` 결정으로 대체됐다. PROD-470 본문·관계·댓글은 새 역할 경계로 정렬했으며 미병합 PR #353/OpenSpec은 재개 시 별도로 갱신해야 한다.
