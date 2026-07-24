## ADDED Requirements

### Requirement: Universal Bookmark list behavior

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `PROD-391`, `PROD-421` 본문과 2026-07-24 Bookmark 목록 UX와 navigation 계약 댓글 — Android, iOS, Web 클라이언트는 `/bookmarks` route에 같은 공용 route·component·Relay 계약을 사용해야 한다(MUST). 플랫폼별 차이는 safe area와 native navigation 같은 표현 경계로 제한해야 하며(MUST), Profile별 pagination cache key는 선택 Profile을 포함해 격리해야 한다(MUST).

#### Scenario: Render Bookmark list on every platform

- **WHEN** 사용자가 Android, iOS 또는 Web에서 `/bookmarks`를 연다
- **THEN** 각 플랫폼은 같은 공용 Bookmark 목록 route와 Relay query 계약을 사용한다

#### Scenario: Navigate from the mobile Bookmark menu

- **WHEN** 사용자가 Android, iOS 또는 mobile layout의 Web에서 메뉴 drawer의 Bookmark 항목을 선택한다
- **THEN** 시스템은 canonical `/bookmarks` route로 이동한다
- **AND** Bookmark 전용 bottom tab이나 별도 header action을 요구하지 않는다

#### Scenario: Isolate Bookmark pagination by Profile

- **WHEN** 사용자가 선택 Profile을 바꾼 뒤 `/bookmarks` 목록을 조회한다
- **THEN** 클라이언트는 새 Profile의 connection과 cursor를 사용한다
- **AND** 이전 Profile의 edge를 새 Profile 결과에 병합하지 않는다
