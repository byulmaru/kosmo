## Purpose

kosmo 웹 애플리케이션의 공통 앱 shell 계약을 문서화한다. 이 스펙은 탭 기반 화면 구조, 안전 영역 처리, 공통 하단 navigation 표시를 다룬다.

## Requirements

### Requirement: Tab shell layout

웹 애플리케이션은 탭 화면에 공통 하단 탭 바를 표시해야 한다(MUST).

#### Scenario: Render tab page shell

- **WHEN** 사용자가 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 안전 영역 상단 padding과 하단 탭 공간을 포함하는 main 영역에 페이지 내용을 렌더링한다
- **AND** 하단에 `BottomTabBar`를 표시한다

### Requirement: Home route location

홈 콘텐츠는 `(tabs)` 탭 셸 아래 `/home` 경로에서 제공되어야 한다(MUST). 루트 경로 `/`는 더 이상 홈 콘텐츠를 렌더링하지 않는다.

#### Scenario: Render home at /home

- **WHEN** 사용자가 `/home`을 연다
- **THEN** 시스템은 `(tabs)` 탭 셸(사이드바·하단 탭·우측 레일) 안에 홈 콘텐츠를 렌더링한다

### Requirement: Root path redirects to home

루트 경로 `/`는 **유효한 세션(로그인) 사용자**를 홈 진입점으로서 `/home`으로 보내야 한다(MUST). 더 이상 모든 접근을 무조건 리다이렉트하지 않는다. 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 유효한 세션일 때만 클라이언트에서 `/home`으로 이동한다. `/`는 서버에서 요청별로 분기하지 않는 공개 페이지다(쿠키 존재만으로 서버 리다이렉트하지 않는다).

#### Scenario: Redirect signed-in user to home

- **WHEN** 유효한 세션을 가진 사용자가 `/`에 접근한다
- **THEN** 시스템은 `currentSession` 확인 후 `/home`으로 이동한다

#### Scenario: Invalid or missing session stays on onboarding

- **WHEN** 세션이 없거나 만료·폐기된 세션을 가진 사용자가 `/`에 접근한다
- **THEN** `currentSession`이 `null`이므로 `/home`으로 이동하지 않고 온보딩(Welcome) 화면에 머문다

### Requirement: Primary navigation targets home route

공통 내비게이션(데스크톱 사이드바, 모바일 하단 탭 바)의 홈 항목은 `/home`을 가리켜야 하며(MUST), 현재 경로가 `/home`일 때 홈 항목을 active로 표시해야 한다(MUST).

#### Scenario: Home navigation links to /home

- **WHEN** 사용자가 사이드바 또는 하단 탭 바의 홈 항목을 본다
- **THEN** 홈 항목의 링크 대상은 `/home`이다

#### Scenario: Home item active on home route

- **WHEN** 현재 경로가 `/home`이다
- **THEN** 사이드바·하단 탭 바의 홈 항목이 active로 강조된다

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

### Requirement: Home no-profile onboarding

홈(`(tabs)/home`, 라우트 `/home`)은 로그인한 사용자에게 선택 프로필(active profile)이 없을 때 타임라인 영역 자리 대신 프로필 온보딩 안내를 표시해야 한다(MUST). 온보딩 안내는 아이콘, 제목, 보조 설명, 다음 행동을 위한 CTA로 구성해야 한다(MUST).

#### Scenario: 로그인했지만 선택 프로필이 없는 사용자

- **WHEN** 인증 session이 있고 `currentSession.selectedProfile`이 없는 사용자가 `/home`을 연다
- **THEN** 시스템은 타임라인 영역 자리 대신 프로필 온보딩 안내(아이콘·제목·보조 설명·CTA)를 표시한다
- **AND** 시스템은 사용자가 보유한 프로필 유무에 따라 안내 문구와 CTA 라벨을 다르게 표시한다(프로필 없음: 만들기 유도, 프로필 있음: 선택 유도)

#### Scenario: 선택 프로필이 있는 사용자

- **WHEN** 인증 session이 있고 `currentSession.selectedProfile`이 있는 사용자가 `/home`을 연다
- **THEN** 시스템은 프로필 온보딩 안내를 표시하지 않고 홈 타임라인 영역을 표시한다

#### Scenario: 비로그인 사용자

