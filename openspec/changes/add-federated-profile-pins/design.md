## Context

현재 Post Action Bar에는 Profile 고정의 시각·메뉴 표현만 있고, Profile 객체·Post List·ActivityPub에는 고정 관계와
`featured` 동기화의 공통 계약이 없다. 이 change는 [proposal](./proposal.md)의 PROD-809 결과를 위해 기존 Post
조회/visibility/eligibility, Note projection, Profile Update(Person) delivery와 단일 서버 pagination 경계를 연결한다.

구현은 ordered 0..N pin collection 저장·API와 현재 Local first-party의 첫 visible 항목 관리 정책, Remote의 원격 ordered
set을 서로 다른 lifecycle로 다뤄야 한다. Local pin은 기본적으로 set에 추가하고 지정한 항목만 제거하며, 현재 UI slot 교체의
expected-current atomic replacement는 rollout 정책으로만 둔다. Followers Only는 일반
공개 fetch와 다른 signed/authenticated authorization이 필요하며, page traversal 중 실패한 Remote sync가 이미 성공한
상태를 훼손해서는 안 된다.

## Goals / Non-Goals

**Goals:**

- Local pin/unpin의 자격·ordered add/remove와 idempotent no-op을 제공하고, 현재 UI slot 교체에는 stale confirmation 보호와 원자성을 제공한다.
- Remote Featured collection의 outbound advertisement, visibility-aware authorization과 inbound ordered sync를 기존
  ActivityPub 경계에 연결한다.
- Profile 목록의 pinned-first 순서, visibility filtering과 서버 소유 cursor/page semantics를 유지한다.
- Profile/Post lifecycle과 block/domain 정책에 맞춰 visible pin을 안전하게 제거한다.

**Non-Goals:**

- Home·Local·Hashtag 목록의 순서 변경, Mentioned Profiles Post(ActivityPub Direct projection)의 Featured 공개, 현재 Local
  first-party 관리 정책을 넘어서는 다중 pin 관리 UI·mutation.
- 새 외부 의존성, Storybook fixture·interaction, 별도 pin UI 체계, 전체 ActivityPub 구현이 Featured를 표시한다는 보장.
- 내부 GraphQL field shape, resolver/function 이름, DB table/index shape 또는 물리 삭제·FK cleanup 방식을 고정하는 것.

## Implementation Guidance

### Current Constraints

- 기존 Post Visibility와 Post Eligibility가 viewer·author·instance 상태를 함께 판정하므로 pin 후보와 Featured Note를
  별도 공개 predicate로 재구현하면 접근 범위가 어긋난다.
- 현재 Profile 목록은 단일 PostList/Relay pagination 경계를 사용한다. pinned 결과를 클라이언트에서 별도 fetch 후
  concat하면 cursor, duplicate, page limit이 관찰 가능한 계약과 달라질 수 있다.
- 기존 Local Note projection은 Public/Unlisted와 Followers Only signed fetch의 권한 경계를 이미 소유하고 있으며,
  Actor Profile Update(Person) delivery lifecycle도 존재한다.
- Remote collection은 page traversal과 Note materialization의 성공 경계를 분리해야 한다. 부분 page를 authoritative
  상태로 저장하면 fetch 실패가 마지막 성공 set을 지우게 된다.

### Recommended Approach

1. 기존 core/domain action 경계에서 Local pin 후보를 검증하고, pin은 ordered set에 추가하고 unpin은 지정한 항목만 제거한다.
   같은 대상과 이미 없는 해제는 현재 상태를 유지하는 idempotent 결과로 정규화한다. 현재 first-party UI slot 교체에만 current
   expected value 검사와 원자적 replace를 적용하며, 이 rollout 정책은 API·저장 cardinality를 제한하지 않는다. 새 pin에는 기존
   pin의 상대 순서를 보존한 한 위치를 원자적으로 부여하고 관계 변경이 없으면 같은 order를 반환한다. 앞·뒤 배치와 별도 재정렬
   UX는 고정하지 않는다.
