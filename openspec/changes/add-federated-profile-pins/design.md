## Context

현재 Post Action Bar에는 Profile 고정의 시각·메뉴 표현만 있고, Profile 객체·Post List·ActivityPub에는 고정 관계와
`featured` 동기화의 공통 계약이 없다. 이 change는 [proposal](./proposal.md)의 PROD-809 결과를 위해 기존 Post
조회/visibility/eligibility, Note projection과 Profile Update(Person) delivery 경계를 연결한다.

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
- 별도 pinned presentation의 순서·visibility filtering과 기존 Profile chronology·pagination 불변을 유지한다.
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
- 기존 Profile chronology는 현재 PostList/Relay pagination 경계를 사용한다. pin 관계가 이 후보·순서·cursor·page limit을
  바꾸지 않도록 pinned presentation과 독립적으로 유지해야 한다.
- 기존 Local Note projection은 Public/Unlisted와 Followers Only signed fetch의 권한 경계를 이미 소유하고 있으며,
  Actor Profile Update(Person) delivery lifecycle도 존재한다.
- Remote collection은 page traversal과 Note materialization의 성공 경계를 분리해야 한다. 부분 page를 authoritative
  상태로 저장하면 fetch 실패가 마지막 성공 set을 지우게 된다.

### Recommended Approach

1. 기존 core/domain action 경계에서 Local pin 후보를 검증하고, pin은 ordered set에 추가하고 unpin은 지정한 항목만 제거한다.
   같은 대상과 이미 없는 해제는 현재 상태를 유지하는 idempotent 결과로 정규화한다. 현재 first-party UI slot 교체에만 current
   expected value 검사와 원자적 replace를 적용하되 같은 원자적 저장 경계에서 일반 pin과 동일한 Profile·대상 자격을 재검증한다.
   내부 수단은 기존 persistence 계층에 맞는 transaction, conditional write 또는 compare-and-swap을 사용할 수 있다.
   이 rollout 정책은 API·저장 cardinality를 제한하지 않는다. 새 pin에는 기존 pin의 상대 순서를 보존한 한 위치를 원자적으로
   부여하고 관계 변경이 없으면 같은 order를 반환한다. 교체 대상이 다른 위치에 이미 pinned면 대상 관계를 current slot으로
   이동하고 기존 current 관계를 제거하며, 중복 없이 나머지 관계의 상대 순서를 보존한다. 앞·뒤 배치와 별도 재정렬 UX는 고정하지 않는다.
2. Local은 첫 visible pin만 별도 pinned segment에 두고 Remote는 검증된 visible pin 전체를 원격 순서의 pinned segment에 둔다.
   기존 Profile chronology는 pin 관계와 무관하게 후보·순서·cursor·page limit을 그대로 유지한다. chronology 후보인 Post는
   pinned segment와 원래 위치에 모두 표시할 수 있고, 추가 Local pin은 기존 chronology 자격만으로 표시한다.
3. Local Actor 표현에는 기존 Profile representation 경계에서 `featured` link를 추가하고, collection item은 기존
   Local Note projection과 authorization을 호출한다. pin/unpin/replacement transaction commit 후에는 기존 Profile Update(Person)
   delivery scheduling/effect lifecycle을 재사용한다. 연속된 commit은 최신 current representation delivery로 병합할 수
   있으며 commit별 1:1 delivery나 완료 시간 SLA를 요구하지 않는다.
4. Remote Actor의 Featured URI를 기존 ActivityPub fetch/validation 경계로 page traversal한다. 각 Note의 canonical `attributedTo`가
   collection을 광고하는 Actor의 canonical URI와 정확히 같은지 확인하고, 모든 page와 item 검증이
   성공한 뒤에만 원격 ordered set을 교체하고, 실패 시 이전 authoritative snapshot을 보존한다. Public/Unlisted는 기존
   공개 fetch를 사용할 수 있다. Followers Only를 수신할 때는 한 sync 시도 동안 같은 Active/Normal이며 사용 가능한 Local
   Instance에 속한 local follower identity로 collection의 모든 page와 각 Note 역참조를 authenticated fetch한다. Suspended
   Profile 또는 사용할 수 없는 Local Instance의 identity는 사용하지 않는다. Remote Profile 등록·stale refresh·검증된 inbound
   Update에서 sync를 시작한다. Sync는 production path에서 inline으로 실행하거나 별도 effect로 예약할 수 있고 상위 Profile
   결과의 성공 여부는 sync 완료·성공에 의존하지 않는다. Follow Relationship 성립이나 follower identity의 Active/Normal
   복귀만으로는 별도 sync를 시작하지 않는다. 각 시도는 취소
   가능하며 next page 순환 검출과 구현이 정한 page·item·byte·시간 예산을 적용한다. 실패·취소·순환·예산 초과는 유효한
   상위 Profile 갱신과 이전 snapshot을 보존한다. 실패는 기존 retry-capable async effect/Workflow 경계에서 관측·재시도할 수
   있어야 하며, 이후 성공한 retry만 snapshot을 원자적으로 교체한다. generation/token, source revision 비교 또는 직렬화된 실행
   중 기존 경계에 맞는 최소 최신성 판별 수단을 사용해 더 최신 trigger 뒤에 완료된 이전 성공 결과를 폐기한다.
   retry timing·backoff·횟수·SLA는 고정하지 않는다. 검증된 원격 표현에서 `featured` URI가 사라진 경우는 이전 URI의 진행 중인
   시도와 retry가 이후 결과를 덮지 못하게 하고 authoritative empty set으로 처리한다.
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

