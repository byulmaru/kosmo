## ADDED Requirements

### Requirement: 원인 행동자의 canonical Profile Tag로 생성 억제

**Source Context:** PROD-1048, `docs/domain/objects/hashtag-mute-rule.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`. 시스템은 새 Notification 생성 판단 시점에 저장된 Related Profile의 구조화된 Profile Tag와 Recipient가 Owner인 적용 중인 Notification Scope Rule의 Target Hashtag를 canonical identity로 비교해야 한다(SHALL). 하나라도 일치하면 Decision이 Exclude·Collapse 중 무엇이든 새 알림을 생성하지 않아야 한다(SHALL).

#### Scenario: 여러 태그 중 하나가 일치

- **WHEN** Related Profile의 여러 Profile Tag 중 하나가 Recipient의 적용 중인 Notification Scope Rule과 일치한다
- **THEN** Exclude·Collapse 각각의 Rule에서 새 Notification이 생성되지 않는다

#### Scenario: 게시물 Hashtag가 없는 원인

- **WHEN** 원인 행동자의 Profile Tag는 Rule과 일치하고 게시물 Hashtag는 없거나 일치하지 않는다
- **THEN** Profile Tag 일치만으로 새 Notification 생성을 억제한다

#### Scenario: 표시 문자열과 bio는 판정 근거가 아님

- **WHEN** bio·본문에만 뮤트한 이름이 있고 구조화된 Profile Tag는 일치하지 않는다
- **THEN** 이 Profile Tag 정책은 억제 사유가 되지 않는다
- **AND** 대소문자·정규화 전 표기가 달라도 같은 canonical identity에 연결된 Profile Tag는 같은 태그로 판정한다

#### Scenario: 저장된 Local·Remote 행동자 관계

- **WHEN** 기존 생성 경로가 허용한 Local 또는 Remote Related Profile에 일치하는 저장된 Profile Tag가 있다
- **THEN** 저장된 관계를 기준으로 억제한다
- **AND** 이 판정을 위해 원격 태그 수집·동기화나 새로운 Remote 생성 경로를 만들지 않는다

### Requirement: Scope·활성 여부·Recipient 격리

**Source Context:** PROD-1048, PROD-1029, `docs/domain/objects/hashtag-mute-rule.md`. 시스템은 Recipient Profile이 Owner인 적용 중인 Rule 중 Notification Scope를 선택한 Rule만 소비해야 한다(SHALL). 만료·해제·불일치·다른 Owner의 Rule은 이 정책의 억제 사유가 되어서는 안 된다(MUST NOT).

#### Scenario: 적용 대상이 아닌 Rule

- **WHEN** Rule이 Notification Scope 미선택, 만료, 해제, Target 불일치 중 하나에 해당하고 다른 억제 사유가 없다
- **THEN** 기존 생성 조건을 통과하는 새 Notification이 생성된다

#### Scenario: 동일 Account의 다른 Profile

- **WHEN** 같은 Account의 Recipient A1에만 일치하는 Rule이 있고 A2에는 없으며 두 Profile의 생성 조건이 충족된다
- **THEN** A1의 새 알림만 억제하고 A2의 새 알림은 생성한다

#### Scenario: 만료 판정 인수

- **WHEN** 선행 PROD-1029의 적용 중인 Rule 판정에서 같은 DB 시각 기준으로 영구·미래·경계·과거 Rule을 평가한다
- **THEN** 이 생성 경로도 같은 적용 여부를 소비하며 별도 만료 의미를 만들지 않는다

### Requirement: 실제 생성 경로와 기존 정책 유지

**Source Context:** PROD-1048, `docs/domain/objects/notification.md`의 Type별 생성 관계·조회 정책. 시스템은 제공 중인 Profile 대상 알림의 Related Profile에 이 정책을 적용해야 한다(SHALL). 적용 대상 유형은 Follow·Follow Request·Reaction·Reply·Repost·Quote·Mention·Followee Post이며, 기반이 없는 유형을 이 이슈에서 새로 구현해서는 안 된다(MUST NOT). 기존 생성 권한·조회 자격·Profile Mute·Block·중복 정책을 유지해야 한다(SHALL).

#### Scenario: 구현된 여섯 유형

- **WHEN** Follow·Follow Request·Reaction·Reply·Repost·Quote 각각의 실제 생성 경로에서 원인 행동자 태그가 일치한다
- **THEN** 해당 Recipient의 새 Notification이 생성되지 않는다
- **AND** 같은 경로의 태그 불일치 대조군은 다른 생성 조건을 통과하면 생성된다

