## ADDED Requirements

### Requirement: Ordered additive pin collection

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-809`

시스템은 Profile 고정 관계와 API projection을 ordered 0..N collection으로 제공해야 한다(MUST). Local pin은 기존 관계를
삭제하지 않고 ordered set에 추가해야 하며(MUST), unpin은 지정한 Post 관계만 제거해야 한다(MUST). 현재 Local first-party
frontend는 server-authoritative order의 첫 visible pinned Post만 관리·렌더하며, 이 rollout 정책은 저장·API cardinality의
영구 제한이 아니다. 서버는 새 pin에 한 위치를 원자적으로 부여하고 기존 pin의 상대 순서를 보존해야 하며(MUST), 명시적인
pin·unpin·UI slot replacement가 없으면 같은 authoritative order를 반환해야 한다(MUST). 새 pin의 앞·뒤 배치와 별도 재정렬
UX는 이 계약에서 고정하지 않는다.
고정 대상은 해당 Local Profile이 작성한
Active이며 Current Content가 있는 Post·Reply·Quote 중 Public, Unlisted 또는 Followers Only인 Post여야 한다(MUST).
Mentioned Profiles Post, Content 없는 pure Repost와 다른 Profile이 작성한 Post는 고정할 수 없어야 한다(MUST NOT).

#### Scenario: Pin an eligible Local Post

- **WHEN** Profile Owner가 현재 Local Profile이 작성한 Active Content Post·Reply·Quote를 고정하고 Post Visibility가
  Public, Unlisted 또는 Followers Only다
- **THEN** 시스템은 해당 Post를 Local Profile의 server-authoritative ordered pin collection에 추가한다
- **AND** 같은 Profile의 기존 pinned Post 관계는 유지한다
- **AND** 기존 pinned Post의 상대 순서는 바뀌지 않는다

#### Scenario: Keep the authoritative order stable

- **WHEN** pin collection 관계를 바꾸는 성공 mutation 없이 같은 Local Profile pin API를 다시 조회한다
- **THEN** 서버는 같은 pinned Post 순서를 반환한다
- **AND** 조회나 idempotent no-op은 collection을 재정렬하지 않는다

#### Scenario: Reject an ineligible Local Post

- **WHEN** 요청 대상이 Mentioned Profiles Post, Content 없는 pure Repost, 다른 Profile 작성 Post, inactive Post 또는
  지원하지 않는 Visibility다
- **THEN** 시스템은 고정 관계를 만들거나 현재 pinned Post를 변경하지 않는다

### Requirement: Atomic replacement with expected-current protection

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/design/post-action-bar.md`, `PROD-809`

현재 Local first-party UI가 관리하는 첫 visible pin을 교체할 때는 기존 canonical ModalSheet의 confirmation content 교체 후
수행해야 하며(MUST), 서버는 해당 UI slot mutation이 적용되는 transaction 안에서 호출자가 확인한 현재 pinned Post 기대값을
검증해야 한다(MUST). 서버는 같은 transaction에서 일반 pin과 동일한 Local Profile의 Active/Normal 상태, 대상의 동일 작성자,
Active Current Content와 Public·Unlisted·Followers Only 자격을 재검증해야 하며(MUST), Mentioned Profiles, Content 없는 pure
Repost와 다른 Profile 작성 Post로 교체해서는 안 된다(MUST NOT). 이 정책은 ordered pin collection의 다른 항목을 삭제하거나 API cardinality를 제한해서는 안 된다(MUST NOT).
교체 대상이 collection의 다른 위치에 이미 pinned면 서버는 해당 관계를 current slot으로 이동하고 기존 current 관계를 제거해야
하며(MUST), 나머지 관계의 상대 순서를 보존하고 중복 관계를 만들어서는 안 된다(MUST NOT).
기대값이
현재 상태와 다르면 stale confirmation이 새 pinned Post를 제거하거나 교체해서는 안 된다(MUST NOT). 이 stale/conflict
결과는 idempotent success와 구별할 수 있는 결과여야 하지만 내부 GraphQL/HTTP shape를 고정하지 않는다.

#### Scenario: Replace the current Local pin after confirmation

- **WHEN** Owner가 다른 eligible Post를 선택하고 기존 ModalSheet 교체 확인을 완료하며, 확인 당시의 current pinned Post
  기대값이 아직 일치한다
