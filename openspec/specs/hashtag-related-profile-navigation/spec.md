# hashtag-related-profile-navigation Specification

## Purpose

공개 Profile의 TagChip에서 정확한 Hashtag identity의 관련 Profile 목록과 기존 Profile route까지 이어지는 Web·Android·iOS 클라이언트 탐색 계약을 문서화한다.

## Requirements

### Requirement: Exact Hashtag identity navigation

**Authority / Provenance:** `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`, `PROD-525`, `PROD-529` (2026-08-05 route 선택과 제목 승인) — client는 공개 Profile의 TagChip이 보유한 Hashtag global ID를 `/hashtags/[hashtagId]/profiles` route로 전달하고 같은 ID를 기존 `node(id:)` lookup에 사용해야 한다(MUST). canonical Hashtag 이름이나 `#` text를 route identity 또는 검색 입력으로 사용해서는 안 되며(MUST NOT), 성공한 Hashtag Node의 이름을 `#<태그명> 관련 프로필` 화면 제목으로 표시해야 한다(MUST).

#### Scenario: Open the related Profile route from a public TagChip

- **WHEN** 로그인한 Account가 공개 Profile의 `#<태그명>` TagChip을 선택한다
- **THEN** client는 그 TagChip의 Hashtag global ID를 `/hashtags/[hashtagId]/profiles` path에 전달한다
- **AND** 같은 ID를 `node(id:)`에 사용해 Hashtag와 관계 목록을 조회한다
- **AND** 성공한 Hashtag 이름으로 `#<태그명> 관련 프로필` 제목을 표시한다

#### Scenario: Open the same Hashtag by direct route entry

- **WHEN** 로그인한 Account가 유효한 Hashtag global ID의 `/hashtags/[hashtagId]/profiles`에 직접 진입한다
- **THEN** client는 TagChip 진입과 같은 Node identity와 관계 목록 query를 사용한다
- **AND** Hashtag 이름을 URL의 identity로 재해석하지 않는다

#### Scenario: Keep relation context before the Hashtag name resolves

- **WHEN** route가 Hashtag Node의 canonical 이름을 아직 받지 못했다
- **THEN** client는 `관련 프로필` PageHeader와 route 맥락을 유지한다
- **AND** query parameter나 이전 화면의 이름을 identity로 사용하지 않는다

#### Scenario: Handle a missing or non-Hashtag Node

- **WHEN** path의 global ID가 존재하지 않거나 Hashtag Node를 가리키지 않는다
- **THEN** client는 다른 Hashtag나 사람 검색 결과로 대체하지 않는다
- **AND** 기존 route 오류 표현과 안전한 이전 화면 이동을 제공한다

### Requirement: Dedicated related Profile connection and existing Profile actions

**Authority / Provenance:** `docs/design/hashtag-related-profiles.md`, `PROD-525`, `PROD-528`, `PROD-529` — client는 `Hashtag.relatedProfiles(first:, after:)`를 search·followers·following과 분리된 Relay connection으로 소비하고 한 번에 최대 20개씩 forward pagination해야 한다(MUST). 결과는 기존 Profile 목록 item, Profile route 이동과 허용된 Profile action을 재사용해야 하며(MUST), Hashtag 또는 Hashtag Name item이나 관련도·알파벳순 표현을 추가해서는 안 된다(MUST NOT).

#### Scenario: Render related Profiles with existing list items

- **WHEN** Hashtag Node가 공개 조회 가능한 관련 Profile edge를 반환한다
- **THEN** client는 각 edge를 기존 Profile 목록 item으로 한 번씩 표시한다
- **AND** Profile 선택은 기존 Profile route로 이동한다
- **AND** 기존 item이 제공하는 허용된 Profile action을 유지한다

#### Scenario: Keep Hashtag relation state isolated from search

- **WHEN** Account가 같은 Session에서 사람 검색과 Hashtag 관계 목록을 각각 탐색한다
- **THEN** client는 두 흐름의 Relay connection key, cursor, loading과 error 상태를 공유하지 않는다
- **AND** Hashtag 관계 조회가 기존 `searchProfiles` 입력·결과·pagination을 변경하지 않는다

#### Scenario: Show an empty related Profile state

- **WHEN** 존재하는 Hashtag Node의 `relatedProfiles`가 공개 조회 가능한 edge를 반환하지 않는다
- **THEN** client는 선택한 Hashtag 제목을 유지한 채 관련 Profile이 없다는 빈 상태를 표시한다
- **AND** Hashtag 검색이나 추천 결과를 대신 표시하지 않는다

