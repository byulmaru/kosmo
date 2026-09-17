## 1. PROD-973 Local pin domain and atomic mutation

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `PROD-973`, parent integration: `PROD-809`

**Deliverable**

Local pin API가 승인된 Post를 ordered set에 추가하고 지정한 Post만 해제하며, current first-party UI slot 교체의 stale confirmation이
다른 pin을 훼손하지 않는다.

**Guardrails**

- Active이며 Current Content가 있는 자기 작성 Post·Reply·Quote와 Public·Unlisted·Followers Only만 허용한다.
- Mentioned Profiles, Content 없는 pure Repost와 타인 작성 Post는 거부한다.
- 기본 pin은 기존 관계를 지우지 않고 추가하며 unpin은 지정한 관계만 제거한다.
- 새 pin은 기존 pin의 상대 순서를 보존한 한 위치에 저장하고 관계 변경·idempotent no-op이 없으면 order를 유지한다.
- 현재 first-party UI slot 교체만 ModalSheet 확인 후 current expected value를 검증한 원자적 결과여야 한다.
- replacement expected-current 불일치는 저장 상태를 보존한 stale/conflict 결과여야 한다.
- 동일 pin과 이미 없는 target unpin은 idempotent no-op이어야 하며 다른 pin을 제거하지 않는다.

**Verification**

- DB/core/API 테스트로 권한·자격, additive ordered collection projection, 지정 항목 unpin, current UI slot atomic replacement, stale concurrent request, same-pin/unpin no-op을
  입력·결과·저장 상태로 검증한다. replacement stale/conflict 결과가 idempotent success와 구별되고 저장 상태를 보존하는지도 검증한다.

- [ ] 1.1 Local Profile pin/unpin의 eligibility, Owner 권한과 ordered add/remove semantics를 구현한다.
- [ ] 1.2 current first-party UI slot 교체에서만 expected value를 검증하고 원자성·idempotent no-op을 보장한다.
- [ ] 1.3 current UI slot replacement 확인과 실패·동시성 결과를 API 계약에 연결하고 focused DB/core 테스트를 통과시킨다.

## 2. PROD-973 Profile pinned-first list and pagination

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `PROD-973`, parent integration: `PROD-809`

**Deliverable**

Profile 목록이 visible pinned Post를 server-authoritative ordered collection 순서로 먼저 표시하고, Local UI는 첫 visible 항목을 렌더하며
Remote는 전체 collection을 유지한 채 일반 chronology와 결합한 서버 cursor/page
결과에서 중복·누락을 만들지 않는다.

**Guardrails**

- pinned Reply·Quote는 pinned segment에 포함한다.
- 일반 segment는 pinned Post를 cursor/page limit 전에 제외한다.
- 기존 Visibility, Eligibility, lifecycle, block/domain 정책을 pinned segment에도 적용한다.
- Home·Local·Hashtag 순서는 변경하지 않고 client concat으로 두 connection을 조합하지 않는다.
- 내부 GraphQL field shape·함수명·DB shape를 이 계약만으로 고정하지 않는다.

**Verification**

- API/Relay 테스트로 Local·Remote ordering, pinned Reply/Quote, page boundary, no duplicate/omission과 hidden/unavailable
  filtering을 검증한다.
- Home·Local·Hashtag focused regression으로 기존 순서·후보 정책 불변을 검증한다.

- [ ] 2.1 Profile 목록의 pinned-first combined ordering과 Local·Remote ordered set 소비를 구현한다.
- [ ] 2.2 pinned Post를 일반 후보에서 cursor/page limit 전에 제외하는 서버 pagination 계약을 구현한다.
- [ ] 2.3 Profile visibility·block/domain·lifecycle filtering과 Relay/API focused regression을 통과시킨다.

