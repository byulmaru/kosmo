## ADDED Requirements

### Requirement: Profile Block action confirmation and state lifecycle

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `DSN-53`; 책임 이슈는 `PROD-823`. Profile surface의 Block action은 Mute와 구분되는 공용 ConfirmationContent를 사용하고 Danger tone의 확인 제목·`상대방은 내 게시물을 볼 수 없고, 타임라인과 검색에서 서로의 게시물이 숨겨져요. 팔로우 관계와 요청은 삭제돼요.`라는 결과 설명·확정 action을 제공해야 한다(MUST). 기본 Profile 정보와 viewer 방향 정책이 허용한 콘텐츠까지 숨긴다고 설명해서는 안 된다(MUST NOT). pending 동안 같은 action의 중복 입력과 dismiss를 차단하고 busy 상태를 전달해야 하며(MUST), 성공 상태는 서버 확정 결과를 사용하고 실패 시 기존 서버 상태와 제품의 공용 오류 피드백을 유지해야 한다(MUST).

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

### Requirement: Profile Block removal confirmation

**Authority / Provenance:** `docs/design/profile-mute-block.md`의 Profile action과 완료 피드백, `PROD-823`의 2026-09-06 차단 해제 확인 방식 결정과 2026-09-08 기존 UI 구현 범위. Profile 메뉴, identity-free `blocking` 상태와 차단 관리 목록에서 차단을 해제할 때는 확인창을 거쳐야 한다(MUST). 확인창은 `이 프로필의 차단을 해제할까요?`, `차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.`, `취소`와 Danger `차단 해제`를 제공해야 하며(MUST), 확정하기 전에는 해제 요청을 실행해서는 안 된다(MUST NOT). identity-free 상태의 확인창에서 Target identity를 표시해서는 안 된다(MUST NOT).

조회 가능한 Profile의 공통 `FollowButton`은 자신의 Block 관계 fragment·해제 mutation·pending·실패·Relay 갱신을 소유해야 한다(MUST). 내가 차단한 경우 플랫폼과 pointer 상태에 관계없이 고정 `차단 해제` label을 표시하고 Web click·Native tap으로 같은 확인창을 열어야 한다(MUST). 상대만 나를 차단한 경우 부모 surface는 관계 action을 숨겨야 하며(MUST), 양방향 Block에서는 내 해제 action을 유지하고 해제 후 서버 결과가 `blockedBy`만 남으면 action을 숨겨야 한다(MUST). 해제 시 이전 Follow 상태를 복구해서는 안 된다(MUST NOT).

#### Scenario: 해제 확인을 취소한다

- **WHEN** 사용자가 Profile 메뉴, `blocking` 상태 또는 차단 목록에서 해제 확인창을 열고 취소하거나 dismiss한다
- **THEN** 해제 요청은 실행되지 않고 기존 차단 상태와 목록을 유지한다

#### Scenario: 해제 확인 후 서버 결과를 기다린다

- **WHEN** 사용자가 확인창의 `차단 해제`를 확정한다
- **THEN** 해제를 요청하고 pending 동안 중복 입력과 dismiss를 차단하며 busy 상태를 전달한다
- **AND** 성공은 서버 확정 결과로 반영하고 실패하면 기존 상태와 공용 오류 피드백, 재시도 경로를 유지한다

#### Scenario: 공통 관계 action이 단방향과 양방향 Block을 표시한다

- **WHEN** 조회 가능한 Profile에 자신의 Block 관계가 있다
- **THEN** 공통 관계 action은 플랫폼과 pointer 상태에 관계없이 고정 `차단 해제` label을 표시한다
- **AND** 상대의 Block도 함께 있더라도 자신의 해제 action을 유지한다
- **AND** 자신의 관계 해제 뒤 서버 결과에 상대의 Block만 남으면 부모 surface는 관계 action을 숨긴다

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

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `DSN-53`; 책임 이슈는 `PROD-823`, `PROD-813`; 후속 UI 교체는 `PROD-917`의 범위다. selected Local Profile을 viewer로 사용하는 Block 관계의 direct Profile route는 기존 Profile 조회 정책에 따른 기본 Profile 정보를 표시해야 한다(MUST). `blocking` route는 기존 Post·Media 정책으로 허용된 Target 콘텐츠를 표시하기 전에 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공해야 한다(MUST). 경고는 현재 Profile handle과 selected actor lifecycle마다 다시 적용해야 하고(MUST), 사용자가 action을 실행하기 전에는 시간 경과만으로 콘텐츠를 표시해서는 안 된다(MUST NOT). `blockedBy` route는 기본 Profile 정보와 콘텐츠 차단 상태를 표시해야 한다(MUST). 양방향 Block은 양쪽 route에 콘텐츠 차단 상태를 적용해야 한다(MUST). `차단 해제` action은 selected Local Profile이 Owner인 `blocking` route에서만 기존 관계 관리 흐름을 유지해야 한다(MUST). Remote Profile이 selected된 상태에서는 Local-only Block 관계 상태를 조회하거나 실행할 수 없는 Block 관리 action을 제공해서는 안 된다(MUST NOT).

