## ADDED Requirements

### Requirement: Outbound Actor Featured advertisement and authorization

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-809`

Local Actor는 canonical ActivityPub Profile 표현에 `featured` URI를 광고해야 한다(MUST). Featured collection은 기존
Local Note projection과 Note 역참조 authorization을 재사용해야 하며(MUST). Public와 Unlisted pinned Post는 공개
collection membership과 Note를 제공하고, Followers Only pinned Post는 Author 또는 established Follower의 signed fetch에만
collection membership과 Note를 제공해야 한다(MUST). Mentioned Profiles Post(ActivityPub Direct projection)는 제공해서는
안 된다(MUST NOT).

#### Scenario: Advertise and expose Public or Unlisted pinned Posts

- **WHEN** Local Actor 표현과 Featured collection을 공개 요청자가 조회한다
- **THEN** Actor 표현은 `featured` URI를 포함한다
- **AND** Public·Unlisted pinned Post가 기존 Local Note projection으로 collection 순서에 맞게 제공된다

#### Scenario: Keep Featured Note attribution bound to the advertising Actor

- **WHEN** Featured collection item이 Note로 materialize된다
- **THEN** Note의 canonical `attributedTo`가 Featured collection을 광고하는 Actor의 canonical URI와 정확히 일치할 때만
  membership과 Note를 제공한다
- **AND** 다른 Actor를 가리키는 Note는 collection item이더라도 제공하지 않는다

#### Scenario: Authorize Followers Only Featured membership

- **WHEN** Author 또는 established Follower가 유효한 signed fetch로 Followers Only Featured collection을 요청한다
- **THEN** 요청 주체가 허용된 경우에만 collection membership과 Note가 제공된다
- **AND** 인증되지 않은 요청·식별되지 않은 요청·비팔로워 요청에는 Post가 없는 것처럼 응답한다

#### Scenario: Do not expose Mentioned Profiles or private existence

- **WHEN** Featured collection에 Mentioned Profiles Post(ActivityPub Direct projection) 또는 허용되지 않은 Followers Only
  Post가 포함될 수 있는 상태다
- **THEN** 시스템은 해당 Post를 collection membership, count 또는 Note로 제공하지 않는다
- **AND** URI와 오류 응답으로 비공개 Post의 존재를 추론할 수 있게 하지 않는다

### Requirement: Inbound Featured collection verification and sync

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-809`

시스템은 Remote Actor가 광고한 Featured collection을 page traversal로 동기화해야 한다(MUST). Remote Profile 등록, stale
refresh와 검증된 inbound `Update(Actor/Person)`에서 actor가 광고한 `featured` URI가 있으면 이 sync를 production path에서
실행하거나 예약해야 한다(MUST). Active Local Profile과 Remote Profile 사이의 Follow Relationship이 새로 성립할 때도 저장된
검증 표현이 광고한 `featured` URI의 sync를 해당 Local Profile identity로 실행하거나 예약해야 한다(MUST). established Follow를
보존한 Local follower identity가 Profile 재활성화 또는 정지 해제로 다시 Active/Normal이 될 때도 해당 identity로 sync를
실행하거나 예약해야 한다(MUST). 상위 Profile, Follow 또는 Profile 상태 전이 결과의 성공 여부는 sync 완료·성공에 의존해서는 안 되며(MUST NOT), sync
완료 시간 SLA는 정의하지 않는다. Public/Unlisted 항목은 기존 공개 fetch와 remote Note 검증을 적용해야 한다(MUST).
각 Featured Note의 canonical `attributedTo`는 collection을 광고하는 Remote Actor의 canonical URI와 정확히 일치해야 한다(MUST).
Followers Only 항목은 한 sync 시도 동안 같은 Active local follower identity로 Featured collection의 모든 page와 각 Note
역참조를 authenticated fetch한 뒤 author, audience와 established Follow 관계를 검증해야 한다(MUST). 각 시도는 취소할 수
있어야 하고(MUST), next page 순환을 검출하며(MUST), 구현이 정한 page·item·byte·시간 예산 안에서 수행해야 한다(MUST).
성공한 authoritative sync만 Remote Profile의 ordered pinned set을 교체해야 하며(MUST), fetch·parse·검증·취소·순환 또는
예산 초과 실패 시 마지막 성공 상태를 보존해야 한다(MUST). Featured sync 실패는 유효한 Remote Profile
등록·refresh·Update 결과를 되돌리거나 실패시켜서는 안 된다(MUST NOT).
실패는 관측·재시도할 수 있어야 하며(MUST), 실패·부분·취소된 시도는 last-success snapshot을 유지하고 이후 성공한 retry만
snapshot을 원자적으로 교체해야 한다(MUST). retry timing·backoff·횟수·SLA는
이 계약에서 고정하지 않는다. 각 trigger는 Remote Profile별 current sync generation 또는 동등한 최신성 token을 갱신해야
하며(MUST), 완료 시점에 current인 시도만 snapshot을 교체해야 한다(MUST). 더 최신 trigger 뒤에 완료된 이전 시도의 성공
결과는 snapshot에 반영해서는 안 된다(MUST NOT).

