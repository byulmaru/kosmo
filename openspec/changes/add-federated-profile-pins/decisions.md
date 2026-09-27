## Context

이 기록은 [proposal](./proposal.md), 세 capability spec과 [design](./design.md)을 PROD-809의 승인된 canonical
계약에 맞춰 구현 가능한 경계로 정리한다. 이 문서는 제품 동작을 추가하지 않고, 이미 확정된 Local pin, Remote
Featured, Profile 목록과 federation lifecycle 선택을 추적한다.

## Decision Records

### Pin API는 ordered 0..N additive set이고 현재 Local UI는 첫 항목만 관리한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-809`
- Status: Active
- Context / Problem: 현재 first-party UI는 첫 Local pin만 관리하지만 저장·API cardinality까지 단일로 고정하면 Remote inbound
  전체 표시와 향후 Local 확장을 막는다. 기본 pin이 기존 항목을 지우거나 unpin이 다른 항목을 지우면 ordered set 계약도 깨진다.
- Decision Outcome: pin 저장·API projection은 ordered 0..N additive collection으로 두고, eligible한 자기 작성 Active Content
  Post·Reply·Quote를 pin하면 ordered set에 추가하며 unpin은 지정한 Post만 제거한다. 현재 Local first-party UI는 server-authoritative
  order의 첫 visible 항목만 렌더·관리한다. 같은 pin과 이미 없는 unpin은 idempotent success no-op이다. 임의 삽입·재정렬·current-slot
  replacement는 reorder UI 계약이 생길 때 별도 도입한다.
- Alternatives Considered: 저장·API를 Local 단일 scalar로 고정하거나 기본 pin을 replacement로 정의하는 방식은 ordered additive
  collection 계약과 달라 선택하지 않는다.
- Consequences: add/unpin mutation은 지정한 관계만 변경하고 Mentioned Profiles·pure Repost·타인 작성 Post는 저장 경계 전에
  거부해야 한다.
- Confirmation / Follow-up: 구현 PR의 DB/core/API 검증에서 additive multi-pin, 지정 항목 unpin, 동시 pin과 idempotent no-op을 증명한다.

### Remote Profile은 검증된 Featured collection의 ordered set을 보존한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`
- Status: Active
- Context / Problem: Remote actor의 Featured collection은 현재 Local first-visible UI 제한과 다른 cardinality·순서를 가지며, 실패한 inbound
  fetch가 마지막으로 확인된 결과를 덮어서는 안 된다.
- Decision Outcome: 지원·검증된 Featured item 전체를 원격 순서로 보존한다. Remote Profile 등록, stale refresh와 검증된
  inbound `Update(Actor/Person)`에서 광고된 `featured` URI가 있으면 production sync path에서 실행하거나 예약한다. 상위 Profile
  결과의 성공 여부는 sync 완료·성공에 의존하지 않고 완료 시간 SLA를 정의하지 않는다. Follow Relationship 성립이나 보존된
  follower identity의 Active/Normal 복귀만으로는 별도 sync를 시작하지 않는다. Public/Unlisted는 기존
  공개 fetch를 사용할 수 있고, Followers Only를 수신할 때는 한 sync 시도 동안 같은 Active/Normal이며 사용 가능한 Local
  Instance에 속한 local follower identity로 모든 page와 각 Note 역참조를 authenticated fetch한다. Suspended Profile 또는
  사용할 수 없는 Local Instance의 identity는 사용하지 않는다. 각 시도는 취소 가능하고 next page 순환 검출과 구현이 정한
  page·item·byte·시간 예산을 적용한다. page traversal과 항목 검증이 성공한 authoritative sync만 ordered set을 교체하고,
  실패·취소·순환·예산 초과는 마지막 성공 상태를 유지한다. unpin, Delete/Tombstone과 eligibility 상실은 성공 sync 또는 기존
  lifecycle에서 제거한다. Sync 실패는 유효한 상위 Profile 등록·refresh·Update를 실패시키지 않으며, 검증된 원격 표현에서
  `featured` URI가 사라지면 이전 URI의 진행 중인 시도와 retry가 이후 결과를 덮지 못하게 하고 authoritative empty set으로
  교체한다. 각 Note의 canonical `attributedTo`는 collection을
  광고하는 Actor의 canonical URI와 정확히 일치해야 한다. Sync 실패는 관측·재시도할 수 있어야 하며, 실패·부분·취소 시도는
  last-success snapshot을 유지하고 이후 성공한 retry만 이를 원자적으로
  교체한다. 구현은 generation/token, source revision 비교 또는 직렬화된 실행 등 현재 경계에 맞는 최신성 판별 수단을 선택하고,
  더 최신 trigger 뒤에 완료된 이전 성공 결과는 폐기한다. retry timing·backoff·횟수·SLA는 고정하지 않는다.
