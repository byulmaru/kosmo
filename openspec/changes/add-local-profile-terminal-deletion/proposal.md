## Why

현재 저장·service·GraphQL의 단일 `ProfileState`와 `deleteProfile`은 비활성화만 표현해, canonical `Deactivated → Deleted` terminal 삭제를 안전하게 실행하거나 lifecycle와 suspension을 독립적으로 판단할 수 없다. PROD-526이 관계 cleanup을 비활성화가 아닌 terminal transaction에 연결하기 전에 호환 가능한 상태·action 경계를 먼저 전달해야 한다.

## What Changes

- **BREAKING** 최종 계약에서 단일 `ProfileState(ACTIVE | DISABLED | SUSPENDED)`를 독립된 `ProfileLifecycleState(ACTIVE | DEACTIVATED | DELETED)`와 `ProfileSuspensionState(NORMAL | SUSPENDED)`로 대체한다.
- additive expand, transition/backfill, 승인된 contract의 세 release 단계로 기존 workload와 rollback 대상을 보존하면서 canonical 상태로 전환한다.
- Local Profile Owner용 비활성화·재활성화·terminal 삭제 action을 분리하고, 기존 `deleteProfile` 비활성화 의미를 terminal 삭제로 재사용하지 않는다.
- terminal 삭제는 Profile row와 기존 Membership을 보존한 채 Deleted 상태를 멱등하게 확정하고, downstream cleanup이 같은 transaction에 참여할 service 경계를 제공한다.
- lifecycle·suspension을 소비하는 공개 visibility, selected Profile session, Profile 목록·검색, Follow 저장 count와 mutation 권한을 새 상태 계약에 맞춘다.
- **BREAKING** 모든 workload 전환, backfill 검증, rollback window 종료와 명시적 승인 뒤 legacy 상태 storage·compatibility read/write·deprecated API를 제거한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/design/profile-tags.md` (`origin/PROD-523@904c41ce`, PR #394는 아직 `main`에 merge되지 않음)
- Linear Contract: PROD-532
- Linear Implementations: PROD-542, PROD-543, PROD-544

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: Local Profile lifecycle action, terminal idempotency, visibility·session·관계 count 소비자 계약을 canonical 상태로 바꾼다.
- `data-model`: Profile lifecycle와 suspension을 독립 enum으로 저장하고 legacy 상태를 단계적으로 제거한다.
- `api-platform`: legacy `ProfileState` GraphQL 등록과 기존 비활성화 mutation compatibility를 새 action 계약에 맞춘다.
- `session-auth`: session actor Profile 자격을 lifecycle Active와 suspension Normal의 결합으로 판정한다.

## Impact

- Core: `packages/core/enums.ts`, `packages/core/db/enums.ts`, `packages/core/db/tables.ts`, `packages/core/services/profile.ts`와 상태 predicate·관련 테스트
- Database: 새 forward Drizzle migrations, transition mapping/backfill 검증, contract migration과 배포 gate
- API: Profile lifecycle mutations, payload와 error mapping, `apps/api/schema.graphql`, Profile visibility·loader·session context·integration tests
- Consumers: Profile lookup/search/list, selected Profile, Follow/Follow Request·Post·Notification 등 `ACTIVE` predicate 사용 경로
- Dependencies: PROD-542 → PROD-543 → production Contract Gate → PROD-544; PROD-526은 PROD-543 transaction seam 뒤에 별도 Profile Tag cleanup을 연결한다.