- **WHEN** 인증 session이 없거나 만료·폐기된 세션을 가진 사용자가 `/home`에 접근한다
- **THEN** 보호 라우트 가드가 `currentSession`이 `null`임을 확인하고 사용자를 루트 온보딩(`/`)으로 이동시킨다
- **AND** 따라서 `/home` 콘텐츠와 프로필 온보딩 안내는 비로그인 사용자에게 렌더링되지 않는다

### Requirement: Home onboarding routes to existing profile create/select flow

홈 프로필 온보딩의 CTA는 새 생성/선택 흐름을 만들지 않고 기존 사이드바 프로필 스위처(생성·선택)를 열어야 한다(MUST). 데스크톱과 모바일 셸 차이를 처리해야 한다(MUST).

#### Scenario: 데스크톱에서 온보딩 CTA 사용

- **WHEN** 데스크톱 폭에서 사용자가 홈 온보딩 CTA를 누른다
- **THEN** 시스템은 좌측 사이드바의 프로필 스위처를 연다
- **AND** 사용자는 기존 사이드바 흐름으로 프로필을 만들거나 선택한다

#### Scenario: 모바일에서 온보딩 CTA 사용

- **WHEN** 모바일 폭에서 사용자가 홈 온보딩 CTA를 누른다
- **THEN** 시스템은 사이드바 드로어를 먼저 연 뒤 프로필 스위처를 연다

#### Scenario: 온보딩에서 프로필 생성·선택 완료

- **WHEN** 사용자가 온보딩에서 유도된 사이드바 흐름으로 프로필을 만들거나 선택한다
- **THEN** 세션의 선택 프로필이 갱신된다
- **AND** 홈은 더 이상 온보딩을 표시하지 않고 타임라인 영역을 표시한다

### Requirement: Protected app routes require a valid session

`(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)은 유효한 세션(로그인)을 전제로 한다(MUST). 유효한 세션이 없는 사용자가 이 라우트에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 쿠키 존재만으로 판정하지 않는다. 공개 프로필 라우트(`/@{handle}` 및 그 하위 게시글 상세)는 비로그인 조회를 유지해야 하며 이 가드에서 제외된다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 리다이렉트하지 않는다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/compose`·`/search`·`/notifications`·`/menu` 중 하나에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Invalid or expired session is treated as guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 보호 라우트에 접근한다
- **THEN** `currentSession`이 `null`이므로 시스템은 비로그인과 동일하게 루트 온보딩(`/`)으로 이동한다

#### Scenario: Public profile remains accessible without login

- **WHEN** 비로그인 사용자가 `/@{handle}` 또는 `/@{handle}/{postId}`에 접근한다
- **THEN** 시스템은 리다이렉트하지 않고 공개 프로필·게시글을 표시한다

#### Scenario: Signed-in user reaches protected route

- **WHEN** 유효한 세션을 가진 사용자가 보호 라우트에 접근한다
- **THEN** 시스템은 리다이렉트 없이 해당 화면을 표시한다

#### Scenario: Hold redirect while session is loading

- **WHEN** `currentSession` 확인이 진행 중이거나 조회가 오류로 실패했다
- **THEN** 시스템은 판단을 보류하고 리다이렉트하지 않는다

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

### Requirement: Responsive sidebar navigation

웹 애플리케이션은 탭 페이지에 사이드바 내비게이션을 제공해야 한다(MUST). 데스크톱 크기 화면에서는 고정 사이드바를 사용하고, 모바일 크기 화면에서는 drawer 사이드바를 사용해야 한다(MUST).

#### Scenario: Render desktop sidebar

- **WHEN** 사용자가 데스크톱 크기 화면에서 `(tabs)` 페이지를 본다
- **THEN** 시스템은 페이지 콘텐츠 옆에 고정 사이드바를 렌더링한다
- **AND** 사이드바에는 주요 내비게이션 메뉴 항목이 포함된다
- **AND** 사이드바 콘텐츠 폭은 Figma drawer 기준인 320px 레이아웃과 일치한다

#### Scenario: Render mobile drawer trigger

- **WHEN** 사용자가 모바일 크기 화면에서 `(tabs)` 페이지를 본다
- **THEN** 시스템은 사이드바 drawer를 열 수 있는 control을 렌더링한다

#### Scenario: Open mobile drawer by button

- **WHEN** 사용자가 모바일 drawer control을 활성화한다
- **THEN** 시스템은 사이드바 drawer를 연다
- **AND** drawer는 320px 폭, 오른쪽 16px radius, 왼쪽에서 열린 surface shadow를 사용한다

#### Scenario: Open mobile drawer from bottom tab menu

