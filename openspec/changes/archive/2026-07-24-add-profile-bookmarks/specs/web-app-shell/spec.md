## ADDED Requirements

### Requirement: Protected Bookmark list route

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `PROD-391`, `PROD-421` 본문과 2026-07-24 Bookmark 목록 UX와 navigation 계약 댓글 — 웹 앱은 개인 Bookmark 목록을 `/bookmarks` canonical route로 제공하고 `(tabs)` 앱 셸 안에 렌더링해야 한다(MUST). `/bookmarks`의 세션 판정과 redirect 보류는 `Protected app routes require a valid session` requirement와 동일한 `currentSession` guard를 적용해야 한다(MUST). 유효한 선택 Profile이 없으면 다른 Profile의 데이터를 대신 사용하지 않고 Profile 선택 안내를 표시해야 한다(MUST).

#### Scenario: Redirect a guest from the Bookmark route

- **WHEN** 유효한 세션이 없는 사용자가 `/bookmarks`에 접근한다
- **THEN** 시스템은 루트 온보딩(`/`)으로 이동한다

#### Scenario: Treat an invalid or expired session as a guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 `/bookmarks`에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Hold Bookmark redirect while session is unresolved

- **WHEN** `/bookmarks`에서 `currentSession` 확인이 진행 중이거나 조회가 오류로 실패한다
- **THEN** 시스템은 세션 판단을 보류하고 리다이렉트하지 않는다

#### Scenario: Open the Bookmark route

- **WHEN** 유효한 세션과 선택 Profile이 있는 사용자가 `/bookmarks`로 이동한다
- **THEN** 시스템은 `(tabs)` 셸을 유지하며 선택 Profile의 개인 Bookmark 목록 화면을 표시한다

#### Scenario: Navigate from the Web Bookmark menu

- **WHEN** 사용자가 Web full 또는 compact sidebar의 Bookmark 메뉴 항목을 선택한다
- **THEN** 시스템은 `/menu`를 경유하지 않고 canonical `/bookmarks` route로 이동한다

#### Scenario: Open without a selected Profile

- **WHEN** 유효한 세션은 있지만 선택 Profile이 없는 사용자가 `/bookmarks`로 이동한다
- **THEN** 시스템은 Bookmark 목록을 요청하지 않고 Profile 선택 안내를 표시한다
