## ADDED Requirements

### Requirement: 유효한 직접 접근과 새로고침 URL 유지

시스템은 유효한 정적·동적·중첩 Web route의 직접 접근과 새로고침에서 초기 로딩·지연된 Relay 응답 중에도 원래 유효한 URL을 유지해야 한다(SHALL). 최종 URL뿐 아니라 document·pushState·replaceState 전체 이력으로 확인해야 한다(SHALL).

**Source Context:** PROD-1103 완료 조건. 아래 내용은 기존 issue의 관찰 가능한 결과를 확인할 임시 예시이며 새 제품 계약을 추가하지 않는다.

#### Scenario: 정적 route의 직접 접근과 reload

- **WHEN** 인증된 사용자가 `/home`, `/search`, `/notifications`, `/bookmarks`, `/settings` 또는 `/settings/theme`에 직접 접근하거나 새로고침하고 Shell 응답이 지연된다
- **THEN** 해당 문서의 전체 URL 이력에서 요청한 유효 URL을 유지한다
- **AND** `/undefined/undefined` 또는 요청하지 않은 게시물 경로가 기록되지 않는다

#### Scenario: Profile과 중첩 following route

- **WHEN** 사용자가 유효한 fixture Profile Home 또는 following route에 직접 접근하거나 새로고침하고 Shell 또는 Profile 응답이 지연된다
- **THEN** 유효한 Profile 경로와 요청한 중첩 경로를 유지한다
- **AND** Profile handle 뒤의 `/undefined` 또는 요청하지 않은 부모 경로가 일시 기록되지 않는다

#### Scenario: Post detail과 reactions route

- **WHEN** 사용자가 유효한 fixture Post detail 또는 reactions route에 직접 접근하거나 새로고침한다
- **THEN** 전체 URL 이력은 요청한 게시물 경로와 중첩 suffix를 유지한다
- **AND** path parameter인 `profileHandle`·`postId`가 요청하지 않은 query로 추가되지 않는다

#### Scenario: 원래 URL의 query와 hash

- **WHEN** 유효한 query 또는 hash를 포함한 URL에 직접 접근하거나 새로고침한다
- **THEN** 기존 route 정책에 따른 유효한 URL을 유지한다
- **AND** 준비되지 않은 state 때문에 query 또는 hash가 변형되지 않는다

### Requirement: 기존 navigation과 접근 결과 보존

시스템은 기존의 의도된 navigation·인증 redirect·조회 및 not-found 결과를 보존해야 한다(SHALL).

**Source Context:** PROD-1103의 내부 이동·뒤로가기·Profile·Post·not-found 보존 조건, `docs/domain/objects/session.md`, `docs/design/breakpoints.md`.

#### Scenario: 내부 이동과 browser history traversal

- **WHEN** 사용자가 정적·동적 route 사이를 이동하거나 기존 query-only 이동·뒤로/앞으로를 실행한다
- **THEN** 기존 목적지·history와 해당 흐름의 focus·scroll 동작을 유지한다
- **AND** `/`의 기존 인증별 redirect를 잘못된 URL 전환으로 판정하지 않는다

#### Scenario: guest·missing·query 실패

- **WHEN** guest가 보호 route에 접근하거나 Profile·Post가 존재하지 않거나 query가 실패해 재시도한다
- **THEN** 기존 인증·not-found·오류·retry 결과를 유지한다
- **AND** URL 안정화를 이유로 보호 화면이나 조회 정책을 우회하지 않는다

### Requirement: 잘못된 pageview 신규 기록 방지

시스템은 이 결함으로 잘못된 URL의 PostHog `$pageview`를 새로 기록해서는 안 된다(MUST NOT). 검증을 위해 운영 수집 정책을 바꾸지 않는다.

**Source Context:** PROD-1103의 PostHog 완료 조건과 `docs/operations/posthog.md`의 analytics 운영 경계.

#### Scenario: 활성 SDK의 격리 전송 검증

- **WHEN** 실제 PostHog SDK가 초기화된 격리 browser fixture에서 유효 route의 직접 접근과 reload를 실행한다
- **THEN** 정상 pageview positive control을 확인하고 전송 payload에 결함으로 생성된 잘못된 URL이 없는지 검증한다
- **AND** SDK가 초기화되지 않은 localhost의 요청 부재를 pageview 검증 성공으로 취급하지 않는다
