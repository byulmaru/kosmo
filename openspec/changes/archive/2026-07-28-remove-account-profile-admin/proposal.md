## Why

canonical Account Profile Role은 Owner와 Member만 정의하지만 runtime application, GraphQL과 PostgreSQL에는
레거시 Admin 값과 권한 분기가 남아 있다. 실제 dev DB에 `ADMIN` row가 없는 현재 시점에 이 불일치를 한
변경으로 제거해 역할과 권한 계약을 단순화한다.

## What Changes

- **BREAKING** `AccountProfileRole`의 공개 GraphQL enum과 PostgreSQL enum에서 `ADMIN` 값을 제거한다.
- application enum과 `updateProfile` 권한 분기에서 Admin을 제거해 Profile 운영 권한을 Owner에게만 둔다.
- Admin을 사용하던 테스트·fixture를 각 시나리오의 실제 의도에 맞는 Owner 또는 Member로 정렬한다.
- 과거 migration 이력은 수정하지 않고, dev DB enum을 Owner와 Member로 재구성하는 forward migration을 추가한다.
- Owner와 Member의 selected Profile 행동이 유지되는지 GraphQL·DB 검증을 갱신한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`
- Linear Contract: `PROD-489`
- Linear Implementations: 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: Account Profile Role을 Owner와 Member로 제한하고 Profile 편집을 Owner에게만 허용한다.

## Impact

- `packages/core`의 Account Profile Role enum과 Drizzle PostgreSQL enum
- `apps/api`의 GraphQL enum SDL과 `updateProfile` 권한 분기
- Admin 역할을 fixture로 사용하던 API integration test
- 새 Drizzle forward migration과 최신 schema snapshot
- dev DB schema와 GraphQL consumer가 관찰하는 enum 값 집합
