## ADDED Requirements

### Requirement: Refresh stored remote actor from inbound Update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `PROD-607` 시스템은 검증된 remote ActivityPub actor `Update`를 수신하면 refresh TTL과 무관하게 동일한 저장 remote `Profile`의 원격 표현 속성, Follow Approval Policy와 actor endpoint metadata를 즉시 갱신해야 한다(MUST).

#### Scenario: Refresh the matching stored remote actor

- **WHEN** remote `Person`, `Application`, `Group`, `Organization` 또는 `Service` actor가 자기 identity와 같은
  embedded actor object를 포함한 `Update`를 보내고 그 identity에 연결된 remote profile이 저장되어 있다
- **THEN** 시스템은 기존 actor materialization과 같은 projection으로 그 profile과 actor endpoint metadata를
  갱신한다
- **AND** `manuallyApprovesFollowers=true`이면 `followPolicy=APPROVAL_REQUIRED`, 아니면
  `followPolicy=OPEN`으로 양방향 반영한다
- **AND** actor metadata의 `lastFetchedAt`을 Update 처리 시각으로 갱신한다

#### Scenario: Reject mismatched or unsupported Update

- **WHEN** Update actor와 embedded object identity가 다르거나 embedded object가 지원 actor type이 아니다
- **THEN** 시스템은 어떤 저장 profile이나 ActivityPub actor metadata도 변경하지 않는다

#### Scenario: Reject local actor collision

- **WHEN** Update identity가 configured local actor 또는 local profile actor metadata와 충돌한다
- **THEN** 시스템은 local profile을 remote profile로 갱신하지 않고 저장 상태를 변경하지 않는다

#### Scenario: Ignore unknown remote actor

- **WHEN** 검증된 Update identity에 연결된 저장 remote profile이 없다
- **THEN** 시스템은 Update만으로 새 remote profile을 materialize하지 않는다

#### Scenario: Process duplicate Update idempotently

- **WHEN** 같은 actor Update를 둘 이상 수신한다
- **THEN** 시스템은 같은 remote profile과 actor metadata를 동일한 최신 projection으로 유지한다
- **AND** 중복 profile, follow request 또는 follow relationship을 만들지 않는다

#### Scenario: Preserve established relationship across policy refresh

- **WHEN** remote profile에 이미 established follow relationship이 있고 actor Update로 follow policy가 바뀐다
- **THEN** 시스템은 기존 relationship과 저장 count를 유지한다

#### Scenario: Apply refreshed approval-required policy to a new Follow

- **WHEN** actor Update가 remote profile policy를 `APPROVAL_REQUIRED`로 갱신한 뒤 active local profile이 신규
  Follow를 요청한다
- **THEN** 시스템은 established relationship과 count 증가 없이 pending follow request를 만든다
- **AND** GraphQL과 FollowButton은 pending 상태를 표시한다
- **AND** 후속 `Accept(Follow)`를 받으면 request를 제거하고 relationship과 count를 한 번 생성해 established
  상태를 표시한다

#### Scenario: Apply refreshed open policy to a new Follow

- **WHEN** actor Update가 remote profile policy를 `OPEN`으로 갱신한 뒤 active local profile이 신규 Follow를
  요청한다
- **THEN** 시스템은 pending request 없이 relationship과 count를 한 번 생성한다
- **AND** GraphQL과 FollowButton은 established 상태를 표시한다