## 3. PROD-974 Outbound ActivityPub Featured projection

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/profile.md`
- `PROD-974`, parent integration: `PROD-809`

**Deliverable**

Local Actor가 `featured` URI를 광고하고, 기존 Local Note projection·authorization으로 공개 및 Followers Only
collection을 제공하며 pin commit 뒤 Profile Update(Person) lifecycle을 재사용한다.

**Guardrails**

- Public·Unlisted는 공개하고 Followers Only는 Author 또는 established Follower의 signed fetch만 허용한다.
- unsigned, 식별 불가, 비팔로워와 Mentioned Profiles Post(ActivityPub Direct projection)는 membership·Note·count·URI로 존재를 노출하지 않는다.
- 이미 commit된 pin은 delivery 실패로 되돌리지 않는다.
- 기존 Note projection과 Profile Update(Person) delivery lifecycle을 재사용한다.
- 연속된 commit은 최신 current representation delivery로 병합할 수 있으며 commit별 1:1 delivery나 완료 시간 SLA를
  요구하지 않는다.

**Verification**

- ActivityPub/Fedify integration으로 Actor `featured` advertisement, ordered items, Public/Unlisted fetch,
  Followers Only signed author/follower fetch와 unsigned/non-follower/Mentioned Profiles denial을 검증한다.
- pin/unpin/replacement commit 뒤 Profile Update delivery, 연속 commit의 최신 표현 반영과 delivery failure 보존을 관측한다.

- [ ] 3.1 Local Actor의 `featured` advertisement와 ordered collection projection을 구현한다.
- [ ] 3.2 기존 Note visibility authorization을 Featured membership과 Note 역참조에 연결한다.
- [ ] 3.3 Profile Update(Person) delivery lifecycle과 최신 표현 병합 허용을 federation 테스트로 검증한다.

## 4. PROD-974 Inbound Featured traversal and authoritative sync

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/profile.md`
- `PROD-974`, parent integration: `PROD-809`

**Deliverable**

Remote Actor가 광고한 Featured collection을 page traversal로 동기화하고, 검증된 ordered pin set만 교체하며 실패 시
마지막 성공 상태를 유지한다. Remote Profile 등록·stale refresh·검증된 inbound `Update(Actor/Person)`에서 advertised
`featured` URI sync가 production path에서 실행되거나 예약된다. 상위 Profile 결과의 성공 여부는 sync 완료·성공에 의존하지
않는다. Mastodon 호환 서버 기준 양방향 federation runtime으로 이 계약을 검증한다.

**Guardrails**

- Public/Unlisted는 기존 remote Note 검증을 사용한다.
- Public/Unlisted는 기존 공개 fetch를 사용할 수 있다. Followers Only는 한 sync 시도 동안 같은 Active local follower
  identity로 collection의 모든 page와 각 Note 역참조를 authenticated fetch하고 author·audience·established Follow를
  검증한다.
- Guest·비팔로워·unfollow된 identity에는 private Post나 membership 존재를 노출하지 않는다.
- fetch·parse·authorization·Note materialization 실패는 partial/empty set으로 마지막 성공 상태를 덮지 않는다.
- Featured sync 실패는 유효한 Remote Profile 등록·refresh·Update를 되돌리거나 실패시키지 않는다.
- 각 sync 시도는 취소 가능하고 next page 순환을 검출하며 구현이 정한 page·item·byte·시간 예산 안에서 수행한다.
- 취소·순환·예산 초과는 실패한 sync로 처리하고 마지막 성공 상태와 상위 Profile 결과를 유지한다.
- sync 완료 시간 SLA는 정의하지 않는다.
- 검증된 원격 표현에서 `featured` URI가 사라지면 ordered pin set을 authoritative empty로 교체한다.
- Remote unpin/Delete/Tombstone/visibility·author eligibility 상실은 다음 성공 sync 또는 기존 lifecycle에서 제거한다.

**Verification**

- Fedify integration으로 multi-page ordered sync, Public/Unlisted, Followers Only signed follower/author fetch,
  unsigned/non-follower denial, unfollow, remote unpin/Delete/Tombstone을 검증한다.
- page fetch·parse·authorization 실패에서 last-success snapshot과 visible count가 유지되는지 검증한다.
- 취소·next page 순환·자원 예산 초과에서 traversal이 중단되고 last-success snapshot이 유지되는지 검증한다.
- 같은 실패에서 유효한 상위 Remote Profile 등록·refresh·Update 결과가 유지되는지와 `featured` URI 제거 시 empty set 교체를
  검증한다.