2. Profile 목록을 계산하는 서버 경계에서 visible pinned segment와 일반 chronology segment를 결합한다. Local은 첫 visible
   pin만 pinned segment에 두고 추가 Local pin은 Reply·Quote를 포함해 기존 chronology 위치의 일반 Post로 유지한다. Remote는
   검증된 visible pin 전체를 pinned segment에 둔다. 실제 pinned segment의 ID만 일반 후보에서 cursor/page limit 전에 제외하며,
   Relay는 이 서버 결과를 하나의 기존 pagination 흐름으로 소비한다.
3. Local Actor 표현에는 기존 Profile representation 경계에서 `featured` link를 추가하고, collection item은 기존
   Local Note projection과 authorization을 호출한다. pin transaction commit 후에는 기존 Profile Update(Person)
   delivery scheduling/effect lifecycle을 재사용한다. 연속된 commit은 최신 current representation delivery로 병합할 수
   있으며 commit별 1:1 delivery나 완료 시간 SLA를 요구하지 않는다.
4. Remote Actor의 Featured URI를 기존 ActivityPub fetch/validation 경계로 page traversal한다. 각 Note의 canonical `attributedTo`가
   collection을 광고하는 Actor의 canonical URI와 정확히 같은지 확인하고, 모든 page와 item 검증이
   성공한 뒤에만 원격 ordered set을 교체하고, 실패 시 이전 authoritative snapshot을 보존한다. Public/Unlisted는 기존
   공개 fetch를 사용할 수 있다. Followers Only를 수신할 때는 한 sync 시도 동안 같은 Active local follower identity로
   collection의 모든 page와 각 Note 역참조를 authenticated fetch한다. Remote Profile 등록·stale refresh·검증된 inbound
   Update뿐 아니라 Active Local Profile의 established Follow가 새로 성립할 때도 해당 identity로 sync를 시작한다. Sync는
   production path에서 inline으로 실행하거나 별도 effect로 예약할 수 있고 상위 Profile·Follow 결과의 성공 여부는 sync
   완료·성공에 의존하지 않는다. 각 시도는 취소
   가능하며 next page 순환 검출과 구현이 정한 page·item·byte·시간 예산을 적용한다. 실패·취소·순환·예산 초과는 유효한
   상위 Profile 갱신과 이전 snapshot을 보존한다. 실패는 기존 retry-capable async effect/Workflow 경계에서 관측·재시도할 수
   있어야 하며, 이후 성공한 retry만 snapshot을 원자적으로 교체한다. 각 trigger는 Remote Profile별 current sync generation
   또는 동등한 최신성 token을 갱신하고 완료 시점에 current인 시도만 snapshot을 교체한다. 더 최신 trigger 뒤에 완료된 이전
   성공 결과는 폐기한다. retry timing·backoff·횟수·SLA는 고정하지 않는다.
   검증된 원격 표현에서 `featured` URI가 사라진 경우는 authoritative empty set으로 처리한다.
5. Profile/Post lifecycle, visibility, block/domain 정책 변경은 기존 조회·삭제·Tombstone lifecycle에서 visible set을
   재계산하거나 다음 성공 sync에서 제거한다. 관계의 물리 cleanup은 기존 보존 정책을 따르는 구현 선택으로 둔다.

### Allowed Alternatives

- Local pin 관계의 저장은 기존 Post/Profile persistence 계층에 맞는 별도 관계 또는 Profile projection 중 하나를
  사용할 수 있다. 어느 쪽이든 ordered 0..N API shape, additive add/unpin, 현재 UI slot의 원자성·stale expected-current 보호와
  Remote ordered set 보존을 외부 동작으로 증명해야 한다.
- Remote snapshot은 같은 transaction의 replace 또는 versioned snapshot swap으로 구현할 수 있다. 부분 fetch가 visible
  상태를 덮지 않고 마지막 성공 snapshot을 유지하면 된다.
- Featured sync scheduling과 Profile Update delivery batching 방식은 고정하지 않는다. 상위 Profile 결과 독립성, bounded
  traversal, 최신 current representation과 last-success 보존 계약만 충족하면 된다.
