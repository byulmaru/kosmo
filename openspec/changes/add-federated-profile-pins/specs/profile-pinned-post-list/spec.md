## ADDED Requirements

### Requirement: Profile list pinned-first ordering

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Profile Post List는 조회 가능한 pinned Post를 먼저 고정 순서(Local 0..1, Remote는 원격 collection 순서)로 표시해야
한다(MUST). Local Profile은 0..1개의 단일 current pin을, Remote Profile은 성공적으로 검증·동기화된 Featured collection의
전체 지원 pinned Post를 표시해야 한다(MUST).
Pinned segment에는 Reply Parent가 있는 Reply와 Quote도 포함해야 하며(MUST), Profile의 일반 Post는 pinned segment
뒤에 기존 chronology로 이어야 한다(MUST).

#### Scenario: Show Local pinned Post before ordinary chronology

- **WHEN** 조회자가 pinned Post와 일반 eligible Post가 있는 Local Profile 목록을 연다
- **THEN** visible pinned Post가 목록의 첫 segment에 단 한 번 표시된다
- **AND** 나머지 일반 Post는 기존 chronology로 pinned segment 뒤에 표시된다

#### Scenario: Show Remote Featured posts in remote order

- **WHEN** 조회자가 성공한 authoritative sync로 저장된 Remote Profile Featured collection을 연다
- **THEN** 조회 가능한 지원 pinned Post 전체가 원격 collection 순서대로 첫 segment에 표시된다
- **AND** Remote Profile에 Local의 최대 1개 정책을 적용하지 않는다

#### Scenario: Include a pinned Reply or Quote

- **WHEN** Profile이 작성한 Reply 또는 Reply Parent가 있는 Quote가 유효한 pinned Post다
- **THEN** 해당 Post는 일반 Profile 목록에서 제외되는 Reply 규칙과 관계없이 pinned segment에 표시된다

### Requirement: Pinned visibility and lifecycle filtering

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Pinned segment와 일반 segment에는 기존 Post Visibility, Post Eligibility, Profile/Post lifecycle, Profile Block, Profile
Domain Block, Domain Limit과 Instance availability 정책을 동일하게 적용해야 한다(MUST). Profile이 deactivated,
suspended 또는 unavailable이거나 Post가 Tombstone·unavailable·작성자 또는 visibility eligibility 상실 상태면 해당
Post를 목록에 표시해서는 안 된다(MUST NOT). Local current pin이 이 상태가 되면 제품상 current pin으로 간주하지 않아
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

- **WHEN** Local current pin이 Tombstone·unavailable·author 또는 visibility eligibility 상실 상태가 된 뒤 Owner가 새
  eligible Post를 고정한다
- **THEN** 시스템은 이전 Post를 제품상 current pin으로 간주하지 않고 새 Post를 pinned segment에 표시한다
- **AND** 물리 cleanup 방식은 목록의 이 결과를 바꾸지 않는다

### Requirement: Server-owned combined pagination

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-809`

Profile 목록의 pinned-first segment와 일반 chronology segment를 결합한 순서, cursor와 page limit은 서버가 관찰 가능한
단일 목록 계약으로 소유해야 한다(MUST). 일반 segment는 pinned Post를 cursor와 page limit 적용 전에 제외해야 하며
(MUST), 클라이언트는 현재 단일 PostList/Relay pagination 결과를 임의로 concat해서는 안 된다(MUST NOT). Home, Local,
Hashtag 목록의 순서와 후보 정책은 이 변경으로 바뀌지 않아야 한다(MUST NOT).

#### Scenario: Do not duplicate pinned Posts across pages

- **WHEN** Profile 목록이 pinned-first 결과를 여러 cursor page로 요청한다
- **THEN** 서버는 pinned Post를 일반 segment에서 먼저 제외한 뒤 page limit과 cursor를 계산한다
- **AND** 모든 page를 합쳐도 pinned Post가 중복되거나 eligible 일반 Post가 누락되지 않는다

#### Scenario: Keep other Post List types unchanged

- **WHEN** 조회자가 Home, Local 또는 Hashtag Post List를 요청한다
- **THEN** 시스템은 기존 해당 목록의 순서와 후보 정책을 사용한다
- **AND** Profile pinned-first ordering을 다른 목록에 적용하지 않는다
