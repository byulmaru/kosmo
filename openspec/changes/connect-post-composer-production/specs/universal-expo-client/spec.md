## MODIFIED Requirements

### Requirement: Platform-adaptive application shell

**Authority / Provenance:** `docs/design/breakpoints.md`, PROD-797 — 클라이언트는 같은 route content를 유지하면서 viewport와 native safe area에 맞는 앱 셸을 제공해야 한다(MUST).

#### Scenario: Render mobile shell

- **WHEN** native 앱 또는 폭 768px 미만의 Web viewport에서 탭 화면을 표시한다
- **THEN** 시스템은 safe area를 반영한 mobile header/content와 하단 탭 navigation을 표시한다

#### Scenario: Render compact desktop shell

- **WHEN** Web viewport 폭이 768px 이상 1280px 미만이다
- **THEN** 시스템은 `80px` 아이콘 navigation rail과 최대 `600px`의 중앙 content를 표시한다
- **AND** 우측 composer rail은 표시하지 않는다

#### Scenario: Render full desktop shell

- **WHEN** Web viewport 폭이 1280px 이상이다
- **THEN** 시스템은 `320px` 좌측 sidebar, 최대 `600px` 중앙 content, 고정 `320px` 우측 composer rail을 표시한다
- **AND** `1240px` 컬럼 묶음을 viewport 가운데에 정렬하고 남는 폭을 양옆 여백으로 배분한다
- **AND** 우측 composer rail이 비어 있어도 고정 `320px` 그리드 트랙을 유지한다

### Requirement: Universal route parity

**Authority / Provenance:** archived `migrate-frontend-to-expo-relay`, PR #217, `PROD-541`; `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-685`; 선행 정보 구조 `PROD-653` — 유니버설 클라이언트는 기존 공개·보호 화면과 canonical `/settings` hub 및 지원되는 내부 detail route를 Android, iOS, Web에서 동일하게 해석해야 한다(MUST). retired `/compose` direct route는 universal route parity 또는 composer entry로 제공하지 않으며(MUST NOT), 직접 접근은 404가 될 수 있다(MAY).

#### Scenario: Navigate core routes

- **WHEN** 사용자가 `/`, `/home`, `/search`, `/notifications`, `/settings` 중 하나로 이동한다
- **THEN** Expo Router는 해당 온보딩 또는 앱 화면을 표시한다

#### Scenario: Reject retired composer direct route

- **WHEN** 사용자가 `/compose`로 직접 이동한다
- **THEN** Expo Router는 composer 화면 또는 Production composer host를 표시하지 않는다
- **AND** 직접 접근은 404가 될 수 있다

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
