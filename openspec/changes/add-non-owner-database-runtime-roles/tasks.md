## 1. PROD-369 비소유 API·Fedify DB 역할과 credential provisioning

**Authority / Provenance**

- Linear `PROD-369`
- 정렬된 Linear `PROD-470`
- 관련 기존 계약: Linear `PROD-616`
- Downstream 경계: 병렬 가능한 `PROD-724` 공통 ACL·`PROD-713` API RLS base/policy, `PROD-715` Fedify transition, `PROD-716` API/Web BFF transition, `PROD-709` workload selector
- 관련 runtime 계약: 기본 비활성 Temporal Worker foundation `PROD-730`

**Deliverable**

Production database에 기존 owner workload와 migration 경계를 바꾸지 않는 `kosmo_api`, `kosmo_fedify` 비소유 LOGIN과 서로 분리된 password credential이 추가된다. `kosmo_api`는 `BYPASSRLS` 없이, `kosmo_fedify`는 `BYPASSRLS`와 함께 provision한다.

**Guardrails**

- 두 runtime role은 owner, migration 또는 서로의 member가 아니며 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION을 갖지 않는다. API만 BYPASSRLS를 갖지 않고 Fedify는 갖는다.
- 두 credential은 각각 `kubernetes/kosmo/prod/api-database`, `kubernetes/kosmo/prod/fedify-database` Vault path와 `<release-prefix>-postgres-api`, `<release-prefix>-postgres-fedify` basic-auth Secret을 사용하고 기존 API/Web/Worker workload나 migration Job에 주입하지 않는다. API Rollout에는 Fedify credential을 주입하지 않는다. `<release-prefix>`는 runtime 접미사를 보존하도록 먼저 제한한다.
- schema/table/sequence GRANT, default privilege, 도메인 RLS policy와 workload credential 선택은 포함하지 않는다.
- DatabaseRole은 retain하고 삭제·prune는 수동 확인을 요구한다.

**Verification**

- Dev/prod Helm lint/render에서 environment 격리, 두 Vault path와 basic-auth Secret, DatabaseRole attribute/membership/reclaim, API `BYPASSRLS=false`와 Fedify `BYPASSRLS=true`, 기존 API/Web와 기본 비활성 Worker owner fallback, API의 Fedify credential 부재 및 migration manifest 무변경을 확인한다. 53자 및 최대 길이 release 이름에서도 API/Fedify metadata/passwordSecret/destination이 접미사를 보존하고 서로 및 migration 이름과 충돌하지 않는지 확인한다.
- Strict OpenSpec validation과 repository formatting/check를 통과한다.
- 배포 전 동명 role의 선행 존재 여부를 확인하고, 배포 뒤 VSO destination과 DatabaseRole readiness 및 실제 credential의 `current_user`, role attribute, membership과 object ownership 부재를 민감 정보 없이 검증한다.

- [x] 1.1 API/Fedify password credential을 서로 다른 production Vault source(`api-database`/`fedify-database`)와 basic-auth Secret(`-postgres-api`/`-postgres-fedify`)으로 선언하고 workload restart/주입에서 격리한다.
- [x] 1.2 `kosmo_api`, `kosmo_fedify` DatabaseRole을 비소유·비상승 속성, API `BYPASSRLS=false`·Fedify `BYPASSRLS=true`, 빈 membership과 retain lifecycle로 선언한다.
- [x] 1.3 Dev/prod/bootstrap 및 기본 비활성 Worker render 회귀 검증을 수행하고 API/Fedify bypass attribute 및 긴 release-name suffix 보존·noncollision assertion을 포함한 Helm lint/render, formatting, strict OpenSpec validation을 통과시킨다.
- [x] 1.4 Diff와 render에 객체 GRANT/default privilege, 도메인 RLS policy, migration SQL 또는 workload credential 선택 변경이 없는지 self-review한다. 기존 API/Web/Worker owner fallback과 migration credential은 unchanged다.
- [ ] 1.5 동명 role의 선행 존재 여부와 Production Vault source를 확인하고, sync 뒤 두 destination Secret·DatabaseRole readiness 및 실제 credential role 경계를 검증한다.
- [ ] 1.6 최신 canonical·Linear와 구현·OpenSpec 정합성을 재확인하고 전체 완료 증거가 준비되면 change를 archive한다.