#### Scenario: 역방향 Block이 없을 때 blocking route에서 기본 Profile과 확인 후 콘텐츠를 표시한다

- **WHEN** selected Local Profile이 Owner이고 Target이 Owner를 차단하지 않은 상태에서 차단한 Target의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile 조회 정책에 따른 Target의 기본 Profile 정보를 표시한다
- **AND** frontend는 Target의 Post·Media를 표시하기 전에 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공한다
- **AND** 사용자가 action을 실행하기 전에는 시간 경과만으로 콘텐츠를 표시하지 않고, 실행한 뒤 기존 Post·Media 정책으로 허용된 Target 콘텐츠를 표시한다
- **AND** Profile handle 또는 selected actor lifecycle이 바뀌면 새 route lifecycle에 경고를 다시 적용한다
- **AND** `차단 해제` action은 기존 blocking route 관계 관리 흐름으로 제공한다

#### Scenario: Remote-selected route는 Local-only Block 상태를 요청하지 않는다

- **WHEN** Remote Profile이 selected된 상태에서 상대의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile identity와 일반 콘텐츠를 표시한다
- **AND** Local-only `profileBlockStatus`를 요청하지 않고 Block 관계 상태를 표시하지 않는다
- **AND** GraphQL selected Local actor가 필요한 Block 생성·해제·관리 action을 제공하지 않는다
- **AND** Remote Owner의 Block/Undo ingress와 관계 projection은 `PROD-818` 범위로 유지한다

#### Scenario: blockedBy route에서 기본 Profile과 콘텐츠 차단 상태를 표시한다

- **WHEN** selected Local Profile이 Target이고 차단한 Owner의 direct Profile route를 연다
- **THEN** 시스템은 기존 Profile 조회 정책에 따른 Owner의 기본 Profile 정보를 표시한다
- **AND** 시스템은 Owner의 Post·Media 콘텐츠에 차단 상태를 표시한다

#### Scenario: 양방향 Block route에 양쪽 콘텐츠 차단 상태를 적용한다

- **WHEN** 두 Profile 사이에 양방향 Profile Block이 있고 어느 Local Profile이 selected된 상태에서 상대의 direct Profile route를 연다
- **THEN** 시스템은 양쪽 route에 기본 Profile 정보와 콘텐츠 차단 상태를 표시한다

### Requirement: Profile Block actor and client-state isolation

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `DSN-51`, `DSN-53`; 책임 이슈는 `PROD-823`, `PROD-813`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Block UI는 selected Profile별 actor 상태 격리를 유지해야 하며(MUST), 기존 Profile 정보를 유지하면서 viewer 방향 콘텐츠 상태와 각 surface의 정책을 표시해야 한다(MUST). Block·Unblock 성공 결과는 현재 화면, Block 목록과 이미 표시 중인 표면의 상태를 서버 정책과 일치하도록 수렴시켜야 하며(MUST), selected Profile 또는 Session 전환 시 이전 Owner의 Block 상태를 새 actor에 재사용해서는 안 된다(MUST NOT).

Block·Unblock action은 차단 생성에는 Target Profile fragment를, 해제에는 실제 `ProfileBlock` 관계 fragment를 입력으로 받아야 하며(MUST), 소비자는 현재 viewer 관계에 따라 action 노출만 합성해야 한다(MUST). 서버 확정 mutation payload는 Target Profile의 `viewerState.profileBlock`과 로드된 관리 connection을 Relay 정규화로 갱신해야 하며(MUST), 이를 위해 actor Store 전체를 교체하거나 module-global 관계 cache를 유지해서는 안 된다(MUST NOT).

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

#### Scenario: 이전 actor의 늦은 응답은 현재 actor 화면을 바꾸지 않는다

