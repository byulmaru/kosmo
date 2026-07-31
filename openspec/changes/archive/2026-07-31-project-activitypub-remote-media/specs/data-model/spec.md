## ADDED Requirements

### Requirement: Media source와 state별 저장 invariant

**Authority / Provenance:** `docs/domain/objects/media.md`, PROD-585. 시스템은 하나의 `media` 테이블에서 Local upload와 Remote Media를 저장하되 source별 upload field 존재 조건과 Remote state를 database invariant로 강제해야 한다(MUST).

#### Scenario: Uploading Local Media 저장

- **WHEN** `source=LOCAL`, `state=UPLOADING` Media를 저장한다
- **THEN** Profile, Upload Account, storage reference와 upload expiry가 존재해야 한다
- **AND** URL, media type과 ready 시각은 존재하지 않아야 한다

#### Scenario: Ready Local Media 저장

- **WHEN** `source=LOCAL`, `state=READY` Media를 저장한다
- **THEN** Profile, Upload Account, storage reference, upload expiry, URL, media type과 ready 시각이 모두 존재해야 한다
- **AND** 이 변경은 기존 Local upload 시작·완료의 application validation을 재정의하지 않는다

#### Scenario: Ready Remote Media 저장

- **WHEN** `source=REMOTE`, `state=READY` Media를 저장한다
- **THEN** 원본 Remote Profile과 canonical HTTP(S) URL이 존재해야 한다
- **AND** Upload Account, storage reference, upload expiry와 ready 시각은 존재하지 않아야 한다
- **AND** media type은 nullable이어야 한다

#### Scenario: 지원하지 않는 Remote Media 조합 거부

- **WHEN** `source=REMOTE`, `state=UPLOADING` Media를 저장하려 한다
- **OR** Remote Media에 URL이 없거나 Local upload 전용 field가 있다
- **THEN** PostgreSQL constraint가 해당 row를 거부한다

#### Scenario: Local upload field invariant 유지

- **WHEN** nullable physical column을 사용하는 `source=LOCAL` Media를 저장하려 한다
- **THEN** PostgreSQL constraint는 Upload Account, storage reference와 upload expiry를 계속 필수로 요구한다

#### Scenario: 기존 Ready Local Media metadata 정렬

- **WHEN** 새 source/state constraint 적용 전에 URL 또는 media type이 없는 기존 `LOCAL + READY` Media가 있다
- **THEN** 시스템은 각 storage reference를 Media Storage Service에서 재확인한 실제 공개 URL과 media type으로 백필해야 한다
- **AND** 확인할 수 없는 값을 synthetic metadata로 만들거나 기존 Media row를 삭제하면 안 된다
- **AND** 백필 뒤 모든 Ready Local Media가 URL, media type과 ready 시각을 가진 상태에서 constraint를 적용해야 한다

### Requirement: Remote Media URL identity

**Authority / Provenance:** `docs/domain/objects/media.md`, PROD-585. 시스템은 canonical 원격 URL을 Remote Media의 재사용 identity로 사용하고 database에서 중복을 방지해야 한다(MUST).

#### Scenario: Remote URL 중복 방지

- **WHEN** `source=REMOTE`인 둘 이상의 Media가 같은 canonical `media.url`을 저장하려 한다
- **THEN** PostgreSQL unique constraint가 하나의 Remote Media만 허용한다
- **AND** Local Media URL의 identity 또는 uniqueness 계약을 변경하지 않는다

#### Scenario: Local upload schema 호환

- **WHEN** 기존 Local Media upload 시작과 완료가 실행된다
- **THEN** Local upload 전용 identity인 storage reference와 Upload Account 계약은 유지된다
- **AND** Remote URL uniqueness 때문에 서로 다른 Local Media의 URL 저장이 거부되지 않는다
