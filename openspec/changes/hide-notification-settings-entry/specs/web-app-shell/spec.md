## ADDED Requirements

### Requirement: Sidebar 설정 진입점 비노출

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-487` — 유니버설 애플리케이션은 설정 공개 전 sidebar navigation에서 준비되지 않은 설정 진입점을 노출하지 않고 현재 제공하는 feedback과 비설정 진입점을 유지해야 한다(MUST).

#### Scenario: responsive sidebar에서 프로필 설정 비노출

- **WHEN** 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile drawer를 연다
- **THEN** 시스템은 `프로필 설정` link나 같은 의미의 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: feedback과 비설정 진입점 유지

- **WHEN** sidebar navigation이 설정 진입점 없이 렌더링된다
- **THEN** PROD-487과 PR #390의 `피드백 보내기` link와 `/feedback` destination을 유지한다
- **AND** 기존 `프로필`·`팔로워 요청` link, 로그아웃 control과 responsive navigation 동작을 유지한다
- **AND** `/menu` route를 삭제하거나 redirect하지 않는다
