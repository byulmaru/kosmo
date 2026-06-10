## ADDED Requirements

### Requirement: Profile post list area

프로필 페이지는 프로필 헤더(`ProfileHero`) 아래에 게시글 목록 영역을 제공해야 한다(MUST). 목록 데이터 조회가 연결되기 전까지 이 영역은 더미 상태 분기로 동작하며, 분기 조건은 이후 목록 query의 `loading`/빈 목록에 1:1 매핑될 수 있어야 한다(MUST).

#### Scenario: Post list area placement

- **WHEN** 사용자가 `/@{handle}` 프로필 페이지를 연다
- **THEN** 시스템은 프로필 헤더 아래에 게시글 목록 영역을 표시한다
- **AND** 기존 "게시글 목록은 추후 제공됩니다." placeholder 문구는 더 이상 표시하지 않는다

### Requirement: Profile post list loading skeleton

게시글 목록 영역은 목록을 불러오는 동안 게시글 형태의 로딩 스켈레톤과 스크린리더용 로딩 안내를 표시해야 한다(MUST). 스켈레톤은 좌측 아바타 거터와 우측 텍스트 줄로 구성된 게시글 아이템 형태를 반복해 표시해야 하며, 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Loading skeleton display

- **WHEN** 게시글 목록이 로딩 중 상태다
- **THEN** 시스템은 게시글 아이템 형태의 스켈레톤을 여러 개 반복해 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 목록 로딩 안내를 제공한다

### Requirement: Profile post list empty state

게시글 목록 영역은 표시할 게시글이 없을 때 인라인 빈 상태를 표시해야 한다(MUST). 빈 상태는 제목과 보조 설명으로 구성하며, 레이아웃이 깨지지 않아야 한다(MUST).

#### Scenario: Empty state display

- **WHEN** 프로필에 표시할 게시글이 없다
- **THEN** 시스템은 목록 영역에 "아직 게시글이 없어요" 제목과 "첫 게시글이 올라오면 여기에 표시돼요." 보조 설명을 중앙 정렬로 표시한다
- **AND** 프로필 헤더와 상위 `(tabs)` 셸은 그대로 유지된다
