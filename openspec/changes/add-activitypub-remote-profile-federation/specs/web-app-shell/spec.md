## MODIFIED Requirements

### Requirement: Handle-based profile page route

웹 앱은 핸들 또는 stored ActivityPub remote profile의 `relativeHandle`을 포함한 URL로 프로필 페이지에 직접 접근할 수 있도록 `(tabs)` 그룹 안에 핸들 동적 라우트를 제공해야 한다(MUST). 이 라우트는 `@` 프리픽스를 사용해 정적 엔드포인트 경로와 충돌하지 않아야 한다(MUST).

#### Scenario: Access profile by handle URL

- **WHEN** 사용자가 `/@{relativeHandle}` 형식의 주소로 이동한다
- **THEN** 시스템은 `(tabs)` 셸(사이드바·하단탭) 안에서 해당 핸들의 프로필 페이지를 연다
- **AND** layout에서 `profileByHandle(handle:)` query로 프로필을 조회해 렌더한 프로필 헤더를 하위 화면 전반에서 공유한다
- **AND** local profile의 `relativeHandle`은 bare handle이고, stored ActivityPub remote profile의 `relativeHandle`은 `handle@domain`이다

#### Scenario: Static endpoint not intercepted by handle route

- **WHEN** 사용자가 `/login`·`/graphql`·`/health` 등 정적 엔드포인트 경로로 이동한다
- **THEN** 핸들 라우트는 `@`로 시작하지 않는 경로를 매칭하지 않으므로 해당 엔드포인트가 정상 처리된다

### Requirement: People tab exact handle search results

검색 후 사람 탭은 제출된 검색어(`q`)를 정확 handle로 해석해 기존 `profileByHandle` 조회 결과를 표시해야 한다(MUST). 사람 탭이 아니거나 제출된 검색어가 비어 있으면 handle 조회를 실행하지 않아야 한다(MUST NOT). 검색 결과는 실데이터와 팔로우 액션이 연결된 `ProfileListItem`으로 표시해야 한다(MUST). 검색 결과 항목은 해당 프로필의 `relativeHandle`을 route parameter로 사용한 프로필 페이지(`/@{relativeHandle}`)로 이동할 수 있어야 한다(MUST). prefix, display name, fediverse 검색은 이 범위에서 제공하지 않는다(MUST NOT).

#### Scenario: Existing handle result

- **WHEN** 사용자가 존재하는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 `profileByHandle` 결과를 `ProfileListItem`으로 표시한다
- **AND** 결과 항목의 프로필 정보 영역은 `/@{relativeHandle}` 프로필 페이지로 이동한다
- **AND** stored ActivityPub remote profile의 `relativeHandle`은 bare `handle`이 아니라 `handle@domain`이다
- **AND** 결과 항목의 팔로우 액션은 기존 `ProfileListItem`/`FollowButton` 정책에 따라 표시되거나 숨겨진다

#### Scenario: Missing handle result

- **WHEN** 사용자가 존재하지 않는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 `profileByHandle` 조회를 실행하지 않는다

### Requirement: Follow count entry-point links

프로필 헤더(`ProfileHero`)와 사이드바 활성 프로필 영역에 표시되는 팔로잉/팔로워 수는 각각 해당 프로필의 팔로잉·팔로워 목록 웹 라우트로 이동하는 링크여야 한다(MUST). 프로필 헤더 링크 대상은 조회된 profile의 `relativeHandle`을 사용해 팔로잉이 `/@{relativeHandle}/following`, 팔로워가 `/@{relativeHandle}/followers`여야 하며(MUST), ActivityPub collection URL로 연결하지 않아야 한다(MUST NOT). 표시·이동 순서는 `팔로잉 → 팔로워`여야 한다(MUST). 각 카운트의 클릭(활성) 영역은 숫자와 라벨 텍스트를 모두 포함해야 한다(MUST). 사이드바 활성 프로필 영역의 카운트 링크가 모바일 drawer 안에서 렌더될 때는, 다른 drawer 내 navigation과 동일하게 이동 시 drawer를 닫아야 한다(MUST).

#### Scenario: Navigate to lists from profile header

- **WHEN** 사용자가 프로필 헤더에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 각각 `/@{relativeHandle}/following` 또는 `/@{relativeHandle}/followers` 웹 라우트로 이동한다
- **AND** stored ActivityPub remote profile의 `relativeHandle`은 `handle@domain` 형식이다
- **AND** 링크 대상은 ActivityPub collection URL이 아니라 로컬 웹 라우트다

#### Scenario: Navigate to lists from sidebar

- **WHEN** 사용자가 사이드바 활성 프로필 영역에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 선택된 프로필의 `/@{relativeHandle}/following` 또는 `/@{relativeHandle}/followers` 웹 라우트로 이동한다

#### Scenario: Whole count and label is the click target

- **WHEN** 카운트가 숫자와 `팔로잉`/`팔로워` 라벨로 구성된다
- **THEN** 사용자가 숫자 또는 라벨 중 어느 쪽을 눌러도 같은 목록 라우트로 이동한다

#### Scenario: Close mobile drawer on navigation

- **WHEN** 모바일 drawer에 렌더된 사이드바에서 사용자가 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 목록 라우트로 이동하면서 열려 있던 drawer를 닫는다
