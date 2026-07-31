## ADDED Requirements

### Requirement: Web pointer hover는 glyph 중심 원형 affordance를 표시한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595. The Universal client MUST render the
approved glyph-centered hover affordance. Universal client는 비터치 Web pointer가
활성 Post Action control에 hover하는 동안 16×16 glyph를 중심으로 28×28 원형 background를 표시해야
한다(MUST). Reply, Repost, Bookmark와 More는 현재 theme의 semantic `surface`를 사용하고 Reaction은
semantic `like`를 사용해야 한다(MUST).

#### Scenario: Social action target에 hover한다

- **WHEN** 비터치 Web pointer가 활성 Reply, Repost 또는 Bookmark control에 hover하면
- **THEN** 50×28 click target은 유지되고 glyph 중심의 28×28 `surface` 원형 background만 표시된다

#### Scenario: Reaction target에 hover한다

- **WHEN** 비터치 Web pointer가 활성 Reaction control에 hover하면
- **THEN** 50×28 click target은 유지되고 glyph 중심의 28×28 `like` 원형 background가 표시된다

#### Scenario: More target에 hover한다

- **WHEN** 비터치 Web pointer가 활성 More control에 hover하면
- **THEN** 기존 28×28 target과 일치하는 glyph 중심의 `surface` 원형 background가 표시된다

#### Scenario: 현재 theme의 surface를 사용한다

- **WHEN** light 또는 dark theme에서 활성 action에 hover하면
- **THEN** hover background는 고정 색상 대신 해당 theme의 semantic `surface` 또는 `like` 값을 사용한다

### Requirement: Selected Reaction은 옅은 분홍 상태를 표시한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595. The Universal client MUST render the
approved selected Reaction tint. Universal client는 Reaction이 selected
상태이면 hover 여부와 관계없이 heart의 stroke와 fill에 현재 theme의 semantic `like`를 사용해야 한다(MUST).
다른 action의 active 색은 기존 표현을 유지해야 한다(MUST).

#### Scenario: Reaction이 selected 상태다

- **WHEN** 현재 Profile이 Post에 하나 이상의 Reaction을 남겼으면
- **THEN** Action Bar의 heart stroke와 fill은 현재 theme의 `like` 값을 사용한다

#### Scenario: Selected Reaction에서 pointer가 벗어난다

- **WHEN** selected Reaction control의 hover가 끝나면
- **THEN** 원형 background는 사라지지만 heart의 `like` stroke와 fill은 유지된다

### Requirement: Hover는 기존 action 상태와 geometry를 보존한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595. The Universal client MUST preserve the
approved action state and geometry. Universal client는 hover를 표시하는 동안
기존 default, pressed, blocked 상태와 Reaction 외 action의 active·selected icon, count, fill과 opacity 의미를
보존해야 한다(MUST). Pending, disabled와 resolution-required control은 hover background를 표시하지 않아야
한다(MUST NOT). Hover는 target 크기, Action Bar 높이, icon-count 간격이나 target 비중첩을 변경하지 않아야
한다(MUST NOT).

#### Scenario: Active action에 hover한다

- **WHEN** 비터치 Web pointer가 활성 active 또는 selected action에 hover하면
- **THEN** action은 glyph 중심 원형 background만 추가하고 승인된 active icon, count 또는 fill 표현을 유지한다

#### Scenario: Hover 중인 action을 누른다

- **WHEN** hover 중인 활성 action이 pressed 상태로 전환되면
- **THEN** 원형 background와 click target geometry를 변경하지 않고 기존 pressed opacity를 계속 표시한다

#### Scenario: Blocked action에 pointer가 이동한다

- **WHEN** pointer가 pending, disabled 또는 resolution-required action target에 도달하면
- **THEN** action은 기존 blocked 표현을 유지하고 hover background를 표시하지 않는다

#### Scenario: Hover는 layout을 변경하지 않는다

- **WHEN** 활성 Post Action control이 hover에 진입하거나 빠져나오면
- **THEN** control 크기, 28px Action Bar 높이, icon-count 간격과 인접 target 비중첩은 변경되지 않는다

### Requirement: Hover 표현은 Web 비터치 pointer로 제한한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595 — Universal client는 hover background를 touch 없이 hover할 수 있는 Web 입력으로 제한해야 한다(MUST). Web
touch 입력과 Native platform은 hover 전용 background를 노출하지 않아야 한다(MUST NOT).

#### Scenario: Web touch 입력이 action에 도달한다

- **WHEN** Web touch pointer가 Post Action control과 상호작용하면
- **THEN** hover 전용 background를 표시하지 않는다

#### Scenario: Native action을 렌더링하거나 누른다

- **WHEN** Android 또는 iOS에서 Post Action control을 사용하면
- **THEN** hover 전용 background를 렌더링하지 않고 기존 Native action 표현을 유지한다