### Requirement: Retained context across loading, error and pagination states

**Authority / Provenance:** `docs/design/hashtag-related-profiles.md`, `PROD-525`, `PROD-529` — client는 첫 loading·첫 error·retry·empty·다음 page loading·error·retry·terminal 상태에서 선택한 Hashtag route 맥락을 유지해야 한다(MUST). 다음 page 요청이 실패해도 이미 표시한 Profile edge를 제거해서는 안 되며(MUST NOT), 동일 cursor 요청을 동시에 중복 실행하거나 terminal page에서 추가 요청 affordance를 노출해서는 안 된다(MUST NOT).

#### Scenario: Retry an initial request

- **WHEN** Hashtag Node 또는 첫 관련 Profile page 요청이 실패한다
- **THEN** client는 관계 목록 route와 PageHeader 맥락을 유지한 오류 상태를 표시한다
- **AND** 실패한 첫 요청을 다시 실행할 수 있는 action을 제공한다

#### Scenario: Retain existing Profiles after a next-page failure

- **WHEN** 하나 이상의 관련 Profile page가 표시된 뒤 다음 page 요청이 실패한다
- **THEN** client는 이미 표시한 Profile과 Hashtag 제목을 유지한다
- **AND** 실패한 다음 page 요청만 다시 실행할 수 있게 한다

#### Scenario: Prevent duplicate page requests

- **WHEN** 같은 cursor의 다음 page 요청이 진행 중이다
- **THEN** client는 그 cursor의 추가 요청을 시작하지 않는다
- **AND** 성공한 page의 Profile edge를 한 번만 append한다

#### Scenario: Stop at the terminal page

- **WHEN** 현재 connection의 `hasNextPage`가 false다
- **THEN** client는 더 불러오기 affordance를 노출하지 않는다
- **AND** 추가 page 요청을 실행하지 않는다

### Requirement: Accessible cross-platform TagChip entry and list context

**Authority / Provenance:** `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`, `PROD-525`, `PROD-529` — 공개 Profile의 TagChip navigation은 `#<태그명> 관련 프로필 보기` 접근성 이름과 link semantics를 제공하고 Web keyboard, iOS 44 pt와 Android 48 dp 입력 target에서 활성화되어야 한다(MUST). client는 기존 표시 전용 TagChip의 시각 geometry와 편집기의 제거·validation action을 유지해야 하며(MUST), 색이나 생략된 text만으로 navigation 목적과 상태를 전달해서는 안 된다(MUST NOT).

#### Scenario: Activate a public TagChip with assistive input

- **WHEN** 사용자가 공개 Profile의 TagChip에 keyboard, screen reader 또는 platform touch input으로 접근한다
- **THEN** client는 전체 `#<태그명> 관련 프로필 보기` 이름과 link 목적을 제공한다
- **AND** 선택하면 exact Hashtag ID의 관련 Profile route를 연다

#### Scenario: Preserve editor and visual chip responsibilities

- **WHEN** 같은 표시 전용 TagChip visual이 공개 Profile navigation과 Profile 편집기에서 사용된다
- **THEN** 공개 Profile의 navigation wrapper만 link target을 소유한다
- **AND** 편집기의 제거 action, disabled state와 validation은 기존 편집 component가 계속 소유한다

### Requirement: Client scope and platform verification remain explicit

**Authority / Provenance:** `docs/design/hashtag-related-profiles.md`, `docs/design/profile-tags.md`, `PROD-525`, `PROD-529` — PROD-529 client는 기존 React Native primitive와 theme token으로 Web·Android·iOS에 같은 정보 구조를 제공해야 한다(MUST). 이 slice는 기존 API·DB·dependency, Remote lookup·refresh·materialization, 사람 검색과 analytics를 변경해서는 안 되며(MUST NOT), Web 자동화와 source-level platform mapping을 iOS·Android 실제 runtime 완료 증거로 표현해서는 안 된다(MUST NOT).

#### Scenario: Preserve excluded systems

- **WHEN** PROD-529 client navigation을 구현한다
- **THEN** 기존 `Hashtag.relatedProfiles`, DB schema, dependency, `searchProfiles`, 원격 Profile lifecycle과 analytics 계약은 변경되지 않는다

#### Scenario: Report platform evidence honestly

- **WHEN** React Native Web unit·상태 catalog·Web E2E와 platform target source mapping이 통과한다
- **THEN** PROD-529는 해당 Web 및 source-level 증거를 기록한다
- **AND** 수행하지 않은 iOS·Android 실제 runtime QA를 완료로 기록하지 않는다
