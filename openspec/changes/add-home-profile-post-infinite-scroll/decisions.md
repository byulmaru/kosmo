## Context

이 기록은 PROD-646의 Home/Profile 무한 스크롤 계약, 완료된 PROD-662 공통 lifecycle, PROD-641 Home prepend와 현재 Relay·scroll owner 구조를 반영한다. 제품 동작은 canonical 문서와 최신 Linear 본문에서 파생하고, 구현 선택은 그 범위를 넘지 않는다.

## Decision Records

### Home과 Profile pagination owner를 분리하고 Home connection identity를 유지한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-641`, `PROD-646`
- Status: Active
- Context / Problem: Home은 Query root의 `homeTimeline`을, Profile은 Profile identity의 `posts`를 소비하며 새 Post prepend는 현재 Home managed connection을 대상으로 한다. 두 목록을 같은 owner나 key로 합치거나 Home key를 바꾸면 actor·Profile 격리와 prepend 정합성이 깨진다.
- Decision Outcome: Home과 Profile은 각자 refetchable Relay pagination owner와 connection identity를 유지한다. Home pagination은 기존 prepend가 사용하는 Home connection identity를 그대로 사용하고, edge·cursor·정렬·중복 제거는 Relay에 맡긴다.
- Alternatives Considered: 하나의 공용 Post connection, route state의 edge 수동 병합, 새 Home connection key는 owner와 cache lifecycle을 혼합하거나 기존 prepend 대상을 분리하므로 선택하지 않는다.
- Consequences: 같은 Post item presentation을 공유해도 pagination fragment와 owner는 명시적으로 구분한다. Home prepend 후 next page를 불러오는 회귀를 검증해야 한다.
- Confirmation / Follow-up: Relay artifact와 집중 검증에서 Home key, Profile identity별 connection, prepend 후 append 순서·중복을 확인한다.

### Relay pagination과 완료된 공통 자동 lifecycle을 조합한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-646`, `PROD-662`
- Status: Active
- Context / Problem: Relay는 connection 누적과 `loadNext`를 소유하고, PROD-662의 공통 hook은 Web·Native near-end, in-flight guard, 성공 후 재측정과 실패 후 수동 retry를 이미 검증했다. Home/Profile에서 둘 중 하나를 다시 구현하면 중복 state와 race가 생긴다.
- Decision Outcome: 각 surface의 `usePaginationFragment` 결과를 기존 `useAutomaticPagination`에 전달한다. 클라이언트는 cursor나 edge를 합성하지 않고 공통 hook 바깥에 별도 자동 retry·near-end guard를 만들지 않는다.
- Alternatives Considered: Home/Profile별 lifecycle 복제, route-level cursor state, 범용 paginated-list framework는 완료된 공통 경계를 우회하거나 승인 범위보다 큰 추상화를 추가하므로 선택하지 않는다.
- Consequences: 공통 hook 자체의 기존 unit 검증은 재사용하고 PROD-646에서는 두 surface의 연결, feedback와 identity reset을 집중 검증한다.
- Confirmation / Follow-up: `loadNext(20)`, 중복 요청 차단, 짧은 page 재측정, 실패 뒤 manual retry와 마지막 page 종료를 관찰 가능한 결과로 확인한다.

### 기존 scroll owner를 유지하고 Native metric만 좁게 등록한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-646`
- Status: Active
- Context / Problem: Home frame과 Profile layout이 header·hero를 포함한 실제 Native ScrollView를 소유하지만 pagination data는 하위 Post 목록이 읽는다. 하위 목록에 ScrollView를 새로 만들면 중첩 scroll과 잘못된 near-end metric이 생긴다.
- Decision Outcome: 기존 Home/Profile scroll owner를 유지하고 Post 목록의 공통 hook이 반환한 Native metric handler만 route 범위의 좁은 registration boundary로 전달한다. Web은 현재 document scroll을 사용한다.
- Alternatives Considered: 중첩 ScrollView, 앱 전역 scroll registry, Post 목록 View의 scroll event 의존은 기존 layout을 바꾸거나 실제 owner metric을 제공하지 못하므로 선택하지 않는다.
- Consequences: 작은 owner-child registration seam과 unmount cleanup이 필요하다. 다른 route의 scroll·refresh 동작은 이 seam에 포함하지 않는다.
- Confirmation / Follow-up: Home/Profile owner에 handler가 연결되고 route/actor 전환 뒤 해제되는지 source test와 실행 가능한 runtime에서 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
