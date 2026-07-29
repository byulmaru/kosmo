## 1. PROD-542 Profile canonical 상태 저장 expand

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- PROD-532
- PROD-542

**Deliverable**

현재 Profile 비활성화·조회·관계·Session 행동을 바꾸지 않으면서 lifecycle와 suspension을 독립 저장할 additive 기반을 배포할 수 있다.

**Guardrails**

- 적용된 migration history를 수정하지 않고 새 forward migration만 추가한다.
- legacy state를 rename·drop·재해석하거나 새 상태를 즉시 required authoritative read로 만들지 않는다.
- transition·backfill·contract 행동을 expand runtime image에 포함하지 않는다.

**Verification**

- 기존 `ACTIVE | DISABLED | SUSPENDED` row와 새 구버전 write가 migration 전후에 같은 결과를 내는지 검증한다.
- additive schema, migration 재실행, lock duration, old/new schema snapshot과 기존 core/API 회귀 test를 확인한다.

- [ ] 1.1 lifecycle와 suspension을 독립 저장할 additive enum·schema 경계를 기존 workload와 호환되게 추가한다.
- [ ] 1.2 기존 상태 row, Profile 생성·비활성화·조회와 migration 적용/실패 경로의 호환 검증을 추가한다.
- [ ] 1.3 PROD-542 required validation을 통과시키고 expand 배포 결과와 PROD-543 착수 evidence를 handoff에 기록한다.

## 2. PROD-543 Profile lifecycle transition과 backfill

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- PROD-532
- PROD-543

**Deliverable**

Active Account의 Local Profile Owner가 Profile을 비활성화·재활성화하고 Deactivated·Normal Profile을 terminal Deleted로 전이할 수 있으며, mixed workload가 canonical 상태와 legacy 호환 결과를 안전하게 공유한다.

**Guardrails**

- 새 public action은 `deactivateProfile`, `reactivateProfile`, `deleteDeactivatedProfile`이며 legacy `deleteProfile`을 terminal 의미로 재사용하지 않는다.
- Deleted는 row와 Owner Membership을 보존하고 같은 Owner retry에 멱등해야 한다.
- 비활성화·재활성화는 Follow row를 보존하고 Active 상대 저장 count만 대칭 보정하며 Session 선택을 자동 복원하지 않는다.
- Profile Tag cleanup을 구현하지 않고 terminal transaction의 단일 통합 경계만 제공한다.
- backfill은 canonical Deleted와 이미 전환한 값을 덮어쓰지 않고 null·mismatch·legacy-only write를 관측한다.

**Verification**

- Local Owner 성공과 Active/Deactivated/Deleted/Remote/non-Owner/inactive Account/Suspended matrix를 core·GraphQL integration test로 검증한다.
- concurrent deactivate/reactivate, count·Session 결과, terminal retry·rollback과 legacy mutation 비재사용을 검증한다.
- repository의 모든 직접 legacy state consumer를 inventory하고 lifecycle Active+suspension Normal 판정으로 정렬했는지 확인한다.
- mixed workload mapping, dual-write, 재실행 backfill과 null·mismatch evidence를 검증한다.

- [ ] 2.1 canonical state와 legacy state의 compatibility read/write, deterministic mapping과 재실행 가능한 backfill·관측 경계를 구현한다.
- [ ] 2.2 비활성화·재활성화·terminal 삭제 core action과 count·Session·멱등 transaction 결과를 구현한다.
- [ ] 2.3 세 GraphQL lifecycle mutation, payload·오류·generated SDL을 구현하고 legacy `deleteProfile`은 deactivation compatibility로만 유지·deprecate한다.
- [ ] 2.4 lookup/search/list, Session context와 Follow·Follow Request·Post·Notification·interaction 등 모든 lifecycle 소비자를 독립 상태 판정에 맞춘다.
- [ ] 2.5 성공·거부·retry·rollback·동시성·mixed workload·backfill 검증과 관련 package validation을 통과시킨다.
- [ ] 2.6 PROD-543 checkpoint를 push하고 PROD-526이 사용할 terminal transaction seam과 PROD-544 Contract Gate input을 handoff에 기록한다.

