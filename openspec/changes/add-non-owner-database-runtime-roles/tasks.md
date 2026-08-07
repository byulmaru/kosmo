## 1. PROD-369 비소유 API·system DB 역할과 credential provisioning

**Authority / Provenance**

- Linear `PROD-369`
- 정렬된 Linear `PROD-470`
- 관련 기존 계약: Linear `PROD-616`

**Deliverable**

Production database에 기존 owner workload와 migration 경계를 바꾸지 않는 `kosmo_api`, `kosmo_system` 비소유 LOGIN과 서로 분리된 password credential이 추가된다.

**Guardrails**

- 두 runtime role은 owner, migration 또는 서로의 member가 아니며 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION과 BYPASSRLS를 갖지 않는다.
- 두 credential은 별도 Vault path/basic-auth Secret을 사용하고 기존 workload나 migration Job에 주입하지 않는다.
- schema/table/sequence GRANT, default privilege, RLS policy와 workload credential 선택은 포함하지 않는다.
- DatabaseRole은 retain하고 삭제·prune는 수동 확인을 요구한다.

**Verification**

- Dev/prod Helm lint/render에서 environment 격리, 두 Vault path와 basic-auth Secret, DatabaseRole attribute/membership/reclaim, 기존 owner workload와 migration manifest 무변경을 확인한다.
- Strict OpenSpec validation과 repository formatting/check를 통과한다.
- 배포 전 동명 role의 선행 존재 여부를 확인하고, 배포 뒤 VSO destination과 DatabaseRole readiness 및 실제 credential의 `current_user`, role attribute, membership과 object ownership 부재를 민감 정보 없이 검증한다.

- [x] 1.1 API/system password credential을 서로 다른 production Vault source와 basic-auth Secret으로 선언하고 workload restart/주입에서 격리한다.
- [x] 1.2 `kosmo_api`, `kosmo_system` DatabaseRole을 비소유·비상승 속성, 빈 membership과 retain lifecycle로 선언한다.
- [x] 1.3 Dev/prod render 회귀 검증을 수행하고 Helm lint/render, formatting, strict OpenSpec validation을 통과시킨다.
- [x] 1.4 Diff와 render에 객체 GRANT/default privilege, RLS policy, migration SQL 또는 workload credential 선택 변경이 없는지 self-review한다.
- [ ] 1.5 동명 role의 선행 존재 여부와 Production Vault source를 확인하고, sync 뒤 두 destination Secret·DatabaseRole readiness 및 실제 credential role 경계를 검증한다.
- [ ] 1.6 최신 canonical·Linear와 구현·OpenSpec 정합성을 재확인하고 전체 완료 증거가 준비되면 change를 archive한다.