- **WHEN** 사용자가 모바일 하단 탭의 메뉴 control을 활성화한다
- **THEN** 시스템은 `/menu`로 이동하지 않고 사이드바 drawer를 연다

#### Scenario: Open mobile drawer by swipe

- **WHEN** 사용자가 모바일 크기 화면에서 왼쪽 edge swipe 제스처를 수행한다
- **THEN** 시스템은 사이드바 drawer를 연다

#### Scenario: Close mobile drawer on navigation

- **WHEN** 모바일 사이드바 drawer가 열려 있다
- **AND** 사용자가 내비게이션 메뉴 항목을 선택한다
- **THEN** 시스템은 선택한 destination으로 이동한다
- **AND** drawer를 닫는다

#### Scenario: Mark active navigation item

- **WHEN** 사이드바에 현재 페이지와 일치하는 내비게이션 항목이 있다
- **THEN** 시스템은 해당 항목을 active 상태로 표시한다
- **AND** active 상태는 page-current semantics로 노출된다

#### Scenario: Render Figma-aligned menu rows

- **WHEN** 시스템이 사이드바 메뉴를 렌더링한다
- **THEN** 각 메뉴 row는 264px 폭, 45px 높이, 16px horizontal padding, 12px vertical padding, 12px icon/text gap을 사용한다
- **AND** active 상태는 옅은 배경과 강조된 텍스트로 표시된다

### Requirement: Sidebar profile switching

웹 애플리케이션은 인증된 사용자가 사이드바에서 접근 가능한 프로필 사이를 전환할 수 있게 해야 한다(MUST). 프로필 전환 성공 후 앱 셸의 활성 프로필 표시와 앱 셸 아래 화면의 active profile 판단은 성공 응답의 `Session.selectedProfile`을 반영해야 하며(MUST), 일반 프로필 선택 성공 handler는 `currentSession` 전체 수동 invalidation/refetch 완료에 의존하지 않아야 한다(MUST NOT).

#### Scenario: Render accessible profiles

- **WHEN** 인증된 계정에 접근 가능한 활성 프로필이 있다
- **THEN** 사이드바는 260px 높이의 상단 프로필 영역에 활성 프로필 정보를 표시한다
- **AND** 활성 프로필 정보는 최초 표시 시 `currentSession.selectedProfile` 조회 결과를 기반으로 하며, 프로필 전환 성공 후에는 성공 응답의 `Session.selectedProfile`을 반영한다
- **AND** 현재 활성 프로필을 시각적으로 구분한다
- **AND** 최근 접근 가능한 프로필을 40px avatar control로 표시해 전환할 수 있게 한다

#### Scenario: Switch active profile

- **WHEN** 사용자가 사이드바에서 다른 접근 가능한 프로필을 선택한다
- **THEN** 시스템은 즉시 해당 프로필을 활성 프로필로 요청한다
- **AND** 요청 성공 후 사이드바는 성공 응답의 `Session.selectedProfile`을 새 활성 프로필로 반영한다
- **AND** 사이드바는 `currentSession` 전체 조회가 다시 완료될 때까지 이전 활성 프로필을 계속 표시하지 않는다
- **AND** 이미 열린 홈, 검색, 프로필 화면에서 active profile 존재 여부나 viewer profile id를 쓰는 UI는 성공 응답의 `Session.selectedProfile`을 반영한다
- **AND** 시스템은 `homeTimeline` 같은 active-profile 의존 root query field와 `Profile.viewerFollow` 같은 active-profile 의존 entity field를 stale 처리하거나 동등한 방식으로 새 active profile 기준 결과를 보장한다

#### Scenario: Create and switch to a new profile

- **WHEN** 인증된 사용자가 사이드바에서 새 프로필 핸들을 입력하고 생성한다
- **THEN** 시스템은 새 프로필 생성을 요청한다
- **AND** 생성 성공 후 시스템은 새 프로필을 즉시 활성 프로필로 선택한다
- **AND** 사이드바는 성공 응답의 `Session.selectedProfile`을 새 활성 프로필로 반영한다
- **AND** 시스템은 접근 가능한 프로필 목록이 새 프로필을 포함하도록 `me.profiles` 또는 동등한 프로필 목록 데이터를 갱신한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다

### Requirement: Search page input form

검색 페이지(`/search`)는 검색어를 입력하고 submit할 수 있는 검색 입력 폼을 제공해야 한다(MUST). 입력값을 비우는 컨트롤을 제공해야 한다(MUST). submit 시 검색어를 URL 쿼리 파라미터 `q`에 반영하고 현재 활성 탭(`tab`)을 유지해야 한다(MUST).

