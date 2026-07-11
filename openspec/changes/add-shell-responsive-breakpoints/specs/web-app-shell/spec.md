## MODIFIED Requirements

### Requirement: Desktop three-column shell layout

웹 애플리케이션의 `(tabs)` 셸은 화면 폭에 따라 데스크톱 레이아웃을 단계적으로 압축해 표시해야 한다(MUST). 모바일 ↔ 데스크톱 경계는 `md`(768px)이며, `md` 이상에서는 (접힌/펼친) 사이드바가 항상 보이고 하단 탭 바·drawer 진입은 표시하지 않는다(MUST). `md` 이상 `xl` 미만에서는 좌측 아이콘 레일(`5rem`)과 중앙 콘텐츠의 2컬럼을 표시하고 우측 레일은 표시하지 않는다(MUST). `xl`(1280px) 이상에서는 좌측 풀 사이드바(`20rem`) · 중앙 콘텐츠 · 우측 레일의 3컬럼을 표시해야 한다(MUST). 중앙 컬럼은 `minmax(0,600px)`로 최대 `600px`까지 라우트 콘텐츠를 렌더링하며, `xl` 경계에서 좌·우 컬럼과 함께 중앙 `600px`를 확보한 채 눌리지 않고 들어맞아야 한다(MUST). 우측 컬럼은 `minmax(290px,350px)` 가변 폭으로 자리를 확보하고, 레일 위젯이 비어도 그리드 트랙을 유지해야 한다(MUST). 컬럼 묶음은 뷰포트가 컬럼 합보다 넓을 때 가운데 정렬되어 남는 폭이 양옆 여백으로 배분되어야 한다(MUST).

#### Scenario: Mobile layout below md

- **WHEN** 사용자가 `md` 미만 너비에서 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 좌측 사이드바 컬럼과 우측 레일 컬럼을 표시하지 않는다
- **AND** 상단 메뉴 헤더, drawer, 하단 탭 바, 전체 폭 콘텐츠가 그대로 유지된다

#### Scenario: Icon rail and feed between md and xl

- **WHEN** 사용자가 `md` 이상 `xl` 미만 너비에서 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 좌측 아이콘 레일(`5rem`)과 중앙 콘텐츠의 2컬럼을 표시한다
- **AND** 우측 레일 컬럼과 하단 탭 바는 표시하지 않는다
- **AND** 좌측 컬럼에서 내비게이션이 정상 동작한다

#### Scenario: Full three columns at xl and above

- **WHEN** 사용자가 `xl` 이상 너비에서 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 좌측 풀 사이드바(`20rem`), 중앙 콘텐츠, 우측 레일의 3컬럼을 한 화면에 표시한다
- **AND** 좌측 컬럼에서 풀 사이드바 내비게이션이 정상 동작한다
- **AND** 중앙 컬럼이 `600px`를 확보한 채 기존 라우트 콘텐츠가 깨짐 없이 렌더링된다

#### Scenario: Center the column group on wide viewport

- **WHEN** 뷰포트 폭이 컬럼 합보다 넓다
- **THEN** 시스템은 컬럼 묶음을 뷰포트 가운데에 정렬하고 남는 폭을 양옆 여백으로 배분한다

## ADDED Requirements

### Requirement: Icon-rail sidebar

좌측 사이드바는 `md` 이상 `xl` 미만 너비에서 아이콘 전용 레일(`5rem`)로 표시되어야 하며(MUST), `xl` 이상에서는 프로필 헤더와 라벨을 포함한 풀 사이드바로 표시되어야 한다(MUST). 아이콘 레일과 풀 사이드바는 한 컴포넌트에서 스크립트·뮤테이션·프로필 상태를 공유하고 CSS 반응형으로 전환되어야 한다(MUST). 아이콘 레일 단계에서도 주요 내비게이션 항목에 모두 접근할 수 있어야 한다(MUST).

#### Scenario: Icon-only rail between md and xl

- **WHEN** 사용자가 `md` 이상 `xl` 미만 너비에서 본다
- **THEN** 시스템은 좌측 사이드바를 아이콘 전용 레일(`5rem`)로 표시한다
- **AND** 아이콘 레일에서 주요 내비게이션 항목에 접근할 수 있다

#### Scenario: Full sidebar at xl and above

- **WHEN** 사용자가 `xl` 이상 너비에서 본다
- **THEN** 시스템은 좌측 사이드바를 프로필 헤더와 라벨이 있는 풀 사이드바로 표시한다

### Requirement: Desktop compose entry

`(tabs)` 셸은 모든 단계에서 글쓰기 진입을 제공해야 한다(MUST). `md` 미만에서는 하단 탭 바가, `md` 이상 `xl` 미만 아이콘 레일 단계에서는 사이드바의 글쓰기 버튼이 `/compose` 진입을 제공해야 한다(MUST). `xl` 이상에서는 우측 레일 컴포저가 글쓰기 진입을 제공하므로, 사이드바의 글쓰기 버튼을 표시하지 않아야 한다(MUST).

#### Scenario: Compose button in icon rail stage

- **WHEN** 사용자가 `md` 이상 `xl` 미만 너비에서 글쓰기를 시작하려 한다
- **THEN** 시스템은 사이드바 아이콘 레일의 글쓰기 버튼으로 `/compose` 진입을 제공한다

#### Scenario: No sidebar compose button when the right rail is present

- **WHEN** 사용자가 `xl` 이상 너비에서 본다
- **THEN** 시스템은 풀 사이드바에 글쓰기 버튼을 표시하지 않는다
- **AND** 우측 레일 컴포저가 글쓰기 진입을 담당한다

### Requirement: Collapsed profile switcher

아이콘 레일 단계(`md` 이상 `xl` 미만)에서 사용자가 프로필 아바타를 누르면, 시스템은 drawer를 열지 않고 프로필 스위처 드롭다운을 아바타 옆 popover로 표시해야 한다(MUST).

#### Scenario: Profile switcher popover from the icon rail

- **WHEN** 사용자가 `md` 이상 `xl` 미만 너비에서 아이콘 레일의 프로필 아바타를 누른다
- **THEN** 시스템은 drawer를 열지 않고 프로필 스위처 드롭다운을 아바타 옆에 popover로 표시한다
