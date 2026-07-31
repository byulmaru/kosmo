## ADDED Requirements

### Requirement: 인증된 Local Media 업로드 완료

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-441` Kosmo는 인증된 Active Account가 소유한 `Source=Local`, `State=Uploading` Media의 완료를 요청할 수 있게 해야 한다(MUST).

#### Scenario: 요청 Account가 소유한 Uploading Media

- **WHEN** 인증된 Account가 자신이 Upload Account인 Local/Uploading Media의 완료를 요청한다
- **THEN** 시스템은 Media의 persistence-only opaque 저장 참조로 저장 완료를 확인한다

#### Scenario: 다른 Account의 Media

- **WHEN** 인증된 Account가 다른 Account가 Upload Account인 Media의 완료를 요청한다
- **THEN** 시스템은 외부 저장 완료를 확인하거나 Media를 변경하지 않고 요청을 거부한다

#### Scenario: 같은 Account의 다른 선택 Profile

- **WHEN** 같은 Upload Account가 업로드 시작 때와 다른 유효한 Member Profile을 선택한 상태로 완료를 요청한다
- **THEN** 시스템은 완료를 허용한다
- **AND** Media의 Profile과 Upload Account 관계를 변경하지 않는다

### Requirement: 외부 저장 완료 확인

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-440`, `PROD-441` Kosmo는 Media Storage Service가 해당 opaque 저장 참조의 원본 저장 성공을 확인한 경우에만 Media를 Ready로 전환해야 한다(MUST).

#### Scenario: 저장 완료

- **WHEN** Media Storage Service 완료 endpoint가 저장 완료를 확인한다
- **THEN** 시스템은 같은 Media의 Ready 전환을 시도한다

#### Scenario: 저장 미완료

- **WHEN** Media Storage Service가 저장 미완료를 반환한다
- **THEN** 시스템은 Media를 Uploading으로 유지하고 성공 payload를 반환하지 않는다

#### Scenario: 외부 확인 실패

- **WHEN** Media Storage Service가 실패 응답을 반환하거나 network 요청이 실패한다
- **THEN** 시스템은 Media를 Uploading으로 유지하고 성공 payload를 반환하지 않는다

### Requirement: 같은 Media의 원자적 Ready 전환

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-441` 저장 완료가 확인된 Local/Uploading Media는 identity와 Account/Profile 관계를 유지한 채 `State=Ready`가 되고 `Ready At`이 기록되어야 한다(MUST).

#### Scenario: 최초 완료 전환

- **WHEN** 저장 완료가 확인된 Uploading Media의 persistence update가 성공한다
- **THEN** 같은 Media identity의 state는 Ready다
- **AND** state와 `readyAt`은 하나의 atomic persistence update로 기록된다
- **AND** Profile, Upload Account, 저장 참조와 업로드 만료 시각은 변경되지 않는다

#### Scenario: persistence 실패

- **WHEN** 저장 완료 확인 뒤 persistence update가 실패한다
- **THEN** Media는 Uploading과 null `readyAt`을 유지한다
- **AND** mutation은 성공 payload를 반환하지 않는다

### Requirement: 멱등 완료 결과

**Authority / Provenance:** `docs/domain/objects/media.md`, `PROD-435`, `PROD-441` 같은 Upload Account의 반복 또는 동시 완료 요청은 최초 전환된 같은 Ready Media 결과를 유지해야 한다(MUST).

#### Scenario: 이미 Ready인 Media의 반복 완료

- **WHEN** 같은 Upload Account가 이미 Ready인 Local Media의 완료를 다시 요청한다
- **THEN** mutation은 같은 Media identity와 기존 `readyAt`을 반환한다
- **AND** 외부 완료 확인이나 persistence write를 반복하지 않는다

#### Scenario: 동시에 완료되는 요청

- **WHEN** 같은 Uploading Media에 대한 유효한 완료 요청이 동시에 실행된다
- **THEN** 최초 conditional update 하나만 Ready와 `readyAt`을 기록한다
- **AND** 나머지 요청은 같은 Ready Media와 최초 `readyAt` 결과를 반환한다

### Requirement: 완료 API 비노출 경계

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-441` 완료 mutation은 Kosmo Media global ID를 입력으로 받고 Ready Media를 반환해야 하며(MUST), opaque 저장 참조를 input, GraphQL identity 또는 공개 field로 노출하면 안 된다(MUST NOT).

#### Scenario: 성공 payload

- **WHEN** 완료 mutation이 성공한다
- **THEN** payload는 같은 Media identity, Ready state와 `readyAt`을 제공한다
- **AND** raw 저장 참조는 schema나 payload에 포함되지 않는다