#### Scenario: Submit search term

- **WHEN** 사용자가 검색 입력에 검색어를 입력하고 submit한다
- **THEN** 시스템은 URL을 `/search?q={검색어}`로 갱신한다
- **AND** 현재 활성 탭(`tab`) 값을 유지한다

#### Scenario: Clear search input

- **WHEN** 사용자가 입력 비우기 컨트롤을 선택한다
- **THEN** 시스템은 검색 입력값을 비우고 입력 포커스를 유지한다
- **AND** 검색 후 단계였다면 URL `q`를 제거해, 빈 입력과 결과 영역이 어긋나지 않게 한다

### Requirement: Search page phases

검색 페이지는 검색바 포커스 상태와 제출된 검색어(`q`)에 따라 검색 전·입력 중·검색 후 단계를 구분해 표시해야 한다(MUST). 검색 결과 유형 탭은 검색 후 단계에서만 노출해야 한다(MUST). 검색바 자체도 단계에 따라 외형이 달라져야 한다(MUST): 입력 중에는 검색바에 포커스 강조를 표시하고, 입력값이 있을 때만 비우기 컨트롤을 노출하며, 검색 전이 아닌 단계(입력 중·검색 후)에는 검색 전으로 되돌리는 뒤로가기 컨트롤을 제공해야 한다(MUST).

#### Scenario: Before search

- **WHEN** 검색바가 포커스되지 않았고 제출된 검색어(`q`)도 없다
- **THEN** 시스템은 검색을 안내하는 검색 전 상태를 표시한다
- **AND** 결과 유형 탭과 뒤로가기 컨트롤을 표시하지 않는다

#### Scenario: Return to before-search

- **WHEN** 사용자가 입력 중 또는 검색 후 단계에서 뒤로가기 컨트롤을 선택한다
- **THEN** 시스템은 검색바 포커스를 해제하고 제출된 검색어(`q`)를 비워 검색 전 단계로 되돌린다

#### Scenario: While typing

- **WHEN** 검색바가 포커스된다
- **THEN** 시스템은 입력 중 단계로 최근 검색을 표시한다
- **AND** 결과 유형 탭을 표시하지 않는다

#### Scenario: After search

- **WHEN** 검색바가 포커스되지 않았고 제출된 검색어(`q`)가 있다
- **THEN** 시스템은 검색 후 단계로 결과 유형 탭과 결과 영역을 표시한다

### Requirement: Recent searches

입력 중 단계는 localStorage에 저장된 최근 검색어를 노출해야 한다(MUST). 최근 검색 항목을 선택하면 그 검색어로 검색을 수행하고, 개별 항목을 삭제할 수 있어야 한다(MUST). 이 기능은 백엔드 없이 동작한다.

#### Scenario: Show recent searches

- **WHEN** 검색바가 포커스되고 저장된 최근 검색어가 있다
- **THEN** 시스템은 최근 검색어 목록을 표시한다

#### Scenario: Select a recent search

- **WHEN** 사용자가 최근 검색 항목을 선택한다
- **THEN** 시스템은 그 검색어로 검색을 수행하고 URL `q`를 갱신한다

#### Scenario: Remove a recent search

- **WHEN** 사용자가 최근 검색 항목의 삭제 컨트롤을 선택한다
- **THEN** 시스템은 해당 항목을 최근 검색 목록에서 제거한다

### Requirement: Search result type tabs

검색 후 단계는 인기·최신·미디어·사람 검색 결과 유형 탭을 제공해야 한다(MUST). 활성 탭을 URL 쿼리 파라미터 `tab`(`popular|latest|media|people`)에 반영해야 하며, `tab`이 없으면 사람(`people`)을 기본 활성으로 사용해야 한다(MUST). 탭을 전환할 때 현재 검색어(`q`)를 유지해야 한다(MUST). 사람 외 탭(인기·최신·미디어)은 관련 검색 백엔드가 준비되기 전까지 준비 중 안내를 표시해야 한다(MUST).

#### Scenario: Default active tab

- **WHEN** 사용자가 `tab` 파라미터 없이 검색 후 단계를 본다
- **THEN** 시스템은 사람(`people`) 탭을 활성으로 표시한다

#### Scenario: Switch result type tab

- **WHEN** 사용자가 다른 결과 유형 탭을 선택한다
- **THEN** 시스템은 URL `tab` 파라미터를 해당 탭으로 갱신한다
- **AND** 현재 검색어(`q`) 값을 유지한다

