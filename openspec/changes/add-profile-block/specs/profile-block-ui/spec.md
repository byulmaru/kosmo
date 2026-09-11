## ADDED Requirements

### Requirement: Profile Block action confirmation and state lifecycle

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `DSN-53`; 책임 이슈는 `PROD-823`. Profile surface의 Block action은 Mute와 구분되는 공용 ConfirmationContent를 사용하고 Danger tone의 확인 제목·결과 설명·확정 action을 제공해야 한다(MUST). pending 동안 같은 action의 중복 입력과 dismiss를 차단하고 busy 상태를 전달해야 하며(MUST), 성공 상태는 서버 확정 결과를 사용하고 실패 시 기존 서버 상태와 제품의 공용 오류 피드백을 유지해야 한다(MUST).

#### Scenario: Block 확인을 취소하면 상태를 바꾸지 않는다

- **WHEN** 사용자가 Profile surface에서 Block action을 실행하고 공용 확인 UI에서 `취소` 또는 dismiss를 선택한다
- **THEN** 시스템은 Block mutation을 실행하지 않는다
- **AND** Profile, 관계 상태, 목록과 Toast는 기존 상태를 유지한다

#### Scenario: Block pending 중 중복 입력과 dismiss를 차단한다

- **WHEN** 사용자가 Block을 확정해 mutation이 pending 상태다
- **THEN** 시스템은 같은 Block action의 추가 입력과 확인 UI dismiss를 차단한다
- **AND** 보조 기술에 busy 또는 진행 중 상태를 전달한다

#### Scenario: Block 성공·실패 피드백을 서버 상태에 맞춘다

- **WHEN** Block mutation이 성공하거나 실패한다
- **THEN** 성공 시 시스템은 차단된 Profile의 서버 확정 상태와 관리 action을 표시한다
- **AND** 실패 시 시스템은 Profile의 기존 서버 확정 상태를 유지하고 확인창을 닫은 뒤 원래 trigger focus를 복원하고 공용 오류 Toast를 표시한다
- **AND** 같은 action을 다시 열어 재시도할 수 있다

### Requirement: Separate Profile Block management destination

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `DSN-53`; 책임 이슈는 `PROD-823`. Settings root는 `뮤트 및 차단` 진입점에서 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 이 순서에 제공해야 하며(MUST), Block destination은 자기 heading, loading, error·retry, empty, pagination과 해제 action을 소유해야 한다(MUST). Block과 Mute를 하나의 혼합 목록이나 이 흐름만을 위한 새 Settings shell로 합쳐서는 안 된다(MUST NOT).

#### Scenario: 차단한 프로필 목록의 독립 상태를 표시한다

- **WHEN** 사용자가 Settings의 `차단한 프로필` destination을 연다
- **THEN** 시스템은 차단 관계의 Target 목록과 destination heading을 표시한다
- **AND** 최초 loading, 오류·retry, empty와 pagination 상태를 해당 목록 안에서 표시한다
- **AND** `뮤트한 프로필`의 목록 상태나 action을 같은 목록 상태로 재사용하지 않는다

#### Scenario: Block 목록에서 Target을 해제한다

- **WHEN** Owner가 `차단한 프로필` 목록의 한 Target에 대해 `차단 해제` action을 선택한다
- **THEN** 시스템은 canonical 공용 확인창에 차단 해제 제목·설명과 `취소`·Danger `차단 해제` action을 표시한다
- **AND** 확인창에서 해제를 확정하기 전에는 해제 mutation을 실행하지 않는다
- **WHEN** Owner가 확인창의 `차단 해제`를 확정한다
- **THEN** 시스템은 해당 Profile Block 해제 mutation을 실행한다
- **AND** 성공한 Target은 현재 Block 목록에서 제거되고 다른 목록 항목의 상태는 바꾸지 않는다

#### Scenario: 차단 해제 확인을 취소하거나 요청에 실패한다

- **WHEN** Owner가 차단 해제 확인을 취소하거나 dismiss한다
- **THEN** 시스템은 차단 상태와 목록을 유지하고 trigger로 focus를 복원한다
- **AND** 해제 mutation과 성공 feedback을 실행하지 않는다
- **WHEN** 확정한 차단 해제 요청이 pending이거나 실패한다
- **THEN** pending에는 중복 입력과 dismiss를 차단하고 busy를 전달한다
- **AND** 실패하면 기존 차단 상태와 목록을 유지하고 확인창을 닫은 뒤 원래 trigger focus를 복원하고 공용 오류 Toast를 표시한다
- **AND** 같은 해제 action을 다시 열어 재시도할 수 있다

