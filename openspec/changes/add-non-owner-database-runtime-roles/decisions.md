## Context

이 기록은 최신 Linear PROD-369/470/724와 PROD-709/713/715/716, 기본 비활성 Worker foundation인 PROD-730의 경계, 기존 환경별 owner·production migration identity, CloudNativePG 1.30 DatabaseRole/VaultStaticSecret 제약과 2026-08-07·10 사용자 선택을 반영한다.

## Decision Records

### API와 Worker database LOGIN을 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: 이전 PROD-470은 API와 web/Fedify가 하나의 `kosmo_runtime` LOGIN을 공유하도록 했지만, 최신 RLS 전환은 API viewer와 trusted federation/Temporal Worker credential을 서로 독립적으로 배포하고 가장을 방지해야 한다.
- Decision Outcome: API LOGIN은 `kosmo_api`, Worker LOGIN은 `kosmo_worker`, migration LOGIN은 기존 `kosmo_migration`으로 고정한다.
- Alternatives Considered: shared `kosmo_runtime`은 credential과 policy rollout 경계를 결합하므로 supersede했다. `kosmo_fedify`는 Web trusted federation ingress만 표현하고 Temporal Worker DB Activity 소비 경계를 누락하므로 최신 명칭에서 제외했다.
- Consequences: PROD-724, PROD-713, PROD-709와 PROD-715/716은 두 이름을 안정적인 role identifier로 사용한다.
- Confirmation / Follow-up: Helm render와 실제 `current_user`, `pg_roles`, `pg_auth_members`로 두 LOGIN의 분리와 상호 membership 부재를 확인한다.

### Worker만 BYPASSRLS를 사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: API viewer는 후속 API RLS policy의 행 필터를 적용받아야 하지만, Web trusted federation ingress와 Temporal Worker DB Activity는 domain policy와 분리된 신뢰 경로로 동작해야 한다.
- Decision Outcome: `kosmo_api`는 `LOGIN` + `BYPASSRLS` 비활성, `kosmo_worker`는 `LOGIN` + `BYPASSRLS` 활성으로 선언한다. 두 role 모두 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION은 비활성이고 `kosmo`, `kosmo_migration` 또는 서로의 member가 아니다.
- Alternatives Considered: 두 role 모두 `BYPASSRLS`를 끄면 trusted federation/Worker 경로가 API viewer policy와 결합된다. 두 role 모두 우회하면 API viewer 보호 경계를 잃으므로 선택하지 않았다.
- Consequences: 이 change는 API/Worker role attribute만 선언하고 객체 GRANT/default privilege와 domain policy는 변경하지 않는다. 공통 ACL은 PROD-724, API policy는 PROD-713, credential transition은 PROD-715/716, workload selector는 PROD-709가 소유한다.
- Confirmation / Follow-up: Render와 실제 credential 세션에서 `rolbypassrls`를 API=false/Worker=true로 확인하고 role membership·ownership은 별도로 확인한다.

### API와 Worker password credential을 별도 Vault path로 관리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: 두 role이 한 Vault 객체나 Kubernetes Secret lifecycle을 공유하면 credential source와 회전 경계가 다시 결합된다.
- Decision Outcome: API와 Worker는 각각 `kubernetes/kosmo/<env>/api-database`, `kubernetes/kosmo/<env>/worker-database`를 사용하고 `<release-prefix>-postgres-api`, `<release-prefix>-postgres-worker` basic-auth Secret으로 투영한다. 모든 환경의 path는 credential과 회전 경계를 공유하지 않으며 `<release-prefix>`는 가장 긴 runtime 접미사를 보존하도록 먼저 제한한다.
- Alternatives Considered: 한 Vault path의 여러 credential key는 source object와 회전을 공유해 선택하지 않았다. 기존 공용 `env` 또는 migration path 재사용은 runtime/migration 경계를 위반한다. 전체 release 이름을 접미사 뒤에서 자르는 방식은 긴 release에서 API/Worker suffix가 사라져 resource collision을 만들 수 있어 선택하지 않았다.
- Consequences: 운영자가 환경마다 두 Vault 객체를 별도로 준비·회전해야 한다. VSO와 DatabaseRole readiness도 환경·role별로 독립 관측할 수 있다. Projection은 현재 공용 `vso-kubernetes-sync` VaultAuth를 사용하므로 이 결정 자체가 path-level Vault ACL을 제공하지는 않는다.
- Confirmation / Follow-up: Render에서 path, destination type/key filter와 CNPG reload label을 확인하고 Secret value는 출력하지 않는다.