#### Scenario: Not-ready tab placeholder

- **WHEN** 사용자가 인기·최신·미디어 탭을 활성으로 본다
- **THEN** 시스템은 해당 탭 콘텐츠 대신 준비 중 안내를 표시한다

### Requirement: People tab exact handle search results

검색 후 사람 탭은 제출된 검색어(`q`)를 정확 handle로 해석해 기존 `profileByHandle` 조회 결과를 표시해야 한다(MUST). 사람 탭이 아니거나 제출된 검색어가 비어 있으면 handle 조회를 실행하지 않아야 한다(MUST NOT). 검색 결과는 실데이터와 팔로우 액션이 연결된 `ProfileListItem`으로 표시해야 한다(MUST). 검색 결과 항목은 해당 프로필 페이지(`/@{handle}`)로 이동할 수 있어야 한다(MUST). prefix, display name, fediverse 검색은 이 범위에서 제공하지 않는다(MUST NOT).

#### Scenario: Existing handle result

- **WHEN** 사용자가 존재하는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 `profileByHandle` 결과를 `ProfileListItem`으로 표시한다
- **AND** 결과 항목의 프로필 정보 영역은 `/@{handle}` 프로필 페이지로 이동한다
- **AND** 결과 항목의 팔로우 액션은 기존 `ProfileListItem`/`FollowButton` 정책에 따라 표시되거나 숨겨진다

#### Scenario: Missing handle result

- **WHEN** 사용자가 존재하지 않는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 `profileByHandle` 조회를 실행하지 않는다

### Requirement: People tab search states

검색 후 사람 탭은 로딩, 오류, 결과 없음(empty) 상태를 표시할 수 있어야 한다(MUST). 로딩 스켈레톤은 프로필 항목 형태로 표시하고 스크린리더용 로딩 안내를 제공해야 하며, 색·반경은 시맨틱 디자인 토큰으로 라이트/다크에 대응해야 한다(MUST). 기존 결과 데이터가 있으면 로딩 또는 오류 중에도 기존 결과를 유지해야 한다(SHOULD).

#### Scenario: Loading state

- **WHEN** 사람 탭이 로딩 상태다
- **THEN** 시스템은 프로필 항목 형태의 로딩 스켈레톤을 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 검색 로딩 안내를 제공한다

#### Scenario: Error state

- **WHEN** 사람 탭 검색이 실패했고 표시할 기존 결과가 없다
- **THEN** 시스템은 오류 상태와 다시 시도 동작을 표시한다

#### Scenario: Empty result state

- **WHEN** 검색어로 일치하는 프로필이 없다
- **THEN** 시스템은 결과 없음 안내를 표시한다

### Requirement: Root path onboarding for guests

루트 경로 `/`는 비로그인 사용자에게 로그인 온보딩(Welcome) 화면을 렌더링해야 한다(MUST). 이 화면은 `(tabs)` 앱 셸(사이드바·하단 탭·우측 레일) 없이 독립으로 표시되며, 로그인 시작 동선을 제공한다.

#### Scenario: Show onboarding to logged-out user

- **WHEN** 비로그인 사용자가 `/`에 접근한다
- **THEN** 시스템은 앱 셸 없이 로그인 온보딩(Welcome) 화면을 렌더링한다

#### Scenario: Start login from onboarding

- **WHEN** 사용자가 온보딩 화면의 "시작하기"를 선택한다
- **THEN** 시스템은 로그인 시작 경로(`/login`)로 이동한다

### Requirement: Post list item display

게시글 목록 항목 컴포넌트(`PostListItem`)는 게시글 한 건의 작성자 프로필(아바타·표시 이름·핸들), Plain Text 본문, 작성 시간을 표시해야 한다(MUST). 작성자 영역은 `PostAuthorProfile`을 재사용하고, 목록 항목의 아바타는 48px로 표시해야 한다(MUST). 필요한 데이터는 컴포넌트 자신의 fragment(`PostListItem_post`)로 선언해야 한다(MUST).

#### Scenario: Item content display

- **WHEN** 게시글 데이터(fragment ref)가 항목 컴포넌트에 전달된다
- **THEN** 시스템은 좌측 아바타 거터와 우측 콘텐츠 컬럼 구조로 작성자 표시 이름·핸들, 본문, 작성 시간을 표시한다

#### Scenario: Empty body

