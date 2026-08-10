## Context

Helm chart의 모든 배포 환경은 CloudNativePG bootstrap owner `kosmo`의 `-app` Secret을 API/Web에 계속 주입하고, 기본 비활성 Worker도 활성화 시 같은 owner fallback credential seam을 사용한다. Production의 별도 `kosmo_migration` DatabaseRole과 basic-auth Secret에서 `kosmo_migration`은 owner membership을 받아 migration runner가 `SET ROLE kosmo`로 객체 ownership을 보존한다.

PROD-369은 이 경계를 바꾸지 않고 아직 workload가 사용하지 않는 `kosmo_api`, `kosmo_worker` LOGIN과 credential만 먼저 추가한다. CloudNativePG 1.30의 namespace-scoped `DatabaseRole`은 role attribute, membership과 basic-auth `passwordSecret`을 관리할 수 있으므로 이 Expand 범위에 맞는다. API role은 `BYPASSRLS` 없이, Worker role은 `BYPASSRLS`와 함께 선언한다. 객체 GRANT/default privilege는 DatabaseRole이 관리하지 않으며 role readiness와 PreSync migration 순서도 달라 PROD-724로 분리했다.

## Goals / Non-Goals

**Goals:**

- 모든 Helm 배포 환경에 `kosmo_api`, `kosmo_worker` 비소유 LOGIN을 환경별 별도 credential로 선언한다.
- Production apply 전에 비운영 환경의 실제 credential로 role identity·attribute·membership과 객체 권한 부재를 검증한다.
- 두 role의 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION 속성과 membership을 명시적으로 비활성화하고, API만 `BYPASSRLS`를 비활성화하며 Worker는 활성화한다.
- 기존 owner workload와 migration credential·membership을 그대로 유지한다.
- Git rollback이 기존 workload를 건드리지 않고 unused database role을 retain하도록 한다.

**Non-Goals:**

- schema/table/sequence GRANT, default privilege 또는 RLS policy.
- API/Web/Worker 기본 DB 경로나 Web trusted federation ingress/Temporal Worker DB Activity의 Secret 선택 및 실제 credential 전환.
- owner LOGIN 제거, NOLOGIN 전환 또는 Vault PKI certificate 연결.

## Implementation Guidance

### Current Constraints

- 모든 환경의 role password Secret은 `kubernetes.io/basic-auth`의 `username`, `password`를 포함하고 `cnpg.io/reload: "true"` label이 있어야 CloudNativePG가 회전을 즉시 반영한다.
- 기존 `vaultstaticsecret.yaml`은 환경 공용 `env` projection과 production migration credential을 소유한다. 새 runtime credential은 공용 `env`나 migration Secret에 섞으면 안 되며 환경별 path도 공유하면 안 된다.
- Runtime DatabaseRole와 password Secret 이름은 63자 Kubernetes 제한에서 `-postgres-api`/`-postgres-worker` 접미사가 항상 보이도록 release 이름을 먼저 최대 47자로 제한한다. 전체 release 이름을 접미사 뒤에서 자르면 긴 이름에서 두 runtime이 같은 `<release>-postgres` 이름으로 충돌할 수 있다.
- API/Web 기본 DB 경로와 기본 비활성 Worker credential seam은 계속 `<postgres-name>-app` owner fallback을 사용한다. Web trusted federation ingress와 Temporal Worker DB Activity의 Worker credential 선택은 PROD-715에 남기고 API Rollout에는 Worker credential을 주입하지 않는다. 새 Secret을 rollout restart target이나 workload env에 연결하면 PROD-709 selector 및 PROD-715/716 transition 범위를 침범한다.
- `DatabaseRole`의 `inRoles`는 실제 membership을 reconcile한다. 기본값에만 의존하지 않고 빈 목록을 명시해 owner/migration/상대 role membership이 없음을 review 가능하게 한다.
- Role CR을 삭제해도 각 환경의 DB identity를 자동 삭제하지 않는 것이 선택된 rollback 정책이다.
- CloudNativePG는 같은 이름의 기존 role도 DatabaseRole 선언에 맞춰 조정할 수 있으므로 각 환경의 live 적용 전에 `kosmo_api`, `kosmo_worker`의 선행 존재 여부와 현재 속성·membership을 민감 정보 없이 확인해야 한다.
- PR merge, manifest 준비와 CI 성공은 production apply 승인이 아니다. Vault source와 rollback·검증 절차를 확인하고 사용자의 별도 명시적 승인을 받기 전에는 Argo sync나 직접 apply를 수행하지 않는다.

### Recommended Approach

