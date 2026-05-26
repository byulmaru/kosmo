## ADDED Requirements

### Requirement: Responsive sidebar navigation

웹 애플리케이션은 탭 페이지에 사이드바 내비게이션을 제공해야 한다(MUST). 데스크톱 크기 화면에서는 고정 사이드바를 사용하고, 모바일 크기 화면에서는 drawer 사이드바를 사용해야 한다(MUST).

#### Scenario: Render desktop sidebar

- **WHEN** 사용자가 데스크톱 크기 화면에서 `(tabs)` 페이지를 본다
- **THEN** 시스템은 페이지 콘텐츠 옆에 고정 사이드바를 렌더링한다
- **AND** 사이드바에는 주요 내비게이션 메뉴 항목이 포함된다

#### Scenario: Render mobile drawer trigger

- **WHEN** 사용자가 모바일 크기 화면에서 `(tabs)` 페이지를 본다
- **THEN** 시스템은 사이드바 drawer를 열 수 있는 control을 렌더링한다

#### Scenario: Open mobile drawer by button

- **WHEN** 사용자가 모바일 drawer control을 활성화한다
- **THEN** 시스템은 사이드바 drawer를 연다

#### Scenario: Open mobile drawer by swipe

- **WHEN** 사용자가 모바일 크기 화면에서 왼쪽 edge swipe 제스처를 수행한다
- **THEN** 시스템은 사이드바 drawer를 연다

#### Scenario: Close mobile drawer on navigation

- **WHEN** 모바일 사이드바 drawer가 열려 있다
- **AND** 사용자가 내비게이션 메뉴 항목을 선택한다
- **THEN** 시스템은 선택한 destination으로 이동한다
- **AND** drawer를 닫는다

#### Scenario: Mark active navigation item

- **WHEN** 사이드바에 현재 페이지와 일치하는 내비게이션 항목이 있다
- **THEN** 시스템은 해당 항목을 active 상태로 표시한다
- **AND** active 상태는 page-current semantics로 노출된다

### Requirement: Sidebar profile switching

웹 애플리케이션은 인증된 사용자가 사이드바에서 접근 가능한 프로필 사이를 전환할 수 있게 해야 한다(MUST).

#### Scenario: Render accessible profiles

- **WHEN** 인증된 계정에 접근 가능한 활성 프로필이 있다
- **THEN** 사이드바는 선택 가능한 프로필 목록을 표시한다
- **AND** 현재 활성 프로필을 시각적으로 구분한다

#### Scenario: Switch active profile

- **WHEN** 사용자가 사이드바에서 다른 접근 가능한 프로필을 선택한다
- **THEN** 시스템은 즉시 해당 프로필을 활성 프로필로 요청한다
- **AND** 요청 성공 후 사이드바는 새 활성 프로필을 반영한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다
