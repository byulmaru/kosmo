## 1. PROD-705 Membership projection

**Authority / Provenance**

- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `PROD-705`

**Deliverable**

현재 Account와 조회 Profile의 실제 Membership을 `Profile.viewerState`에 안전하게 제공한다.

**Guardrails**

- 다른 Account의 Membership을 노출하지 않고 기존 follow viewer state를 유지한다.
- 기존 `AccountProfile`과 role을 재사용하며 DB schema를 변경하지 않는다.

**Verification**

- Membership 결과, batching과 직접 Node 조회 권한을 API integration test로 검증한다.

- [x] 1.1 Account-scoped Membership projection과 schema를 구현하고 nullable·role·batching 경계를 검증한다.
- [x] 1.2 `AccountProfile` Node를 Membership Account 또는 Local Profile Owner만 조회할 수 있게 하고 회귀를 검증한다.

## 2. PROD-705 기존 consumer 전환

**Authority / Provenance**

- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `docs/design/profile-edit.md`
- `PROD-705`

**Deliverable**

공개 Profile과 protected Profile edit route가 Membership projection으로 편집 eligibility를 확인한다.

**Guardrails**

- selected Local Owner 경계와 `updateProfile`의 독립 권한 재검증을 유지한다.
- FollowButton과 PR #529의 ProfileSwitcher action은 변경하지 않는다.
- 기존 production consumer 전환을 확인하기 전에는 query를 제거하지 않는다.

**Verification**

- 기존 consumer의 Owner·부적격 분기와 schema 제거를 관련 API·app test 및 repository 검색으로 검증한다.

- [x] 2.1 공개 Profile과 `ProfileEditRoute` consumer를 Membership projection으로 전환한다.
- [x] 2.2 `selectedProfileForEdit` schema/resolver와 관련 artifact를 제거하고 production consumer가 남지 않았는지 확인한다.

## 3. PROD-705 통합과 archive

**Authority / Provenance**

- `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`
- `docs/design/profile-edit.md`
- `PROD-705`
- `PROD-660`

**Deliverable**

선행 Membership migration의 정합성을 확인하고 전체 계약이 완료되면 change를 archive한다.

**Guardrails**

- PR readiness와 OpenSpec archive 완료를 별도로 판단한다.
- archived 이력과 PROD-660의 후행 ProfileSwitcher 범위를 변경하지 않는다.

**Verification**

- 관련 API·app 검증, OpenSpec strict validation과 독립 리뷰 결과를 확인한다.

- [x] 3.1 구현·schema·canonical spec 정합성과 필수 검증을 확인한다.
- [ ] 3.2 모든 task 완료 뒤 delta spec 동기화, PROD-660 handoff와 archive를 마친다.
