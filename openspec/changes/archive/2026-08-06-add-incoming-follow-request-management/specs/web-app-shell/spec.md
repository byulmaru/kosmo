## MODIFIED Requirements

### Requirement: 준비되지 않은 sidebar 진입점 비노출

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-487`, `PROD-566`, `PROD-654` — 유니버설 애플리케이션은 준비되지 않은 sidebar navigation 진입점을 노출하지 않고 현재 제공하는 feedback과 실제 동작하는 진입점을 유지해야 한다(MUST). 받은 팔로우 요청 관리 화면이 제공되면 full Web sidebar, compact Web rail과 mobile Web drawer는 같은 canonical route 진입점을 제공해야 한다(MUST).

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
- **AND** mobile 하단 5탭의 `/compose` 글쓰기 link는 유지한다
- **AND** compact Web icon rail의 글쓰기 link는 우측 composer가 없는 breakpoint의 진입점으로 유지한다

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