### 객체 authorization은 role provisioning에서 분리한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-724`, `PROD-713`, `PROD-715`, `PROD-716`, `PROD-709`
- Status: Active
- Context / Problem: DatabaseRole은 schema/table/sequence GRANT와 default privilege를 관리하지 않으며, 환경별 PreSync migration은 Sync 단계의 새 role보다 먼저 실행될 수 있다. Local full migration replay에도 Helm이 관리하는 runtime role이 없다.
- Decision Outcome: PROD-369은 role과 credential만 선언한다. 공통 비RLS 객체 GRANT/default privilege는 PROD-724, API RLS policy는 PROD-713, API/Worker credential transition은 PROD-715/716, workload credential selector는 PROD-709가 소유한다.
- Alternatives Considered: 이번 PR에 conditional GRANT migration을 넣으면 role 부재 시 조용히 누락되거나 full replay가 실패한다. same-release role+GRANT Job은 기존 migration ownership 경계를 중복하므로 선택하지 않았다.
- Consequences: 새 credential은 처음에는 객체 privilege가 없고 어떤 workload도 사용하지 않는다. 후속 authorization·transition 이슈가 준비되기 전 transition할 수 없다.
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

### PR merge와 production apply 승인을 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: role·credential manifest는 additive하지만 production Vault와 PostgreSQL identity를 생성·조정한다. PR merge나 CI 통과만으로 자동 반영하면 Vault 준비, rollback 및 실제 credential 검증 gate를 건너뛸 수 있다.
- Decision Outcome: PR merge, manifest 준비 또는 CI 통과를 production apply 승인으로 간주하지 않는다. Vault source와 rollback·검증 절차를 확인하고 사용자가 별도로 명시적으로 승인한 뒤에만 production sync/apply를 수행한다.
- Alternatives Considered: merge 뒤 자동 sync는 전달 속도는 높지만 운영 준비와 승인 경계를 결합하므로 선택하지 않았다. PR을 계속 Draft로 두는 방식은 코드 리뷰 준비 상태와 production 승인 상태를 혼동하므로 선택하지 않았다.
- Consequences: PR은 Ready/Mergeable 상태여도 production에는 반영되지 않을 수 있다. live 검증 task는 승인·apply 이후까지 미완료로 남는다.
- Confirmation / Follow-up: Production 변경 전에 승인 기록과 대상 release를 확인하고, 적용 직후 VSO destination·DatabaseRole readiness·실제 credential 경계를 검증한다.

### 모든 배포 환경에 역할을 선언하고 production 전 비운영 환경에서 먼저 검증한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: Production apply는 별도 수동 승인을 요구하지만 특정 환경만 허용하는 manifest는 새 배포 환경에서 동일한 role 계약을 재사용할 수 없고 production 전 실제 LOGIN, BYPASSRLS, membership과 권한 거부 검증도 제한한다.
- Decision Outcome: `.Values.env`로 구분되는 모든 Helm 배포 환경에 같은 `kosmo_api`, `kosmo_worker` DatabaseRole과 환경별 credential Secret을 additive하게 provision한다. 비운영 환경 적용은 production 승인이 아니며 workload 선택, migration, GRANT와 RLS policy는 바꾸지 않는다.
- Alternatives Considered: Dev와 production만 allowlist하는 방식은 staging 등 다른 배포 환경을 누락한다. Production에서만 최초 live 검증하는 방식은 승인 뒤에야 role 계약 오류를 발견한다.
- Consequences: 각 환경 Vault에 별도 `api-database`, `worker-database` source를 준비해야 하며 source가 없으면 role provisioning readiness만 실패한다. 기존 owner workload는 새 Secret을 사용하지 않는다.
- Confirmation / Follow-up: 임의의 비운영 환경 render와 실제 credential로 role identity·attribute·membership·객체 ownership 부재를 확인한 뒤 production preflight와 별도 승인을 진행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Linear `PROD-470`의 2026-07-24 shared `kosmo_runtime` 결정과 2026-08-07 `kosmo_fedify` 명칭은 2026-08-10 `API와 Worker database LOGIN을 분리한다` 결정으로 대체됐다.
