## ADDED Requirements

### Requirement: Responsive Web profile picker surface

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/figma.md`, `PROD-238` — Web 앱 셸은 full sidebar와 compact icon rail에 각각 맞는 profile picker surface를 제공해야 하며(MUST), picker를 열어도 중앙 피드의 layout 폭을 바꾸지 않아야 한다(MUST).

#### Scenario: Open the full sidebar picker as an overlay

- **WHEN** 사용자가 `full` 이상 Web에서 프로필 이름 trigger를 실행한다
- **THEN** 시스템은 닫힌 260px 프로필 요약 영역 바로 아래에 profile picker를 anchored absolute overlay로 표시한다
- **AND** 닫힌 상태의 기존 260px 상단 프로필 요약 영역은 유지한다
- **AND** picker는 sidebar navigation 위에 표시하되 navigation의 layout 위치를 바꾸지 않는다
- **AND** backdrop과 focus trap을 사용하지 않는다
- **AND** sidebar의 실제 layout 폭은 유지한다
- **AND** 중앙 피드의 layout 폭은 유지한다

#### Scenario: Expose the full picker state from one trigger

- **WHEN** full sidebar profile picker가 닫히거나 열린다
- **THEN** 같은 프로필 이름 trigger가 accessibility `expanded` 상태로 열림 여부를 노출한다
- **AND** 닫힌 상태는 아래 방향 chevron, 열린 상태는 위 방향 chevron으로 표시한다
- **AND** chevron은 별도 focus target이 아니다

#### Scenario: Dismiss the full picker

- **WHEN** full sidebar profile picker가 열린 상태에서 사용자가 같은 프로필 이름 trigger를 다시 실행하거나 바깥을 클릭하거나 `Escape`를 누르거나 프로필 선택을 성공한다
- **THEN** 시스템은 overlay picker를 닫는다
- **AND** trigger는 닫힌 accessibility `expanded` 상태와 아래 방향 chevron을 표시한다
- **AND** 바깥 pointer close이면 시스템은 pointer event의 기본 동작을 막지 않아 pointer 대상의 기본 focus를 따른다
- **AND** trigger 재실행, 바깥 pointer close 또는 `Escape`의 명시적 close이면 `open=false`, `creating=false`, 빈 handle과 오류 없음으로 초기화한다

#### Scenario: Open the compact picker beside the icon rail

- **WHEN** 사용자가 `compact` 이상 `full` 미만 Web에서 프로필 아바타 trigger를 실행한다
- **THEN** 시스템은 80px 아이콘 레일 오른쪽에 비모달 overlay drawer를 표시한다
- **AND** drawer는 본문보다 위에 표시된다
- **AND** backdrop과 focus trap을 사용하지 않는다
- **AND** 아이콘 레일과 중앙 피드의 실제 layout 폭은 유지한다

#### Scenario: Dismiss the compact picker

- **WHEN** compact drawer가 열린 상태에서 사용자가 아바타 trigger를 다시 실행하거나 바깥을 클릭하거나 `Escape`를 누르거나 프로필 선택을 성공한다
- **THEN** 시스템은 compact drawer를 닫는다
- **AND** 바깥 pointer close이면 시스템은 pointer event의 기본 동작을 막지 않아 pointer 대상의 기본 focus를 따른다
- **AND** trigger 재실행, 바깥 pointer close 또는 `Escape`의 명시적 close이면 `open=false`, `creating=false`, 빈 handle과 오류 없음으로 초기화한다

### Requirement: Bounded profile picker content

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-238` — Web profile picker는 viewport 안에서 프로필 목록과 생성 진입을 계속 사용할 수 있어야 하며(MUST), 프로필 목록만 제한된 높이의 internal scroll owner로 사용해야 한다(MUST).

#### Scenario: Scroll a long profile list inside the picker

- **WHEN** 사용자가 접근할 수 있는 프로필이 10개 이상이다
- **THEN** 시스템은 프로필 목록만 picker 내부에서 스크롤한다
- **AND** 새 프로필 추가 액션은 목록 아래의 고정 영역에 계속 표시된다
- **AND** picker 밖의 Web document scroll 흐름은 유지된다

#### Scenario: Keep keyboard focus visible in the profile list

- **WHEN** 사용자가 full 또는 compact Web profile picker를 연다
- **THEN** 시스템은 현재 선택된 프로필, 선택값이 없으면 첫 프로필 항목으로 focus를 이동한다
- **AND** `ArrowUp`·`ArrowDown`·`Home`·`End`로 프로필 항목 사이를 이동할 수 있게 한다
- **AND** focus된 프로필 항목을 목록의 보이는 영역 안에 유지한다
- **AND** `Escape`는 picker를 닫고 해당 trigger로 focus를 복원한다
- **AND** `Tab`은 focus trap 없이 브라우저의 일반 focus 순서를 따른다

#### Scenario: Keep the create form available below the list

- **WHEN** 사용자가 새 프로필 추가 액션을 실행한다
- **THEN** 시스템은 고정 영역의 추가 액션을 생성 폼으로 교체한다
- **AND** 프로필 목록은 생성 폼을 제외한 남은 높이에 맞게 줄어든다

#### Scenario: Preserve a failed picker operation

- **WHEN** 프로필 선택 또는 생성이 실패한다
- **THEN** 시스템은 picker를 열린 상태로 유지하고 오류를 표시한다
- **AND** 생성 실패이면 사용자가 입력한 핸들을 유지한다

#### Scenario: Reset transient state after explicit dismissal

- **WHEN** 사용자가 full 또는 compact Web picker를 trigger 재실행, 바깥 pointer close 또는 `Escape`로 직접 닫는다
- **THEN** 시스템은 `open=false`, `creating=false`, 빈 handle과 오류 없음으로 초기화한다
- **AND** 바깥 pointer close는 pointer 대상의 기본 focus를 따르고, `Escape`는 해당 trigger로 focus를 복원한다
- **AND** 사용자가 picker를 다시 열면 생성 폼과 이전 오류는 표시하지 않는다
