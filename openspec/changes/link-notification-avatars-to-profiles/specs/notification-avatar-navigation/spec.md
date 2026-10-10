## ADDED Requirements

### Requirement: 반응·재게시 사진의 프로필 이동

Reaction/Repost의 표시된 프로필 사진은 해당 행위자의 Profile로 한 번 이동해야 한다(SHALL).
사진을 활성화할 때 대상 게시글 이동을 함께 실행해서는 안 된다(MUST NOT).

**Source Context:** PROD-1078 범위와 완료 기준; `docs/domain/objects/notification.md`의 Reaction/Repost 목록 이동.

#### Scenario: 사진과 게시글 작성자가 다른 반응 알림

- **WHEN** 행위자 A가 작성자 B의 게시글에 반응한 알림에서 A의 사진을 활성화한다
- **THEN** A의 프로필로 한 번 이동한다
- **AND** B의 프로필이나 대상 게시글로 추가 이동하지 않는다

#### Scenario: 재게시 행위자 사진과 게시글 영역

- **WHEN** 행위자 A가 작성자 B의 게시글을 재게시한 알림에서 A의 사진을 활성화한다
- **THEN** A의 프로필로 한 번 이동한다
- **WHEN** 사진 외의 기존 게시글 영역을 활성화한다
- **THEN** 기존 대상 게시글로 한 번 이동한다

#### Scenario: 복수 사진과 기본 사진

- **WHEN** 서로 다른 행위자의 사진이 최대 3개 표시되거나 사진 URL이 없어 기본 사진이 표시된다
- **THEN** 활성화한 사진에 해당하는 Profile로 이동한다
- **AND** 다른 사진의 Profile이나 게시글 이동을 함께 실행하지 않는다

### Requirement: 이동을 막지 않는 읽음 처리

사진 또는 게시글 영역을 활성화하면 해당 Notification의 Best Effort Read를 한 번 시작해야 한다(SHALL).
읽음 요청의 지연·실패는 이동을 막아서는 안 된다(MUST NOT).

**Source Context:** PROD-1078 읽음 처리 완료 기준; `docs/domain/objects/notification.md`와 `docs/design/notifications.md`.

#### Scenario: 읽음 요청 지연

- **WHEN** Reaction/Repost 사진이나 게시글을 활성화하고 읽음 요청 응답이 지연된다
- **THEN** 응답을 기다리지 않고 선택한 목적지로 한 번 이동한다
- **AND** 그 활성화에서 읽음 요청은 해당 알림 ID로 한 번 시작한다

#### Scenario: 읽음 요청 실패

- **WHEN** 사진이나 게시글 활성화로 시작한 읽음 요청이 실패한다
- **THEN** 선택한 목적지의 이동은 유지된다
- **AND** 읽음 성공을 임의로 표시하거나 부모 영역의 추가 읽음 요청을 시작하지 않는다

### Requirement: 사진별 독립 입력과 접근성

Reaction/Repost 사진은 28px·최대 3개 표시를 유지하고 겹침을 제거해야 한다(SHALL).
각 사진은 식별 가능한 링크 이름과 서로 겹치지 않는 플랫폼별 입력 영역을 제공해야 한다(SHALL).

**Source Context:** 2026-10-10 사용자 선택; PROD-1078 추가 디자인 결정; `docs/design/notifications.md`, `docs/design/accessibility.md`.

#### Scenario: 사진별 focus와 입력 영역

- **WHEN** Web keyboard 또는 Native 보조 기술로 여러 사진을 탐색하고 활성화한다
- **THEN** 각 Profile을 구분하고 선택한 프로필만 열 수 있다
- **AND** Web 최소 24×24 CSS px, iOS 44×44pt, Android 48×48dp의 기존 입력 기준을 충족한다

### Requirement: 기존 알림 표시와 차단 유지

다른 알림 유형의 이동·읽음, 기존 Read/Unread·hover와 CW·sensitive 처리를 유지해야 한다(SHALL).
기존 pending/disabled에서는 사진과 게시글 이동을 모두 차단해야 한다(SHALL).

**Source Context:** PROD-1078의 기존 동작 보존; `docs/design/notifications.md`의 pending/disabled·미리보기 계약.

#### Scenario: pending 또는 disabled

- **WHEN** Reaction/Repost가 기존 pending 또는 disabled 상태다
- **THEN** 사진과 게시글 활성화 모두 이동이나 읽음 요청을 시작하지 않는다

#### Scenario: 다른 알림 유형과 보호된 미리보기

- **WHEN** Follow/FollowRequest·Reply/Mention/Quote·Operational 알림을 활성화하거나 보호된 미리보기를 표시한다
- **THEN** 각 유형의 기존 목적지·독립 action·읽음 처리와 CW·sensitive 표시가 유지된다
