## Purpose

kosmo 웹 애플리케이션의 공통 앱 shell 계약을 문서화한다. 이 스펙은 탭 기반 화면 구조, 안전 영역 처리, 공통 하단 navigation 표시를 다룬다.

## Requirements

### Requirement: Tab shell layout

웹 애플리케이션은 탭 화면에 공통 하단 탭 바를 표시해야 한다(MUST).

#### Scenario: Render tab page shell

- **WHEN** 사용자가 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 안전 영역 상단 padding과 하단 탭 공간을 포함하는 main 영역에 페이지 내용을 렌더링한다
- **AND** 하단에 `BottomTabBar`를 표시한다

### Requirement: Handle and post-id based post detail route

웹 앱은 핸들과 게시글 ID를 포함한 URL로 단일 게시글 디테일에 직접 접근할 수 있도록, 프로필 라우트 하위에 게시글 ID 동적 라우트를 제공해야 한다(MUST). 이 라우트는 작성자 프로필 헤더(`ProfileHero`)를 렌더하지 않고 단독 게시글 뷰로 표시해야 하며(MUST), 상위 `(tabs)` 셸(사이드바·하단탭)은 유지해야 한다(MUST).

#### Scenario: Access post by handle and post id URL

- **WHEN** 사용자가 `/@{handle}/{postId}` 형식의 주소로 이동한다
- **THEN** 시스템은 `(tabs)` 셸 안에서 해당 게시글의 디테일 뷰를 연다
- **AND** 라우트는 레이아웃을 `(tabs)` 셸까지 리셋해 상위 핸들 라우트의 `ProfileHero`를 표시하지 않는다

### Requirement: Post basic information display

게시글 디테일 페이지는 게시글의 기본 정보를 표시해야 한다(MUST). 표시 항목은 Plain Text 본문, 작성자(표시 이름·핸들), 작성 시각, 공개 범위이며, 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display post body and author

- **WHEN** 표시할 활성 게시글이 있다
- **THEN** 시스템은 Plain Text 본문을 줄바꿈을 보존해 표시하고, 작성자 표시 이름과 `@handle`, 작성 시각, 공개 범위를 표시한다
- **AND** 작성자 영역은 작성자의 `/@{handle}` 프로필 페이지로 이동할 수 있다

#### Scenario: Author avatar initial fallback

- **WHEN** 작성자에게 아바타 이미지가 없다(스키마 미보유)
- **THEN** 시스템은 표시 이름(없으면 핸들)의 첫 글자를 대문자로 한 이니셜 아바타를 표시한다

#### Scenario: Missing post content

- **WHEN** 게시글에 표시할 본문 콘텐츠가 없다
- **THEN** 시스템은 본문 영역을 비워도 레이아웃이 깨지지 않는다

### Requirement: Post detail loading and error states

게시글 디테일 페이지는 로딩, 조회 오류, 없는 게시글, 삭제된 게시글 상태를 처리해야 한다(MUST). 모든 상태에서 상위 `(tabs)` 셸은 유지되어야 한다(MUST).

#### Scenario: Loading state

- **WHEN** 게시글 조회가 진행 중이다
- **THEN** 시스템은 게시글 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시한다

#### Scenario: Query error

- **WHEN** 게시글 조회가 오류로 실패한다
- **THEN** 시스템은 오류 안내와 다시 시도 동작을 제공하고, 사이드바·하단탭은 유지한다

#### Scenario: Missing post

- **WHEN** 게시글 ID와 일치하는 게시글이 없다
- **THEN** 시스템은 인라인 빈 상태("게시글을 찾을 수 없어요")를 표시하고, 사이드바·하단탭은 유지한다

#### Scenario: Deleted post

- **WHEN** 게시글의 상태가 `DELETED`이다
- **THEN** 시스템은 삭제된 게시글 안내를 표시하고, 본문은 노출하지 않는다

### Requirement: Post detail back navigation

게시글 디테일 페이지는 상단에 이전 화면으로 돌아가는 back 컨트롤을 제공해야 한다(MUST).

#### Scenario: Navigate back

- **WHEN** 사용자가 디테일 페이지 상단의 back 컨트롤을 누른다
- **THEN** 시스템은 이전 화면으로 돌아간다

### Requirement: Profile post list area

프로필 페이지는 프로필 헤더(`ProfileHero`) 아래에 게시글 목록 영역을 제공해야 한다(MUST). 이 영역은 프로필별 게시글 목록 query 상태에 따라 로딩, 오류, 빈 목록, 게시글 목록을 표시해야 한다(MUST).

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

### Requirement: Profile post list data rendering

게시글 목록 영역은 프로필별 게시글 목록 query의 첫 페이지를 조회해 게시글 항목 목록을 렌더해야 한다(MUST). 목록 항목은 `PostListItem`의 fragment 계약을 통해 데이터를 받아야 한다(MUST). 이 요구사항은 첫 페이지 렌더링만 다루며, 추가 페이지 로딩은 별도 후속 범위다.

#### Scenario: Post list items display

- **WHEN** 프로필 게시글 목록 query가 게시글 edge를 반환한다
- **THEN** 시스템은 각 edge의 node를 `PostListItem`으로 렌더한다
- **AND** 게시글 목록은 프로필 헤더 아래에 표시된다

### Requirement: Profile post list detail navigation

게시글 목록 영역은 각 게시글 카드 전체를 해당 게시글 디테일 페이지로 연결해야 한다(MUST). 카드 안의 별도 인터랙티브 컨트롤은 상세 이동보다 자기 동작을 우선해야 한다(MUST).

#### Scenario: Navigate from post list card

- **WHEN** 사용자가 프로필 게시글 목록에서 게시글 카드를 선택한다
- **THEN** 시스템은 `/@{handle}/{postId}` 형식의 게시글 디테일 페이지로 이동한다
- **AND** 사용자가 카드 안의 `더보기...` 같은 별도 컨트롤을 선택하면 시스템은 상세 페이지로 이동하지 않고 해당 컨트롤의 동작을 수행한다

### Requirement: Profile post list empty state

게시글 목록 영역은 표시할 게시글이 없을 때 인라인 빈 상태를 표시해야 한다(MUST). 빈 상태는 제목과 보조 설명으로 구성하며, 레이아웃이 깨지지 않아야 한다(MUST).

#### Scenario: Empty state display

- **WHEN** 프로필에 표시할 게시글이 없다
- **THEN** 시스템은 목록 영역에 "아직 게시글이 없어요" 제목과 "첫 게시글이 올라오면 여기에 표시돼요." 보조 설명을 중앙 정렬로 표시한다
- **AND** 프로필 헤더와 상위 `(tabs)` 셸은 그대로 유지된다

### Requirement: Profile post list error state

게시글 목록 영역은 목록 query가 실패하고 표시할 기존 목록 데이터가 없을 때 인라인 오류 상태와 재시도 동작을 제공해야 한다(MUST). 기존 목록 데이터가 있으면 로딩/오류 중에도 기존 목록을 유지해야 한다(SHOULD).

#### Scenario: Error state display

- **WHEN** 프로필 게시글 목록 query가 실패했고 표시할 기존 목록 데이터가 없다
- **THEN** 시스템은 "게시글 목록을 불러오지 못했어요" 오류 상태를 표시한다
- **AND** 사용자는 다시 시도 버튼으로 목록 query를 다시 요청할 수 있다
