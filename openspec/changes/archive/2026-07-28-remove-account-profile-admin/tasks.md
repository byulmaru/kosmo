## 1. PROD-489 Runtime 역할과 권한 정렬

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0020-profile-edit-authorization-and-role-alignment.md`
- `PROD-489`

**Deliverable**

application과 GraphQL은 Account Profile Role로 Owner와 Member만 노출하고 Profile 수정은 Owner에게만 허용한다.

**Guardrails**

- Member의 selected Profile 소셜 행동 자격은 유지한다.
- `updateProfile`의 `usingProfile` 전환, 새 필드와 Media 관계는 변경하지 않는다.
- GraphQL runtime schema와 committed SDL을 같은 변경에서 정렬한다.

**Verification**

- core enum과 GraphQL SDL이 Owner/Member만 포함하는지 확인한다.
- Owner의 Profile 수정 성공과 Member의 권한 거부를 API integration test로 검증한다.
- Owner/Member selected Profile의 기존 소셜 행동 회귀 test를 통과시킨다.

- [x] 1.1 Account Profile Role runtime 값과 Profile 수정 권한을 Owner/Member canonical 계약에 맞춘다.
- [x] 1.2 Admin을 사용하던 fixture를 Membership·운영 권한 의도에 맞는 Owner 또는 Member로 정렬하고 역할별 회귀 검증을 갱신한다.
- [x] 1.3 runtime GraphQL schema를 생성해 committed SDL과 enum 값 집합을 동기화한다.

## 2. PROD-489 dev PostgreSQL enum 정렬

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0020-profile-edit-authorization-and-role-alignment.md`
- `PROD-489`

**Deliverable**

dev PostgreSQL의 `account_profile_role`은 기존 Owner/Member row를 유지하면서 `OWNER`, `MEMBER` 값만 허용한다.

**Guardrails**

- 실제 DB에 `ADMIN` row가 없다는 승인된 전제를 사용하며 자동 Role 전환이나 backfill을 추가하지 않는다.
- 예상과 달리 `ADMIN` row가 있으면 migration이 실패해야 한다.
- 적용된 migration과 과거 snapshot은 수정하지 않고 새 forward migration과 최신 snapshot만 추가한다.
- 구버전 workload 호환성과 단계별 rollout을 구현하지 않는다.

**Verification**

- 생성된 migration SQL과 snapshot parent가 현재 schema head를 잇는지 검토한다.
- migration runner의 전체 history 적용·재실행 검증을 통과시킨다.

- [x] 2.1 Owner/Member schema를 표현하는 새 Drizzle forward migration과 최신 snapshot을 생성하고 enum 재구성 SQL을 검토한다.
- [x] 2.2 기존 migration runner로 전체 history 적용과 재실행을 검증한다.

## 3. PROD-489 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0008-relationship-report-state-exclusions.md`
- `docs/domain/decisions/0020-profile-edit-authorization-and-role-alignment.md`
- `PROD-489`

**Deliverable**

runtime, GraphQL, DB와 canonical/OpenSpec이 Owner/Member 역할 계약으로 정합하며 독립 변경의 검증 증거가 남는다.

**Guardrails**

- Terraform IAM의 `*Admin` 역할과 과거 migration history의 `ADMIN` 문자열은 Account Profile Role runtime 잔존으로 오판하지 않는다.
- 프로필 수정 UI·Media 관계와 Profile Link 범위를 포함하지 않는다.

**Verification**

- `pnpm lint:prettier`, API TypeScript/schema check, core migration test와 API integration test를 통과시킨다.
- `openspec validate remove-account-profile-admin --type change --strict`를 통과시킨다.
- runtime source와 최신 schema에서 허용되지 않은 Account Profile Admin 참조가 없는지 범위를 제한해 검색한다.

- [x] 3.1 formatter, type/schema, migration과 관련 API integration 검증을 실행하고 실패를 해결한다.
- [x] 3.2 canonical·Linear·OpenSpec·구현 정합성을 확인하고 모든 task 완료 뒤 change를 validate한다.
- [x] 3.3 전체 계약과 검증이 완료된 뒤 OpenSpec change를 archive하고 archive 후 validation을 통과시킨다.
