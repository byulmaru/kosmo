## Context

이 결정 기록은 canonical Account Profile Role, Profile 운영 권한, 현재 `PROD-489` 계약과 dev 환경의 전달
제약을 구현자가 다시 해석하지 않도록 정리한다. 역할 제거와 migration 수단을 구분하고, 프로필 수정 후속
범위를 현재 변경에 포함하지 않는다.

## Decision Records

### Account Profile Role은 Owner와 Member만 가진다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `docs/domain/decisions/0020-profile-edit-authorization-and-role-alignment.md`, `PROD-489`
- Status: Active
- Context / Problem: canonical 역할 집합에서 제거된 Admin이 application, GraphQL과 PostgreSQL에 남아 역할과 권한 계약이 일치하지 않는다.
- Decision Outcome: Account Profile Role은 `OWNER`와 `MEMBER`만 지원하고 `ADMIN`은 모든 현재 runtime 계약에서 제거한다.
- Alternatives Considered: Admin을 deprecated 값으로 남기는 방안은 canonical 역할과 권한 분기를 계속 이중화하므로 채택하지 않는다.
- Consequences: GraphQL과 DB enum 값 제거는 breaking 변경이며 Profile 운영 권한은 Owner만 가진다. Member의 selected Profile 소셜 행동 자격은 유지한다.
- Confirmation / Follow-up: runtime GraphQL SDL, core enum, dev DB enum과 Owner/Member integration test를 함께 검증한다.

### Profile 수정의 Admin 권한 예외를 제거한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0020-profile-edit-authorization-and-role-alignment.md`, `PROD-489`
- Status: Active
- Context / Problem: 현재 `updateProfile`은 Owner와 Admin을 허용하지만 canonical Profile 운영 권한은 Owner에게만 있다.
- Decision Outcome: 현재 mutation shape와 나머지 동작은 유지하면서 Admin 허용 분기와 Admin 기준 오류 표현을 제거한다.
- Alternatives Considered: `updateProfile` 전체를 selected Profile 기반 계약으로 함께 전환하는 방안은 `PROD-492`의 독립 범위를 흡수하므로 채택하지 않는다.
- Consequences: Member는 Profile을 수정할 수 없고 Owner만 기존 수정 동작을 사용할 수 있다. `usingProfile`, 새 필드와 Media 관계는 이 변경에서 달라지지 않는다.
- Confirmation / Follow-up: Owner 성공과 Member 권한 거부를 API integration test로 확인한다.

### dev DB enum을 단일 forward migration으로 재구성한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-489`
- Status: Active
- Context / Problem: PostgreSQL은 enum value 직접 삭제를 지원하지 않지만 대상은 구버전 호환성과 rollback window가 필요 없는 dev 환경이고 실제 `ADMIN` row가 없다.
- Decision Outcome: application 변경과 같은 전달에서 `account_profile_role` enum을 Owner/Member 값으로 재구성하는 새 forward migration을 적용한다. 예상과 달리 `ADMIN` row가 있으면 자동 강등하지 않고 migration을 실패시킨다.
- Alternatives Considered: transition과 contract release 분리, `ADMIN`을 `MEMBER`로 backfill, enum을 text로 완화하는 방안은 현재 데이터와 환경에 불필요하거나 역할 의미를 추정하므로 채택하지 않는다.
- Consequences: migration 중 dev downtime과 table lock을 허용한다. 구버전 code rollback 호환성은 제공하지 않으며 실패 시 새 forward migration으로 정정한다.
- Confirmation / Follow-up: 격리 DB에서 migration을 적용해 Owner/Member row 보존, `ADMIN` 부재와 재실행 history를 확인한다.

### 적용된 migration 이력은 보존한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-489`
- Status: Active
- Context / Problem: 기존 migration과 snapshot에는 당시 유효했던 `ADMIN` 값이 기록되어 있어 문자열 일괄 제거가 history를 손상시킬 수 있다.
- Decision Outcome: 적용된 migration directory와 snapshot은 수정하지 않고 새 migration과 최신 snapshot만 Owner/Member schema로 생성한다.
- Alternatives Considered: 최초 enum 생성 migration과 모든 snapshot을 rewrite하는 방안은 이미 적용된 history와 checksum 의미를 깨뜨리므로 채택하지 않는다.
- Consequences: repository 검색에는 historical `ADMIN` 문자열이 남는다. 완료 판정은 runtime source, GraphQL SDL과 최신 schema head를 기준으로 한다.
- Confirmation / Follow-up: git diff에서 과거 migration 변경이 없고 새 migration의 parent snapshot이 현재 head를 잇는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Admin 제거를 application transition과 PostgreSQL contract release로 나누고 rollback window를 두는 초기 제안은 대상이 구버전 호환성이 필요 없는 dev 환경이라는 사용자 정정으로 폐기되었다. `PROD-489`의 단일 forward migration 결정이 이를 대체한다.