#### Scenario: 기존 억제 정책도 함께 적용

- **WHEN** Profile Tag가 불일치해도 기존 Profile Mute·양방향 Block 또는 생성 자격 제한이 적용된다
- **THEN** 기존 정책에 따른 생성 억제 결과를 유지한다

#### Scenario: 독립적인 게시물 태그 사유

- **WHEN** Profile Tag 기준 또는 별도 PROD-1031의 게시물 Hashtag 기준 중 어느 하나가 일치한다
- **THEN** 새 Notification은 억제된다
- **AND** PROD-1031이 아직 미구현이어도 Profile Tag 기준 억제는 독립적으로 제공한다

#### Scenario: Operational과 미구현 기반

- **WHEN** Operational 알림이거나 해당 Profile 대상 유형의 생성 기반이 아직 없다
- **THEN** Operational에 Profile Tag 정책을 적용하거나 이 이슈에서 누락된 생성 기반을 새로 만들지 않는다

### Requirement: 판정 시점과 기존 알림 보존

**Source Context:** PROD-1048, `docs/domain/objects/notification.md`의 기존 Notification·Read State 보존 정책. 시스템은 생성 판단 때 저장된 태그·Rule을 소비해야 한다(SHALL). 이후 태그·Rule 변경만으로 기존 Notification을 다시 판정하거나 그 존재·Read State를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 생성 전에 태그 변경

- **WHEN** 원인 행동 후 실제 생성 판단 전에 저장된 Profile Tag가 일치 상태로 바뀌거나 일치 관계가 제거된다
- **THEN** 생성 판단 시점에 저장된 관계를 기준으로 새 알림의 억제 여부를 정한다

#### Scenario: 기존 알림 이후 규칙·태그 변경

- **WHEN** Read·Unread 알림이 저장된 뒤 태그 또는 Rule을 생성·변경·해제·만료시킨다
- **THEN** 그 변경만으로 기존 알림의 ID·존재·Read State·최초 읽음 시각이 바뀌지 않는다
- **AND** 이후 새로운 원인 행동은 당시 저장된 태그·Rule로 판단한다

### Requirement: Quote Author와 최초 판단 보존

**Source Context:** PROD-1048, `docs/domain/objects/notification.md`의 Quote 정책, `docs/domain/decisions/0028-quote-notification-policy.md`. 시스템은 Quote Author의 Profile Tag를 검사해야 하며(SHALL), Source Author의 태그로 대신 판정해서는 안 된다(MUST NOT). 최초 판단에서 억제된 같은 Quote를 해제·만료·태그 변경·재처리로 소급 생성해서는 안 된다(MUST NOT). 기존 중복·선생성 알림·승인 및 rollout 경계를 유지해야 한다(SHALL).

#### Scenario: Quote Author만 일치

- **WHEN** Quote Author의 태그만 일치하고 Source Author와 게시물 Hashtag는 일치하지 않는다
- **THEN** Quote Notification이 생성되지 않고 최초 억제 판단이 유지된다

#### Scenario: Source Author만 일치

- **WHEN** Source Author의 태그만 Rule과 일치하고 Quote Author의 태그는 불일치하며 다른 생성 조건이 충족된다
- **THEN** Source Author 태그를 이유로 Quote Notification을 억제하지 않는다

#### Scenario: 최초 억제 후 재처리

- **WHEN** Profile Tag 기준으로 최초 억제된 Quote를 Rule 해제·만료 또는 태그 제거 후 재처리한다
- **THEN** 같은 Quote의 새 알림을 만들지 않는다

#### Scenario: Reply를 겸한 Quote와 기존 대표 알림

- **WHEN** 같은 원인·Recipient의 Reply·Quote가 함께 후보이거나 기존 Reply·Mention이 이미 대표 알림으로 존재한다
- **THEN** 각 생성 후보의 정책을 적용하고 기존 우선순위·선생성 보존 정책을 유지한다
- **AND** 기존 Notification과 Read State를 교체하지 않으며, 기반 없는 Mention 생성기를 이 검증을 위해 추가하지 않는다

#### Scenario: rollout과 승인 경계

- **WHEN** 기존 Quote rollout이 비활성 또는 도입 전이거나 기존 승인 경로가 생성 자격을 주지 않는다
- **THEN** Profile Tag 검사 추가가 기존 생성·최초 판단 경계를 우회하지 않는다
