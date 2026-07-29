## ADDED Requirements

### Requirement: Web shell feedback navigation

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487` — The Web shell MUST provide a "피드백 보내기" link in the existing settings-and-support position of the full sidebar, compact icon rail, and Web mobile drawer. The link MUST navigate to the protected canonical `/feedback` route. This requirement MUST NOT add the Android or iOS menu entry owned by `PROD-488`.

#### Scenario: Navigate from full Web sidebar

- **WHEN** 로그인한 사용자가 full Web sidebar의 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** 링크는 실제 destination을 나타내는 link semantics와 접근 가능한 이름을 제공한다

#### Scenario: Navigate from compact Web rail

- **WHEN** 로그인한 사용자가 compact Web icon rail의 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** icon-only link의 accessible name은 "피드백 보내기"이다

#### Scenario: Navigate from Web mobile drawer

- **WHEN** Web mobile drawer가 열려 있고 로그인한 사용자가 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** 열려 있던 drawer를 닫는다

#### Scenario: Mark feedback navigation current

- **WHEN** Web shell의 현재 route가 `/feedback`이다
- **THEN** 시스템은 "피드백 보내기" 링크를 active로 표시한다
- **AND** active 상태는 page-current semantics로 노출된다

#### Scenario: Preserve the existing menu route

- **WHEN** 로그인한 Web 사용자가 `/menu`를 연다
- **THEN** 시스템은 `/feedback`으로 redirect하지 않고 기존 메뉴 화면을 렌더링한다
- **AND** `/feedback`은 독립된 protected route로 유지된다

#### Scenario: Leave native menu navigation unchanged

- **WHEN** Android 또는 iOS 앱이 이번 변경의 shell navigation을 렌더링한다
- **THEN** 시스템은 이번 Web 구현 slice를 이유로 native "피드백 보내기" entry를 새로 노출하지 않는다
