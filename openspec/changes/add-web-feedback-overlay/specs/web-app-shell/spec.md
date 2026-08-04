## MODIFIED Requirements

### Requirement: Universal shell feedback navigation

**Authority / Provenance:** `docs/design/feedback.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-487`, `PROD-594` — Android/iOS/Web shell은 인증 상태에서 기존 settings-and-support 위치에 `피드백 보내기` 진입점을 제공해야 한다(MUST). Web의 일반 진입은 URL과 browser
history를 변경하지 않는 단일 shell-level overlay를 열어야 하며(MUST), Android/iOS와 Web 직접 `/feedback`
접근은 보호된 canonical route를 유지해야 한다(MUST). Guest public shell은 진입점과 form을 노출하지 않아야
한다(MUST NOT).

#### Scenario: Open overlay from full and compact Web navigation

- **WHEN** 로그인한 사용자가 full sidebar 또는 compact icon rail의 `피드백 보내기`를 활성화한다
- **THEN** 시스템은 현재 pathname, query와 browser history를 변경하지 않는다
- **AND** 현재 route tree와 document scroll을 배경에 유지한 단일 피드백 dialog를 표시한다
- **AND** 진입점의 accessible name은 `피드백 보내기`이다

#### Scenario: Open overlay from mobile Web drawer

- **WHEN** mobile Web drawer가 열려 있고 로그인한 사용자가 `피드백 보내기`를 활성화한다
- **THEN** 시스템은 drawer를 닫고 URL을 변경하지 않은 채 현재 route 위 bottom sheet를 표시한다

#### Scenario: Hide feedback from guest public shell

- **WHEN** 비로그인 사용자가 public Web shell을 본다
- **THEN** 시스템은 `피드백 보내기` 진입점과 overlay form을 표시하지 않는다
- **AND** `feedback=open` query가 있어도 overlay를 열지 않는다

#### Scenario: Keep Native feedback route navigation

- **WHEN** Android 또는 iOS 사용자가 shell의 `피드백 보내기`를 활성화한다
- **THEN** 시스템은 기존 `/feedback` route로 이동하고 기존 drawer close/navigation semantics를 유지한다

#### Scenario: Keep direct Web feedback route

- **WHEN** 로그인한 Web 사용자가 `/feedback` URL을 직접 열거나 새로고침한다
- **THEN** 시스템은 overlay를 중복하지 않고 기존 독립 page를 표시한다
- **AND** 기존 보호 route, `PageHeader`, mutation, 성공·실패·재시도 동작을 유지한다

#### Scenario: Ignore legacy feedback query

- **WHEN** 사용자가 `/feedback`이 아닌 shell route를 `feedback=open` query와 함께 직접 열거나 새로고침한다
- **THEN** 시스템은 query를 overlay open state로 해석하지 않는다
- **AND** 현재 route와 query를 변경하지 않는다

#### Scenario: Close a clean overlay explicitly

- **WHEN** draft가 clean이고 제출 중이 아닌 overlay에서 사용자가 닫기 버튼, backdrop 또는 `Escape`를 실행한다
- **THEN** 시스템은 overlay를 닫고 URL, route tree, document scroll과 browser history를 유지한다

#### Scenario: Confirm discarding a dirty draft

- **WHEN** 종류나 본문이 초기값에서 바뀐 상태에서 닫기 버튼, backdrop 또는 `Escape`를 실행한다
- **THEN** 시스템은 작성 중인 피드백을 버릴지 확인한다
- **AND** 취소하면 overlay와 draft를 유지하고 폐기하면 overlay를 닫는다

#### Scenario: Block explicit close while submitting

- **WHEN** 제출 중인 상태에서 사용자가 닫기 버튼, backdrop 또는 `Escape`를 실행한다
- **THEN** 시스템은 overlay와 form 상태를 유지하고 중복 제출 경로를 만들지 않는다

#### Scenario: Do not guard browser navigation and reload

- **WHEN** overlay가 열린 상태에서 browser Back/Forward, reload, 주소 이동 또는 tab close가 발생한다
- **THEN** 시스템은 overlay 전용 navigation/history guard를 적용하지 않는다
- **AND** 이 경로의 dirty draft 보존과 submitting 이탈 차단을 보장하지 않는다

#### Scenario: Keep overlay open after submission result

- **WHEN** 제출이 성공한다
- **THEN** 시스템은 성공 메시지를 표시하고 종류와 본문을 초기화한 채 overlay를 유지한다
- **WHEN** 제출이 실패한다
- **THEN** 시스템은 오류, 재시도, 종류, 본문과 overlay를 유지한다

#### Scenario: Present responsive and accessible Web surfaces

- **WHEN** overlay가 `768px` 미만 Web viewport에서 열린다
- **THEN** viewport 아래 bottom sheet로 표시한다
- **AND** `768px` 이상에서는 최대 약 `600px` 너비와 `85dvh` 높이의 중앙 dialog로 표시한다
- **AND** form body만 가용 높이 안에서 내부 scroll한다
- **AND** focus를 내부로 이동·가두고 배경 shell 상호작용을 차단한다
- **AND** 닫으면 유효한 이전 focus target과 document scroll을 복원한다

#### Scenario: Mark feedback route current

- **WHEN** Android/iOS/Web shell의 현재 pathname이 `/feedback`이다
- **THEN** 시스템은 `피드백 보내기` route 진입점을 active로 표시한다
