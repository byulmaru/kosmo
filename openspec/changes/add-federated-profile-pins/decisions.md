## Context

이 기록은 [proposal](./proposal.md), 세 capability spec과 [design](./design.md)을 PROD-809의 승인된 canonical
계약에 맞춰 구현 가능한 경계로 정리한다. 이 문서는 제품 동작을 추가하지 않고, 이미 확정된 Local pin, Remote
Featured, Profile 목록과 federation lifecycle 선택을 추적한다.

## Decision Records

### Local Profile은 단일 pin과 expected-current atomic replacement를 사용한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-809`
- Status: Active
- Context / Problem: Local Profile의 최대 1개 정책에서 교체 확인이 늦게 도착하면 새 pin을 잘못 제거할 수 있다.
- Decision Outcome: eligible한 자기 작성 Active Content Post·Reply·Quote만 대상으로 하고, 교체 시 확인 당시 current pin
  기대값을 검증한 뒤 기존 관계 제거와 새 관계 생성을 원자적으로 수행한다. 같은 pin과 이미 없는/different target unpin은
  idempotent success no-op이다. expected-current 불일치는 저장 상태를 바꾸지 않고 idempotent success와 구별되는
  stale/conflict 결과를 반환한다.
- Alternatives Considered: UI confirmation만 신뢰하는 방식은 stale 요청 보호가 없으므로 선택하지 않는다. 다중 Local pin은
  canonical cardinality와 달라 선택하지 않는다.
- Consequences: mutation은 current expected value와 transaction 경계를 보존해야 하며, Mentioned Profiles·pure Repost·타인
  작성 Post는 저장 경계 전에 거부해야 한다.
- Confirmation / Follow-up: 구현 PR의 DB/core/API 검증에서 동시 replacement, stale confirmation, idempotent no-op을 증명한다.

### Remote Profile은 검증된 Featured collection의 ordered set을 보존한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-809`
- Status: Active
- Context / Problem: Remote actor의 Featured collection은 Local 단일 pin과 다른 cardinality·순서를 가지며, 실패한 inbound
  fetch가 마지막으로 확인된 결과를 덮어서는 안 된다.
- Decision Outcome: 지원·검증된 Featured item 전체를 원격 순서로 보존한다. Remote Profile 등록, stale refresh와 검증된
  inbound `Update(Actor/Person)`에서 광고된 `featured` URI가 있으면 production sync path에서 실행하거나 예약한다. 상위
  Profile 결과의 성공 여부는 sync 완료·성공에 의존하지 않고 완료 시간 SLA를 정의하지 않는다. Public/Unlisted는 기존
  공개 fetch를 사용할 수 있고, Followers Only를 수신할 때는 한 sync 시도 동안 같은 Active local follower identity로 모든
  page와 각 Note 역참조를 authenticated fetch한다. 각 시도는 취소 가능하고 next page 순환 검출과 구현이 정한
  page·item·byte·시간 예산을 적용한다. page traversal과 항목 검증이 성공한 authoritative sync만 ordered set을 교체하고,
  실패·취소·순환·예산 초과는 마지막 성공 상태를 유지한다. unpin, Delete/Tombstone과 eligibility 상실은 성공 sync 또는 기존
  lifecycle에서 제거한다. Sync 실패는 유효한 상위 Profile 등록·refresh·Update를 실패시키지 않으며, 검증된 원격 표현에서
  `featured` URI가 사라지면 authoritative empty set으로 교체한다.
- Alternatives Considered: Local single-pin 정책을 Remote에 적용하거나 실패 시 빈 set으로 초기화하는 방식은 승인된 계약과
  안전한 visibility 보존을 위반하므로 선택하지 않는다.
- Consequences: Remote sync는 부분 page를 visible 결과로 커밋하지 않고, Followers Only 항목에는 fetch 시점의 Active local
  follower identity와 established Follow 검증이 필요하다. 구체 scheduling과 자원 예산값은 구현·운영 환경이 소유한다.
- Confirmation / Follow-up: 구현 PR의 Fedify integration과 Mastodon 호환 runtime 검증에서 ordered sync, failure preservation,
  unpin/delete/unfollow를 확인한다.

### Profile 목록은 서버가 pinned-first combined cursor를 소유한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/post-list.md`, `docs/domain/objects/profile.md`, `PROD-809`
- Status: Active
- Context / Problem: Profile 목록의 pinned segment와 chronology segment를 클라이언트 concat하면 중복·누락과 cursor 경계가
  발생한다.
- Decision Outcome: 서버가 visible pinned segment를 먼저, 일반 chronology를 뒤에 결합하고 pinned Post를 일반 후보에서
  cursor/page limit 전에 제외한다. Relay/client는 단일 서버-owned pagination 결과를 소비하며 Home·Local·Hashtag 순서는
  유지한다.
- Alternatives Considered: 두 connection을 client concat하거나 pinned 결과만 별도 fetch하는 방식은 관찰 가능한 cursor
  계약을 보장하지 못하므로 선택하지 않는다.
- Consequences: 구현은 내부 GraphQL shape를 고정하지 않은 채 combined ordering과 cursor semantics를 API 경계에서 증명해야
  하며, hidden/unavailable pinned Post는 count와 URI를 포함해 노출하지 않는다.
- Confirmation / Follow-up: 구현 PR의 API/Relay 검증에서 page boundary, no duplicate/omission, visibility filtering과 다른
  목록 순서 불변을 확인한다.

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

- 없음.
