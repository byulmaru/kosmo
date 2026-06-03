## ADDED Requirements

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
