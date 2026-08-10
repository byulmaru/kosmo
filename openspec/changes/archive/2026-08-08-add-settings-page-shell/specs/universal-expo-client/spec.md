## MODIFIED Requirements

### Requirement: Universal route parity

**Authority / Provenance:** archived `migrate-frontend-to-expo-relay`, PR #217, `PROD-541`; `docs/design/settings.md`, `PROD-685`; 선행 정보 구조 `PROD-653` — 유니버설 클라이언트는 기존 공개·보호 화면과 canonical `/settings` hub 및 지원되는 내부 detail route를 Android, iOS, Web에서 동일하게 해석해야 한다(MUST).

#### Scenario: Navigate core routes

- **WHEN** 사용자가 `/`, `/home`, `/compose`, `/search`, `/notifications`, `/settings` 중 하나로 이동한다
- **THEN** Expo Router는 해당 온보딩 또는 앱 화면을 표시한다

#### Scenario: Navigate profile routes

- **WHEN** 사용자가 `/${relativeHandle}`, `/${relativeHandle}/followers`, `/${relativeHandle}/following`, `/${relativeHandle}/{postId}` 중 하나로 이동한다
- **THEN** Expo Router는 local profile의 `@handle` 또는 stored ActivityPub remote profile의 `@handle@domain`을 `relativeHandle`로 해석해 해당 공개 화면을 표시한다
- **AND** route parameter에서는 leading `@`를 제거한 `handle` 또는 `handle@domain`을 `profileByHandle(handle:)`에 전달한다

#### Scenario: Navigate Settings detail route

- **WHEN** 사용자가 지원되는 Profile 기본 공개 범위 Settings detail route로 이동한다
- **THEN** Expo Router는 Web·Android·iOS에서 같은 Profile 설정 화면을 표시한다
- **AND** 플랫폼별 layout은 full master-detail 또는 one-pane detail 계약을 따른다

#### Scenario: Open a native deep link

- **WHEN** Android 또는 iOS가 지원 route를 가리키는 `kosmo://` custom-scheme deep link를 연다
- **THEN** 시스템은 웹과 같은 canonical 화면으로 이동한다
