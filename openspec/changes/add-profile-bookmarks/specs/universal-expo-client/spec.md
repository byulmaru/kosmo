## MODIFIED Requirements

### Requirement: Universal route parity

유니버설 클라이언트는 기존 공개·보호 화면의 canonical URL을 Android, iOS, Web에서 동일하게 해석해야 한다(MUST).

#### Scenario: Navigate core routes

- **WHEN** 사용자가 `/`, `/home`, `/compose`, `/search`, `/notifications`, `/bookmarks`, `/menu` 중 하나로 이동한다
- **THEN** Expo Router는 해당 온보딩 또는 앱 화면을 표시한다

#### Scenario: Navigate profile routes

- **WHEN** 사용자가 `/${relativeHandle}`, `/${relativeHandle}/followers`, `/${relativeHandle}/following`, `/${relativeHandle}/{postId}` 중 하나로 이동한다
- **THEN** Expo Router는 local profile의 `@handle` 또는 stored ActivityPub remote profile의 `@handle@domain`을 `relativeHandle`로 해석해 해당 공개 화면을 표시한다
- **AND** route parameter에서는 leading `@`를 제거한 `handle` 또는 `handle@domain`을 `profileByHandle(handle:)`에 전달한다

#### Scenario: Open a native deep link

- **WHEN** Android 또는 iOS가 지원 route를 가리키는 `kosmo://` custom-scheme deep link를 연다
- **THEN** 시스템은 웹과 같은 canonical 화면으로 이동한다

## ADDED Requirements

### Requirement: Universal Bookmark list behavior

Android, iOS, Web 클라이언트는 `/bookmarks` route에 같은 공용 route·component·Relay 계약을 사용해야 한다(MUST). 플랫폼별 차이는 safe area와 native navigation 같은 표현 경계로 제한해야 하며(MUST), Profile별 pagination cache key는 선택 Profile을 포함해 격리해야 한다(MUST).

#### Scenario: Render Bookmark list on every platform

- **WHEN** 사용자가 Android, iOS 또는 Web에서 `/bookmarks`를 연다
- **THEN** 각 플랫폼은 같은 공용 Bookmark 목록 route와 Relay query 계약을 사용한다

#### Scenario: Isolate Bookmark pagination by Profile

- **WHEN** 사용자가 선택 Profile을 바꾼 뒤 `/bookmarks` 목록을 조회한다
- **THEN** 클라이언트는 새 Profile의 connection과 cursor를 사용한다
- **AND** 이전 Profile의 edge를 새 Profile 결과에 병합하지 않는다
