## ADDED Requirements

### Requirement: 편집 가능한 selected Profile의 반응형 navigation 진입점

**Authority / Provenance:** `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, PROD-660 — 유니버설 애플리케이션은 nullable `selectedProfileForEdit`이 반환되는 인증 사용자에게 full Web sidebar, compact Web icon rail과 shared mobile drawer에서 canonical `/profile-edit` 진입점을 제공해야 한다(MUST). 이 진입점은 기존 selected Profile 공개 페이지 진입점 바로 다음에 `UserRoundPen` 아이콘과 `프로필 편집` label로 표시되어야 하며(MUST), `selectedProfileForEdit`이 `null`이면 시각 화면과 접근성 트리에서 모두 숨겨야 한다(MUST). mobile bottom tab과 우측 레일에는 중복 진입점을 제공하지 않아야 한다(MUST NOT).

#### Scenario: full Web sidebar에서 Profile 편집 진입

- **WHEN** 인증 사용자의 `selectedProfileForEdit`이 반환되고 full Web sidebar가 렌더링된다
- **THEN** 시스템은 selected Profile의 `프로필` 진입점 바로 다음에 `UserRoundPen` 아이콘과 `프로필 편집`
  label을 가진 link를 표시한다
- **AND** link의 destination은 `/profile-edit`이다

#### Scenario: compact Web icon rail에서 Profile 편집 진입

- **WHEN** 인증 사용자의 `selectedProfileForEdit`이 반환되고 compact Web icon rail이 렌더링된다
- **THEN** 시스템은 accessible name이 `프로필 편집`인 `UserRoundPen` link를 표시한다
- **AND** link의 destination은 `/profile-edit`이다

#### Scenario: shared mobile drawer에서 Profile 편집 진입

- **WHEN** 인증 사용자의 `selectedProfileForEdit`이 반환되고 mobile Web, Android 또는 iOS의 drawer가 열린다
- **THEN** 시스템은 selected Profile의 `프로필` 진입점 바로 다음에 `프로필 편집` link를 표시한다
- **AND** 사용자가 link를 실행하면 guarded forward navigation으로 `/profile-edit`를 열고 drawer를 닫는다

#### Scenario: 편집할 수 없는 selected Profile의 진입점 비노출

- **WHEN** 세션이 없거나 `selectedProfileForEdit`이 `null`이다
- **THEN** 시스템은 full sidebar, compact icon rail과 mobile drawer에 `프로필 편집` 항목을 시각적으로 표시하지
  않는다
- **AND** 해당 항목을 disabled link, button 또는 다른 interactive element로 접근성 트리에 노출하지 않는다

#### Scenario: Profile 편집 현재 route 상태

- **WHEN** 현재 pathname이 `/profile-edit`이고 `프로필 편집` link가 렌더링된다
- **THEN** 시스템은 해당 link를 active로 표시한다
- **AND** link는 page-current semantics와 `프로필 편집` accessible name을 유지한다

#### Scenario: 중복 shell 진입점과 placeholder 비노출

- **WHEN** `프로필 편집` 진입점이 responsive navigation에 표시된다
- **THEN** 시스템은 mobile bottom tab과 우측 레일에 같은 진입점을 추가하지 않는다
- **AND** generic `/menu`를 가리키는 `프로필 설정` placeholder를 복원하지 않는다
