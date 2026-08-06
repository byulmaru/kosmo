## MODIFIED Requirements

### Requirement: 편집 가능한 selected Profile의 sidebar Profile 요약 진입점

**Authority / Provenance:** `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, Figma `WebSidebar` node `901:610`, `ProfileHero` edit button node `560:453`, `Button` primary/sm node `271:3`, PROD-660 — 유니버설 애플리케이션은 nullable `selectedProfileForEdit`이 반환되는 인증 사용자에게 full Web sidebar와 shared mobile drawer의 expanded Profile 요약에서 canonical `/profile-edit` action을 제공해야 한다(MUST). 이 action은 오른쪽 mini-profile 이미지 묶음 바로 아래에 우측 정렬한 작은 노란 `편집` button으로 표시되어야 하며(MUST), `selectedProfileForEdit`이 `null`이면 시각 화면과 접근성 트리에서 모두 숨겨야 한다(MUST). compact Web icon rail, mobile bottom tab, 우측 레일과 주요 navigation에는 중복 진입점을 제공하지 않아야 한다(MUST NOT).

#### Scenario: full Web sidebar의 Profile 요약에서 편집 진입

- **WHEN** 인증 사용자의 `selectedProfileForEdit`이 반환되고 full Web sidebar가 렌더링된다
- **THEN** 시스템은 selected Profile 요약의 오른쪽 mini-profile 이미지 묶음 바로 아래에 우측 정렬한 `편집`
  action을 표시한다
- **AND** 시각 button은 `72x32 CSS px`, primary 배경, `radius.sm`, SUIT 14px bold label을 사용한다
- **AND** link의 destination은 `/profile-edit`이고 accessible name은 `프로필 편집`이다

#### Scenario: shared mobile drawer의 Profile 요약에서 편집 진입

- **WHEN** 인증 사용자의 `selectedProfileForEdit`이 반환되고 mobile Web, Android 또는 iOS의 drawer가 열린다
- **THEN** 시스템은 full sidebar와 같은 Profile 요약 위치와 `72x32` 시각 geometry로 `편집` action을 표시한다
- **AND** Web의 pointer target은 `72x32 CSS px`, iOS와 Android의 input target은 시각 geometry를 바꾸지 않은
  각각 최소 `44pt`와 `48dp` 높이의 투명 slot이다
- **AND** 사용자가 action을 실행하면 guarded forward navigation으로 `/profile-edit`를 열고 drawer를 닫는다

#### Scenario: compact Web icon rail에서 편집 action 비노출

- **WHEN** compact Web icon rail이 렌더링된다
- **THEN** 시스템은 `프로필 편집` navigation item, icon 또는 별도 compact action을 표시하지 않는다
- **AND** selected Profile avatar trigger의 기존 동작과 geometry를 유지한다

#### Scenario: 편집할 수 없는 selected Profile의 action 비노출

- **WHEN** 세션이 없거나 `selectedProfileForEdit`이 `null`이다
- **THEN** 시스템은 full sidebar와 mobile drawer의 Profile 요약에 `편집` action을 시각적으로 표시하지 않는다
- **AND** 해당 action을 disabled link, button 또는 다른 interactive element로 접근성 트리에 노출하지 않는다

#### Scenario: Profile 편집 현재 route 상태

- **WHEN** 현재 pathname이 exact `/profile-edit`이고 Profile 요약의 `편집` action이 렌더링된다
- **THEN** 시스템은 action에 page-current semantics를 제공한다
- **AND** action은 `프로필 편집` accessible name과 노란 button의 시각 geometry를 유지한다

#### Scenario: 중복 shell 진입점과 placeholder 비노출

- **WHEN** Profile 요약의 `편집` action이 표시된다
- **THEN** 시스템은 주요 navigation, compact Web icon rail, mobile bottom tab과 우측 레일에 같은 진입점을
  추가하지 않는다
- **AND** generic `/menu`를 가리키는 `프로필 설정` placeholder를 복원하지 않는다
- **AND** mini-profile 이미지 묶음에 실제 Profile switching data나 interaction을 추가하지 않는다
