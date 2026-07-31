## ADDED Requirements

### Requirement: 원격 actor Profile 표현 projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, PROD-625. 시스템은 Fedify가 hydrate한 원격 ActivityPub actor의 embedded `icon`을 Profile avatar 후보로, embedded `image`를 Profile header 후보로 투영해야 한다(MUST). 각 후보는 정확히 하나의 canonical HTTP(S) 표현 URL을 가져야 하며 nullable Media Type과 사람이 읽을 수 있는 이름을 보존해야 한다(MUST). IRI-only 또는 부적합한 표현을 위해 추가 원격 fetch를 수행해서는 안 되며(MUST NOT), 해당 표현 때문에 기본 actor materialization을 실패시켜서는 안 된다(MUST NOT).

#### Scenario: embedded avatar와 header projection

- **WHEN** 원격 actor가 각각 정확히 하나의 HTTP(S) URL을 가진 embedded `icon`과 `image`를 제공한다
- **THEN** 시스템은 `icon`을 avatar 후보로, `image`를 header 후보로 투영한다
- **AND** 각 후보의 canonical URL, nullable Media Type과 nullable name을 보존한다
- **AND** 표현 metadata나 image byte를 위한 추가 network fetch를 수행하지 않는다

#### Scenario: 지원하지 않는 표현 격리

- **WHEN** actor의 `icon` 또는 `image`가 IRI-only이거나 URL이 없거나 둘 이상이거나 HTTP(S)가 아니다
- **THEN** 시스템은 해당 Profile 표현을 없는 것으로 처리한다
- **AND** 나머지 Profile scalar와 ActivityPub actor endpoint materialization은 계속한다
- **AND** 표현을 해석하기 위한 추가 network fetch를 수행하지 않는다

### Requirement: 원격 Profile Media 저장과 동기화

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, PROD-625. 시스템은 유효한 원격 actor avatar/header 후보를 원본 Remote Profile 소유의 Ready Remote Media로 등록하고 각각 `AVATAR`/`HEADER` ProfileMedia 관계로 연결해야 한다(MUST). 최초 actor lookup, stale refresh와 검증된 inbound `Update(Actor)`는 Profile scalar, ActivityPub actor metadata와 Profile 표현을 같은 transaction의 동일한 동기화 경계에서 반영해야 한다(MUST).

#### Scenario: 최초 Profile 표현 materialization

- **WHEN** 처음 materialize하는 원격 actor가 유효한 avatar와 header 후보를 제공한다
- **THEN** 시스템은 원본 Remote Profile 소유의 `REMOTE + READY` Media를 각 후보에 대해 생성한다
- **AND** avatar Media를 `AVATAR`, header Media를 `HEADER` ProfileMedia 관계로 연결한다
- **AND** 기존 GraphQL `Profile.avatar`와 `Profile.header`에서 각 Media를 조회할 수 있다

#### Scenario: 같은 URL의 avatar와 header 분리

- **WHEN** 같은 Remote Profile의 avatar와 header가 같은 canonical URL을 사용한다
- **THEN** 시스템은 kind별로 별도 Media identity와 ProfileMedia 관계를 저장한다
- **AND** avatar와 header의 nullable Media Type과 Alt Text를 서로 덮어쓰지 않고 보존한다

#### Scenario: 같은 kind의 동일 표현 refresh

- **WHEN** 같은 kind의 현재 ProfileMedia 관계가 refresh에서도 같은 canonical URL을 가리킨다
- **THEN** 시스템은 현재 관계가 가리키는 Media identity를 유지하고 최신 nullable Media Type과 Alt Text를 반영한다
- **AND** URL이 같은 다른 Media를 검색하거나 재사용하지 않는다

#### Scenario: refresh 표현 교체와 제거

- **WHEN** stale refresh 또는 inbound `Update(Actor)`의 유효한 표현 URL이 기존 관계와 달라진다
- **THEN** 시스템은 해당 kind의 ProfileMedia 관계를 새 Ready Remote Media로 교체한다
- **AND** 원격 actor에서 해당 표현이 사라지거나 지원되지 않으면 해당 kind 관계를 제거한다
- **AND** 더 이상 참조하지 않는 기존 Remote Media를 이 동기화 행동에서 물리 삭제하지 않는다

#### Scenario: actor와 표현의 원자적 갱신

- **WHEN** Profile scalar, ActivityPub actor metadata, Media 또는 ProfileMedia 저장 중 하나가 실패한다
- **THEN** 시스템은 해당 actor materialization의 모든 변경을 rollback한다
- **AND** 이전에 저장된 Profile과 표현 관계를 유지한다
