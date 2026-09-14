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
