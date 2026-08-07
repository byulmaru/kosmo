## Why

Profile 편집 eligibility가 nullable top-level `Query.selectedProfileForEdit`에 묶여 있어, 실제
Account-Profile Membership보다 특정 route capability가 공개 Profile과 후속 shell consumer의 공통 계약이 되고
있다. PR #529에 새 production consumer를 추가하기 전에 viewer-relative Membership 관계를 account-scoped하게
노출하고 기존 route consumer를 전환해야 한다.

## What Changes

- `Profile.viewerState.membership: AccountProfile`을 현재 session Account와 조회 중인 Profile 사이의 실제 nullable
  Membership으로 제공하고 `OWNER | MEMBER` role을 노출한다.
- guest, 유효한 viewer Profile이 없는 session과 Membership이 없는 Account에는 authorization error 없이 nullable
  결과를 반환하고, 다른 Account의 Membership이나 role을 노출하지 않는다.
- 공개 Profile의 편집 eligibility를 `viewerState.isSelf`와 Owner Membership, 기존 Active Account/Profile 및
  Local·non-Suspended Instance 조건의 결합으로 전환한다.
- `/profile-edit`가 `currentSession.selectedProfile.viewerState.membership`을 사용하도록 전환하고, 부적격 직접
  접근의 기존 StateView를 유지한다.
- Profile 목록의 Membership 조회를 현재 Account로 scope된 batch 경계로 제공하고 Profile별 N+1 query를 만들지
  않는다.
- `updateProfile`이 projection과 독립적으로 현재 Account, selected Profile, Instance와 Owner Membership을
  mutation 실행 시점에 재검증하는 경계를 유지한다.
- **BREAKING** 기존 production consumer를 Membership projection으로 전환한 뒤
  `Query.selectedProfileForEdit` schema/resolver와 관련 Relay operation/generated artifact를 제거한다.
- `Profile.viewerState.isSelf`, `follow`, `followRequest`와 FollowButton 동작은 변경하지 않는다.
- PR #529의 ProfileSwitcher consumer와 노란 편집 action은 이 change에 포함하지 않고, 선행 migration merge 뒤
  `PROD-660`에서 새 계약으로 전환한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/domain/objects/account-profile-membership.md`, `docs/design/profile-edit.md`
- Linear Contract: `PROD-705`
- Linear Implementations: `PROD-705`; 후행 consumer handoff는 `PROD-660`

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `profile`: viewer-relative Account-Profile Membership projection을 추가하고 top-level
  `selectedProfileForEdit` capability를 제거한다.
- `profile-edit-ui`: 공개 Profile과 protected `/profile-edit` route의 eligibility source를 Membership
  projection으로 전환한다.

## Impact

- GraphQL: `ProfileViewerState`, 기존 `AccountProfile` Node/role, account-scoped loader,
  `Query.selectedProfileForEdit` 제거, runtime/public schema 동기화.
- App/Relay: 기존 first-party consumer operation·generated artifact·component test 전환.
- Tests: guest/no-viewer/null, Owner/Member/무관 Account, selected mismatch, Remote/inactive/suspended,
  cross-account 비노출, batching/query-count, FollowButton 불변과 mutation 독립 재검증 회귀.
- OpenSpec: `profile`과 `profile-edit-ui` delta만 소유한다. active `add-profile-tags`는 query source를 고정하지 않아
  변경하지 않고, archived `add-local-profile-edit`는 과거 이력으로 보존한다. `web-app-shell` delta는
  `PROD-660` 범위이므로 제외한다.
- Data/dependencies: DB schema, Account Profile Role enum과 의존성을 변경하지 않는다. 새 DB index는 query plan과
  별도 범위 승인 없이는 추가하지 않는다.
