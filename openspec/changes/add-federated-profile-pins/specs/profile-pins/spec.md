## ADDED Requirements

### Requirement: Local Profile single pinned Post

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-809`

시스템은 Local Profile마다 고정 Post를 최대 하나만 유지해야 한다(MUST). 고정 대상은 해당 Local Profile이 작성한
Active이며 Current Content가 있는 Post·Reply·Quote 중 Public, Unlisted 또는 Followers Only인 Post여야 한다(MUST).
Mentioned Profiles Post, Content 없는 pure Repost와 다른 Profile이 작성한 Post는 고정할 수 없어야 한다(MUST NOT).

#### Scenario: Pin an eligible Local Post

- **WHEN** Profile Owner가 현재 Local Profile이 작성한 Active Content Post·Reply·Quote를 고정하고 Post Visibility가
  Public, Unlisted 또는 Followers Only다
- **THEN** 시스템은 해당 Post를 Local Profile의 유일한 pinned Post로 저장한다
- **AND** 같은 Local Profile에 다른 pinned Post를 동시에 유지하지 않는다

#### Scenario: Reject an ineligible Local Post

- **WHEN** 요청 대상이 Mentioned Profiles Post, Content 없는 pure Repost, 다른 Profile 작성 Post, inactive Post 또는
  지원하지 않는 Visibility다
- **THEN** 시스템은 고정 관계를 만들거나 현재 pinned Post를 변경하지 않는다

### Requirement: Atomic replacement with expected-current protection

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/design/post-action-bar.md`, `PROD-809`

Local Profile 고정 교체는 기존 canonical ModalSheet의 confirmation content 교체 후 수행해야 하며(MUST), 서버는
mutation이 적용되는 transaction 안에서 호출자가 확인한 현재 pinned Post 기대값을 검증해야 한다(MUST). 기대값이
현재 상태와 다르면 stale confirmation이 새 pinned Post를 제거하거나 교체해서는 안 된다(MUST NOT). 이 stale/conflict
결과는 idempotent success와 구별할 수 있는 결과여야 하지만 내부 GraphQL/HTTP shape를 고정하지 않는다.

#### Scenario: Replace the current Local pin after confirmation

- **WHEN** Owner가 다른 eligible Post를 선택하고 기존 ModalSheet 교체 확인을 완료하며, 확인 당시의 current pinned Post
  기대값이 아직 일치한다
- **THEN** 시스템은 기존 pinned 관계 제거와 새 pinned 관계 생성을 원자적으로 수행한다
- **AND** 중간 상태를 성공 결과로 노출하지 않는다

#### Scenario: Preserve a newer pin after stale confirmation

- **WHEN** 교체 확인이 열린 동안 다른 요청이 current pinned Post를 변경한 뒤 이전 확인 요청이 도착한다
- **THEN** 시스템은 기대값 불일치로 저장 상태를 변경하지 않고 stale/conflict 결과를 반환한다
- **AND** 현재 pinned Post를 제거하거나 이전 대상과 교체하지 않는다

### Requirement: Idempotent pin and unpin normalization

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-809`

시스템은 현재와 동일한 Post를 다시 고정하는 요청과 이미 없는 Post 또는 현재 대상과 다른 Post의 해제 요청을 성공 가능한
안전한 idempotent no-op으로 정규화해야 한다(MUST). 다른 current pin을 잘못 제거해서는 안 된다(MUST NOT). distinguishable
stale/conflict 결과는 replacement의 expected-current 불일치에만 적용하며, 해당 replacement는 저장 상태를 변경해서는 안 된다(MUST NOT).

#### Scenario: Re-pin the already pinned Post

- **WHEN** 대상 Post가 이미 Local Profile의 current pinned Post다
- **THEN** 시스템은 저장된 관계와 다른 Post를 변경하지 않고 안전한 no-op 결과를 반환한다

#### Scenario: Unpin an already absent or different Post

- **WHEN** 요청 대상이 이미 해제됐거나 current pinned Post와 다르다
- **THEN** 시스템은 어떤 pinned 관계도 제거하지 않고 안전한 no-op 결과를 반환한다

### Requirement: Pin lifecycle does not block a new Local pin

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Local current pin이 Tombstone, unavailable, author eligibility 상실 또는 Visibility 상실 상태가 되면 시스템은 이를
제품상 current pin으로 간주해서는 안 되며(MUST NOT), 새 eligible Post의 pin을 막아서도 안 된다(MUST NOT). 물리 관계
cleanup은 기존 lifecycle 구현 선택으로 둔다. Profile이 deactivated, suspended 또는 unavailable이면 pin mutation을
거부해야 한다(MUST).

#### Scenario: Replace an ineligible current pin

- **WHEN** Local Profile의 기존 pinned Post가 Tombstone, unavailable, 작성자 자격 상실 또는 Visibility 자격 상실 상태가
  된 뒤 Owner가 새 eligible Post를 고정한다
- **THEN** 시스템은 기존 Post를 제품상 current pin으로 취급하지 않고 새 Post를 current pin으로 저장한다
- **AND** 물리 cleanup 방식은 이 결과를 바꾸지 않는다

#### Scenario: Apply existing Profile state rules

- **WHEN** Profile이 deactivated, suspended 또는 unavailable 상태에서 pin mutation을 요청한다
- **THEN** 시스템은 pin mutation을 거부한다
- **AND** 이 change는 Profile unavailable 상태를 우회하는 별도 권한을 만들지 않는다
