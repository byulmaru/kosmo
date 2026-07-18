## MODIFIED Requirements

### Requirement: Profile follow graph

API는 활성 상태이고 `SUSPENDED`가 아닌 profile 간 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST). Viewer active profile이 대상 profile을 follow하는 established 관계는 `Profile.viewerState.follow`로만 노출해야 한다(MUST).

#### Scenario: Read followers

- **WHEN** 클라이언트가 활성 profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 profile을 followee로 하고 follower 프로필도 노출 가능한 활성 profile인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read following

- **WHEN** 클라이언트가 활성 profile의 following connection을 조회한다
- **THEN** 시스템은 해당 profile을 follower로 하고 followee 프로필도 노출 가능한 활성 profile인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Read viewer state

- **WHEN** 클라이언트가 활성 프로필의 `viewerState`를 조회한다
- **THEN** 시스템은 현재 요청에 active profile이 선택되어 있으면 viewer-relative 상태를 반환한다
- **AND** 현재 요청에 active profile이 없으면 없음으로 응답한다
- **AND** 조회 대상 프로필이 viewer active profile 자신인지 `isSelf`로 반환한다
- **AND** viewer active profile이 대상 프로필을 follow하는 관계가 있으면 `follow`로 반환하고, 없으면 없음으로 응답한다
- **AND** 동일 관계를 `Profile`의 다른 viewer-relative follow 필드로 중복 노출하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다
