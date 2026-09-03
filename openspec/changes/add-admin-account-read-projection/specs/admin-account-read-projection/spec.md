## ADDED Requirements

### Requirement: 분리된 Account 목록 projection

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-691`. Admin Console은 같은 Viewer admission을 사용하는 Account 목록을 MUST 제공한다. 목록은 Account ID, 표시 이름, State, 생성 시각만 MUST 반환하며, Account ID 역순 keyset으로 페이지당 최대 50개를 MUST 반환한다.

#### Scenario: 첫 Account 페이지 조회

- **WHEN** Admin Console Viewer가 cursor 없이 Account 목록을 요청한다
- **THEN** Account ID 역순으로 최대 50개의 허용 필드와 다음 페이지 cursor를 반환한다

#### Scenario: 다음 Account 페이지 조회

- **WHEN** Admin Console Viewer가 이전 결과의 cursor로 Account 목록을 요청한다
- **THEN** cursor보다 작은 Account ID의 다음 결과를 중복 없이 반환한다

#### Scenario: 이전 Account 페이지 조회

- **WHEN** Admin Console Viewer가 첫 페이지 이후의 Account 목록을 보고 있다
- **THEN** Account ID keyset 경계를 유지하면서 이전 페이지로 이동할 수 있다

### Requirement: Account ID 상세 projection

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-691`. Admin Console은 Account ID로 단일 Account 상세를 MUST 조회한다. 상세는 목록 필드와 전체 OIDC subject만 반환하고 Profile, Membership, Session 또는 credential 정보를 MUST NOT 합친다.

#### Scenario: Account 상세 조회

- **WHEN** Admin Console Viewer가 존재하는 Account ID의 상세를 요청한다
- **THEN** 해당 Account의 허용된 상세 필드와 전체 OIDC subject를 반환한다

#### Scenario: 존재하지 않는 Account

- **WHEN** Admin Console Viewer가 존재하지 않거나 유효하지 않은 Account ID의 상세를 요청한다
- **THEN** 일반 404를 반환하고 내부 조회 정보를 노출하지 않는다

### Requirement: Server-side read query 경계

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-691`. Account projection은 SvelteKit server loader에서 read query 계층을 MUST 호출하며, 별도 REST 또는 GraphQL endpoint나 state-changing application action을 MUST NOT 만든다.

#### Scenario: Account 화면 요청

- **WHEN** Admin Console Viewer가 Account 목록 또는 상세 화면을 요청한다
- **THEN** server loader가 Account projection을 조회해 page data로 전달한다

#### Scenario: 지원하지 않는 mutation 요청

- **WHEN** caller가 Account 화면 경계에 mutation method를 요청한다
- **THEN** Account 상태를 변경하지 않고 method를 거부한다