- **WHEN** 게시글의 `content`가 비어 있다
- **THEN** 시스템은 본문 영역 없이 작성자와 작성 시간만 표시하고 레이아웃이 깨지지 않는다

### Requirement: Post list item body clamping

목록 항목의 본문은 200자(코드 포인트 기준)를 초과하거나 줄바꿈 기준 10줄을 초과하면 잘라서 표시해야 하며(MUST), 본문이 실제로 잘린 경우에만 말줄임표와 "더보기..." 버튼을 노출해야 한다(MUST). "더보기..."는 게시글 디테일로 이동하지 않고 제자리에서 본문 전체를 펼쳐야 한다(MUST). 임계값(200자·10줄)은 정책 확정 전 초기값이며 PR에서 논의한다.

#### Scenario: Long body clamped

- **WHEN** 본문이 200자를 초과한다
- **THEN** 시스템은 앞 200자와 말줄임표만 표시하고 본문 아래에 "더보기..." 버튼을 표시한다

#### Scenario: Many lines clamped

- **WHEN** 본문이 200자 이하지만 줄바꿈 기준 10줄을 초과한다
- **THEN** 시스템은 앞 10줄과 말줄임표만 표시하고 본문 아래에 "더보기..." 버튼을 표시한다

#### Scenario: Expand inline

- **WHEN** 사용자가 "더보기..." 버튼을 누른다
- **THEN** 시스템은 페이지 이동 없이 해당 항목의 본문 전체를 펼쳐 표시하고 버튼을 숨긴다

#### Scenario: Short body not clamped

- **WHEN** 본문이 200자 이하이고 10줄 이내다
- **THEN** 시스템은 본문 전체를 표시하고 "더보기..." 버튼을 표시하지 않는다

### Requirement: Post list item time display

목록 항목의 작성 시간은 이름 블록과 같은 행의 우측에 표시해야 한다(MUST). 작성 후 24시간 미만이면 `Intl.RelativeTimeFormat('ko', { numeric: 'auto' })` 기반 상대시간(0초 "지금", 그 외 "n초 전"/"n분 전"/"n시간 전")을, 24시간 이상이면 날짜("2026. 04. 27" 형식)를 표시해야 한다(MUST). 기계 가독 시각을 `<time datetime>`으로 제공해야 한다(MUST).

#### Scenario: Recent post relative time

- **WHEN** 게시글이 24시간 이내에 작성됐다
- **THEN** 시스템은 "n초 전"/"n분 전"/"n시간 전" 형식의 상대시간(0초는 "지금")을 헤더 우측에 표시한다

#### Scenario: Older post absolute date

- **WHEN** 게시글이 작성된 지 24시간 이상 지났다
- **THEN** 시스템은 "2026. 04. 27" 형식의 날짜를 헤더 우측에 표시한다

### Requirement: Handle-based profile page route

웹 앱은 핸들을 포함한 URL로 프로필 페이지에 직접 접근할 수 있도록 `(tabs)` 그룹 안에 핸들 동적 라우트를 제공해야 한다(MUST). 이 라우트는 `@` 프리픽스를 사용해 정적 엔드포인트 경로와 충돌하지 않아야 한다(MUST).

#### Scenario: Access profile by handle URL

- **WHEN** 사용자가 `/@{handle}` 형식의 주소로 이동한다
- **THEN** 시스템은 `(tabs)` 셸(사이드바·하단탭) 안에서 해당 핸들의 프로필 페이지를 연다
- **AND** layout에서 `profileByHandle(handle:)` query로 프로필을 조회해 렌더한 프로필 헤더를 하위 화면 전반에서 공유한다

#### Scenario: Static endpoint not intercepted by handle route

- **WHEN** 사용자가 `/login`·`/graphql`·`/health` 등 정적 엔드포인트 경로로 이동한다
- **THEN** 핸들 라우트는 `@`로 시작하지 않는 경로를 매칭하지 않으므로 해당 엔드포인트가 정상 처리된다

### Requirement: Profile basic information display

프로필 페이지는 조회된 프로필의 기본 정보를 표시해야 한다(MUST). 표시 항목은 커버 영역, 아바타, 표시 이름, 핸들, bio, 팔로잉/팔로워 수이며, 팔로우 수는 `팔로잉 → 팔로워` 순서로 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display loaded profile

- **WHEN** 핸들로 조회한 활성 프로필이 있다
- **THEN** 시스템은 커버 밴드, 아바타, 표시 이름, `@handle`, bio(있을 때), 팔로잉/팔로워 수를 표시한다
- **AND** 팔로우 수는 팔로잉을 먼저, 팔로워를 나중에 표시한다