#### Scenario: Sync a verified remote Featured collection in order

- **WHEN** Remote Profile 등록·stale refresh 또는 검증된 inbound `Update(Actor/Person)`가 `featured` URI를 광고하고 public
  fetch 또는 한 sync 시도 동안 같은 Active local follower identity를 사용한 page traversal과 Note 역참조 검증이 성공한다
- **THEN** 시스템은 지원·검증된 pinned Post 전체를 원격 collection 순서로 Remote Profile에 저장·표시한다
- **AND** Remote Profile에는 Local first-visible UI 제한을 적용하지 않는다

#### Scenario: Reject a Featured Note attributed to another Actor

- **WHEN** Remote Actor의 Featured collection item이 다른 Actor를 canonical `attributedTo`로 가진 Note를 참조한다
- **THEN** 시스템은 해당 Note를 광고 Actor의 pinned Post로 materialize하지 않는다
- **AND** 실패한 시도는 last-success snapshot을 변경하지 않는다

#### Scenario: Verify Followers Only with an active local follower identity

- **WHEN** Remote Featured collection의 어느 page가 Followers Only Note를 포함하고 현재 Active local follower identity로
  해당 page와 Note 역참조를 authenticated fetch한다
- **THEN** 시스템은 Note의 author·audience와 established Follow 관계가 일치할 때만 해당 membership과 Note를
  materialize한다
- **AND** guest, 비팔로워 또는 unfollow된 identity에는 Post가 없는 것처럼 처리한다

#### Scenario: Re-sync Featured after an established Follow is created

- **WHEN** Active Local Profile과 `featured` URI를 광고한 Remote Profile 사이의 Follow Relationship이 새로 성립한다
- **THEN** 시스템은 해당 Local Profile identity를 사용하는 Featured sync를 실행하거나 예약한다
- **AND** 성공한 sync는 새로 조회 가능한 Followers Only item을 authoritative snapshot에 포함한다
- **AND** sync 실패는 성립한 Follow Relationship과 last-success snapshot을 변경하지 않는다

#### Scenario: Re-sync Featured when a preserved follower identity becomes active again

- **WHEN** established Follow Relationship을 보존한 Local follower identity가 Profile 재활성화 또는 정지 해제로 다시
  Active/Normal이 된다
- **THEN** 시스템은 저장된 검증 표현의 `featured` URI를 해당 Local Profile identity로 sync하도록 실행하거나 예약한다
- **AND** sync 실패는 Profile 상태 전이와 last-success snapshot을 변경하지 않는다

#### Scenario: Preserve the last successful set after sync failure

- **WHEN** Featured collection page fetch, parse, authorization 또는 Note 검증이 authoritative sync를 완료하기 전에
  실패한다
- **THEN** 시스템은 마지막 성공한 ordered pinned set을 유지한다
- **AND** 실패한 partial page나 count를 Remote Profile의 visible pin set으로 교체하지 않는다
- **AND** 유효한 Remote Profile 등록·refresh·Update 결과는 유지한다

#### Scenario: Replace the snapshot after a successful retry

