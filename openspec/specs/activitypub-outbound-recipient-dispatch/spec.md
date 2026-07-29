# activitypub-outbound-recipient-dispatch Specification

## Purpose

논리적 outbound target을 usable Fedify recipient로 확장하고 전달하는 공통 계약을 정의한다.

## Requirements

### Requirement: 논리적 outbound target 확장

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, PROD-512. 시스템은 이미 구성된 Activity와 direct remote Profile·Author followers target을 받아 usable Fedify
`Recipient` 집합으로 확장해야 한다(MUST). Activity별 lifecycle이 `ProfileFollows`, `ActivityPubActors` 또는
inbox 필드를 직접 조회하게 해서는 안 된다(MUST NOT).

#### Scenario: direct Profile과 followers target 결합

- **WHEN** 하나의 outbound Activity가 특정 remote Profile과 Local Author의 followers를 target으로 가진다
- **THEN** dispatcher는 direct Profile과 established remote followers를 하나의 recipient 집합으로 확장한다
- **AND** 같은 actor가 두 target에서 발견돼도 한 recipient로 중복 제거한다

#### Scenario: followers가 없는 target

- **WHEN** Local Author에게 usable established remote follower가 없다
- **THEN** followers target은 빈 recipient 집합으로 확장된다
- **AND** dispatcher는 follower가 없다는 이유로 committed application 결과를 실패로 바꾸지 않는다

### Requirement: remote recipient eligibility

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`, PROD-512. 시스템은 canonical Instance 정책상 새 원격 요청이 허용되고 Active remote Profile과 ActivityPub actor mapping이
있으며 유효한 HTTP(S) actor URI와 personal inbox를 가진 actor만 recipient로 사용해야 한다(MUST).

#### Scenario: usable remote recipient

- **WHEN** target Profile이 Active이고 Remote Instance가 새 원격 요청을 허용하며 actor URI와 personal inbox가 유효한 HTTP(S) URI다
- **THEN** dispatcher는 해당 actor를 recipient에 포함한다
- **AND** 유효한 shared inbox가 저장돼 있으면 Fedify가 우선할 수 있도록 보존한다

#### Scenario: invalid shared inbox fallback

- **WHEN** actor URI와 personal inbox는 유효하지만 shared inbox가 없거나 유효한 HTTP(S) URI가 아니다
- **THEN** dispatcher는 shared inbox를 사용하지 않는다
- **AND** 유효한 personal inbox recipient는 유지한다

#### Scenario: unavailable recipient 제외

- **WHEN** target이 Local Profile이거나 remote Profile·Instance가 unavailable이거나 actor URI 또는 personal inbox를 안전하게 해석할 수 없다
- **THEN** dispatcher는 해당 target을 recipient에 포함하지 않는다
- **AND** invalid URI를 Fedify에 전달하지 않는다

### Requirement: 공통 Fedify direct delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, PROD-447, PROD-512, PROD-533. 시스템은 이미 구성된 Activity, 발신 Local Profile·Instance identity와 확장된 recipient를
사용해 Fedify direct delivery를 한 공통 경계에서 실행해야 한다(MUST). Activity의 종류·identity·audience와
domain target 의미를 dispatcher가 재정의해서는 안 된다(MUST NOT).

#### Scenario: recipient가 있는 delivery

- **WHEN** 하나 이상의 usable recipient가 확장된다
- **THEN** dispatcher는 발신 Local Instance의 signing context로 같은 Activity를 전달한다
- **AND** shared-inbox preference를 Fedify delivery에 적용한다
- **AND** 현재 direct delivery에 ordering key를 제공하지 않는다

#### Scenario: recipient가 없는 delivery

- **WHEN** 모든 target이 빈 집합으로 확장되거나 eligibility에서 제외된다
- **THEN** dispatcher는 remote HTTP delivery를 호출하지 않는다
- **AND** no-op 결과를 정상적으로 반환한다

#### Scenario: delivery 실패

- **WHEN** Fedify direct delivery가 remote HTTP 오류로 실패한다
- **THEN** dispatcher는 호출자가 실패를 관측하고 격리할 수 있도록 오류를 반환한다
- **AND** dispatcher는 이미 commit된 domain state를 rollback하지 않는다

### Requirement: 내부 followers expansion 경계

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/profile.md`, PROD-512. 시스템은 followers target을 내부 delivery recipient expansion에만 사용해야 하며(MUST), 이 구현만으로 외부
followers collection 조회 또는 팔로워 목록 공개 동작을 추가해서는 안 된다(MUST NOT).

#### Scenario: remote followers expansion

- **WHEN** dispatcher가 Local Author의 followers target을 확장한다
- **THEN** 저장된 established remote Follow 관계만 recipient 후보로 사용한다
- **AND** 외부 HTTP followers collection endpoint의 공개 범위는 변경하지 않는다
