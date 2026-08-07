## ADDED Requirements

### Requirement: Profile viewer Account membership projection

**Authority / Provenance:** `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/design/profile-edit.md`, `PROD-705` — `Profile.viewerState.membership`은 현재 session Account와 조회 중인 Profile 사이의 실제 nullable `AccountProfile` 관계를 반환해야 한다(MUST).

Projection은 현재 session Account로 scope되어야 하고(MUST), 다른 Account의 Membership 또는 role을 노출해서는
안 된다(MUST NOT). 실제 관계의 role은 `OWNER` 또는 `MEMBER`여야 하며(MUST), 별도 `canEdit` capability로
변환해서는 안 된다(MUST NOT).

#### Scenario: Return the current Account membership

- **WHEN** 유효한 viewer Profile이 있는 session의 현재 Account와 조회 중인 Profile 사이에 Membership이 있다
- **THEN** `Profile.viewerState.membership`은 해당 실제 `AccountProfile`을 반환한다
- **AND** `membership.role`은 저장된 `OWNER` 또는 `MEMBER` 값을 반환한다

#### Scenario: Hide another Account membership

- **WHEN** 현재 session Account와 조회 중인 Profile 사이에는 Membership이 없지만 다른 Account의 Membership이 있다
- **THEN** `Profile.viewerState.membership`은 `null`이다
- **AND** 다른 Account의 Membership identity 또는 role을 응답에 노출하지 않는다

#### Scenario: Keep the viewer boundary guest-safe

- **WHEN** guest 또는 유효한 viewer Profile이 없는 session이 공개 Profile을 조회한다
- **THEN** API는 GraphQL authorization error 없이 기존 nullable `Profile.viewerState` 경계를 유지한다
- **AND** Membership projection을 권한이 있는 것처럼 합성하지 않는다

#### Scenario: Batch Memberships within the current Account

- **WHEN** 한 요청이 여러 Profile의 `viewerState.membership`을 조회한다
- **THEN** 시스템은 현재 session Account로 scope된 batch 경계에서 Membership을 조회한다
- **AND** Profile마다 개별 Membership query를 실행하지 않는다

#### Scenario: Preserve existing viewer follow state

- **WHEN** 클라이언트가 Membership과 기존 viewer-relative follow 상태를 함께 조회한다
- **THEN** `viewerState.isSelf`, `viewerState.follow`과 `viewerState.followRequest`는 기존 viewer Profile 관계를
  그대로 반환한다
- **AND** Membership projection은 FollowButton의 self·established follow·pending request 동작을 변경하지 않는다

## REMOVED Requirements

### Requirement: Guest-safe selected Profile edit capability

**Authority / Provenance:** `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-705`

**Reason**: top-level `selectedProfileForEdit`이 실제 Account-Profile 관계 대신 route 전용 capability를 GraphQL
root에 고정한다. ADR 0023과 PROD-705는 이 query source를 viewer-relative Membership projection으로 대체한다.

**Migration**: 공개 Profile과 protected `ProfileEditRoute`를 `Profile.viewerState.membership` 계약으로 먼저
전환하고 first-party 및 외부 consumer 호환성을 확인한 뒤 `Query.selectedProfileForEdit` schema/resolver와 관련
Relay operation/generated artifact를 제거한다. archived `add-local-profile-edit` 기록은 당시 이력으로 보존한다.

#### Scenario: Return the selected editable Profile

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Account가 Owner다
- **THEN** `selectedProfileForEdit`은 해당 Profile을 반환한다

#### Scenario: Keep public Profile queries usable without edit authority

- **WHEN** guest, selected Profile이 없는 session, Member·무관 Account 또는 Remote/inactive/suspended selected
  Profile이 공개 Profile과 `selectedProfileForEdit`을 함께 조회한다
- **THEN** 공개 Profile은 기존 조회 정책에 따라 응답한다
- **AND** `selectedProfileForEdit`은 authorization error 없이 `null`이다