#### Scenario: 관리 목록 조회 실패와 성공 제거 후 focus

- **WHEN** 최초 또는 추가 목록 조회가 실패한다
- **THEN** 시스템은 공용 danger Toast와 `다시 시도` action을 제공한다
- **AND** Toast가 사라져도 본문에 최초 `다시 시도` 또는 추가 `더 불러오기`를 유지한다
- **WHEN** 차단 해제 성공 feedback으로 목록 행을 제거한다
- **THEN** 목록 제목으로 focus를 이동한다

### Requirement: Profile Block direct route presents basic Profile and content state

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `DSN-53`; 책임 이슈는 `PROD-823`, `PROD-813`; 후속 UI 교체는 `PROD-917`의 범위다. Block 관계의 direct Profile route는 기존 Profile 조회 정책에 따른 기본 Profile 정보를 표시해야 한다(MUST). `blocking` route는 기존 Post·Media 정책으로 허용된 Target 콘텐츠를 표시하기 전에 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공해야 한다(MUST). 경고는 현재 Profile handle과 selected actor lifecycle마다 다시 적용해야 하고(MUST), 사용자가 action을 실행하기 전에는 시간 경과만으로 콘텐츠를 표시해서는 안 된다(MUST NOT). `blockedBy` route는 기본 Profile 정보와 콘텐츠 차단 상태를 표시해야 한다(MUST). 양방향 Block은 양쪽 route에 콘텐츠 차단 상태를 적용해야 한다(MUST). `차단 해제` action은 selected Local Profile이 Owner인 `blocking` route에서만 기존 관계 관리 흐름을 유지해야 하며(MUST), Remote Profile이 selected된 상태에서는 실행할 수 없는 Block 관리 action을 제공해서는 안 된다(MUST NOT).

#### Scenario: 역방향 Block이 없을 때 blocking route에서 기본 Profile과 확인 후 콘텐츠를 표시한다

- **WHEN** selected Local Profile이 Owner이고 Target이 Owner를 차단하지 않은 상태에서 차단한 Target의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile 조회 정책에 따른 Target의 기본 Profile 정보를 표시한다
- **AND** frontend는 Target의 Post·Media를 표시하기 전에 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공한다
- **AND** 사용자가 action을 실행하기 전에는 시간 경과만으로 콘텐츠를 표시하지 않고, 실행한 뒤 기존 Post·Media 정책으로 허용된 Target 콘텐츠를 표시한다
- **AND** Profile handle 또는 selected actor lifecycle이 바뀌면 새 route lifecycle에 경고를 다시 적용한다
- **AND** `차단 해제` action은 기존 blocking route 관계 관리 흐름으로 제공한다

#### Scenario: Remote-selected route에는 실행할 수 없는 Block 관리 action을 제공하지 않는다

- **WHEN** Remote Profile이 selected된 상태에서 Block 관계인 상대의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile identity와 viewer 방향 콘텐츠 상태를 표시한다
- **AND** GraphQL selected Local actor가 필요한 Block 생성·해제·관리 action을 제공하지 않는다
- **AND** Remote Owner의 Block/Undo ingress는 `PROD-818` 범위로 유지한다

#### Scenario: blockedBy route에서 기본 Profile과 콘텐츠 차단 상태를 표시한다

- **WHEN** selected Profile이 Target이고 차단한 Owner의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile 조회 정책에 따른 Owner의 기본 Profile 정보를 표시한다
- **AND** 시스템은 Owner의 Post·Media 콘텐츠에 차단 상태를 표시한다

#### Scenario: 양방향 Block route에 양쪽 콘텐츠 차단 상태를 적용한다

- **WHEN** 두 Profile 사이에 양방향 Profile Block이 있고 어느 한쪽이 상대의 direct Profile route를 연다
- **THEN** 시스템은 양쪽 route에 기본 Profile 정보와 콘텐츠 차단 상태를 표시한다

### Requirement: Profile Block actor and client-state isolation

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `DSN-51`, `DSN-53`; 책임 이슈는 `PROD-823`, `PROD-813`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Block UI는 selected Profile별 actor 상태 격리를 유지해야 하며(MUST), 기존 Profile 정보를 유지하면서 viewer 방향 콘텐츠 상태와 각 surface의 정책을 표시해야 한다(MUST). Block·Unblock 성공 결과는 현재 화면, Block 목록과 이미 표시 중인 표면의 상태를 서버 정책과 일치하도록 수렴시켜야 하며(MUST), selected Profile 또는 Session 전환 시 이전 Owner의 Block 상태를 새 actor에 재사용해서는 안 된다(MUST NOT).

