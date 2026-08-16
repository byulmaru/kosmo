## REMOVED Requirements

### Requirement: Account와 Profile actor setting helper를 제공한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — This historical actor setting helper requirement MUST be removed from the active capability.

**Reason**: 병합된 GraphQL RLS policy가 모두 제거됐고 미병합 RLS 변경도 닫혀 Account/Profile session setting을 읽는 database consumer가 없다. 요청별 actor state는 target architecture의 DB 권한 경계가 아니다.

**Migration**: actor GUC 설정 call-site를 먼저 제거하고 migration replay로 남은 policy/function dependency가 없음을 확인한 뒤 `public.kosmo_current_account_id()`와 `public.kosmo_current_profile_id()`를 forward migration에서 제거한다. production apply는 별도 승인 범위다.

#### Scenario: Account/Profile actor helper requirement가 제거됨

- **WHEN** 이 delta가 canonical actor-context capability에 동기화된다
- **THEN** Account/Profile setting과 helper pair를 제공한다는 requirement는 더 이상 active contract가 아니다

### Requirement: malformed actor setting은 guarded UUID 해석으로 처리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — This historical guarded UUID helper requirement MUST be removed from the active capability.

**Reason**: actor setting helper 자체를 retire하므로 malformed UUID 해석과 함수 속성 계약도 더 이상 runtime capability가 아니다.

**Migration**: helper unit/migration assertions을 제거하고 generic migration replay 및 catalog 검증에서 두 함수의 제거와 다른 schema object 불변을 확인한다.

#### Scenario: guarded actor UUID helper requirement가 제거됨

- **WHEN** 이 delta가 canonical actor-context capability에 동기화된다
- **THEN** malformed actor setting을 database helper가 해석해야 한다는 requirement는 더 이상 active contract가 아니다
