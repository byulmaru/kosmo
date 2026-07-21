## MODIFIED Requirements

### Requirement: Protected app routes require a valid session

`(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/bookmarks`·`/menu`)은 유효한 세션(로그인)을 전제로 한다(MUST). 유효한 세션이 없는 사용자가 이 라우트에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 쿠키 존재만으로 판정하지 않는다. 공개 프로필 라우트(`/${relativeHandle}` 및 그 하위 게시글 상세)는 비로그인 조회를 유지해야 하며 이 가드에서 제외된다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 리다이렉트하지 않는다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/compose`·`/search`·`/notifications`·`/bookmarks`·`/menu` 중 하나에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Invalid or expired session is treated as guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 보호 라우트에 접근한다
- **THEN** `currentSession`이 `null`이므로 시스템은 비로그인과 동일하게 루트 온보딩(`/`)으로 이동한다

#### Scenario: Public profile remains accessible without login

- **WHEN** 비로그인 사용자가 `/${relativeHandle}` 또는 `/${relativeHandle}/{postId}`에 접근한다
- **THEN** 시스템은 리다이렉트하지 않고 공개 프로필·게시글을 표시한다

#### Scenario: Signed-in user reaches protected route

- **WHEN** 유효한 세션을 가진 사용자가 보호 라우트에 접근한다
- **THEN** 시스템은 리다이렉트 없이 해당 화면을 표시한다

#### Scenario: Hold redirect while session is loading

- **WHEN** `currentSession` 확인이 진행 중이거나 조회가 오류로 실패했다
- **THEN** 시스템은 판단을 보류하고 리다이렉트하지 않는다

## ADDED Requirements

### Requirement: Protected Bookmark list route

웹 앱은 개인 Bookmark 목록을 `/bookmarks` canonical route로 제공하고 `(tabs)` 앱 셸 안에 렌더링해야 한다(MUST). 유효한 선택 Profile이 없으면 다른 Profile의 데이터를 대신 사용하지 않고 Profile 선택 안내를 표시해야 한다(MUST).

#### Scenario: Open the Bookmark route

- **WHEN** 유효한 세션과 선택 Profile이 있는 사용자가 `/bookmarks`로 이동한다
- **THEN** 시스템은 `(tabs)` 셸을 유지하며 선택 Profile의 개인 Bookmark 목록 화면을 표시한다

#### Scenario: Open without a selected Profile

- **WHEN** 유효한 세션은 있지만 선택 Profile이 없는 사용자가 `/bookmarks`로 이동한다
- **THEN** 시스템은 Bookmark 목록을 요청하지 않고 Profile 선택 안내를 표시한다

### Requirement: Independent Post Bookmark control

게시글 목록 항목과 게시글 디테일은 현재 선택 Profile이 사용할 수 있는 독립적인 Bookmark control을 제공해야 한다(MUST). 목록 카드 안의 Bookmark control은 카드의 게시글 상세 이동보다 자기 동작을 우선해야 하며(MUST), 공통 Post Action Bar rollout을 전제로 하지 않아야 한다(MUST NOT).

#### Scenario: Activate Bookmark from a post list item

- **WHEN** 사용자가 `PostListItem` 안의 Bookmark control을 활성화한다
- **THEN** 시스템은 현재 선택 Profile의 Bookmark 동작을 수행한다
- **AND** 게시글 디테일 route로 이동하지 않는다

#### Scenario: Show Bookmark state on post detail

- **WHEN** 유효한 선택 Profile이 게시글 디테일을 본다
- **THEN** 시스템은 그 Profile의 현재 Bookmark 상태와 실행 가능한 control을 표시한다

#### Scenario: No eligible selected Profile

- **WHEN** 세션 또는 실행 가능한 선택 Profile이 없다
- **THEN** 시스템은 Bookmark 생성·삭제 요청을 실행할 수 있는 control을 제공하지 않는다