### Known Traps

- 교체 확인을 UI에서만 신뢰하거나 mutation payload에 기대 current pin을 포함하지 않으면 stale confirmation이 다른
  pin을 제거할 수 있다. expected-current 불일치는 저장 상태를 바꾸지 않고 idempotent success와 구별되는 stale/conflict
  결과로 반환해야 한다.
- Followers Only Featured를 unsigned fetch, Suspended identity나 follower 여부가 오래된 캐시만으로 허용하면 private Post
  존재가 노출된다. 인증 주체·Active/Normal Profile·사용 가능한 Local Instance·현재 established relation을 fetch 시점에 검증해야 한다.
- Remote page 하나를 성공 snapshot으로 간주하거나 parse 실패를 빈 collection으로 정규화하면 일시적 원격 장애가
  기존 pin을 모두 숨긴다.
- Remote next page 순환과 무제한 collection을 방어하지 않으면 sync worker가 끝나지 않거나 자원을 고갈시킨다. 시도별
  순환 검출과 구현이 정한 자원 예산을 적용하고 중단된 시도는 실패로 처리해야 한다.
- 겹친 sync의 성공 여부만 보고 snapshot을 교체하면 늦게 끝난 이전 시도가 최신 원격 표현을 덮을 수 있다. 구현이 선택한
  generation/token, source revision 비교 또는 직렬화된 실행 경계로 이전 결과를 폐기해야 한다.
- pinned Post를 일반 query에서 제외하거나 순서를 바꾸면 pin 관계가 기존 Profile chronology와 pagination을 변경한다. 기존
  chronology 후보인 Post의 pinned·chronology 중복 표시는 의도된 결과다.
- Profile/Post가 unavailable이 된 뒤 pinned metadata나 count를 별도 경로로 반환하면 기존 visibility 정책을 우회한다.

## Risks / Trade-offs

- [Remote server가 Featured collection을 지원하지 않거나 비표준 응답을 반환] → 검증된 지원 항목만 반영하고 실패 시
  마지막 성공 snapshot을 유지한다. Mastodon 호환 서버를 기준으로 양방향 runtime 검증을 수행하되 모든 Fediverse
  구현의 표시를 보장하지 않는다.
- [Remote collection이 순환하거나 과도하게 큼] → 시도별 순환 검출·취소·자원 예산으로 중단하고 마지막 성공 snapshot을
  유지한다. 정확한 예산값은 구현과 운영 환경이 소유한다.
- [pin replacement와 unpin이 동시에 도착] → current expected value 검증과 단일 atomic transaction을 사용한다.
- [별도 pinned presentation이 같은 Post를 두 번 표시함] → pin 관계가 기존 chronology를 바꾸지 않는 계약을 우선하고 중복
  표시를 허용한다.

## Migration Plan

- 구현 PR에서 storage/API projection을 기존 schema·migration 관례에 맞춰 additive하게 도입하고, 기존 Profile chronology는
  visible pin set 유무와 관계없이 현재 후보·순서·pagination 결과를 유지한다.
- Local commit 이후 Profile Update(Person) delivery와 inbound sync를 단계적으로 연결하고, 양방향 runtime 검증에서
  Public/Unlisted, Followers Only signed fetch와 denial/unfollow를 확인한다.
- 장애 시 신규 pin mutation과 Featured sync를 중지해도 기존 Post/Profile 조회와 마지막 성공 Remote snapshot을 보존할
  수 있어야 한다. 필요하면 새 pinned presentation만 중지하고 기존 Profile chronology는 그대로 유지하며, 이미 commit된 Local
  pin을 delivery 실패만으로 되돌리지 않는다.

## Open Questions

없음.