- Mastodon 호환 서버 양방향 runtime으로 Public/Unlisted, Followers Only signed fetch, unsigned/non-follower denial,
  pin/unpin/update/sync/unfollow를 검증한다.

- [ ] 4.1 production path에서 advertised `featured` URI sync와 authenticated traversal을 구현한다.
- [ ] 4.2 Featured Note의 canonical `attributedTo`와 advertising Actor의 exact URI 일치를 검증한다.
- [ ] 4.3 Followers Only authenticated fetch에서 Active local follower identity와 author·audience·Follow 관계를 검증한다.
- [ ] 4.4 bounded authoritative sync·failure preservation·remote removal을 inbound 테스트로 검증한다.
- [ ] 4.5 retry-capable async effect/Workflow에서 실패를 관측·재시도하고 성공 retry로 snapshot을 원자 교체하는지 검증한다.

## 5. PROD-975 Profile UI, Relay and runtime verification

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/design/post-action-bar.md`
- `PROD-975`, parent integration: `PROD-809`

**Deliverable**

Profile UI가 ordered pin API를 소비하고 현재 Local first-visible 정책에 따라 첫 항목을 관리하며 Remote inbound는 전체 ordered
collection을 표시한다. Relay/cache와 Profile/Post lifecycle·moderation 정책에 맞는 visible pin cleanup을 연결하고,
Web·iOS·Android runtime과 접근성 결과를 증명한다.

**Guardrails**

- deactivated/suspended/unavailable Profile, Tombstone/unavailable Post와 block/domain policy는 기존 조회 정책으로 숨긴다.
- Local pinned Post가 Tombstone/unavailable/author 또는 visibility eligibility 상실 상태가 되면 제품상 visible pin으로 간주하지
  않고 새 pin을 막지 않으며, 물리 cleanup은 기존 lifecycle 구현에 맡긴다.
- Deactivated·Suspended·unavailable Profile의 pin mutation은 기존 Active/Normal 조건에 따라 거부한다.
- cleanup의 물리 table/FK shape는 canonical 계약으로 고정하지 않으며 기존 lifecycle·성공 sync 경계를 따른다.
- 모든 Fediverse 구현이 Featured 표시를 지원한다고 가정하지 않는다.
- 이번 스펙 PR에는 app code, fixture, snapshot, Storybook interaction과 테스트 인프라 변경을 포함하지 않는다.

**Verification**

- canonical domain validator, `openspec validate add-federated-profile-pins --strict`, 변경 파일 Prettier check와 `git diff --check`를
  스펙 PR에서 통과시킨다.
- 구현 PR에서 Web·iOS·Android runtime으로 Local first-visible 관리, Remote 전체 표시와 Profile/Post unavailable cleanup을
  검증한다.

- [ ] 5.1 ordered 0..N API를 Relay/cache에 연결하고, Local UI는 첫 visible 항목만 렌더하며 Remote inbound는 전체 collection을 표시하도록 구현한다.
- [ ] 5.2 Profile/Post lifecycle, block/domain filtering과 성공 sync 이후 visible pin cleanup을 기존 조회 경계에 연결한다.
- [ ] 5.3 Web/iOS/Android runtime에서 Local first-visible UI와 Remote 전체 표시, 접근성·pagination 결과를 검증한다.

## 6. PROD-809 Cross-slice integration and archive

**Authority / Provenance**

- `openspec/changes/add-federated-profile-pins/proposal.md`
- `PROD-809`

**Deliverable**

PROD-973·PROD-974·PROD-975의 결과를 통합하고 전체 검증 증거를 확인한 뒤 OpenSpec change를 archive한다.

**Verification**

- [ ] 6.1 세 구현 slice의 API·federation·UI/runtime 결과와 계약 불변을 통합 검증한다.
- [ ] 6.2 전체 완료 조건과 검증 증거를 Linear PROD-809에 연결하고 OpenSpec change를 archive한다.
