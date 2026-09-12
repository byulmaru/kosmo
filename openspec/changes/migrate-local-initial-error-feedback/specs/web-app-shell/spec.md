## MODIFIED Requirements

### Requirement: Local timeline loading, empty, and error states

**Authority / Provenance:** `docs/design/local-timeline.md`, `docs/design/accessibility.md`, Figma Mobile `4665:4855`, `6576:8485`, Figma Web `5560:13625`, `PROD-939` — The app SHALL Local route의 최초 loading, empty, 저장된 성공 목록이 없는 최초 error와 성공 목록 뒤 hard refresh error·retry 상태를 공용 목록·상태·Toast 컴포넌트로 제공한다. 상태 문구, 플랫폼별 오류 배경과 announcement는 canonical design과 PROD-939를 따라야 한다(MUST).

현재 actor에서 Local route가 성공한 `LocalPageQuery` 결과를 렌더하면 빈 connection이나 Relay cache에서 읽은
결과도 성공 이력으로 간주한다.

#### Scenario: Initial Local loading

- **WHEN** Local 첫 page를 불러오는 중이다
- **THEN** 시스템은 공용 StateView loading으로 `로컬 타임라인을 불러오는 중입니다.`를 표시하고 보조 기술에 알린다

#### Scenario: Empty Local timeline

- **WHEN** Local connection에 표시할 edge가 없다
- **THEN** 시스템은 `아직 게시글이 없어요`와 `첫 게시글이 올라오면 여기에 표시돼요.`를 표시한다

#### Scenario: Present an initial Local error on Web

- **WHEN** 저장된 성공 목록이 없는 Web Local 첫 page 조회가 실패한다
- **THEN** 시스템은 목록 영역을 비운 채 공용 persistent Danger Toast로 `로컬 타임라인을 불러오지 못했어요`와 `다시 시도` action을 표시한다
- **AND** Toast는 공용 alert announcement와 action button semantics를 유지하며 자동으로 사라지지 않는다

#### Scenario: Present an initial Local error on Android and iOS Native

- **WHEN** 저장된 성공 목록이 없는 Android 또는 iOS Native Local 첫 page 조회가 실패한다
- **THEN** 시스템은 두 Native 플랫폼에 Figma Android baseline의 2행 skeleton과 공용 persistent Danger Toast로 `로컬 타임라인을 불러오지 못했어요`와 `다시 시도` action을 표시한다
- **AND** skeleton은 보조 기술에서 숨기고 Toast는 공용 alert announcement와 action button semantics를 유지한다

#### Scenario: Retry an initial Local error

- **WHEN** 사용자가 최초 오류 Toast의 `다시 시도` action을 실행한다
- **THEN** 시스템은 기존 RouteBoundary 경로로 Local 첫 page 재시도를 시작하고 실행한 action을 제거한다
- **AND** 재시도가 성공하면 오류 Toast를 남기지 않고 성공 목록 또는 빈 상태를 표시한다
- **AND** 재시도가 다시 실패하면 플랫폼별 최초 오류 배경과 새 persistent Danger Toast를 다시 표시한다

#### Scenario: End an initial Local error lifetime

- **WHEN** 최초 오류가 표시된 Local route를 이탈하거나 selected Profile이 전환된다
- **THEN** 시스템은 이전 route 또는 actor의 Toast와 retry action을 제거하고 다음 화면이나 actor에 남기지 않는다

#### Scenario: Present a hard refresh Local error after success

- **WHEN** 현재 route·actor에 빈 connection이나 Relay cache 결과를 포함한 성공한 Local 조회가 렌더된 뒤 hard refresh 요청이 실패한다
- **THEN** 시스템은 마지막 성공 목록을 유지하고 공용 persistent Danger Toast로 `로컬 타임라인을 불러오지 못했어요`와 `다시 시도` action을 표시한다
- **AND** 최초 오류 전용 Web 빈 배경이나 Native skeleton으로 목록을 대체하지 않는다

#### Scenario: Preserve a reply draft during a failed Local refresh

- **WHEN** Local hard refresh가 진행되는 동안 사용자가 목록에서 답글 작성창을 열어 입력한 뒤 요청이 실패한다
- **THEN** 시스템은 기존 목록 인스턴스, 열린 답글 작성창과 입력 내용을 유지하며 오류 Toast를 표시한다
- **AND** 오류 처리를 위해 작성창을 닫거나 작성 중인 내용을 폐기하지 않는다

#### Scenario: Retry a hard refresh Local error

- **WHEN** 사용자가 hard refresh 오류 Toast의 `다시 시도` action을 실행한다
- **THEN** 시스템은 refresh token을 통해 Local hard refresh 재시도를 시작하고 실행한 action을 제거한다
- **AND** 재시도가 성공하면 갱신 결과를 표시하고 오류 Toast를 남기지 않는다
- **AND** 재시도가 다시 실패하면 마지막 성공 목록과 새 persistent Danger Toast를 계속 제공한다

#### Scenario: End a hard refresh Local error lifetime

- **WHEN** hard refresh 오류가 표시된 Local route를 이탈하거나 selected Profile이 전환된다
- **THEN** 시스템은 이전 route 또는 actor의 Toast와 retry action을 제거하고 다음 화면이나 actor에 남기지 않는다

#### Scenario: Preserve partial response and pagination behavior

- **WHEN** Local refresh가 사용 가능한 부분 GraphQL 응답을 반환하거나 pagination 요청이 완료된다
- **THEN** 시스템은 기존 Relay partial data 처리와 pagination 오류·재시도 계약을 유지한다