#### Scenario: Block 성공 뒤 표시 중인 결과가 정책에 수렴한다

- **WHEN** selected Profile이 Target을 차단하는 mutation이 성공한다
- **THEN** 시스템은 현재 Profile 화면과 Block 목록을 서버 확정 Block 상태로 갱신한다
- **AND** 현재 Profile 화면은 기본 Profile 정보와 viewer 방향에 따른 콘텐츠 상태를 서버 정책에 맞춰 표시한다
- **AND** 이미 표시 중인 Home·Local·Hashtag timeline·Profile Post List와 Notification은 각 surface의 서버 Profile Block 정책에 맞춰 숨기거나 갱신한다
- **AND** mutation 실패 시 이전 cache를 차단된 것으로 확정하지 않는다

#### Scenario: 새로고침과 직접 링크 진입에서도 차단 화면과 해제를 제공한다

- **WHEN** selected Local Owner가 이미 차단한 Target의 Profile route에 이전 client cache 없이 직접 진입하거나 새로고침한다
- **THEN** 시스템은 기존 Target Profile 정보와 API의 현재 Owner 차단 결과, 해당 Profile Block ID의 `차단 해제` action을 제공한다
- **AND** 차단 목록을 먼저 열어 본 상태를 요구하지 않는다
- **AND** 콘텐츠는 viewer 방향 Profile Block 정책에 따라 표시한다

#### Scenario: 상대에게만 차단된 직접 route는 해제 action을 제공하지 않는다

- **WHEN** 현재 selected Profile은 Target을 차단하지 않았지만 Target의 Block 때문에 콘텐츠 조회가 제한된다
- **THEN** 시스템은 기존 Target Profile 정보와 콘텐츠 차단 상태를 표시한다
- **AND** 다른 Owner의 Block을 해제할 action을 표시하지 않는다

#### Scenario: selected Profile을 전환해도 Block 상태를 섞지 않는다

- **WHEN** selected Profile A의 Block 목록을 본 뒤 selected Profile B로 전환한다
- **THEN** 시스템은 A의 Block 상태와 client 상태를 B의 결과로 재사용하지 않는다
- **AND** B의 Block 목록은 B가 Owner인 관계만 표시한다
- **AND** 같은 Target의 직접 route도 B의 현재 서버 결과로 다시 판정하며 A의 차단 상태·해제 ID를 사용하지 않는다

#### Scenario: Unblock 뒤 제거된 관계를 UI가 복구하지 않는다

- **WHEN** Owner가 Block 목록에서 Target의 차단을 해제한다
- **THEN** 시스템은 최신 Block 상태에 맞게 목록과 Profile surface를 갱신한다
- **AND** 차단 생성 때 제거된 Follow 관계를 client optimistic 상태로 복구하지 않는다
- **AND** 기본 Profile 정보는 기존 Profile 조회 정책에 따라 계속 표시할 수 있고, Post·상호작용은 이후 새 요청에서 서버가 허용한 경우에만 다시 나타날 수 있다

### Requirement: Profile Block interaction accessibility

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/accessibility.md`, `DSN-53`; 책임 이슈는 `PROD-823`. Block confirmation과 management list는 실제 동작에 맞는 role·accessible name·current·disabled·busy 상태와 안전한 초기 focus, modal 의미, Web `Escape`·Native back 및 focus 복원을 제공해야 한다(MUST). 공용 Button, ActionMenu, ModalSheet, Toast와 SettingsItem을 재사용해야 하며(MUST), 이 흐름만을 위한 새 Toast·범용 safety component·별도 UI package를 추가해서는 안 된다(MUST NOT).

#### Scenario: 확인 UI와 해제 action이 접근 가능한 이름과 상태를 제공한다

- **WHEN** keyboard 또는 보조 기술 사용자가 Block confirmation을 열거나 Block 목록의 해제 action으로 이동한다
- **THEN** 시스템은 확인 제목·설명·`취소`·확정 action과 각 action의 정확한 accessible name을 제공한다
- **AND** pending action은 disabled·busy 상태로 전달되고 확인 UI가 닫힌 뒤 유효한 이전 focus를 복원한다

#### Scenario: 지원 viewport와 긴 identity에서 layout을 유지한다

- **WHEN** Block confirmation과 목록을 Web 1024·1440, Mobile 390의 Light/Dark 상태에서 긴 handle·표시 이름과 함께 렌더링한다
- **THEN** 기존 Settings/Profile presentation의 reflow와 focus 순서를 유지한다
- **AND** Web 시각 target과 Native 입력 target이 canonical 접근성 계약을 만족하면서 인접 action과 겹치지 않는다
