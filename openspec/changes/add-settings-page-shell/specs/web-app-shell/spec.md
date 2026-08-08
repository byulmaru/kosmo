## MODIFIED Requirements

### Requirement: Protected app routes require a valid session

**Authority / Provenance:** `PROD-148`, `PROD-161`, `PROD-541`; `docs/design/settings.md`, `PROD-685`; 선행 정보 구조 `PROD-653` — `(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/settings`와 지원되는 Settings 내부 detail)은 유효한 세션(로그인)을 전제로 해야 한다(MUST). 유효한 세션이 없는 사용자가 이 route에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL query로 확인해야 하며(MUST), 만료·폐기된 세션은 `null`로 반환되어야 하고(MUST NOT), 쿠키 존재만으로 판정해서는 안 된다(MUST NOT). 공개 Profile route(`/${relativeHandle}` 및 그 하위 Post 상세)는 비로그인 조회를 유지해야 하며 이 guard에서 제외되어야 한다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 redirect해서는 안 된다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/compose`·`/search`·`/notifications`·`/settings` 중 하나에 접근한다
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
