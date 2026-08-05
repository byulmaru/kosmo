## ADDED Requirements

### Requirement: Local Profile 기본 Post Visibility 저장

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-648` 시스템은 Local Profile의 기본 Post Visibility를 Profile별 durable 값으로 저장할 수 있어야 한다(MUST).
저장 가능한 값은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`뿐이어야 하며(MUST), 기존 또는 미설정 Local Profile은
canonical application projection에서 `UNLISTED`로 동작해야 한다(MUST). Remote Profile에는 Kosmo Local
설정값을 만들거나 변경해서는 안 된다(MUST NOT).

#### Scenario: Local Profile 기본값 저장

- **WHEN** Local Profile Owner가 지원하는 기본 Post Visibility를 저장한다
- **THEN** 시스템은 해당 Profile에만 값을 저장한다
- **AND** 같은 Account의 다른 Local Profile 값은 변경하지 않는다

#### Scenario: 기존 Local Profile 호환

- **WHEN** migration 이전에 생성되어 저장된 기본값이 없는 Local Profile을 읽는다
- **THEN** 시스템은 destructive rewrite 없이 `UNLISTED`를 반환한다
- **AND** 기존 Post의 저장된 Visibility를 변경하지 않는다

#### Scenario: 새 Local Profile 기본값

- **WHEN** 새 Local Profile이 생성된다
- **THEN** 해당 Profile의 canonical 기본 Post Visibility는 `UNLISTED`다

#### Scenario: Remote Profile 설정 부재

- **WHEN** Remote Profile을 생성·갱신하거나 조회한다
- **THEN** 시스템은 Remote Profile에 Kosmo Local 기본 Post Visibility를 저장하거나 변경하지 않는다

#### Scenario: 지원하지 않는 값 저장 방지

- **WHEN** `DIRECT` 또는 지원하지 않는 값을 Local Profile 기본값으로 저장하려 한다
- **THEN** application validation은 write 전에 요청을 거부한다
- **AND** 요청은 기존 저장값을 변경하지 않는다
