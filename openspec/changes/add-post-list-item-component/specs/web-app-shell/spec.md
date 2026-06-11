## ADDED Requirements

### Requirement: Post list item display

게시글 목록 항목 컴포넌트(`PostListItem`)는 게시글 한 건의 작성자 프로필(아바타·표시 이름·핸들), Plain Text 본문, 작성 시간을 표시해야 한다(MUST). 작성자 영역은 `PostAuthorProfile`을 재사용하고, 목록 항목의 아바타는 48px로 표시해야 한다(MUST). 필요한 데이터는 컴포넌트 자신의 fragment(`PostListItem_post`)로 선언해야 한다(MUST).

#### Scenario: Item content display

- **WHEN** 게시글 데이터(fragment ref)가 항목 컴포넌트에 전달된다
- **THEN** 시스템은 좌측 아바타 거터와 우측 콘텐츠 컬럼 구조로 작성자 표시 이름·핸들, 본문, 작성 시간을 표시한다

#### Scenario: Empty body

- **WHEN** 게시글의 `content`가 비어 있다
- **THEN** 시스템은 본문 영역 없이 작성자와 작성 시간만 표시하고 레이아웃이 깨지지 않는다

### Requirement: Post list item body clamping

목록 항목의 본문은 여러 줄을 넘으면 클램프해 표시해야 하며(MUST), 본문이 실제로 잘린 경우에만 "더보기..." 버튼을 노출해야 한다(MUST). "더보기..."는 게시글 디테일로 이동하지 않고 제자리에서 본문 전체를 펼쳐야 한다(MUST).

#### Scenario: Long body clamped

- **WHEN** 본문이 클램프 줄 수를 초과한다
- **THEN** 시스템은 본문을 클램프해 표시하고 본문 아래에 "더보기..." 버튼을 표시한다

#### Scenario: Expand inline

- **WHEN** 사용자가 "더보기..." 버튼을 누른다
- **THEN** 시스템은 페이지 이동 없이 해당 항목의 본문 전체를 펼쳐 표시하고 버튼을 숨긴다

#### Scenario: Short body not clamped

- **WHEN** 본문이 클램프 줄 수 이내다
- **THEN** 시스템은 본문 전체를 표시하고 "더보기..." 버튼을 표시하지 않는다

### Requirement: Post list item time display

목록 항목의 작성 시간은 이름 블록과 같은 행의 우측에 표시해야 한다(MUST). 작성 후 24시간 미만이면 상대시간("방금 전"/"n분 전"/"n시간 전")을, 24시간 이상이면 날짜("2026. 04. 27" 형식)를 표시해야 한다(MUST). 기계 가독 시각을 `<time datetime>`으로 제공해야 한다(MUST).

#### Scenario: Recent post relative time

- **WHEN** 게시글이 24시간 이내에 작성됐다
- **THEN** 시스템은 "n분 전" 또는 "n시간 전" 형식의 상대시간을 헤더 우측에 표시한다

#### Scenario: Older post absolute date

- **WHEN** 게시글이 작성된 지 24시간 이상 지났다
- **THEN** 시스템은 "2026. 04. 27" 형식의 날짜를 헤더 우측에 표시한다