1. 모든 Helm 배포 환경에 두 VaultStaticSecret을 렌더하고, 각각 `kubernetes/kosmo/<env>/api-database`, `kubernetes/kosmo/<env>/worker-database`의 `username`/`password`만 접미사를 보존한 `<release-prefix>-postgres-api`, `<release-prefix>-postgres-worker` basic-auth Secret으로 투영한다.
2. 두 Secret과 role lifecycle에 `Prune=confirm`을 적용하고 Secret에는 CNPG reload label을 둔다. Workload restart target은 추가하지 않는다.
3. 두 DatabaseRole을 별도 manifest로 렌더해 `name`, `login: true`, `inRoles: []`, `inherit: true`, `superuser/createdb/createrole/replication: false`, API `bypassrls: false`, Worker `bypassrls: true`, 대응 passwordSecret과 `databaseRoleReclaimPolicy: retain`을 명시한다.
4. Helm lint와 복수 환경 render에서 모든 환경에 role/Secret이 생성되는지, 환경별 Vault path 격리, 기존 API/Web와 기본 비활성 Worker owner fallback, API의 Worker credential 부재 및 migration manifest 무변경을 검증한다.
5. 비운영 환경 적용 뒤 Secret value를 읽거나 출력하지 않고 VSO destination Secret type/key 존재, DatabaseRole applied 상태와 각 credential의 `current_user`·role attribute·membership·객체 ownership 부재를 검증한다. Production은 같은 절차와 별도 수동 승인 뒤에만 적용한다.

### Allowed Alternatives

없음.

### Known Traps

- `kosmo_api` 또는 `kosmo_worker`를 `kosmo`, `kosmo_migration`이나 서로의 `inRoles`에 넣지 않는다.
- 53자 또는 최대 길이 release 이름에서 runtime 접미사를 잘라 DatabaseRole metadata, passwordSecret, VSO destination이 서로 또는 `<release>-postgres-migration`과 충돌하게 만들지 않는다.
- role/Secret 추가와 함께 schema/table GRANT, default privilege, RLS policy 또는 migration SQL을 넣지 않는다.
- 새 Secret을 API/Web/Worker env, migration Job, 공용 `env` Secret이나 rolloutRestartTargets에 연결하지 않는다. API Rollout에는 Worker credential을 주입하지 않는다.
- password나 rendered Secret data를 검증 로그, PR 또는 Linear에 출력하지 않는다.
- 이전 PROD-470의 shared `kosmo_runtime` 결정을 재사용하지 않는다. 최신 Linear 계약은 `kosmo_api`, `kosmo_worker` 분리와 Worker `BYPASSRLS`를 확정했다.

## Risks / Trade-offs

- [Git rollback 뒤 PostgreSQL role이 남는다] → PROD-369만 적용된 시점에는 workload와 객체 privilege에 연결되지 않는다. 후속 authorization이 적용된 뒤에는 role과 ACL이 함께 남을 수 있으므로 완전 제거를 과거 chart rollback에 맡기지 않고 별도 승인·cleanup으로 처리한다.
- [환경별 Vault path에 credential이 아직 없으면 VSO/DatabaseRole readiness가 실패한다] → workload는 기존 owner Secret을 계속 사용하므로 서비스 영향 없이 provisioning 상태만 실패하며, 비운영 환경 path부터 준비·검증한 뒤 production 승인을 진행한다.
- [두 password path가 운영 관리량을 늘린다] → API/Worker credential object와 회전 경계를 분리한다. 현재 공용 `vso-kubernetes-sync` VaultAuth의 path 접근 정책은 이 change가 좁히지 않으며, path-level Vault ACL 분리는 별도 platform authorization 결정이다.

## Migration Plan

1. 복수 환경 render에 각각 환경별 두 Vault path/basic-auth Secret/DatabaseRole이 있고 기존 API/Web와 기본 비활성 Worker의 `-app` owner fallback 및 migration role/Secret이 동일함을 확인한다.
2. 비운영 환경 Vault에 두 path의 `username`, `password`를 준비하고 동명 PostgreSQL role의 선행 존재 여부·속성·membership을 확인한 뒤 적용한다.
3. 비운영 환경 VSO destination Secret과 DatabaseRole applied 상태를 확인하고 실제 credential로 role identity·attribute·membership·객체 ownership 부재를 민감 정보 없이 검증한다.
4. Production Vault path와 동명 role, rollback·검증 절차를 확인하고 사용자의 별도 명시적 production apply 승인을 받은 뒤에만 production Helm 선언을 적용한다.
5. Production에서도 같은 live 경계를 확인한다. Rollback은 Helm 선언을 이전 revision으로 되돌리되 Prune 확인을 거치고 PostgreSQL role은 retain한다. 기존 workload와 migration은 전 과정에서 기존 credential을 유지한다.

## Open Questions

없음.