## 3. PROD-544 Legacy ProfileState contract 제거

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-532
- PROD-544

**Deliverable**

승인된 production Contract Gate 뒤 canonical lifecycle와 suspension이 유일한 authoritative state가 되고 legacy storage·compatibility API가 제거된다.

**Guardrails**

- backfill null·mismatch·legacy-only write, active·preview·rollback 대상 workload drain, rollback window, backup/restore와 production 승인을 모두 확인하기 전에는 contract를 merge·배포하지 않는다.
- contract SQL은 PROD-542·543 image에 미리 포함하지 않고 새 forward migration으로만 적용한다.
- legacy `deleteProfile`은 제거하되 terminal action으로 재사용하지 않는다.
- contract 뒤 구버전 workload rollback을 지원한다고 주장하지 않는다.

**Verification**

- Contract Gate evidence와 승인 시점의 image·workload·backfill 상태를 기록한다.
- contract migration 전후 schema, canonical default/constraint, runtime errors, generated SDL과 mismatch zero를 검증한다.
- legacy column·enum·compatibility read/write·deprecated mutation이 남지 않았는지 확인한다.

- [ ] 3.1 backfill·workload drain·rollback window·backup/restore evidence를 모으고 production Contract Gate의 명시적 승인을 기록한다.
- [ ] 3.2 canonical state constraint/default를 확정하고 legacy state storage를 제거하는 별도 contract migration을 적용한다.
- [ ] 3.3 legacy compatibility read/write, `ProfileState` GraphQL 등록과 deprecated `deleteProfile`을 제거해 최종 public/runtime contract를 정렬한다.
- [ ] 3.4 contract migration·schema·core/API 회귀 검증을 통과시키고 PROD-532 통합·archive handoff를 남긴다.

## 4. PROD-532 통합 검증과 OpenSpec archive

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- `docs/design/profile-tags.md`
- PROD-532

**Deliverable**

세 migration 단계와 downstream Profile Tag cleanup seam이 최신 canonical 계약에 맞게 결합됐음을 통합 검증하고 shared OpenSpec을 archive한다.

**Guardrails**

- PROD-542·543·544의 구현·검증·delivery gate가 완료되기 전에는 parent completion이나 archive를 수행하지 않는다.
- PROD-526이 소유하는 Profile Tag schema·cleanup을 이 task group에서 중복 구현하지 않는다.
- PR #394의 최신 merge 결과와 Linear contract-changing comment를 archive 직전에 독립적으로 다시 확인한다.
- 다른 관계 cleanup, Profile row 물리 삭제, Remote/ActivityPub 또는 Account/privacy 범위를 추가하지 않는다.

**Verification**

- deactivate → reactivate와 deactivate → terminal delete의 상태·Session·count·관계 결과를 종단 간 검증한다.
- terminal transaction과 PROD-526 Profile Tag cleanup이 원자적으로 결합되고 deactivation에는 cleanup이 실행되지 않는지 검증한다.
- current canonical·Linear·delta specs·runtime schema·task completion을 대조하고 archive 전후 strict validation을 실행한다.

- [ ] 4.1 PROD-542·543·544와 PROD-526의 완료 evidence, 최신 canonical·Linear·PR 상태를 독립적으로 재검증한다.
- [ ] 4.2 lifecycle action, mixed migration 결과와 downstream cleanup의 통합 scenario를 검증하고 남은 mismatch·Blocked decision이 없음을 확인한다.
- [ ] 4.3 완료된 task와 delta spec을 현재 구현에 동기화하고 OpenSpec Gate·Completion Gate 승인 뒤 change를 archive한다.
- [ ] 4.4 archive 후 repository validation을 통과시키고 PROD-532 완료 eligibility를 기록한다.
