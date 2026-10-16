## ADDED Requirements

### Requirement: 공유 Hashtag에 대한 Owner별 규칙 관리

시스템은 같은 canonical Hashtag identity를 대상으로 Owner Profile의 뮤트 규칙을 생성·변경·해제하고 조회할 수 있어야 한다(SHALL).

**Source Context:** PROD-1029 포함 범위·완료 조건, `docs/domain/objects/hashtag.md`,
`docs/domain/objects/hashtag-mute-rule.md`, ADR 0020.

#### Scenario: Profile Tag와 같은 Hashtag에 규칙 생성

- **WHEN** 권한 있는 Owner Profile이 Profile Tag가 참조하는 canonical Hashtag에 유효한 규칙을 생성한다
- **THEN** 해당 Hashtag identity에 연결된 규칙과 서버가 확정한 Scope·Decision·만료를 조회할 수 있다
- **AND** 이름을 기준으로 별도 identity를 만들거나 다른 Profile의 규칙을 바꾸지 않는다

#### Scenario: 규칙 변경과 해제

- **WHEN** 권한 있는 Owner Profile이 자신의 규칙의 Scope·Decision·만료를 변경하거나 규칙을 해제한다
- **THEN** 변경한 규칙은 확정된 값으로 조회되고 해제한 규칙은 적용 중인 뮤트로 조회되지 않는다
- **AND** 다른 Hashtag와 다른 Owner의 규칙은 유지된다

### Requirement: canonical 권한과 selected Profile 격리

시스템은 생성에 `Account.Active`, `Profile.Member`, Active/Normal Local Owner 조건을 적용하고 변경·해제·조회에 Rule Owner 권한과 selected Profile 격리를 적용해야 한다(SHALL).

**Source Context:** PROD-1029 권한·격리 완료 조건, `docs/domain/objects/hashtag-mute-rule.md` 행동·권한·조회 조건.

#### Scenario: Member가 Owner Profile의 규칙을 생성

- **WHEN** Active Account의 selected Profile이 Active/Normal Local Profile이고 Account가 해당 Profile의 Member다
- **THEN** 유효한 입력으로 그 Profile 소유 규칙을 생성할 수 있다
- **AND** Account의 Owner role만 요구하는 제한을 추가하지 않는다

#### Scenario: 다른 selected Profile의 Rule ID 사용

- **WHEN** 요청의 selected Profile과 Rule의 Owner Profile이 다르다
- **THEN** 해당 Rule의 비공개 내용을 조회하거나 변경·해제할 수 없다
- **AND** 같은 Account가 두 Profile의 membership을 가지고 있어도 Rule Owner는 현재 selected Profile을 기준으로 판정한다

#### Scenario: 생성 조건 미충족

- **WHEN** 비인증·비활성 Account, membership 없는 요청 또는 Active/Normal Local 조건을 만족하지 않는 Owner로 생성한다
- **THEN** 생성은 거절되고 규칙 저장 상태는 바뀌지 않는다

### Requirement: Scope와 만료 입력 검증

시스템은 생성·변경 후 저장할 최종 상태에 하나 이상의 Scope와 Decision을 포함하고 만료를 미래 시각 또는 영구로 제한해야 한다(SHALL).

**Source Context:** PROD-1029 포함 범위·완료 조건, `docs/domain/objects/hashtag-mute-rule.md` 상태·속성·행동.

#### Scenario: 여러 Scope와 영구 설정

- **WHEN** Owner가 하나 이상의 유효한 Scope, Decision과 영구 설정으로 규칙을 생성하거나 변경한다
- **THEN** 서버가 확정한 Scope·Decision과 영구 설정을 조회할 수 있다

#### Scenario: 빈 Scope 또는 유효하지 않은 만료

- **WHEN** Owner가 빈 Scope 또는 미래가 아닌 만료 시각을 입력한다
- **THEN** 요청은 거절되고 기존 규칙을 부분 변경하지 않는다

#### Scenario: 유효한 규칙에서 만료를 생략한 부분 변경

- **WHEN** Owner가 만료 시각이 미래이거나 영구인 규칙의 Scope 또는 Decision만 변경하고 만료를 생략한다
- **THEN** 서버는 기존 만료 값을 유지하고 변경할 값과 합친 최종 상태를 검증한다
- **AND** 저장 직전에도 최종 상태가 유효하면 변경을 확정한다

