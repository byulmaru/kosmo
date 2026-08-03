## MODIFIED Requirements

### Requirement: Universal shell feedback navigation

**Authority / Provenance:** `docs/design/feedback.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-487`, `PROD-594` — Android/iOS/Web shell은 기존 settings-and-support 위치에 `피드백 보내기` 진입점을 제공해야 한다(MUST). Web의 full sidebar, compact icon rail과 mobile drawer 진입점은 현재 route를 유지한 채 `feedback=open` query를 push해 하나의 shell-level 피드백 overlay를 열어야 하며(MUST), Android/iOS 진입점과 Web의 직접 `/feedback` 접근은 보호된 canonical `/feedback` route를 계속 사용해야 한다(MUST).

#### Scenario: Open overlay from full Web sidebar

- **WHEN** 로그인한 사용자가 full Web sidebar의 `피드백 보내기` 진입점을 활성화한다
- **THEN** 시스템은 현재 pathname과 기존 query를 보존한 채 `feedback=open` history entry를 push한다
- **AND** 현재 route 화면 위에 피드백 dialog를 표시한다
- **AND** 기존 route tree와 document scroll 맥락을 배경에 유지한다

#### Scenario: Open overlay from compact Web rail

- **WHEN** 로그인한 사용자가 compact Web icon rail의 `피드백 보내기` 진입점을 활성화한다
- **THEN** 시스템은 현재 pathname과 기존 query를 보존한 채 `feedback=open` history entry를 push한다
- **AND** 현재 route 화면 위에 피드백 dialog를 표시한다
- **AND** icon-only 진입점의 accessible name은 `피드백 보내기`이다

#### Scenario: Open overlay from mobile Web drawer

- **WHEN** mobile Web drawer가 열려 있고 로그인한 사용자가 `피드백 보내기` 진입점을 활성화한다
- **THEN** 시스템은 drawer를 닫고 현재 pathname과 기존 query를 보존한 채 `feedback=open` history entry를 push한다
- **AND** 현재 route 화면 위에 피드백 bottom sheet를 표시한다

#### Scenario: Keep Native feedback route navigation

- **WHEN** Android 또는 iOS 사용자가 shell의 `피드백 보내기` 진입점을 활성화한다
- **THEN** 시스템은 기존 `/feedback` route로 이동한다
- **AND** 기존 drawer close와 navigation semantics를 유지한다

#### Scenario: Keep direct Web feedback route

- **WHEN** 로그인한 Web 사용자가 `/feedback` URL을 직접 열거나 그 URL에서 새로고침한다
- **THEN** 시스템은 overlay와 중복된 form을 만들지 않고 기존 독립 피드백 page를 표시한다
- **AND** 기존 보호 route, `PageHeader`, mutation, 성공·실패·재시도 동작을 유지한다

#### Scenario: Restore a fresh query-backed overlay

- **WHEN** 로그인한 Web 사용자가 `/feedback`이 아닌 shell route를 `feedback=open` query와 함께 직접 열거나 새로고침한다
- **THEN** 시스템은 해당 route 위에 피드백 overlay를 복원한다
- **AND** 사용자가 overlay를 닫으면 현재 history에서 다른 page로 이동하지 않고 `feedback` query만 replace해 제거한다

#### Scenario: Close a clean internally opened overlay

- **WHEN** shell 진입점이 push한 피드백 overlay에 변경된 draft가 없고 제출 중이 아닌 상태에서 사용자가 닫기 버튼, backdrop 또는 `Escape`를 실행한다
- **THEN** 시스템은 overlay의 단일 `requestClose` 경계를 통해 이전 history entry로 돌아간다
- **AND** browser forward는 `feedback=open` entry를 다시 방문해 overlay를 다시 연다

#### Scenario: Close with browser back

- **WHEN** shell 진입점이 push한 피드백 overlay가 열려 있고 사용자가 browser back을 실행한다
- **THEN** 시스템은 현재 route의 직전 history entry로 돌아가 overlay를 닫는다
- **AND** draft 또는 제출 상태가 있으면 같은 `requestClose` 정책을 적용한다

#### Scenario: Confirm discarding a dirty draft

- **WHEN** 피드백 종류나 본문이 초기값에서 바뀐 상태에서 사용자가 닫기 버튼, backdrop, `Escape` 또는 browser back으로 overlay를 닫으려 한다
- **THEN** 시스템은 작성 중인 피드백을 버릴지 확인한다
- **AND** 사용자가 취소하면 overlay, `feedback=open` query와 draft를 유지한다
- **AND** 사용자가 폐기를 확인하면 overlay를 닫고 해당 close source에 맞는 history 결과를 적용한다

#### Scenario: Block closing while submitting

- **WHEN** 피드백 제출이 진행 중인 상태에서 사용자가 닫기 버튼, backdrop, `Escape` 또는 browser back으로 overlay를 닫으려 한다
- **THEN** 시스템은 overlay, `feedback=open` query와 form 상태를 유지한다
- **AND** 중복 제출이나 별도 API 호출 경로를 만들지 않는다

#### Scenario: Keep overlay open after successful submission

- **WHEN** overlay 안의 피드백 제출이 성공한다
- **THEN** 시스템은 기존 성공 메시지를 표시하고 피드백 종류와 본문을 초기화한다
- **AND** overlay와 `feedback=open` query를 유지해 사용자가 다른 피드백을 이어서 제출할 수 있게 한다

#### Scenario: Keep draft after failed submission

- **WHEN** overlay 안의 피드백 제출이 delivery failure 또는 GraphQL failure로 끝난다
- **THEN** 시스템은 기존 오류와 재시도 action을 표시한다
- **AND** 피드백 종류, 본문, overlay와 `feedback=open` query를 유지한다

#### Scenario: Present responsive Web overlay surfaces

- **WHEN** `feedback=open` overlay가 `768px` 미만 Web viewport에서 열린다
- **THEN** 시스템은 viewport 아래에 붙는 bottom sheet로 표시한다
- **AND** `768px` 이상 Web viewport에서는 최대 약 `600px` 너비와 `85dvh` 높이의 중앙 dialog로 표시한다
- **AND** 두 surface 모두 form body만 가용 높이 안에서 내부 scroll한다

#### Scenario: Provide modal accessibility lifecycle

- **WHEN** 피드백 overlay가 열린다
- **THEN** 시스템은 `피드백 보내기` 제목과 accessible name이 있는 닫기 control을 제공하고 focus를 dialog 내부로 이동한다
- **AND** keyboard focus를 overlay 안에 가두고 배경 shell을 pointer, keyboard와 accessibility tree 상호작용에서 차단한다
- **AND** overlay를 닫으면 열기 직전의 유효한 focus target과 document scroll 위치를 복원한다

#### Scenario: Mark feedback navigation current

- **WHEN** Android/iOS/Web shell의 현재 pathname이 `/feedback`이다
- **THEN** 시스템은 `피드백 보내기` 진입점을 active로 표시한다
- **AND** 기존 page-current semantics를 유지한다
