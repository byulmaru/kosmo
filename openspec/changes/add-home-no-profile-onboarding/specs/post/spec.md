## MODIFIED Requirements

### Requirement: Post composer usage boundary

웹 앱은 새 글 작성 컴포넌트 사용처에서 인증과 active profile 부재 상태를 처리해야 한다(MUST).

#### Scenario: 사용처 로딩 상태

- **WHEN** 새 글 작성 컴포넌트가 놓인 사용처가 현재 session과 active profile 정보를 불러오는 중이다
- **THEN** 시스템은 로딩 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 인증되지 않은 사용자

- **WHEN** 인증 session이 없는 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 게시글을 작성하려면 로그인이 필요하다는 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 선택 프로필이 없는 사용자

- **WHEN** 로그인했지만 active profile이 선택되지 않은 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 홈(`/`)으로 이동해 프로필을 만들거나 선택하도록 안내하고, 홈으로 이동하는 링크/버튼을 제공한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: `/compose` 첫 사용처

- **WHEN** 로그인한 사용자의 active profile이 선택된 상태에서 `/compose` route가 렌더링된다
- **THEN** `/compose` route query는 `currentSession.selectedProfile`에서 새 글 작성 컴포넌트가 선언한 `Profile` fragment를 spread한다
- **AND** 시스템은 `{#if}` 분기로 선택 프로필이 있을 때만 새 글 작성 컴포넌트에 해당 fragment ref를 전달한다
- **AND** `/compose` route는 editor, 공개 범위, 글자수, mutation 제출 로직을 직접 소유하지 않는다