- **WHEN** 이전 Featured sync가 실패해 last-success snapshot을 유지한 뒤 retry가 전체 검증에 성공한다
- **THEN** 시스템은 성공한 retry의 ordered pinned set을 원자적으로 visible snapshot으로 교체한다
- **AND** 실패한 시도의 partial/empty 결과는 snapshot에 반영하지 않는다

#### Scenario: Discard a superseded successful sync

- **WHEN** 이전 trigger의 Featured sync보다 더 최신 trigger의 sync가 먼저 성공해 snapshot을 교체한 뒤 이전 시도가 성공한다
- **THEN** 시스템은 이전 시도의 결과를 폐기하고 최신 trigger가 교체한 snapshot을 유지한다
- **AND** 시도 완료 순서가 원격 표현의 최신성 순서를 뒤집지 않는다

#### Scenario: Keep the parent Profile outcome independent from Featured sync

- **WHEN** 유효한 Remote Profile 등록·stale refresh·inbound Update 또는 established Follow 성립이 Featured sync를 실행하거나 예약한다
- **THEN** 시스템은 Featured sync의 완료 또는 성공을 상위 Profile 또는 Follow 결과의 성공 조건으로 사용하지 않는다
- **AND** sync 완료까지의 고정 시간 상한을 요구하지 않는다

#### Scenario: Stop a bounded traversal without replacing the snapshot

- **WHEN** Featured collection traversal이 취소되거나 next page 순환을 발견하거나 구현이 정한 자원 예산을 초과한다
- **THEN** 시스템은 해당 시도를 실패로 처리하고 추가 traversal을 중단한다
- **AND** 마지막 성공한 ordered pinned set과 유효한 상위 Profile 결과를 유지한다

#### Scenario: Clear pins when a verified remote representation removes Featured

- **WHEN** 성공적으로 검증된 Remote Profile refresh 또는 Update가 더 이상 `featured` URI를 광고하지 않는다
- **THEN** 시스템은 currentness token을 갱신해 이전 URI의 진행 중인 sync와 예약된 retry를 무효화한다
- **AND** Remote Profile의 ordered pinned set을 authoritative empty set으로 교체한다
- **AND** 무효화된 이전 시도가 나중에 성공해도 empty snapshot을 덮지 않는다
- **AND** 원격 Profile의 다른 유효한 표현 갱신은 유지한다

### Requirement: Featured lifecycle and Profile Update delivery

The system MUST satisfy this contract.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`

Remote unpin, Delete/Tombstone 또는 visibility·author eligibility 상실은 다음 성공 sync나 기존 lifecycle에서 Remote
Profile의 visible pinned set에서 제거해야 한다(MUST). Local pin/unpin/replacement commit 뒤에는 기존 Profile Update(Person)
delivery lifecycle을 재사용해 `featured` 표현을 갱신해야 하며(MUST), 연속된 commit은 최신 current representation
delivery로 병합할 수 있다. commit별 1:1 delivery나 완료 시간 SLA를 요구하지 않는다. delivery 실패가 이미 commit된 Local
pin 상태를 되돌려서는 안 된다(MUST NOT).

#### Scenario: Remove a remote pin after authoritative change

- **WHEN** 다음 성공 sync에서 Remote Actor가 기존 item을 제거하거나 해당 Post가 Delete/Tombstone·visibility·author
  eligibility 상실로 검증되지 않는다
- **THEN** 시스템은 해당 Post를 Remote Profile의 visible ordered pinned set에서 제거한다
- **AND** 남은 item의 원격 순서를 보존한다

#### Scenario: Reuse Profile Update delivery after local commit

- **WHEN** Local Profile pin, unpin 또는 replacement transaction이 commit된다
- **THEN** 시스템은 기존 Profile Update(Person) delivery lifecycle을 사용해 Actor의 Featured 표현을 갱신한다
- **AND** 여러 commit은 lifecycle이 처리할 최신 current representation delivery로 병합할 수 있다
- **AND** delivery 실패가 Local Profile의 이미 commit된 pin 관계를 변경하지 않는다
