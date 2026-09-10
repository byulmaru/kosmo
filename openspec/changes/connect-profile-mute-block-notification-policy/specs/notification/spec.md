## ADDED Requirements

### Requirement: Profile Notification 공통 생성 정책

**Authority / Provenance:** `docs/domain/objects/notification.md`의 Type별 생성 관계·조회 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 전달 결과·적용 source kind·포함 범위 및 `Domain / Issue Gate 승인 — 2026-09-10`. — 시스템은 Follow, Follow Request, Reply, Reaction, Repost의 새 Notification을 저장하기 전에 하나의 공통 정책 경계에서 source로부터 파생한 Recipient Profile과 Related Profile에 영구 Profile Mute·양방향 Profile Block을 적용해야 한다(MUST). 각 source의 기존 생성 조건과 원인 객체 조회 조건을 통과했다는 사실만으로 이 판정을 생략해서는 안 된다(MUST NOT). 관계·정책을 별도 저장소에 복제하거나 capability 대신 테스트 전용 evaluator/callback을 production 계약으로 제공해서는 안 된다(MUST NOT).

| Source         | Recipient Profile              | Related Profile |
| -------------- | ------------------------------ | --------------- |
| Follow         | Follow Relationship의 Followee | Follower        |
| Follow Request | Follow Request의 Followee      | Follower        |
| Reply          | Reply Parent의 Author          | Reply Author    |
| Reaction       | Reaction 대상 Post의 Author    | Reaction Owner  |
| Repost         | direct Repost Source의 Author  | Repost Author   |

#### Scenario: 다섯 source의 허용된 생성

- **WHEN** 각 source의 기존 생성·조회 조건이 충족되고 파생된 Recipient·Related Profile 사이에 적용 중인 영구 Mute 또는 Block이 없다
- **THEN** 각 source는 동일한 공통 정책 경계를 통과해 기존 source identity와 Recipient를 가진 Notification을 멱등 생성한다
- **AND** 기존 self-notification, Local Recipient, source lifecycle·조회 제한을 완화하지 않는다

#### Scenario: 진입점과 무관한 생성 판정

- **WHEN** Local 요청 또는 기존 Remote 수신 경로에서 같은 종류의 유효한 source가 commit되고 Notification effect가 실행된다
- **THEN** effect는 source의 실제 Recipient·Related Profile에 같은 공통 정책을 적용한다
- **AND** 요청 Account나 현재 선택 Profile을 source의 Recipient 대신 사용하지 않는다

#### Scenario: 새 source의 공통 정책 소비

- **WHEN** 후속 이슈가 새로운 Profile Notification source를 도입한다
- **THEN** 새 source도 자신의 생성 계약과 함께 공통 Mute·Block 경계를 소비한다
- **AND** 이번 change 자체가 Quote·Mention source 생성 또는 그 중복 제거·승인 lifecycle을 구현하지 않는다

