## ADDED Requirements

### Requirement: 반응형 shell의 Post Composer 진입과 surface

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/accessibility.md`, `docs/design/icons.md`, `docs/domain/objects/profile.md`, DSN-43, PROD-797 — 유니버설 앱 shell은 platform과 기존 `compact`·`full` breakpoint에 따라 일반 Post 작성 진입을 Full Web Rail, desktop modal Overlay 또는 모바일 전체 화면으로 MUST 제공한다. shell trigger는 같은 Production composer host를 MUST 사용하며, 중앙 timeline inline composer나 direct `/compose` compatibility entry를 canonical presentation으로 만들지 MUST NOT 한다. retired `/compose`의 직접 접근은 404가 될 수 있고(MAY), bare `compose`는 Local Profile System Reserved Handle로 유지해야 한다(MUST).

#### Scenario: Full Web Rail에서 작성

- **WHEN** Web viewport가 `full` 이상이고 일반 app route를 표시한다
- **THEN** shell은 우측 Rail에 공용 Post Composer의 `Surface=Rail` presentation을 표시한다
- **AND** 별도 큰 글쓰기 CTA를 표시하지 않는다
- **AND** Rail의 Expand action은 같은 draft를 desktop modal Overlay로 연다

#### Scenario: compact Web에서 작성

- **WHEN** Web viewport가 `compact` 이상 `full` 미만이다
- **THEN** compact icon rail의 글쓰기 trigger가 desktop modal Overlay를 연다
- **AND** 우측 Rail 또는 중앙 timeline inline composer를 표시하지 않는다

#### Scenario: 모바일 shell에서 작성

- **WHEN** mobile Web의 viewport가 `compact` 미만이거나 Android·iOS에서 사용자가 하단 글쓰기 탭을 실행한다
- **THEN** 하단 글쓰기 탭은 모바일 전체 화면 composer를 연다
- **AND** mobile drawer에 중복 글쓰기 진입점을 표시하지 않는다
- **AND** Android·iOS는 화면 폭과 무관하게 모바일 surface를 유지한다

#### Scenario: Direct `/compose` access has no compatibility entry

- **WHEN** 사용자가 retired `/compose` URL에 직접 접근한다
- **THEN** 시스템은 해당 URL에서 Production composer host를 렌더링하거나 열지 않는다
- **AND** 직접 접근은 404가 될 수 있다
- **AND** 지원되는 작성 진입은 Full·compact·mobile shell trigger로 한정한다

#### Scenario: Preserve bare `compose` as a Local Profile reserved handle

- **WHEN** 로그인한 계정이 bare `compose` 또는 대소문자만 다른 값을 Local Profile handle로 제출한다
- **THEN** 시스템은 Profile을 생성하지 않고 기존 System Reserved Handle 정책의 `handle` field 오류를 반환한다
- **AND** Remote Profile의 원격 handle에는 이 Local Profile 예약 정책을 적용하지 않는다

#### Scenario: Profile이 없을 때 진입 차단

- **WHEN** 로그인했지만 selected Profile이 없는 사용자가 shell 글쓰기 진입점을 실행한다
- **THEN** 시스템은 기존 composer usage boundary에 따라 작성 surface를 열거나 `createPost`를 호출하지 않는다
- **AND** Home에서 Profile을 만들거나 선택하도록 안내한다

## MODIFIED Requirements

### Requirement: Protected app routes require a valid session

**Authority / Provenance:** `PROD-148`, `PROD-161`, `PROD-541`; `docs/design/settings.md`, `PROD-685`; 선행 정보 구조 `PROD-653` — `(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/search`·`/notifications`·`/settings`와 지원되는 Settings 내부 detail)은 유효한 세션(로그인)을 전제로 해야 한다(MUST). 유효한 세션이 없는 사용자가 이 route에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL query로 확인해야 하며(MUST), 만료·폐기된 세션은 `null`로 반환되어야 하고(MUST), 쿠키 존재만으로 판정해서는 안 된다(MUST NOT). 공개 Profile route(`/${relativeHandle}` 및 그 하위 Post 상세)는 비로그인 조회를 유지해야 하며 이 guard에서 제외되어야 한다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 redirect해서는 안 된다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/search`·`/notifications`·`/settings` 중 하나에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Invalid or expired session is treated as guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 보호 route에 접근한다
- **THEN** `currentSession`이 `null`이므로 시스템은 비로그인과 동일하게 루트 온보딩(`/`)으로 이동한다

#### Scenario: Public profile remains accessible without login

- **WHEN** 비로그인 사용자가 `/${relativeHandle}` 또는 `/${relativeHandle}/{postId}`에 접근한다
- **THEN** 시스템은 redirect하지 않고 공개 Profile·Post를 표시한다

#### Scenario: Signed-in user reaches protected route

- **WHEN** 유효한 세션을 가진 사용자가 보호 route에 접근한다
- **THEN** 시스템은 redirect 없이 해당 화면을 표시한다

#### Scenario: Redirect guest from Settings detail

- **WHEN** 유효한 세션이 없는 사용자가 지원되는 Settings 내부 detail route에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Hold redirect while session is loading

- **WHEN** `currentSession` 확인이 진행 중이거나 조회가 오류로 실패했다
- **THEN** 시스템은 판단을 보류하고 redirect하지 않는다

### Requirement: Sidebar profile switching

유니버설 애플리케이션은 인증된 사용자가 앱 셸에서 접근 가능한 프로필 사이를 전환할 수 있게 해야 한다(MUST). 프로필 전환 성공 후 앱 셸의 활성 프로필 표시는 새 actor 환경에서 성공적으로 조회한 `currentSession.selectedProfile` 결과를 반영해야 하며(MUST), 앱 셸 아래 route는 자기 화면에서 필요한 active profile field를 자기 GraphQL operation으로 선언해야 한다(MUST).

#### Scenario: Render accessible profiles

- **WHEN** 인증된 계정에 접근 가능한 활성 프로필이 있다
- **THEN** 데스크톱 사이드바 또는 모바일 profile switch surface는 활성 프로필 정보를 표시한다
- **AND** full 데스크톱 사이드바는 260px 높이의 상단 프로필 영역을 유지하고 compact rail은 40px avatar trigger를 사용한다
- **AND** 활성 프로필 정보는 `currentSession.selectedProfile` 조회 결과를 기반으로 하며, 프로필 전환 성공 후 새 Relay Environment와 Store에서 실행한 actor query 결과를 반영한다
- **AND** 현재 활성 프로필을 시각적으로 구분한다
- **AND** 접근 가능한 다른 프로필을 control로 표시해 전환할 수 있게 한다

#### Scenario: Switch active profile

- **WHEN** 사용자가 앱 셸에서 다른 접근 가능한 프로필을 선택한다
- **THEN** 시스템은 즉시 해당 프로필을 활성 프로필로 요청한다
- **AND** 요청 성공 응답은 `selectProfile.profile.id`로 새 활성 프로필을 식별한다
- **AND** 클라이언트는 새 selected profile ID를 actor key로 사용해 Relay Environment와 Store를 새로 만든다
- **AND** 새 actor query가 준비되기 전에는 이전 actor Store의 부분 `Session.selectedProfile` payload를 새 active profile 결과로 표시하지 않고, query가 성공적으로 준비되면 앱 셸은 새 `currentSession.selectedProfile` 결과를 활성 프로필로 반영한다
- **AND** 이미 열린 route-backed home 및 viewer-dependent profile/follow 화면은 새 actor environment에서 route query를 다시 실행한다
- **AND** 새 environment는 `homeTimeline`과 `Profile.viewerState`가 새 active profile 기준 결과임을 보장한다

#### Scenario: Create and switch to a new profile

- **WHEN** 인증된 사용자가 앱 셸에서 새 프로필 핸들을 입력하고 생성한다
- **THEN** 시스템은 새 프로필 생성을 요청한다
- **AND** 생성 성공 후 시스템은 새 프로필을 즉시 활성 프로필로 선택한다
- **AND** 새 프로필 선택 성공 후 앱 셸은 새 actor Environment와 Store에서 조회한 `currentSession.selectedProfile` 결과가 준비되면 이를 새 활성 프로필로 반영한다
- **AND** 시스템은 접근 가능한 프로필 목록이 새 프로필을 포함하도록 `me.profiles` connection 또는 동등한 Relay record를 갱신한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다

### Requirement: Universal app shell rendering

**Authority / Provenance:** `docs/design/breakpoints.md`, archived `migrate-frontend-to-expo-relay`, PR #217, `PROD-541`, PROD-797 — 앱 shell은 Expo Router route group에서 Android, iOS, Web 공용으로 렌더되어야 한다(MUST). 기존 웹 route와 사용자 동작을 유지하면서 native safe area와 web breakpoint를 적용해야 한다(MUST). Retired `/compose` direct route는 app shell screen으로 등록하지 않아야 한다(MUST NOT).

#### Scenario: Render a native tab screen

- **WHEN** Android 또는 iOS에서 `/home`, `/search`, `/notifications` 중 하나를 연다
- **THEN** 시스템은 native safe area 안에 route content와 하단 navigation을 표시한다
- **AND** 같은 route의 Web 화면과 같은 GraphQL data 및 주요 동작을 제공한다

#### Scenario: Render a web tab screen

- **WHEN** Web에서 tab route를 연다
- **THEN** 시스템은 viewport breakpoint에 따라 mobile bottom navigation, compact rail 또는 full three-column shell을 표시한다
- **AND** canonical URL은 기존 경로를 유지한다

### Requirement: 준비되지 않은 sidebar 진입점 비노출

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-487`, `PROD-566`, `PROD-654`, PROD-797 — 유니버설 애플리케이션은 준비되지 않은 sidebar navigation 진입점을 노출하지 않고 현재 제공하는 feedback과 실제 동작하는 진입점을 유지해야 한다(MUST). 받은 팔로우 요청 관리 화면이 제공되면 full Web sidebar, compact Web rail과 mobile Web drawer는 같은 canonical route 진입점을 제공해야 한다(MUST).

#### Scenario: responsive sidebar에서 프로필 설정 비노출

- **WHEN** 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile drawer를 연다
- **THEN** 시스템은 `프로필 설정` link나 같은 의미의 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: responsive sidebar에서 팔로워 요청 비노출

- **WHEN** 받은 팔로우 요청 관리 화면이 아직 제공되지 않은 상태에서 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile drawer를 연다
- **THEN** 시스템은 `팔로워 요청` link나 같은 의미의 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: 관리 화면 준비 후 responsive navigation 진입점

- **WHEN** `/follow-requests` 받은 팔로우 요청 관리 화면이 제공된 상태에서 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile Web drawer를 연다
- **THEN** 시스템은 `팔로워 요청` label과 Lucide `UserRoundPlus` glyph를 사용하는 진입점을 표시한다
- **AND** 세 shell surface의 진입점은 모두 `/follow-requests`로 이동한다
- **AND** mobile bottom tab에는 팔로워 요청 진입점을 추가하지 않는다
- **AND** mobile Web drawer에서 진입하면 기존 route navigation과 drawer close 동작을 유지한다

#### Scenario: 실제 동작하는 navigation 유지

- **WHEN** sidebar navigation이 준비되지 않은 진입점 없이 렌더링된다
- **THEN** 시스템은 PROD-487과 PR #390의 `피드백 보내기` link와 `/feedback` destination을 유지한다
- **AND** 기존 `프로필`·`북마크` link, 로그아웃 control과 responsive navigation 동작을 유지한다

#### Scenario: 피드백과 준비되지 않은 설정 구분

- **WHEN** full sidebar, compact icon rail 또는 mobile drawer가 `피드백 보내기` link를 렌더링한다
- **THEN** 시스템은 Lucide `Mail` glyph를 사용한다
- **AND** label, accessible name, `/feedback` destination, active 상태와 drawer close 동작은 유지한다

#### Scenario: mobile drawer의 중복 글쓰기 진입점 비노출

- **WHEN** mobile Web, Android 또는 iOS에서 인증된 사용자가 drawer를 연다
- **THEN** 시스템은 drawer 안에 `글쓰기` link나 button을 표시하지 않는다
- **AND** mobile 하단 navigation의 글쓰기 항목은 `/compose` link가 아니라 현재 route 위에서 모바일 전체 화면 composer를 여는 action이다
- **AND** compact Web icon rail의 글쓰기 항목은 `/compose` link가 아니라 desktop modal Overlay를 여는 action이다

#### Scenario: 로그아웃 아이콘의 시각적 weight 일치

- **WHEN** full sidebar, compact icon rail 또는 mobile drawer가 로그아웃 control을 렌더링한다
- **THEN** Lucide `LogOut` glyph는 주변 navigation glyph와 같은 2px stroke weight를 사용한다
- **AND** 로그아웃 label, accessible name, target geometry와 동작을 변경하지 않는다
- **AND** compact icon rail의 로그아웃 target과 glyph는 다른 compact footer target과 같은 수평 중심선을 사용한다

#### Scenario: ProfileSwitcher nickname 중심 정렬

- **WHEN** full Web sidebar 또는 mobile drawer가 ProfileSwitcher trigger를 렌더링한다
- **THEN** nickname은 별도 하향 transform 없이 trigger의 수직 중심에 정렬된다
- **AND** nickname·chevron은 trigger의 같은 중심선을 유지하며 compact rail profile button geometry를 변경하지 않는다

#### Scenario: generic menu placeholder 제거

- **WHEN** PROD-541의 유니버설 route 구성이 등록된다
- **THEN** 시스템은 generic `메뉴` 소개·설명·login-test UI만 렌더링하던 `/menu` placeholder route를 등록하지 않는다
- **AND** `/menu` 직접 접근에 새 redirect나 전용 404 화면을 추가하지 않는다
- **AND** 팔로우 요청의 pending 저장 모델과 GraphQL 목록·승인·거절·취소 계약을 변경하지 않는다