- **WHEN** selected Profile A의 Block·Unblock 또는 목록 요청이 진행 중인 상태에서 B로 전환하고 A의 응답이 뒤늦게 도착한다
- **THEN** 시스템은 A의 응답을 B의 목록·Profile 상태·pending·오류·완료 피드백에 적용하지 않는다
- **AND** B의 현재 요청 결과만 B의 화면과 관리 action에 반영한다

#### Scenario: Unblock 뒤 제거된 관계를 UI가 복구하지 않는다

- **WHEN** Owner가 Block 목록에서 Target의 차단을 해제한다
- **THEN** 시스템은 최신 Block 상태에 맞게 목록과 Profile surface를 갱신한다
- **AND** 차단 생성 때 제거된 Follow 관계를 client optimistic 상태로 복구하지 않는다
- **AND** 기본 Profile 정보는 기존 Profile 조회 정책에 따라 계속 표시할 수 있고, Post·상호작용은 이후 새 요청에서 서버가 허용한 경우에만 다시 나타날 수 있다

### Requirement: Direct Profile access after reload and actor switch

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 조회 정책, `docs/design/profile-mute-block.md`의 차단 관계의 직접 Profile, `PROD-823`의 새로고침·직접 링크·selected Profile 전환 완료 조건, `DSN-51`, `DSN-53`. 직접 Profile route는 이전 Profile cache나 관리 목록 선행 로딩에 의존하지 않고 현재 Owner의 서버 차단 결과와 기존 Profile 조회 결과를 함께 소비해야 한다(MUST). Profile이 조회되면 `blocking`·`blockedBy` 모두 기존 기본 Profile 정보와 방향별 콘텐츠 상태를 유지해야 하며(MUST). Profile이 조회되지 않는 경우에만 identity-free `blocking` 또는 `blockedBy` fallback을 표시해야 한다(MUST). Target identity·handle·content·social action을 이전 cache나 route parameter에서 복구해서는 안 된다(MUST NOT). 두 상태는 기존 viewport별 Profile route chrome을 유지하고, Web 중앙 column에 별도 PageHeader를 추가해서는 안 된다(MUST NOT).

#### Scenario: cache 없는 직접 링크에서도 서버 결과에 따라 Profile과 차단 상태를 표시한다

- **WHEN** 자신의 Block이 있는 Target의 직접 링크를 새로 열거나 새로고침해 이전 Profile cache가 없다
- **THEN** 시스템은 현재 Owner의 서버 결과와 기존 Profile 조회 정책에 따라 조회 가능한 Target의 기본 Profile 정보, `blocking` 콘텐츠 경고와 `차단 해제`를 표시한다
- **AND** 해제 요청에는 서버가 제공한 자신의 Block 관계 ID를 사용한다
- **AND** Profile을 조회할 수 없는 경우에만 Target identity 없는 `blocking`과 `차단 해제`를 표시한다

#### Scenario: 상대에게만 차단된 직접 Profile은 기본 Profile과 콘텐츠 차단 상태를 유지한다

- **WHEN** 현재 Owner의 Block은 없고 상대의 Block 때문에 직접 Profile을 볼 수 없다
- **THEN** 시스템은 조회 가능한 상대 Profile의 기본 정보를 유지하면서 `이 프로필을 볼 수 없습니다` 콘텐츠 상태를 표시한다
- **AND** Profile을 조회할 수 없는 경우에만 기존 viewport별 Profile chrome의 actionless identity-free StateView를 표시한다
- **AND** 어느 경우에도 상대의 차단을 해제하는 action은 표시하지 않는다

#### Scenario: 양방향 Block에서 자신의 관계를 해제한 뒤에도 상대의 정책을 유지한다

- **WHEN** 양쪽 모두 Block이 있어 `blocking`을 표시한 상태에서 자신의 Block 해제가 성공한다
- **THEN** 시스템은 현재 Owner의 최신 서버 결과를 다시 확인한다
- **AND** 상대의 Block이 남아 있으면 조회 가능한 Profile의 기본 정보와 `blockedBy` 콘텐츠 상태를 유지하고, Profile을 조회할 수 없으면 identity-free `blockedBy`를 표시한다

#### Scenario: 같은 직접 링크에서 selected Profile을 전환한다

- **WHEN** 차단된 직접 Profile route를 유지한 채 selected Profile을 전환한다
- **THEN** 시스템은 새 Owner의 서버 결과를 받아 해당 Owner의 `blocking`·`blockedBy` 또는 허용된 Profile 상태를 표시한다
- **AND** 이전 Owner의 Block 관계 ID를 새 Owner의 해제 action에 사용하지 않는다

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