### Requirement: Recipient 방향의 영구 Profile Mute 판정

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`의 상태·관계·조회 정책·제외/보류; `docs/domain/objects/notification.md`의 조회 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 영구 Mute 범위·selected Recipient Profile 격리·완료 조건 및 `Domain / Issue Gate 승인 — 2026-09-10`. — 시스템은 Recipient가 Owner이고 Related Profile이 Target인 `expires_at IS NULL` Profile Mute가 존재하면 다섯 source의 새 Notification을 생성하지 않아야 한다(MUST). 관계 방향을 뒤집거나 같은 Account의 다른 Profile에 이 판정을 확장해서는 안 된다(MUST NOT). non-null 만료 시각의 활성·만료 의미를 새로 도입해서는 안 된다(MUST NOT).

#### Scenario: 수신자의 영구 Mute

- **WHEN** Recipient A가 Related Profile B를 영구 Mute한 상태에서 각 source의 Notification 생성이 시도된다
- **THEN** A에게 해당 Notification을 저장하지 않는다
- **AND** source action의 결과와 Mute 관계는 바뀌지 않는다

#### Scenario: 반대 방향 Mute

- **WHEN** B가 A를 Mute했지만 Recipient A는 Related Profile B를 Mute하지 않았고 다른 생성 조건도 충족한다
- **THEN** B가 소유한 Mute만을 이유로 A의 Notification을 억제하지 않는다

#### Scenario: 같은 Account의 다른 Profile 격리

- **WHEN** 같은 Account의 Profile A1만 B를 Mute했고 A1·A2 각각을 Recipient로 하는 유효한 source가 발생한다
- **THEN** A1의 Notification은 억제하고 A2에는 A2 자신의 정책을 적용한다
- **AND** 세션의 selected Profile 변경으로 저장 대상이나 정책 Owner가 바뀌지 않는다

#### Scenario: non-null 만료 값의 v1 경계

- **WHEN** 정책 조회에서 Owner·Target이 일치하더라도 `expires_at`이 non-null인 관계만 존재한다
- **THEN** 그 관계를 v1의 적용 중인 영구 Mute로 취급하지 않는다
- **AND** 기간·만료 정책이나 시간 기반 정리를 이번 change에서 추가하지 않는다

### Requirement: 콘텐츠 직접 조회와 독립된 Notification Block pair 판정

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 조회 정책; `docs/domain/objects/notification.md`의 Recipient·Related Profile pair 조회 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 양방향 Notification Block pair 판정 및 `Domain / Issue Gate 승인 — 2026-09-10`. — 시스템은 Recipient·Related Profile 사이 어느 방향으로든 Profile Block이 존재하면 새 Notification을 생성하지 않아야 한다(MUST). Profile 기본정보나 한쪽 방향의 Post·Media 직접 조회 허용을 Notification 허용 근거로 사용해서는 안 된다(MUST NOT). 새 생성 판정은 기존 Notification 숨김·Follow 직접 원인 cleanup을 대체해서는 안 된다(MUST NOT).

#### Scenario: 수신자가 상대를 Block

- **WHEN** Recipient A가 Related Profile B를 Block했고 A가 B의 Post를 직접 조회할 수 있는 상태에서 Notification effect가 실행된다
- **THEN** 직접 조회 허용과 무관하게 A의 새 Notification을 억제한다

#### Scenario: 상대가 수신자를 Block

- **WHEN** Related Profile B가 Recipient A를 Block한 상태에서 Notification effect가 실행된다
- **THEN** B→A 관계만 존재해도 A의 새 Notification을 억제한다

#### Scenario: 상호 Block에서 한쪽만 해제

- **WHEN** A와 B가 서로 Block한 뒤 한쪽 관계만 해제되고 새 Notification effect가 실행된다
- **THEN** 남은 반대 방향 Block 때문에 생성을 계속 억제한다

#### Scenario: source commit 이후 Block

- **WHEN** 기존 source action은 이미 commit됐고 Notification 정책 평가 전에 해당 pair에 Block이 생성된다
- **THEN** 평가 시점의 Block에 따라 Notification을 억제한다
- **AND** 이 판정을 이유로 이미 commit된 source를 rollback하거나 새로운 cleanup을 실행하지 않는다

### Requirement: Notification 정책 오류의 실패 격리와 기존 retry 보존

**Authority / Provenance:** `docs/domain/objects/notification.md`의 생성 조건; `docs/architecture/core-services.md`의 commit 이후 effect 처리; [PROD-273](https://linear.app/byulmaru/issue/PROD-273)의 공통 정책·failure boundary; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 fail-closed·source rollback 금지·source lifecycle retry 변경 제외. — 시스템은 명시적인 정책 deny와 정책 평가 실패 모두에서 해당 시도의 새 Notification을 저장하지 않아야 한다(MUST). deny는 생성하지 않는 정상 결과로 처리하되 평가 오류는 호출자·기존 Activity 실패 경계에서 관찰 가능하게 유지해야 한다(MUST). 오류를 성공으로 삼켜 기존 retry 의미를 바꾸거나 원본 source action을 rollback해서는 안 된다(MUST NOT). 기존 unique source identity와 retry·중복 호출의 멱등성을 유지해야 한다(MUST).

#### Scenario: 정상적인 정책 deny

- **WHEN** 실제 Mute 또는 Block 판정이 deny를 반환한다
- **THEN** 새 Notification 없이 effect를 정상적으로 마친다
- **AND** deny 자체를 장애로 재시도하거나 이미 commit된 원본 행동을 실패로 바꾸지 않는다

#### Scenario: 정책 조회 실패

- **WHEN** 각 source의 Mute 또는 Block 평가 중 조회 오류가 발생한다
- **THEN** 해당 시도는 새 Notification을 저장하지 않고 오류를 기존 실패 경계에 전달한다
- **AND** 원본 Follow·Follow Request·Reply·Reaction·Repost의 commit 결과를 보존한다
- **AND** 기존 Activity retry와 sibling effect settlement를 유지한다

#### Scenario: 오류 이후 재시도

- **WHEN** 기존 retry 정책에 따른 재시도에서 source가 여전히 유효하고 정책 평가가 복구된다
- **THEN** 재시도 시점의 정책을 다시 적용해 허용되면 기존 멱등성 계약으로 생성하고 deny면 생성하지 않는다
- **AND** source가 이미 삭제되거나 terminal이 됐다면 기존 source lifecycle의 no-op·cleanup 계약을 따른다

#### Scenario: 중복 호출과 읽음 상태

- **WHEN** 같은 source·Recipient의 Notification이 이미 존재하고 중복 호출 또는 retry가 실행된다
- **THEN** 같은 알림을 추가 생성하거나 기존 Notification의 identity·Read State·최초 읽음 시각을 재설정하지 않는다
- **AND** 새 정책이 deny여도 생성 정책이 기존 행을 삭제하지 않는다

### Requirement: 최신 관계 적용과 기존 Notification 보존

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`의 조회 정책; `docs/domain/objects/profile-block.md`의 행동·조회 정책; `docs/domain/objects/notification.md`의 기존 Notification 보존·정리 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 해제 후 최신 정책·기존 Read State 보존·cleanup 제외 범위. — 시스템은 영구 Mute 해제 또는 마지막 Block 해제 뒤 새 source action의 Notification에 최신 관계를 적용해야 한다(MUST). 생성 정책 연결만을 이유로 기존 Notification을 삭제·읽음 처리하거나 기존에 억제된 source를 찾아 소급 생성해서는 안 된다(MUST NOT). 기존 source retry는 앞선 실패 격리 계약을 그대로 따른다.