#### Scenario: Avatar initial fallback

- **WHEN** 프로필에 아바타 이미지가 없다(스키마 미보유)
- **THEN** 시스템은 표시 이름(없으면 핸들)의 첫 글자를 대문자로 한 이니셜 아바타를 표시한다

#### Scenario: Compact follow counts

- **WHEN** 팔로워 또는 팔로잉 수를 표시한다
- **THEN** 시스템은 1000 이상의 값을 compact 표기(예: `1.2k`)로 보여준다

### Requirement: Profile page loading and error states

프로필 페이지는 로딩, 조회 오류, 없는 프로필 상태를 처리해야 한다(MUST). 오류·없는 프로필 상태에서도 상위 `(tabs)` 셸은 유지되어야 한다(MUST).

#### Scenario: Loading state

- **WHEN** 프로필 조회가 진행 중이다
- **THEN** 시스템은 헤더 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시한다

#### Scenario: Query error

- **WHEN** 프로필 조회가 오류로 실패한다
- **THEN** 시스템은 오류 안내와 다시 시도 동작을 제공하고, 사이드바·하단탭은 유지한다

#### Scenario: Missing profile

- **WHEN** 핸들과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 인라인 빈 상태("프로필을 찾을 수 없어요")를 표시하고, 사이드바·하단탭은 유지한다

### Requirement: Profile page column alignment

프로필 페이지는 공유 `(tabs)` 셸의 main 레이아웃을 변경하지 않고, 프로필 라우트에서만 콘텐츠를 탑정렬한 컬럼으로 표시해야 한다(MUST). 모바일에서는 화면 끝까지 풀블리드로, 넓은 화면에서는 고정 폭 컬럼으로 표시해야 한다(MUST). 데스크톱 전체 가운데 클러스터 정렬(트위터식)은 공유 셸 재구성이 필요하므로 별도 웹 레이아웃 이슈로 이연한다.

#### Scenario: Mobile full-bleed column

- **WHEN** 모바일 폭에서 프로필 페이지를 본다
- **THEN** 커버는 화면 좌우 끝까지 닿고 콘텐츠는 상단부터 시작한다

#### Scenario: Desktop fixed-width column

- **WHEN** 넓은 화면에서 프로필 페이지를 본다
- **THEN** 콘텐츠는 고정 폭 컬럼으로 표시된다
- **AND** 공유 셸과 다른 탭 페이지의 렌더링은 변경되지 않는다

### Requirement: Sidebar profile entry navigation

사이드바의 "프로필" 항목은 현재 세션에서 선택된 프로필의 프로필 페이지로 이동해야 한다(MUST). 선택된 프로필이 없으면 해당 항목을 비활성화해야 한다(MUST).

#### Scenario: Navigate to own profile

- **WHEN** 현재 세션에 선택된 프로필이 있고 사용자가 사이드바 "프로필" 항목을 누른다
- **THEN** 시스템은 선택된 프로필의 `/@{handle}` 페이지로 이동한다
- **AND** 사용자가 자신의 프로필 페이지를 보고 있을 때만 해당 항목을 활성 상태로 표시한다

#### Scenario: Disabled when no selected profile

- **WHEN** 현재 세션에 선택된 프로필이 없다
- **THEN** 시스템은 사이드바 "프로필" 항목을 비활성화하여(클릭 불가) 이동하지 않는다

### Requirement: Followers and following list routes

웹 앱은 프로필의 팔로워·팔로잉 목록에 직접 접근할 수 있도록, 프로필 라우트 하위에 `/@{handle}/followers`와 `/@{handle}/following` 웹 라우트를 제공해야 한다(MUST). 두 라우트는 프로필 layout 아래에서 렌더되어 상단에 프로필 헤더(`ProfileHero`)를 유지해야 하며(MUST), 게시글 상세 라우트와 달리 `(tabs)` 셸까지 레이아웃을 리셋하지 않아야 한다(MUST NOT). 실제 목록 데이터 연결은 후속 범위(PROD-184/185)이며, 데이터 연결 전에도 라우트는 직접 접근 시 깨지지 않고 빈 목록 상태를 표시해야 한다(MUST).

#### Scenario: Access followers list route

- **WHEN** 사용자가 `/@{handle}/followers`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로워 목록 영역을 표시한다
- **AND** 데이터 연결 전에는 빈 목록 상태를 표시한다

