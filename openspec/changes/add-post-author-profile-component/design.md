## Context

웹 앱에는 이미 `Avatar`, `UserRow` 같은 프로필 표시 UI가 있지만, 게시글 작성자 영역은 팔로우 버튼이나 검색 결과 레이아웃과 다른 재사용 단위가 필요하다. `PROD-97`은 타임라인, 프로필 게시글 목록 같은 게시글 목록과 더보기로 진입하는 게시글 상세 페이지에서 같은 작성자 정보를 표현할 수 있는 공통 컴포넌트를 제공하는 작업이다.

## Goals / Non-Goals

**Goals:**

- 게시글 작성자 표시 이름과 핸들을 GraphQL `Profile` fragment로 선언하고 렌더링한다.
- 현재 `Profile` API에 이미지 필드가 없으므로 fallback avatar를 렌더링한다.
- 목록과 상세에서 같은 props API로 재사용할 수 있게 한다.
- 작성자 프로필 링크가 있으면 클릭 가능한 링크로 렌더링한다.
- 긴 텍스트가 주변 게시글 레이아웃을 깨지 않도록 한다.

**Non-Goals:**

- 타임라인, 프로필 게시글 목록, 게시글 상세 라우트를 구현하지 않는다.
- GraphQL 게시글 query나 작성자 데이터 조회를 구현하지 않는다.
- 프로필 이미지 필드를 새로 추가하지 않는다.
- 팔로우/언팔로우 액션을 포함하지 않는다.

## Decisions

- `PostAuthorProfile` 컴포넌트를 새로 만든다. 기존 `UserRow`는 검색/계정 row와 팔로우 버튼 중심의 레이아웃이므로 게시글 header 영역에 그대로 쓰기 어렵다.
- `PostAuthorProfile`은 GraphQL fragment를 푸는 컨테이너로 두고, 실제 표시 UI는 `PostAuthorProfileView`로 분리한다. Storybook은 Mearie client context 없이 표시 상태를 확인해야 하므로 표시 전용 컴포넌트를 렌더링한다.
- 프로필 데이터는 `PostAuthorProfile_profile` GraphQL fragment key로 받는다. 컴포넌트가 필요한 `displayName`, `handle` 필드를 자기 파일에서 선언해 부모 query가 fragment를 spread할 수 있게 하기 위해서다.
- 프로필 이미지는 현재 GraphQL `Profile` 타입에 없으므로 기존 `Avatar` 컴포넌트의 initials fallback만 사용한다. 이미지 필드가 추가되면 fragment에 필드를 추가하는 후속 변경으로 확장한다.
- 컴포넌트 props는 작성자 fragment와 링크 가능성에만 둔다. 화면 종류를 나타내는 prop은 추가하지 않아 타임라인과 상세 페이지가 같은 컴포넌트를 사용할 수 있게 한다.
- `href`가 있으면 anchor, 없으면 non-interactive container로 렌더링한다. props 타입도 `href`를 기준으로 anchor 속성과 div 속성을 분리한다.

## Risks / Trade-offs

- 작성자 데이터 shape가 향후 GraphQL post type과 다를 수 있다. → 작성자 자체는 `Profile` fragment로 받고, 게시글 query는 작성자 위치에서 해당 fragment를 spread하게 한다.
- GraphQL fragment 컨테이너는 Storybook에서 바로 렌더링하기 어렵다. → Storybook은 Mearie context가 필요 없는 표시 전용 컴포넌트를 사용한다.
- 상세 페이지에서 더 큰 작성자 영역이 필요할 수 있다. → 이번 변경은 공통 최소 표현을 제공하고, 상세 전용 확장은 후속 화면 이슈에서 결정한다.
