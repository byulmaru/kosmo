# radio-group Specification

## Purpose

Web·Native 공용 controlled radio group/option의 semantics와 상태, Web keyboard 동작, canonical option presentation과 consumer lifecycle 소유권을 정의한다.

## Requirements

### Requirement: Controlled radio selection semantics

**Authority / Provenance:** `docs/design/foundations.md`, `docs/design/accessibility.md`, PROD-753; 공용 radio group은 Web과 Native에서 accessible group name을 제공하고 각 option을 radio role, accessible name, checked·disabled state로 노출해야 한다(MUST). 활성화된 option은 controlled change를 요청해야 하며 checked state는 consumer가 전달한 현재 값만 반영해야 한다(MUST).

#### Scenario: 선택된 option을 렌더링한다

- **WHEN** consumer가 group name, option 목록과 현재 값을 전달한다
- **THEN** group은 accessible radio group으로 노출되고 현재 값과 같은 option만 checked state로 노출된다

#### Scenario: 활성 option을 선택한다

- **WHEN** 사용자가 enabled option을 활성화한다
- **THEN** primitive는 해당 option 값으로 change를 요청하고 consumer가 갱신한 현재 값을 checked state에 반영한다

#### Scenario: 비활성 option은 선택하지 않는다

- **WHEN** 사용자가 disabled option을 활성화하려 한다
- **THEN** option은 disabled state로 노출되고 change를 요청하지 않는다

### Requirement: Web roving keyboard navigation

**Authority / Provenance:** `docs/design/foundations.md`, `docs/design/accessibility.md`, PROD-753; Web radio group은 enabled option 사이에서 roving tabIndex를 사용하고 ArrowUp·ArrowLeft는 이전 option, ArrowDown·ArrowRight는 다음 option으로 순환 이동해야 한다(MUST). 방향키 이동은 disabled option을 건너뛰고 대상 option에 focus를 옮기며 controlled change를 요청해야 한다(MUST).

#### Scenario: Tab으로 현재 선택에 진입한다

- **WHEN** Web 사용자가 Tab으로 group에 진입한다
- **THEN** 현재 선택된 enabled option만 tab stop이 되고 나머지 option은 순차 tab order에서 제외된다

#### Scenario: 선택값이 disabled이거나 목록에 없다

- **WHEN** 현재 값에 해당하는 enabled option이 없고 enabled option이 하나 이상 있다
- **THEN** 첫 번째 enabled option만 tab stop이 되고 checked state는 consumer가 전달한 현재 값을 그대로 반영한다

#### Scenario: 모든 option이 disabled다

- **WHEN** group의 모든 option이 disabled다
- **THEN** 모든 option이 disabled state로 노출되고 tab stop과 방향키 change 대상은 없다

#### Scenario: 다음 option으로 순환 이동한다

- **WHEN** Web 사용자가 마지막 enabled option에서 ArrowDown 또는 ArrowRight를 누른다
- **THEN** 첫 번째 enabled option으로 focus가 이동하고 해당 값으로 change가 요청된다

#### Scenario: 이전 option으로 순환 이동한다

- **WHEN** Web 사용자가 첫 번째 enabled option에서 ArrowUp 또는 ArrowLeft를 누른다
- **THEN** 마지막 enabled option으로 focus가 이동하고 해당 값으로 change가 요청된다

#### Scenario: disabled option을 건너뛴다

- **WHEN** 방향키 이동 경로에 disabled option이 있다
- **THEN** focus와 change 요청은 다음 enabled option으로 이동한다

### Requirement: Option content and focus presentation

**Authority / Provenance:** `docs/design/foundations.md`, `docs/design/accessibility.md`, DSN-39, PROD-753, PROD-775; `RadioOption`은 20px indicator와 10px inner dot, 12px corner radius·content gap·outer inset, 공용 label·description typography를 canonical option presentation으로 제공해야 한다(MUST). Selected는 row 전체 fill 없이 indicator로 표현하고 hover·pressed·disabled·focus는 semantic state token으로 표현해야 한다(MUST). Web keyboard focus는 플랫폼의 `:focus-visible` 상태를 사용해 option 내부 2px focus border로 표시하고, border가 outer geometry를 바꾸지 않도록 inset에서 보정해야 한다(MUST). 이 내부 focus indicator가 browser outline을 대체하며 별도 input-modality helper를 요구해서는 안 된다(MUST). Primitive는 고정 높이를 강제하지 않고 긴 label과 description에 맞춰 늘어나야 한다(MUST).

#### Scenario: 설명과 긴 label을 표시한다

- **WHEN** consumer가 description 또는 여러 줄이 필요한 label을 제공한다
- **THEN** option은 canonical inset과 content gap, accessible name과 상태를 유지하면서 내용을 잘라내거나 고정 높이에 가두지 않고 표시한다

#### Scenario: 선택과 상호작용 상태를 표시한다

- **WHEN** option이 selected, hovered, pressed 또는 disabled 상태가 된다
- **THEN** primitive는 selected indicator와 해당 semantic state surface·border·foreground를 표시하되 selected row 전체에 별도 fill을 추가하지 않는다

#### Scenario: focus를 식별한다

- **WHEN** Web option이 keyboard focus를 받는다
- **THEN** primitive는 `:focus-visible`을 감지해 semantic focus token의 내부 2px border를 표시하고 inset을 보정해 option의 outer geometry를 유지한다

#### Scenario: Native option의 상태를 노출한다

- **WHEN** Native에서 option이 렌더링된다
- **THEN** option은 radio role과 checked·disabled state를 노출하고 Web key handler나 input-modality helper를 사용하지 않는다

### Requirement: Consumer lifecycle ownership

**Authority / Provenance:** `docs/design/foundations.md`, `docs/design/feedback.md`, PROD-753, PROD-775; FeedbackForm과 ProfileDefaultPostVisibilityControl은 공용 radio semantics·keyboard와 canonical `RadioOption` presentation을 사용해야 한다(MUST). `RadioOption`이 각 option의 indicator·content·state visual과 내부 spacing을 소유하고, 각 consumer는 group placement와 Feedback validation·dirty/submitting·mutation 또는 공개 범위 저장 mutation·Relay actor lifecycle을 계속 소유해야 한다(MUST).

#### Scenario: Feedback 종류를 변경한다

- **WHEN** 사용자가 FeedbackForm의 enabled 종류 option을 선택한다
- **THEN** 공용 radio 계약으로 종류가 변경되고 기존 dirty·validation·submitting·mutation 동작은 유지된다

#### Scenario: 기본 공개 범위를 선택하고 저장한다

- **WHEN** 소유자가 기본 게시 공개 범위 option을 선택한다
- **THEN** 공용 radio 계약으로 로컬 선택 값만 변경되고 기존 저장 action 전에는 mutation이 실행되지 않는다