#### Scenario: Access following list route

- **WHEN** 사용자가 `/@{handle}/following`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로잉 목록 영역을 표시한다
- **AND** 데이터 연결 전에는 빈 목록 상태를 표시한다

#### Scenario: Lists keep the profile header

- **WHEN** 팔로워 또는 팔로잉 목록 라우트가 렌더된다
- **THEN** 레이아웃은 상위 핸들 라우트의 `ProfileHero`를 유지한다
- **AND** `(tabs)` 셸(사이드바·하단탭)도 유지된다

### Requirement: Profile connection list area states

팔로워·팔로잉 목록 영역은 목록 종류 제목과 함께 로딩, 오류, 빈 목록 상태를 표시할 수 있어야 한다(MUST). 두 목록은 같은 상태 표현(제목·로딩 스켈레톤·인라인 오류·인라인 빈 상태)을 공유해 시각/상태 구조가 어긋나지 않아야 한다(MUST). 로딩 중에는 프로필 행 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시해야 하며, 스켈레톤 시각 요소는 보조 기술에 노출하지 않아야 한다(MUST). 목록 query가 실패하고 표시할 기존 데이터가 없을 때는 인라인 오류 상태와 재시도 동작을 제공해야 한다(MUST). 표시할 항목이 없을 때는 제목과 보조 설명으로 구성된 인라인 빈 상태를 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST). 상태 표현은 기존 게시글 목록 상태(`Profile post list ...`)와 같은 토큰·접근성 패턴을 따른다.

#### Scenario: Loading state

- **WHEN** 목록 영역이 로딩 중 상태다
- **THEN** 시스템은 프로필 행 형태의 스켈레톤을 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 목록 로딩 안내를 제공한다

#### Scenario: Error state with retry

- **WHEN** 목록 query가 실패했고 표시할 기존 데이터가 없다
- **THEN** 시스템은 인라인 오류 상태를 표시한다
- **AND** 사용자는 다시 시도 동작으로 목록을 다시 요청할 수 있다

#### Scenario: Empty state

- **WHEN** 표시할 팔로워 또는 팔로잉 항목이 없다
- **THEN** 시스템은 목록 종류에 맞는 제목과 보조 설명을 중앙 정렬로 표시한다

#### Scenario: Shared structure across both lists

- **WHEN** 팔로워 목록과 팔로잉 목록을 비교한다
- **THEN** 두 목록은 같은 제목·로딩·오류·빈 상태 구조를 사용한다

### Requirement: Follow count entry-point links

프로필 헤더(`ProfileHero`)와 사이드바 활성 프로필 영역에 표시되는 팔로잉/팔로워 수는 각각 해당 프로필의 팔로잉·팔로워 목록 웹 라우트로 이동하는 링크여야 한다(MUST). 링크 대상은 팔로잉이 `/@{handle}/following`, 팔로워가 `/@{handle}/followers`이며, ActivityPub collection URL로 연결하지 않아야 한다(MUST NOT). 표시·이동 순서는 `팔로잉 → 팔로워`여야 한다(MUST). 각 카운트의 클릭(활성) 영역은 숫자와 라벨 텍스트를 모두 포함해야 한다(MUST). 사이드바 활성 프로필 영역의 카운트 링크가 모바일 drawer 안에서 렌더될 때는, 다른 drawer 내 navigation과 동일하게 이동 시 drawer를 닫아야 한다(MUST).

#### Scenario: Navigate to lists from profile header

- **WHEN** 사용자가 프로필 헤더에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 각각 `/@{handle}/following` 또는 `/@{handle}/followers` 웹 라우트로 이동한다
- **AND** 링크 대상은 ActivityPub collection URL이 아니라 로컬 웹 라우트다

#### Scenario: Navigate to lists from sidebar

- **WHEN** 사용자가 사이드바 활성 프로필 영역에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 선택된 프로필의 `/@{handle}/following` 또는 `/@{handle}/followers` 웹 라우트로 이동한다

#### Scenario: Whole count and label is the click target

- **WHEN** 카운트가 숫자와 `팔로잉`/`팔로워` 라벨로 구성된다
- **THEN** 사용자가 숫자 또는 라벨 중 어느 쪽을 눌러도 같은 목록 라우트로 이동한다

#### Scenario: Close mobile drawer on navigation

- **WHEN** 모바일 drawer에 렌더된 사이드바에서 사용자가 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 목록 라우트로 이동하면서 열려 있던 drawer를 닫는다
