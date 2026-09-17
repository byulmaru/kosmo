## ADDED Requirements

### Requirement: Profile list pinned-first ordering

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Profile Post List 서버/API는 저장·API의 조회 가능한 pinned Post를 server-authoritative ordered 0..N collection으로 제공해야
한다(MUST). 현재 Local first-party UI는 이 순서의 첫 visible pinned Post만 pinned segment와 고정 표시로 렌더해야 하며(MUST),
나머지 조회 가능한 Local pin은 Reply·Quote를 포함해 기존 chronology 위치에 일반 Post로 한 번 표시해야 한다(MUST). Remote
Profile UI는 성공적으로 검증·동기화된 Featured collection의 전체 지원 pinned Post를 원격 순서의 pinned segment로 표시해야
한다(MUST). Remote inbound에는 Local의 first-visible UI 제한을 적용하지 않는다(MUST NOT).
서버는 pin 관계가 바뀌지 않는 동안 같은 authoritative order를 유지해야 하며(MUST), visibility filtering은 남은 visible
항목의 상대 순서를 바꿔서는 안 된다(MUST NOT).
실제 pinned segment 대상(Local first visible pin, Remote visible pin 전체)에는 Reply Parent가 있는 Reply와 Quote도 포함해야
하며(MUST), Profile의 일반 Post는 pinned segment 뒤에 기존 chronology로 이어야 한다(MUST).

#### Scenario: Show Local pinned Post before ordinary chronology

- **WHEN** 조회자가 pinned Post와 일반 eligible Post가 있는 Local Profile 목록을 연다
- **THEN** server-authoritative order에서 첫 visible pinned Post가 목록의 첫 segment에 표시된다
- **AND** 추가 Local pin을 포함한 나머지 일반 Post는 기존 chronology 위치로 pinned segment 뒤에 표시된다

#### Scenario: Keep additional Local pins available to the API

- **WHEN** Local Profile의 ordered pin collection에 첫 항목 외에도 유효한 pinned Post가 있다
- **THEN** 서버·API는 추가 항목을 ordered collection에 보존한다
- **AND** 현재 Local first-party UI는 첫 visible 항목만 pinned 상태로 렌더하고 추가 항목은 기존 chronology 위치에 일반 Post로 표시한다
- **AND** 반복 조회와 visibility filtering은 visible 항목의 상대 순서를 유지한다

#### Scenario: Show Remote Featured posts in remote order

- **WHEN** 조회자가 성공한 authoritative sync로 저장된 Remote Profile Featured collection을 연다
- **THEN** 조회 가능한 지원 pinned Post 전체가 원격 collection 순서대로 첫 segment에 표시된다
- **AND** Remote Profile에 Local first-visible UI 제한을 적용하지 않는다

#### Scenario: Include a pinned Reply or Quote

- **WHEN** Profile이 작성한 Reply 또는 Reply Parent가 있는 Quote가 유효한 pinned Post다
- **THEN** pinned segment 대상이면 일반 Profile 목록의 Reply 제외 규칙과 관계없이 pinned segment에 표시된다
- **AND** 현재 Local UI의 추가 pin이면 같은 Reply 제외 규칙을 적용하지 않고 기존 chronology 위치에 일반 Post로 표시된다

### Requirement: Pinned visibility and lifecycle filtering

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Pinned segment와 일반 segment에는 기존 Post Visibility, Post Eligibility, Profile/Post lifecycle, Profile Block, Profile
Domain Block, Domain Limit과 Instance availability 정책을 동일하게 적용해야 한다(MUST). Profile이 deactivated,
suspended 또는 unavailable이거나 Post가 Tombstone·unavailable·작성자 또는 visibility eligibility 상실 상태면 해당
Post를 목록에 표시해서는 안 된다(MUST NOT). Local pinned Post가 이 상태가 되면 제품상 visible pin으로 간주하지 않아
새 pin을 막지 않아야 하며(MUST), private pinned Post의 존재를 count, URI 또는 목록 오류로 노출해서는 안 된다(MUST NOT).

#### Scenario: Hide a pinned Post denied by existing visibility

- **WHEN** 조회자가 Followers Only pinned Post의 Author도 established Follower도 아니거나 guest다
- **THEN** 시스템은 해당 pinned Post를 목록과 pinned count에서 제외한다
- **AND** Post의 존재를 count, URI 또는 오류로 노출하지 않는다

#### Scenario: Remove an unavailable Profile or Post from display

- **WHEN** Profile이 deactivated·suspended·unavailable이 되거나 pinned Post가 Tombstone·unavailable·author
  eligibility 상실 상태가 된다
- **THEN** 시스템은 해당 pinned Post를 Profile 목록 노출에서 제거한다
- **AND** 관계 cleanup 여부와 시점은 기존 lifecycle 또는 성공한 remote sync 규칙을 따른다

#### Scenario: Do not block a replacement after pin eligibility loss

- **WHEN** Local pinned Post가 Tombstone·unavailable·author 또는 visibility eligibility 상실 상태가 된 뒤 Owner가 새
  eligible Post를 고정한다
- **THEN** 시스템은 이전 Post를 제품상 visible pin으로 간주하지 않고 새 Post를 pinned segment에 표시한다
- **AND** 물리 cleanup 방식은 목록의 이 결과를 바꾸지 않는다

### Requirement: Server-owned combined pagination

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-809`

Profile 목록의 pinned-first segment와 일반 chronology segment를 결합한 순서, cursor와 page limit은 서버가 관찰 가능한
단일 목록 계약으로 소유해야 한다(MUST). 일반 segment는 실제 pinned segment에 표시한 Post를 cursor와 page limit 적용 전에 제외해야 하며
(MUST), 클라이언트는 현재 단일 PostList/Relay pagination 결과를 임의로 concat해서는 안 된다(MUST NOT). Home, Local,
Hashtag 목록의 순서와 후보 정책은 이 변경으로 바뀌지 않아야 한다(MUST NOT).

#### Scenario: Do not duplicate pinned Posts across pages

- **WHEN** Profile 목록이 pinned-first 결과를 여러 cursor page로 요청한다
- **THEN** 서버는 실제 pinned segment에 표시한 Post를 일반 segment에서 먼저 제외한 뒤 page limit과 cursor를 계산한다
- **AND** 모든 page를 합쳐도 pinned Post가 중복되거나 eligible 일반 Post가 누락되지 않는다

#### Scenario: Keep other Post List types unchanged

- **WHEN** 조회자가 Home, Local 또는 Hashtag Post List를 요청한다
- **THEN** 시스템은 기존 해당 목록의 순서와 후보 정책을 사용한다
- **AND** Profile pinned-first ordering을 다른 목록에 적용하지 않는다
