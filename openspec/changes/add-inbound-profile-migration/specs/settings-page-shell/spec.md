## MODIFIED Requirements

### Requirement: Profile detail 상태 소유

**Authority / Provenance:** `docs/design/settings.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-685`, `PROD-743`; Profile 데이터·전환·저장 경계 `PROD-667` — Profile detail은 현재 Local Profile identity와 Profile query·loading·error·empty·content·retry 상태를 자기 화면 안에서 소유해야 한다(MUST). Profile loading 중 확인되지 않은 값을 확정된 것처럼 표시해서는 안 되며(MUST NOT), Profile 전환 뒤 이전 Profile 결과를 새 대상 아래에 표시해서는 안 된다(MUST NOT). 오류에는 backend 원문이 아닌 안전한 한국어 설명과 재시도 action을 제공해야 한다(MUST). Settings shell과 Account entry가 Profile 오류 종류나 저장 상태를 공통 상태로 해석하거나 재구현해서는 안 된다(MUST NOT). page shell은 공개 범위 control의 inline·dropdown·sheet 또는 즉시·명시적 저장 interaction을 고정해서는 안 된다(MUST NOT). Profile Migration source 준비 control은 이 detail에서 현재 선택된 Local Profile을 target으로 사용하고 별도 target Profile ID 입력 없이 source qualified handle만 제출하도록 해당 feature flag가 켜져 있고 값이 확인된 경우에만 노출해야 하며(MUST), flag가 꺼져 있거나 확인할 수 없거나 로딩 중이면 렌더링해서는 안 된다(MUST NOT). 이 flag는 Profile Owner 권한을 대신하지 않으며(MUST NOT), 이미 준비된 관계와 그로부터 파생된 alias 및 inbound Move 처리를 flag 상태로 중단하거나 제거해서는 안 된다(MUST NOT).

#### Scenario: 선택한 Profile detail을 표시한다

- **WHEN** selected Local Profile이 있는 사용자가 Profile 기본 공개 범위 detail을 연다
- **THEN** detail은 현재 Profile의 표시 이름·`relativeHandle`과 Profile 설정 content를 표시한다
- **AND** Profile control의 accessible name은 Kosmo 내부 기능과 현재 대상을 전달한다

#### Scenario: 확인된 feature flag가 켜져 있을 때 source 준비 control을 표시한다

- **WHEN** selected Local Profile이 있고 Profile Migration feature flag가 켜진 것으로 확인된다
- **THEN** Profile detail은 source qualified handle을 준비할 수 있는 Profile Migration control을 표시한다
- **AND** control 실행은 기존 `Account.Active`와 `Profile.Owner` 권한 경계를 사용한다

#### Scenario: source 등록 성공 뒤 ActivityPub Move를 안내한다

- **WHEN** Profile detail의 현재 selected Local Profile에서 source qualified handle만 담은 `RegisterProfileMigrationSourceInput`으로 `registerProfileMigrationSource` mutation이 성공한다
- **THEN** detail은 `RegisterProfileMigrationSourcePayload.profile`의 target Profile과 `migrationSource` field를 반영한다
- **AND** 성공 안내는 기존 Mastodon 계정에서 새 Kosmo handle로 ActivityPub `Move`를 시작하도록 설명한다
- **AND** detail은 Profile 이전 완료를 표시하거나 Move 이후 완료를 위한 별도 Kosmo API·action을 제공하지 않는다

#### Scenario: feature flag가 꺼졌거나 확인되지 않으면 source 준비 control을 숨긴다

- **WHEN** Profile Migration feature flag가 꺼져 있거나 값을 확인할 수 없거나 로딩 중이다
- **THEN** Profile detail은 Profile Migration source 준비 control을 렌더링하지 않는다
- **AND** Profile identity·기존 Profile 설정 content의 loading·error·empty 정책은 변경하지 않는다

#### Scenario: Settings UI flag가 Profile 권한을 넓히지 않는다

- **WHEN** feature flag는 켜져 있지만 현재 Account가 selected Local Profile의 `Profile.Owner`가 아니다
- **THEN** 시스템은 Profile Migration source 준비 action을 기존 Profile Owner 권한으로 거부한다
- **AND** 준비 관계와 Profile 상태를 변경하지 않는다

#### Scenario: source 준비 저장 실패에서 입력과 재시도를 보존한다

- **WHEN** Profile Migration source qualified handle을 제출했지만 준비 요청이 실패한다
- **THEN** Profile detail은 사용자가 제출한 source 입력과 안전한 오류 설명을 유지한다
- **AND** 같은 입력으로 재시도할 수 있는 action을 제공한다
- **AND** 기존 준비 관계와 alias를 실패 결과로 변경하지 않는다

#### Scenario: 설정 대상 Profile이 없다

- **WHEN** Account가 접근할 수 있는 Local Profile이 없거나 session에 selected Profile이 없다
- **THEN** Profile detail은 대상이 없다는 설명과 기존 Profile 선택·생성 흐름으로 이동하는 action을 표시한다
- **AND** 이전 또는 다른 Profile의 설정값을 현재 값처럼 표시하지 않는다

#### Scenario: Profile 조회를 재시도한다

- **WHEN** Profile detail의 query가 실패한다
- **THEN** detail은 안전한 한국어 오류 설명과 재시도 action을 표시한다
- **AND** Settings shell이나 Account entry는 Profile error type을 해석하거나 Account data error state를 만들지 않는다

#### Scenario: Profile 전환의 늦은 결과를 표시하지 않는다

- **WHEN** 설정 대상 Profile이 바뀐 뒤 이전 Profile 요청이 늦게 완료된다
- **THEN** detail은 이전 결과를 새 Profile identity 아래에 표시하지 않는다
- **AND** 새 Profile의 identity와 데이터가 일치할 때만 설정 control을 content 상태로 표시한다

#### Scenario: flag 상태가 이미 준비된 inbound 동작을 중단하지 않는다

- **WHEN** Profile Migration 관계와 그로부터 파생된 alias가 이미 존재하고 feature flag가 꺼지거나 확인되지 않는다
- **THEN** Settings detail은 source 준비 control을 숨길 수 있다
- **AND** 기존 관계·alias와 inbound Move 처리는 flag 상태에 따라 제거되거나 중단되지 않는다