- **THEN** 시스템은 현재 UI slot에 해당하는 기존 pinned 관계를 새 Post로 원자적으로 교체한다
- **AND** 그 외 ordered pinned 관계는 보존한다
- **AND** 중간 상태를 성공 결과로 노출하지 않는다

#### Scenario: Move an already pinned replacement target into the current slot

- **WHEN** ordered pin collection이 `[A, C, B]`이고 current `A`의 expected value가 일치한 상태에서 이미 pinned인 `B`로 교체한다
- **THEN** 시스템은 `B`를 current slot으로 이동하고 `A` 관계를 제거해 collection을 `[B, C]`로 원자적으로 저장한다
- **AND** `B`의 중복 관계를 만들지 않고 나머지 `C`의 상대 순서를 보존한다

#### Scenario: Preserve a newer pin after stale confirmation

- **WHEN** 교체 확인이 열린 동안 다른 요청이 current pinned Post를 변경한 뒤 이전 확인 요청이 도착한다
- **THEN** 시스템은 기대값 불일치로 저장 상태를 변경하지 않고 stale/conflict 결과를 반환한다
- **AND** 현재 pinned Post를 제거하거나 이전 대상과 교체하지 않는다

#### Scenario: Reject an ineligible replacement target

- **WHEN** current pin 교체 대상이나 Local Profile 상태가 일반 pin 자격을 통과하지 않는다
- **THEN** 시스템은 current pin과 다른 ordered pinned 관계를 변경하지 않는다
- **AND** confirmation과 expected-current 일치만으로 자격 검증을 우회하지 않는다

### Requirement: Idempotent pin and unpin normalization

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-809`

시스템은 현재와 동일한 Post를 다시 고정하는 요청과 이미 없는 Post의 해제 요청을 성공 가능한 안전한 idempotent no-op으로
정규화해야 한다(MUST). unpin은 지정한 Post만 제거하고 다른 pinned Post를 잘못 제거해서는 안 된다(MUST NOT). distinguishable
stale/conflict 결과는 현재 UI slot replacement의 expected-current 불일치에만 적용하며, 해당 replacement는 저장 상태를 변경해서는
안 된다(MUST NOT).

#### Scenario: Re-pin the already pinned Post

- **WHEN** 대상 Post가 이미 Local Profile의 ordered pinned collection에 있다
- **THEN** 시스템은 저장된 관계와 다른 Post를 변경하지 않고 안전한 no-op 결과를 반환한다

#### Scenario: Unpin an already absent or different Post

- **WHEN** 요청 대상 Post가 이미 해제됐다
- **THEN** 시스템은 어떤 pinned 관계도 제거하지 않고 안전한 no-op 결과를 반환한다

#### Scenario: Unpin only the requested Post

- **WHEN** 요청 대상 Post가 Local Profile의 ordered pinned collection에 있고 다른 pinned Post도 있다
- **THEN** 시스템은 요청 대상 관계만 제거한다
- **AND** 다른 pinned Post 관계와 server-authoritative order를 보존한다

### Requirement: Pin lifecycle does not block a new Local pin

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Local pinned Post가 Tombstone, unavailable, author eligibility 상실 또는 Visibility 상실 상태가 되면 시스템은 이를
제품상 visible pin으로 간주해서는 안 되며(MUST NOT), 새 eligible Post의 pin을 막아서도 안 된다(MUST NOT). 물리 관계
cleanup은 기존 lifecycle 구현 선택으로 둔다. Profile이 deactivated, suspended 또는 unavailable이면 pin mutation을 거부해야
한다(MUST).

#### Scenario: Add a new pin after an existing pin loses eligibility

- **WHEN** Local Profile의 기존 pinned Post가 Tombstone, unavailable, 작성자 자격 상실 또는 Visibility 자격 상실 상태가
  된 뒤 Owner가 새 eligible Post를 고정한다
- **THEN** 시스템은 기존 Post를 제품상 visible pin으로 취급하지 않고 새 Post를 ordered pin collection에 추가한다
- **AND** 물리 cleanup 방식은 이 결과를 바꾸지 않는다

#### Scenario: Apply existing Profile state rules

- **WHEN** Profile이 deactivated, suspended 또는 unavailable 상태에서 pin mutation을 요청한다
- **THEN** 시스템은 pin mutation을 거부한다
- **AND** 이 change는 Profile unavailable 상태를 우회하는 별도 권한을 만들지 않는다
