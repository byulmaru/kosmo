## ADDED Requirements

### Requirement: Web pointer hover는 전체 action target을 표시한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595 — Universal client는 비터치 Web pointer가 활성 Post Action control에 hover하는 동안 전체 interactive target에 현재 theme의 semantic `surface` background를 표시해야 한다(MUST). Reply, Repost, Reaction과 Bookmark는
기존 50×28 target을 pill로 사용하고 More는 기존 28×28 target을 원형으로 사용해야 한다(MUST).

#### Scenario: Social action target에 hover한다

- **WHEN** 비터치 Web pointer가 활성 Reply, Repost, Reaction 또는 Bookmark control에 hover하면
- **THEN** 전체 50×28 target은 현재 theme의 `surface` background를 pill로 표시한다

#### Scenario: More target에 hover한다

- **WHEN** 비터치 Web pointer가 활성 More control에 hover하면
- **THEN** 전체 28×28 target은 현재 theme의 `surface` background를 원형으로 표시한다

#### Scenario: 현재 theme의 surface를 사용한다

- **WHEN** light 또는 dark theme에서 활성 action에 hover하면
- **THEN** hover background는 고정 색상 대신 해당 theme의 semantic `surface` 값을 사용한다

### Requirement: Hover는 기존 action 상태와 geometry를 보존한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595 — Universal client는 hover를 표시하는 동안 기존 default, active, pressed와 selected icon, count, fill과 opacity 의미를 보존해야 한다(MUST). Pending, disabled와 resolution-required control은 hover background를 표시하지
않아야 한다(MUST NOT). Hover는 target 크기, Action Bar 높이, 간격이나 target 비중첩을 변경하지 않아야
한다(MUST NOT).

#### Scenario: Active action에 hover한다

- **WHEN** 비터치 Web pointer가 활성 active 또는 selected action에 hover하면
- **THEN** action은 `surface` background만 추가하고 기존 active icon, count 또는 fill 표현을 유지한다

#### Scenario: Hover 중인 action을 누른다

- **WHEN** hover 중인 활성 action이 pressed 상태로 전환되면
- **THEN** hover target geometry를 변경하지 않고 기존 pressed opacity를 계속 표시한다

#### Scenario: Blocked action에 pointer가 이동한다

- **WHEN** pointer가 pending, disabled 또는 resolution-required action target에 도달하면
- **THEN** action은 기존 blocked 표현을 유지하고 hover background를 표시하지 않는다

#### Scenario: Hover는 layout을 변경하지 않는다

- **WHEN** 활성 Post Action control이 hover에 진입하거나 빠져나오면
- **THEN** control 크기, 28px Action Bar 높이, 간격과 인접 target 비중첩은 변경되지 않는다

### Requirement: Hover 표현은 Web 비터치 pointer로 제한한다

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-595 — Universal client는 hover background를 touch 없이 hover할 수 있는 Web 입력으로 제한해야 한다(MUST). Web
touch 입력과 Native platform은 hover 전용 background를 노출하지 않아야 한다(MUST NOT).

#### Scenario: Web touch 입력이 action에 도달한다

- **WHEN** Web touch pointer가 Post Action control과 상호작용하면
- **THEN** hover 전용 background를 표시하지 않는다

#### Scenario: Native action을 렌더링하거나 누른다

- **WHEN** Android 또는 iOS에서 Post Action control을 사용하면
- **THEN** hover 전용 background를 렌더링하지 않고 기존 Native action 표현을 유지한다