- Alternatives Considered: Local first-visible UI 정책을 Remote에 적용하거나 실패 시 빈 set으로 초기화하는 방식은 승인된 계약과
  안전한 visibility 보존을 위반하므로 선택하지 않는다.
- Consequences: Remote sync는 부분 page를 visible 결과로 커밋하지 않고, Note attribution은 advertising Actor와 exact match여야
  하며, Followers Only 항목에는 fetch 시점의 Active/Normal Profile, 사용 가능한 Local Instance와 established Follow 검증이 필요하다. 구체
  scheduling과 자원 예산값은 구현·운영 환경이 소유한다.
- Confirmation / Follow-up: 구현 PR의 Fedify integration과 Mastodon 호환 runtime 검증에서 ordered sync, failure preservation,
  unpin/delete/unfollow를 확인한다.

### pinned presentation은 기존 Profile chronology와 독립적이다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `PROD-809`
- Status: Active
- Context / Problem: pin 관계를 기존 Profile chronology의 후보·순서·pagination에 반영하면 고정 여부가 일반 목록 결과까지
  바꾸고, 별도 pinned presentation과 chronology의 책임이 섞인다.
- Decision Outcome: 현재 Local UI에서는 첫 visible pin만 별도 pinned segment에 두고 Remote는 visible pin 전체를 원격 순서의
  pinned segment에 둔다. 일반 Profile chronology는 pin 관계와 무관하게 기존 후보·순서·cursor·page limit을 유지한다. 따라서
  chronology 후보인 Post는 pinned segment와 원래 위치에 모두 표시될 수 있고, 추가 Local pin은 기존 chronology 자격만으로
  표시된다. Home·Local·Hashtag 순서도 유지한다.
- Alternatives Considered: pinned Post를 일반 chronology에서 제거하는 방식은 pin 관계가 기존 pagination 결과를 바꾸므로
  선택하지 않는다.
- Consequences: 구현은 pinned presentation을 별도로 제공하면서 기존 chronology query와 pagination을 변경하지 않아야 하며,
  hidden/unavailable pinned Post는 count와 URI를 포함해 노출하지 않는다.
- Confirmation / Follow-up: 구현 PR의 API/Relay 검증에서 pinned·chronology 중복 허용, 기존 Profile pagination 불변,
  visibility filtering과 다른 목록 순서 불변을 확인한다.

### 기존 Note authorization과 Profile Update delivery lifecycle을 재사용한다

- Decision Date: 2026-09-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/design/post-action-bar.md`, `PROD-809`
- Status: Active
- Context / Problem: Featured collection을 새 visibility·delivery 경계로 만들면 Local Note와 Followers Only authorization이
  분기되고 pin commit과 Actor update가 서로 다른 lifecycle을 갖게 된다.
- Decision Outcome: Featured collection membership과 Note는 기존 Local Note projection·authorization을 재사용하고, Local
  pin/unpin commit 이후 기존 Profile Update(Person) delivery lifecycle을 호출한다. 연속된 commit은 최신 current
  representation delivery로 병합할 수 있고 commit별 1:1 delivery나 완료 시간 SLA는 요구하지 않는다. 구체 file, function,
  GraphQL shape와 persistence schema는 고정하지 않는다.
- Alternatives Considered: Featured 전용 Note serializer·권한 predicate·delivery pipeline을 새로 만드는 방식은 중복된
  security 경계를 만들고 승인된 scope를 넘어가므로 선택하지 않는다.
- Consequences: 구현자는 기존 경계의 Public/Unlisted 공개, Followers Only signed fetch, Direct 비공개와 commit-after-effects
  규칙을 보존해야 하며, delivery 실패가 committed pin을 되돌리지 않는다.
- Confirmation / Follow-up: 구현 PR의 API/Fedify/runtime 검증과 Profile Update delivery 관측에서 기존 lifecycle 재사용을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### current first-visible slot expected-current replacement API

- Superseded Date: 2026-09-23
- Superseded By: 사용자 승인 및 PROD-973 계약 갱신
- Reason: production caller가 없고 reorder UI 계약이 정해지지 않아 additive pin/unpin만 유지한다. 임의 삽입·재정렬·replacement는
  해당 UI 계약이 생길 때 별도 결정한다.
