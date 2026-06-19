## ADDED Requirements

### Requirement: Desktop three-column shell layout

웹 애플리케이션은 데스크톱 너비(`lg` 이상)의 탭 화면에서 좌측 내비게이션 · 중앙 콘텐츠 · 우측 레일의 3컬럼 그리드 셸을 표시해야 한다(MUST). 좌측 컬럼은 고정 폭 `20rem`으로 기존 사이드바를 배치하고, 중앙 컬럼은 최대 `600px`의 수축 가능한 폭(`minmax(0,600px)`)으로 라우트 콘텐츠를 렌더링하며, 우측 컬럼은 `minmax(290px,350px)` 가변 폭으로 자리를 확보해야 한다(MUST). 3컬럼 묶음은 뷰포트가 컬럼 합보다 넓을 때 가운데 정렬되어 남는 폭이 양옆 여백으로 배분되어야 한다(MUST). 우측 컬럼은 레일 위젯이 채워지기 전까지 빈 컨테이너여도 그리드 트랙을 유지해야 한다(MUST).

#### Scenario: Render three columns on desktop width

- **WHEN** 사용자가 `lg` 이상 너비에서 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 좌측 내비게이션, 중앙 콘텐츠, 우측 레일 자리의 3컬럼을 한 화면에 표시한다
- **AND** 좌측 컬럼에서 기존 사이드바 내비게이션이 정상 동작한다
- **AND** 중앙 컬럼에 기존 라우트 콘텐츠가 깨짐 없이 렌더링된다

#### Scenario: Center the column group on wide viewport

- **WHEN** 뷰포트 폭이 3컬럼 합(최대 1270px)보다 넓다
- **THEN** 시스템은 3컬럼 묶음을 뷰포트 가운데에 정렬하고 남는 폭을 양옆 여백으로 배분한다

#### Scenario: Center column does not push right rail

- **WHEN** 중앙 컬럼에 긴 콘텐츠가 렌더링된다
- **THEN** 중앙 트랙은 수축 가능해 우측 레일 트랙이 밀려나지 않는다

#### Scenario: Mobile layout unchanged below desktop width

- **WHEN** 사용자가 `lg` 미만 너비에서 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 우측 레일 컬럼을 표시하지 않는다
- **AND** 기존 모바일 레이아웃(상단 메뉴 헤더, drawer, 하단 탭 바, 전체 폭 콘텐츠)이 그대로 유지된다
