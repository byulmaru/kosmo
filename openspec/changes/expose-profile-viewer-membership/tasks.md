## 1. PROD-705 Account-scoped Membership projection

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `docs/design/profile-edit.md`
- `PROD-705`

**Deliverable**

유효한 viewer Profile이 있는 요청에서 현재 session Account와 queried Profile 사이의 실제 nullable
`AccountProfile` 관계와 role을 `Profile.viewerState.membership`으로 제공하며, 다른 Account의 관계를 노출하지
않고 Profile 목록에서도 query 수가 선형 증가하지 않는다.

**Guardrails**

- 기존 `AccountProfile` Node와 `OWNER | MEMBER` role을 재사용하고 public `canEdit` scalar나 새 role을 만들지
  않는다.
- guest/no-viewer nullable 경계와 `viewerState.isSelf`, `follow`, `followRequest` 계약을 유지한다.
- 현재 Account를 query predicate와 request batch 경계에서 모두 보존한다.
- query plan과 별도 승인 없이 DB index를 추가하지 않는다.

**Verification**

- API GraphQL integration에서 Owner, Member, 무관 Account, 다른 Account만 Owner인 관계와 guest/no-viewer를
  검증한다.
- 여러 Profile의 Membership을 한 operation에서 조회하고 query-count가 Profile 수에 비례하지 않는지 검증한다.
- schema check와 `@kosmo/api` type/unit/integration 관련 suite를 통과시킨다.

- [x] 1.1 Membership의 role/nullability, cross-account 비노출과 guest/no-viewer 경계를 고정하는 실패하는 API
      integration test를 먼저 추가한다.
- [x] 1.2 현재 Account로 scope된 batch projection과 `ProfileViewerState.membership: AccountProfile`을 구현해
      1.1의 test를 통과시킨다.
- [x] 1.3 여러 Profile query-count와 기존 follow/isSelf/followRequest 회귀 test를 추가하고 schema snapshot을
      갱신한다.

## 2. PROD-705 기존 route consumer 전환과 legacy query 제거

**Authority / Provenance**

- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `docs/design/profile-edit.md`
- `PROD-705`

**Deliverable**

main의 공개 Profile route와 protected `ProfileEditRoute`가 viewer Membership을 사용하면서 selected Owner 및
Active Account/Profile·Local·non-Suspended 조건을 유지하고, 호환성 확인 뒤 `selectedProfileForEdit` 공개
계약을 제거한다.

**Guardrails**

- 공개 Profile은 `viewerState.isSelf`와 Owner Membership을 함께 확인한다.
- protected route는 `currentSession.selectedProfile.viewerState.membership`을 사용하며 부적격 직접 접근의 기존
  StateView를 유지한다.
- selected Profile id, Local origin 또는 Membership role 하나만으로 eligibility를 추측하지 않는다.
- 권한 없는 공개 Profile에 disabled edit placeholder를 추가하거나 FollowButton의 self·follow·pending 동작을
  바꾸지 않는다.
- PR #529의 ProfileSwitcher consumer와 노란 action은 수정하지 않는다.

**Verification**

- 공개 route component test에서 selected Owner, Member, selected mismatch, guest와 Remote/상태 부적격 action
  분기를 검증한다.
- protected route component test에서 Owner form 초기값과 Member/무관/Remote/상태 부적격 StateView를 검증한다.
- repository 전체에서 production `selectedProfileForEdit` operation/resolver/schema/generated artifact가 제거되고
  archived history만 남는지 확인한다.
- Relay compile과 `pnpm --filter @kosmo/app test:unit` 관련 suite를 통과시킨다.

- [x] 2.1 공개 Profile의 새 eligibility와 FollowButton 불변을 고정하는 실패하는 component test를 먼저
      추가하고 route consumer를 전환한다.
- [x] 2.2 protected route의 selected Owner/부적격 StateView를 고정하는 실패하는 component test를 먼저 추가하고
      초기값 query를 `currentSession.selectedProfile` projection으로 전환한다.
- [ ] 2.3 first-party operation과 알려진 외부/stacked consumer 호환성을 검색한 뒤
      `Query.selectedProfileForEdit` schema/resolver와 관련 operation/generated artifact를 제거한다.
      production deployment `0.1.1` (`b7cc1443`)에 해당 field와 first-party consumer가 포함된 증거가 있어,
      현재 선행 PR은 first-party consumer만 전환하고 deprecated compatibility alias를 유지한다.
- [x] 2.4 public/runtime schema와 Relay generated artifact를 동기화하고 app/API type·schema check를 통과시킨다.

## 3. PROD-705 통합 검증, 정합성 확인과 archive

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `docs/design/profile-edit.md`
- `PROD-705`
- 후행 handoff 경계: `PROD-660`

**Deliverable**

projection, 두 main consumer, legacy query 제거와 독립 mutation authorization이 하나의 선행 migration으로 함께
동작함을 검증하고, canonical·Linear·runtime/public schema·Relay·OpenSpec이 일치할 때 이 change를 archive할 수
있는 완료 증거를 제공한다.

**Guardrails**

- `updateProfile`은 viewer projection을 권한 증거로 사용하지 않고 실행 시점의 Account, selected Profile,
  Instance와 Owner Membership을 독립 재검증한다.
- 기존 transaction/locking 정책, AccountProfile DB/role, Profile form·Media·Tag UX와 Follow policy를 변경하지
  않는다.
- archived `add-local-profile-edit`은 과거 이력으로 보존하고 active `add-profile-tags`의 별도 통합/archive 책임을
  가져오지 않는다.
- PROD-705 prerequisite가 merge되기 전에는 PROD-660/ProfileSwitcher 구현을 이 change의 완료로 주장하지 않는다.
- PR readiness와 OpenSpec archive 완료를 별개로 확인한다.

**Verification**

- API database integration에서 `updateProfile` Owner 성공과 Member/무관 Account, selected mismatch,
  inactive/Remote/suspended 거부가 계속 성립하는지 확인한다.
- 공개 Profile 조회→edit action, protected route 초기값→`updateProfile`→갱신 Profile 복귀 흐름과 실패
  StateView를 cross-layer로 검증한다.
- `pnpm --filter @kosmo/api test`, `pnpm --filter @kosmo/app test`,
  `./node_modules/.bin/openspec validate expose-profile-viewer-membership --strict`를 통과시킨다.
- archive 전 최신 canonical 문서와 PROD-705/PROD-660 관계, PR #529 blocker를 독립 재확인하고 archive 후 전체
  OpenSpec validation을 통과시킨다.

- [x] 3.1 기존 `updateProfile` authorization과 FollowButton 회귀 suite를 실행하고 새 projection을 권한 증거로
      재사용하지 않았음을 code/test evidence로 확인한다.
- [x] 3.2 schema→Relay→공개 Profile→protected route→mutation의 cross-layer 시나리오와 필수 API/app 검증을
      통과시킨다.
- [ ] 3.3 canonical·Linear·OpenSpec·runtime/public schema 정합성, 제외 범위와 PROD-660 handoff를 독립 리뷰하고
      prerequisite PR에 검증 증거를 기록한다.
- [ ] 3.4 모든 PROD-705 task와 통합 gate가 완료된 뒤 delta specs를 canonical specs에 동기화해 이 change를
      archive하고 archive 후 validation을 확인한다.
