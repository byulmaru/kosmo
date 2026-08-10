## 1. PROD-369 비소유 API·Worker DB 역할과 credential provisioning

**Authority / Provenance**

- Linear `PROD-369`
- 정렬된 Linear `PROD-470`
- 관련 기존 계약: Linear `PROD-616`
- Downstream 경계: 병렬 가능한 `PROD-724` 공통 ACL·`PROD-713` API RLS base/policy, `PROD-715` Worker transition, `PROD-716` API/Web BFF transition, `PROD-709` workload selector
- 관련 runtime 계약: 기본 비활성 Temporal Worker foundation `PROD-730`

**Deliverable**

모든 Helm 배포 환경의 database에 기존 owner workload와 migration 경계를 바꾸지 않는 `kosmo_api`, `kosmo_worker` 비소유 LOGIN과 환경별로 분리된 password credential이 추가된다. `kosmo_api`는 `BYPASSRLS` 없이, `kosmo_worker`는 `BYPASSRLS`와 함께 provision한다.

**Guardrails**

- 두 runtime role은 owner, migration 또는 서로의 member가 아니며 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION을 갖지 않는다. API만 BYPASSRLS를 갖지 않고 Worker는 갖는다.
- 두 credential은 각각 `kubernetes/kosmo/<env>/api-database`, `kubernetes/kosmo/<env>/worker-database` Vault path와 `<release-prefix>-postgres-api`, `<release-prefix>-postgres-worker` basic-auth Secret을 사용하고 기존 API/Web/Worker workload나 migration Job에 주입하지 않는다. API Rollout에는 Worker credential을 주입하지 않는다. `<release-prefix>`는 runtime 접미사를 보존하도록 먼저 제한한다.
- schema/table/sequence GRANT, default privilege, 도메인 RLS policy와 workload credential 선택은 포함하지 않는다.
- DatabaseRole은 retain하고 삭제·prune는 수동 확인을 요구한다.
- PR merge, manifest 준비 또는 CI 통과는 production apply 승인이 아니다. Vault source와 rollback·검증 절차를 확인하고 사용자의 별도 명시적 승인을 받은 뒤에만 production sync/apply를 수행한다.

**Verification**

- 복수의 환경 값으로 Helm lint/render하여 모든 environment의 두 Vault path와 basic-auth Secret, DatabaseRole attribute/membership/reclaim, API `BYPASSRLS=false`와 Worker `BYPASSRLS=true`, 기존 API/Web와 기본 비활성 Worker owner fallback, API의 Worker credential 부재 및 migration manifest 무변경을 확인한다. 53자 및 최대 길이 release 이름에서도 API/Worker metadata/passwordSecret/destination이 접미사를 보존하고 서로 및 migration 이름과 충돌하지 않는지 확인한다.
- Strict OpenSpec validation과 repository formatting/check를 통과한다.
- 배포 전 동명 role의 선행 존재 여부를 확인하고, 배포 뒤 VSO destination과 DatabaseRole readiness 및 실제 credential의 `current_user`, role attribute, membership과 object ownership 부재를 민감 정보 없이 검증한다.

- [x] 1.1 API/Worker password credential을 환경·role별 Vault source(`kubernetes/kosmo/<env>/api-database`, `kubernetes/kosmo/<env>/worker-database`)와 basic-auth Secret(`-postgres-api`/`-postgres-worker`)으로 선언하고 workload restart/주입에서 격리한다.
- [x] 1.2 `kosmo_api`, `kosmo_worker` DatabaseRole을 비소유·비상승 속성, API `BYPASSRLS=false`·Worker `BYPASSRLS=true`, 빈 membership과 retain lifecycle로 선언한다.
- [x] 1.3 Dev/prod/임의 환경/bootstrap 및 기본 비활성 Worker render 회귀 검증을 수행하고 API/Worker bypass attribute 및 긴 release-name suffix 보존·noncollision assertion을 포함한 Helm lint/render, formatting, strict OpenSpec validation을 통과시킨다.
- [x] 1.4 Diff와 render에 객체 GRANT/default privilege, 도메인 RLS policy, migration SQL 또는 workload credential 선택 변경이 없는지 self-review한다. 기존 API/Web/Worker owner fallback과 migration credential은 unchanged다.
- [x] 1.5 환경 allowlist 없이 모든 Helm 배포 환경에 환경별 API/Worker VaultStaticSecret과 같은 DatabaseRole 경계를 additive하게 렌더하고 owner workload·migration·selector 불변 및 환경 간 path 격리를 검증한다.
- [ ] 1.6 비운영 환경 Vault source와 동명 role을 확인한 뒤 적용하고 두 destination Secret·DatabaseRole readiness 및 실제 credential role 경계를 검증한다.
- [ ] 1.7 Production의 동명 role, Vault source·rollback·검증 절차를 확인하고, 사용자의 별도 명시적 production apply 승인을 받은 뒤 sync하여 같은 live 경계를 검증한다.
- [ ] 1.8 최신 canonical·Linear와 구현·OpenSpec 정합성을 재확인하고 전체 완료 증거가 준비되면 change를 archive한다.
