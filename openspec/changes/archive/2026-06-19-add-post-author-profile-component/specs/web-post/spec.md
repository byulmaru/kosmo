## ADDED Requirements

### Requirement: Post author profile display

웹 앱은 게시글 목록과 게시글 상세 페이지에서 재사용 가능한 GraphQL `Profile` fragment 기반 작성자 프로필 표시 컴포넌트를 제공해야 한다(MUST).

#### Scenario: Render author identity

- **WHEN** 게시글 작성자 표시 이름과 핸들이 제공된다
- **THEN** 시스템은 작성자 표시 이름과 핸들을 함께 렌더링한다

#### Scenario: Render author fallback avatar

- **WHEN** 게시글 작성자 `Profile` fragment가 제공된다
- **THEN** 시스템은 표시 이름 또는 핸들 기반 fallback avatar를 렌더링한다

#### Scenario: Declare author profile fields as fragment

- **WHEN** 부모 GraphQL query가 게시글 작성자 프로필을 조회한다
- **THEN** 시스템은 작성자 표시 컴포넌트가 선언한 `Profile` fragment를 spread할 수 있어야 한다

#### Scenario: Keep layout with long author text

- **WHEN** 작성자 표시 이름 또는 핸들이 긴 값이다
- **THEN** 시스템은 게시글 목록 또는 상세 레이아웃을 깨지 않고 텍스트를 줄임 처리한다

#### Scenario: Link to author profile when available

- **WHEN** 작성자 프로필 링크가 제공된다
- **THEN** 시스템은 작성자 프로필 영역을 해당 링크로 이동 가능한 요소로 렌더링한다

#### Scenario: Render without route dependency

- **WHEN** 작성자 프로필 링크가 제공되지 않는다
- **THEN** 시스템은 특정 라우트 구현에 의존하지 않고 작성자 정보를 non-interactive 요소로 렌더링한다
