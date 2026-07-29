## MODIFIED Requirements

### Requirement: API 세션 컨텍스트 파생

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/session.md`, PROD-532 — API 서버는 Bearer token에서 현재 Session과 Session에 저장된 actor Profile을 파생해야 한다(MUST).

#### Scenario: 유효한 Bearer token

- **WHEN** API 요청의 `Authorization` header가 `Bearer <token>` 형식이고 token이 Active Session과 일치한다
- **THEN** 시스템은 Session ID, Account ID와 선택적 actor Profile ID를 request context에 설정한다
- **AND** 연결된 Account는 `ACTIVE` 상태여야 한다
- **AND** Session은 `ACTIVE` 상태여야 한다

#### Scenario: actor profile 선택

- **WHEN** 유효한 Session의 `active_profile_id`가 존재한다
- **THEN** 시스템은 해당 Profile lifecycle이 `ACTIVE`, suspension이 `NORMAL`, 소속 Instance가 사용 가능한 상태이고 Session Account와 `account_profile`로 연결된 경우에만 actor Profile로 사용한다
- **AND** 유효하지 않은 actor Profile은 `null`로 처리한다

#### Scenario: actor profile 없음

- **WHEN** 유효한 Session의 `active_profile_id`가 없거나 Profile lifecycle transition으로 선택이 해제됐다
- **THEN** 시스템은 actor Profile을 `null`로 처리한다
