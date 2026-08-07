## MODIFIED Requirements

### Requirement: Protected selected Owner Profile edit route

**Authority / Provenance:** `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492`, `PROD-705` — Production `/profile-edit` route는 `currentSession.selectedProfile`의 viewer-relative Membership을 사용해 selected Active/Normal Local Profile과 현재 Active Account의 Owner 관계를 server-authoritative하게 확인하고 초기값과 submit을 연결할 때만 제공해야 한다(MUST).

Client는 selected Profile id, Local origin 또는 Membership role 하나만으로 Owner 권한을 추측해서는 안
된다(MUST NOT).

#### Scenario: Enter the route as selected Local Owner

- **WHEN** 현재 Account가 Active이고 `currentSession.selectedProfile`이 Active/Normal Local이며
  `selectedProfile.viewerState.membership.role`이 `OWNER`다
- **THEN** route는 selected Profile에서 서버가 반환한 초기값과 submit callback을 가진 Profile edit form을
  제공한다
- **AND** 저장 성공 뒤 갱신된 Profile로 복귀한다

#### Scenario: Render the public Profile edit action for the selected Owner

- **WHEN** 공개 조회 중인 Profile이 Active/Normal Local이고 현재 Active Account의 유효한 viewer Profile과 같아
  `viewerState.isSelf`가 true이며 `viewerState.membership.role`이 `OWNER`다
- **THEN** 공개 Profile route는 해당 Profile의 편집 button을 표시한다
- **AND** top-level `selectedProfileForEdit` 또는 public `canEdit` scalar를 사용하지 않는다

#### Scenario: Reject non-owner or ineligible route access

- **WHEN** guest, 유효한 viewer Profile이 없는 session, inactive Account, selected mismatch, Member·무관 Account
  또는 Remote·inactive·suspended selected Profile이 직접 URL에 접근한다
- **THEN** client는 `이 프로필을 수정할 수 없어요`와 `프로필로 돌아가기` action을 가진 StateView를 제공한다
- **AND** Profile edit content와 enabled 저장 action을 제공하지 않는다
- **AND** selected Profile id, Local origin 또는 Membership role 하나만으로 접근을 허용하지 않는다
- **AND** 공개 Profile 화면에 disabled placeholder를 포함한 편집 button을 렌더하지 않는다