#### Scenario: 만료된 규칙에서 만료를 생략한 부분 변경

- **WHEN** Owner가 이미 만료된 규칙의 Scope 또는 Decision만 변경하고 만료를 생략한다
- **THEN** 기존 만료를 유지한 최종 상태가 미래 또는 영구 조건을 만족하지 않으므로 요청을 거절한다
- **AND** Scope·Decision·만료를 포함한 기존 규칙의 저장 상태는 바뀌지 않는다

#### Scenario: 만료된 규칙의 만료를 유효하게 변경

- **WHEN** Owner가 만료된 규칙의 만료를 미래 시각 또는 영구로 명시하고 유효한 Scope·Decision으로 변경한다
- **THEN** 서버는 변경할 값과 기존 값을 합친 최종 상태를 검증하고 변경을 확정한다
- **AND** 변경된 규칙은 만료 기준으로 유효하며 저장된 Scope에서만 적용된다

### Requirement: 유일성과 만료에 따른 적용 여부

시스템은 같은 Owner와 Target Hashtag에 적용 중인 Rule을 하나만 유지하고 만료된 Rule을 적용 중인 뮤트로 판정하지 않아야 한다(SHALL). 규칙의 만료 기준 유효성과 요청 Scope별 적용 여부를 구분하여 조회할 수 있어야 한다(SHALL).

**Source Context:** PROD-1029 중복·만료·재생성·조회 완료 조건, `docs/domain/objects/hashtag-mute-rule.md` 관계·조회 정책.

#### Scenario: 같은 pair의 동시 생성

- **WHEN** 같은 Owner와 Target Hashtag에 대해 생성 요청이 동시에 실행된다
- **THEN** 적용 중인 Rule은 하나만 존재한다
- **AND** 별개의 생성 요청이 기존 적용 중 규칙의 Scope·Decision·만료를 변경하지 않는다

#### Scenario: 만료 후 조회와 재생성

- **WHEN** 저장된 규칙의 만료 시각이 지나고 Owner가 상태를 조회한다
- **THEN** 해당 규칙은 적용 중인 뮤트로 판정되지 않는다
- **AND** 그 pair에 유효한 새 규칙을 생성하면 중복 적용 없이 서버 확정 상태를 조회할 수 있다

#### Scenario: 유효한 규칙과 요청 Scope의 불일치

- **WHEN** Owner가 만료 시각이 미래이거나 영구이고 Home Scope만 저장된 규칙을 Search Scope 기준으로 조회한다
- **THEN** 규칙은 만료 기준으로 유효하지만 Search Scope에는 적용되지 않는 것으로 반환된다
- **AND** 같은 규칙을 Home Scope 기준으로 조회하면 적용되는 것으로 반환된다
- **AND** 이 조회 결과는 실제 목록·검색·알림 적용의 통합 완료를 뜻하지 않는다

#### Scenario: 만료 시각에 도달한 규칙의 Scope별 조회

- **WHEN** Owner가 서버 조회 시각과 만료 시각이 같거나 만료 시각이 더 이른 규칙을 조회한다
- **THEN** 규칙은 만료 기준으로 유효하지 않다
- **AND** 요청 Scope가 저장된 Scope에 포함되어도 적용되지 않는 것으로 반환된다

### Requirement: Local Scope와 저장 Decision의 보존

시스템은 Local Scope를 저장·조회하고 Local에서 Collapse도 Exclude로 소비한다는 기존 목록 정책을 보존해야 한다(SHALL).

**Source Context:** PROD-1029의 2026-09-22 확정 결정 및 범위, `docs/domain/objects/hashtag-mute-rule.md`,
`docs/domain/policies/post-list.md`.

#### Scenario: Local과 다른 Scope에 Collapse 저장

- **WHEN** Owner가 Local과 Home Scope에 Collapse 규칙을 저장한다
- **THEN** 저장된 Decision은 Collapse로 조회되며 Local의 소비 결과 때문에 Exclude로 재작성되지 않는다
- **AND** Local 목록의 실제 Exclude 적용은 PROD-1030의 검증 책임으로 남는다
