## Context

현재 API는 selected Profile 기준 `homeTimeline`과 `Profile.posts` Relay connection을 제공하지만 configured Local
Instance 전체의 공개 Post를 조회하는 root connection은 없다. 앱의 Home route는 route-owned scroll과
`PostListItem`, Relay actor/store 격리, 공통 자동 pagination lifecycle을 이미 사용하며 공용 `Tabs` primitive도
접근 가능한 선택·키보드 동작을 제공한다.

Local 후보는 기존 Profile 목록과 다르다. 원격 Profile과 Content 없는 Repost를 허용하는 `Profile.posts`를
재활용하거나 Home contract에 mode를 추가하면 후보 정책과 Relay identity가 섞인다. configured Local Instance는
core resolver를 통해 현재 runtime 설정에서 확인할 수 있다.

## Goals / Non-Goals

**Goals:**

- Local 후보 정책을 page limit 전에 적용하는 독립 Relay connection을 제공한다.
- Home/Local route에서 기존 탭, Post item, 상태, pagination과 actor/store 격리를 재사용한다.
- Local 재선택 refresh와 다음-page 수동 복구를 Web·Android·iOS 공용 흐름으로 제공한다.
- Block/Mute Exclude 계약과 현재 runtime 구현 경계를 명시한다.

**Non-Goals:**

- Profile Block/Mute runtime capability 구현 또는 Local 연결
- 기존 Home/Profile/Hashtag 후보 정책이나 Home prepend 변경
- Federated·추천 timeline, guest access, subscription·push 기반 실시간 prepend
- 범용 timeline framework, 새 UI primitive, 새 dependency 또는 근거 없는 DB index 추가

## Implementation Guidance

### Current Constraints

- `homeTimeline`은 follow 관계와 viewer 관련 Reply를 포함하므로 Local 필터로 재사용할 수 없다.
- `Profile.posts`는 target Profile별 connection이고 원격 Profile 및 Content 없는 Repost를 허용한다.
- Local 후보는 configured Local Instance, Profile/Post 상태, Visibility, Content와 Reply/Repost 관계를 limit 전에
  함께 검사해야 한다.
- Home route의 scroll owner와 `PostList` pagination owner를 분리하거나 중첩 ScrollView를 추가하면 자동
  pagination metric과 sticky header가 깨진다.
- 현재 DB/runtime에는 Profile Block/Mute 조회 capability가 없으므로 Local client에서 이를 추정하면 canonical
  정책과 후속 구현이 이중화된다.
- 현재 앱 설정과 전역 `ThemeProvider`는 Light로 고정되어 있어 Local만 Dark runtime을 활성화할 수 없다.

### Recommended Approach

기존 Post root query 패턴 옆에 selected Profile auth를 사용하는 nullable `localTimeline` connection을 추가한다.
configured Local Instance의 ID와 Active/Normal Profile, Public Visibility, current Content, Reply Parent 없음 조건을
기존 Post access predicate와 함께 적용하고 기존 immutable Post ID cursor의 descending 순서를 사용한다. connection
page size는 default/max 20으로 제한한다.

앱에는 Home/Local route 값과 선택 callback만 소유하는 작은 공용 timeline tab을 두고 기존 `Tabs` primitive를
그대로 사용한다. Home과 Local route는 같은 Page Header·scroll 구조를 유지하고 Local route는 별도 Relay query와
기존 Post 목록 presentation을 소비한다. 비활성 탭 전환은 sibling route 교체로 처리하고 selected Local 재선택은
route fetch key만 증가시켜 store-and-network query를 다시 실행한다.

Local 목록 pagination은 기존 `useAutomaticPagination`과 `PaginationScrollView`를 사용한다. 초기 state는 route
boundary가 Local 전용 문구와 retry를 소유하고, empty와 next-page feedback는 기존 공용 컴포넌트에 문구만
전달한다. 정책 후보를 client에서 다시 계산하거나 edge를 수동 병합하지 않는다.

### Allowed Alternatives

- Home/Local route의 작은 frame markup은 중복이 더 짧으면 그대로 둘 수 있다. 공통화하더라도 timeline 외 route를
  포괄하는 범용 frame으로 확장하지 않는다.
- 현재 코드의 Post ID cursor helper가 page-size 제한과 deterministic descending order를 보존한다면 기존 helper를
  직접 재사용하거나 같은 root query 패턴을 따를 수 있다.

### Known Traps

- Local을 `homeTimeline` argument나 `Profile.posts` mode로 추가해 기존 Relay contract/cache identity를 바꾸지 않는다.
- limit 이후 JavaScript나 client에서 원격·Reply·Repost를 제거하지 않는다.
- selected Profile revision을 Local query/pagination subtree identity에서 누락하지 않는다.
- Profile Block/Mute를 임시 배열, client filter 또는 빈 predicate로 구현 완료라고 표시하지 않는다.
- 새 Public Post를 Local connection에 무조건 prepend하지 않는다. Local membership은 refresh/query 결과로 수렴한다.

## Risks / Trade-offs

- [UUIDv7 ID cursor는 같은 millisecond 안의 생성 순서를 임의로 정할 수 있음] → 기존 목록과 같은 deterministic ID
  ordering을 사용하고 정확한 timestamp tie-break 요구가 생길 때 composite cursor를 도입한다.
- [새 Local 조건의 production query plan이 아직 측정되지 않음] → 현재 primary-key descending scan으로 시작하고
  실제 plan/latency 근거가 있을 때 additive index를 별도 검토한다.
- [Block/Mute 계약과 runtime 적용 시점이 분리됨] → canonical Exclude를 유지하고 PROD-813/814가 capability 도입 시
  Local 연결 및 회귀 검증을 소유하도록 명시한다.
- [자동화가 Native 실제 화면을 완전히 증명하지 못함] → 공용 component/unit 검증과 실제 Web·Android·iOS runtime
  증거를 구분해 보고한다.
- [Dark semantic token은 존재하지만 app-wide runtime은 Light로 고정됨] → Local 범위에서 별도 theme switch를
  만들지 않고 전역 theme 활성화 뒤 Dark 실화면을 검증한다.

## Migration Plan

1. canonical 문서와 OpenSpec delta를 먼저 동기화한다.
2. additive GraphQL field와 app route를 배포하고 generated schema/Relay artifact를 갱신한다.
3. focused API·app·Web E2E와 실행 가능한 runtime QA를 수행한다.
4. 회귀 시 API field와 client route를 함께 되돌린다. DB migration이나 backfill은 없다.

## Open Questions

없음.