- Profile list cursor는 기존 opaque cursor 규칙을 확장하거나 pin/chronology 경계를 포함하는 새 opaque cursor를 사용할
  수 있다. 클라이언트가 cursor 의미를 해석하거나 segment를 concat하지 않는 조건을 만족해야 한다.

### Known Traps

- 교체 확인을 UI에서만 신뢰하거나 mutation payload에 기대 current pin을 포함하지 않으면 stale confirmation이 다른
  pin을 제거할 수 있다. expected-current 불일치는 저장 상태를 바꾸지 않고 idempotent success와 구별되는 stale/conflict
  결과로 반환해야 한다.
- Followers Only Featured를 unsigned fetch나 follower 여부가 오래된 캐시만으로 허용하면 private Post 존재가
  노출된다. 인증 주체·Active local identity·현재 established relation을 fetch 시점에 검증해야 한다.
- established Follow 성립 뒤 sync trigger를 누락하면 이전 public-only snapshot이 다음 우연한 refresh까지 유지된다.
- Remote page 하나를 성공 snapshot으로 간주하거나 parse 실패를 빈 collection으로 정규화하면 일시적 원격 장애가
  기존 pin을 모두 숨긴다.
- Remote next page 순환과 무제한 collection을 방어하지 않으면 sync worker가 끝나지 않거나 자원을 고갈시킨다. 시도별
  순환 검출과 구현이 정한 자원 예산을 적용하고 중단된 시도는 실패로 처리해야 한다.
- 겹친 sync의 성공 여부만 보고 snapshot을 교체하면 늦게 끝난 이전 시도가 최신 원격 표현을 덮을 수 있다. 완료 시점의
  generation 또는 동등한 최신성 token을 비교해 current 시도만 교체해야 한다.
- 실제 pinned segment의 Post를 일반 query에서 제외하지 않은 채 두 connection을 client concat하면 duplicate, omission과 cursor
  경계 불일치가 생긴다. 반대로 현재 UI가 pinned segment에 표시하지 않는 추가 Local pin까지 일반 query에서 제외하면 해당
  Post가 Profile 목록에서 사라진다.
- Profile/Post가 unavailable이 된 뒤 pinned metadata나 count를 별도 경로로 반환하면 기존 visibility 정책을 우회한다.

## Risks / Trade-offs

- [Remote server가 Featured collection을 지원하지 않거나 비표준 응답을 반환] → 검증된 지원 항목만 반영하고 실패 시
  마지막 성공 snapshot을 유지한다. Mastodon 호환 서버를 기준으로 양방향 runtime 검증을 수행하되 모든 Fediverse
  구현의 표시를 보장하지 않는다.
- [Remote collection이 순환하거나 과도하게 큼] → 시도별 순환 검출·취소·자원 예산으로 중단하고 마지막 성공 snapshot을
  유지한다. 정확한 예산값은 구현과 운영 환경이 소유한다.
- [pin replacement와 unpin이 동시에 도착] → current expected value 검증과 단일 atomic transaction을 사용한다.
- [pin segment가 일반 pagination의 cursor 비용과 복잡도를 높임] → 서버가 opaque cursor와 combined ordering을
  소유하고 클라이언트 concat을 금지한다.

## Migration Plan

- 구현 PR에서 storage/API projection을 기존 schema·migration 관례에 맞춰 additive하게 도입하고, 기존 Profile 목록은
  visible pin set이 없을 때 현재 chronology 결과를 유지한다.
- Local commit 이후 Profile Update(Person) delivery와 inbound sync를 단계적으로 연결하고, 양방향 runtime 검증에서
  Public/Unlisted, Followers Only signed fetch와 denial/unfollow를 확인한다.
- 장애 시 신규 pin mutation과 Featured sync를 중지해도 기존 Post/Profile 조회와 마지막 성공 Remote snapshot을 보존할
  수 있어야 한다. 필요하면 새 pinned segment를 기존 Profile chronology로 rollback하고, 이미 commit된 Local pin을
  delivery 실패만으로 되돌리지 않는다.

## Open Questions

없음.
