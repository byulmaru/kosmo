## MODIFIED Requirements

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 Profile의 정책에 따라 follow할 수 있어야 한다(MUST).
정책이 승인을 요구하면 pending follow request를 생성할 수 있어야 한다(MUST).

#### Scenario: Follow open active profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 Profile follow를 요청한다
- **THEN** 시스템은 follow relationship을 생성한다
- **AND** 같은 pair의 pending request가 있으면 제거한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 생성된 `ProfileFollow`를 반환한다
- **AND** `profileFollowRequest`는 없음이다

#### Scenario: Request approval-required active profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 다른 활성 Profile follow를 요청한다
- **THEN** 시스템은 pending request를 생성한다
- **AND** mutation은 `FollowProfilePayload.profileFollowRequest`로 request를 반환한다
- **AND** `profileFollow`는 없음이다

#### Scenario: Follow or request idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중이거나 pending request가 있는 Profile follow를 요청한다
- **THEN** 시스템은 기존 `ProfileFollow` 또는 `ProfileFollowRequest`를 반환한다
- **AND** 오류나 중복 row를 만들지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Follow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 Profile 또는 비활성인 대상 Profile follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

## ADDED Requirements

### Requirement: Profile viewer follow-request state

API는 active profile이 대상 Profile에 보낸 pending request를 viewer-relative state로 노출해야 한다(MUST).

#### Scenario: Read viewer outgoing request

- **WHEN** active profile이 있는 인증자가 다른 활성 Profile의 `viewerState`를 조회한다
- **THEN** viewer가 대상에 보낸 pending request가 있으면 `followRequest`로 반환한다
- **AND** pending request가 없으면 `followRequest`는 없음이다