#### Scenario: Mute 해제 뒤 새 행동

- **WHEN** Recipient가 영구 Mute를 해제한 뒤 새 유효한 source action이 발생하고 다른 억제 조건이 없다
- **THEN** 새 Notification을 기존 생성 계약대로 제공한다
- **AND** 해제 action이 과거에 억제된 source를 재생하지 않는다

#### Scenario: 마지막 Block 해제 뒤 새 행동

- **WHEN** pair의 마지막 Block이 해제되고 기존 Block 해제·cleanup 계약을 충족한 뒤 새 유효한 source action이 발생한다
- **THEN** 남은 Mute와 기존 생성 조건을 다시 평가한다
- **AND** 제거됐던 Follow·Follow Request나 Notification을 복원하지 않는다

#### Scenario: Mute 생성 전의 Notification

- **WHEN** Recipient에게 이미 Read 또는 Unread Notification이 있는 상태에서 Related Profile에 대한 Mute가 생성된다
- **THEN** 이번 생성 정책은 기존 Notification의 존재·Read State·최초 읽음 시각을 변경하지 않는다

#### Scenario: 기존 Block cleanup과 조회 정책

- **WHEN** Block action이나 기존 unavailable Notification 조회·정리가 실행된다
- **THEN** Follow 직접 원인 정리와 양방향 pair 숨김·Best Effort 비동기 정리에는 각각 기존 소유 계약을 적용한다
- **AND** PROD-327 생성 판정이 그 cleanup·조회 정책을 중복 수행하거나 완화하지 않는다
