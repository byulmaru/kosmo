## Context

이 기록은 canonical Local Post List 정책, PROD-649와 DSN-56 Figma handoff, 현재 Post GraphQL·Relay·route 구조를
반영한다. Block/Mute의 제품 결정과 현재 runtime capability의 구현 시점을 구분한다.

## Decision Records

### Local Post List는 독립 root connection을 사용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/post-list.md`, `PROD-649`
- Status: Active
- Context / Problem: Home과 Profile connection은 각각 follow/reply 관계와 target Profile 정체성을 소유해 Local 후보와 계약이 다르다.
- Decision Outcome: Local은 selected Profile 기준 nullable root connection으로 제공하고 기존 Home/Profile connection identity는 변경하지 않는다.
- Alternatives Considered: `homeTimeline` mode argument는 기존 Home contract/cache를 넓히고, `Profile.posts` 재사용은 원격 Profile과 Content 없는 Repost 정책이 달라 선택하지 않는다.
- Consequences: API와 Relay에 Local 전용 owner가 생기지만 Post node presentation과 접근 predicate는 재사용한다.
- Confirmation / Follow-up: API 통합 검증에서 candidate matrix, null auth, cursor와 max page size를 확인한다.

### 기존 Post ID cursor와 최대 20개 page를 사용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/post-list.md`, `PROD-649`
- Status: Active
- Context / Problem: Local은 immutable cursor와 bounded query cost가 필요하지만 현재 Home/Profile은 UUIDv7 Post ID descending cursor를 사용한다.
- Decision Outcome: Local도 기존 Post ID cursor를 사용하고 default/max page size를 20으로 제한한다. 새 DB index나 composite cursor는 추가하지 않는다.
- Alternatives Considered: createdAt+ID composite cursor와 새 partial index는 정확한 same-millisecond 순서나 측정된 query plan 요구가 없어 현재 범위보다 크다.
- Consequences: 순서는 deterministic하지만 같은 millisecond 내부의 정확한 생성 순서는 보장하지 않는다. production evidence가 생기면 cursor/index를 별도 변경한다.
- Confirmation / Follow-up: 여러 page의 중복·누락·hasNextPage와 20개 상한을 통합 검증한다.

### Block/Mute는 Exclude 계약만 기록하고 runtime 연결은 후속 capability가 소유한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/post-list.md`, `PROD-649`
- Status: Active
- Context / Problem: Local의 Profile Block/Mute 결정은 Exclude지만 현재 runtime에는 두 관계를 조회·적용할 capability가 없다.
- Decision Outcome: PROD-649는 canonical Exclude를 보존하고 현재 존재하는 Post 정책만 재사용한다. Local 전용 임시 필터를 추가하지 않는다.
- Alternatives Considered: PROD-649에서 관계 모델을 선행 구현하거나 client에서 추정하는 방식은 승인된 이슈 경계를 넘고 후속 capability와 중복된다.
- Consequences: 실제 Block/Mute 연결과 Local 회귀 검증은 해당 capability를 도입하는 PROD-813/814가 수행한다.
- Confirmation / Follow-up: PROD-813/814 구현 시 Local connection의 Exclude 회귀를 포함하고, 그 전에는 PROD-649를 Block/Mute runtime 구현 근거로 사용하지 않는다.

### Home과 Local은 route를 분리하고 공용 탭만 재사용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/local-timeline.md`, `PROD-649`
- Status: Active
- Context / Problem: 두 화면은 Page Header, 탭과 Post presentation을 공유하지만 query owner와 refresh identity는 분리돼야 한다.
- Decision Outcome: `/home`과 `/local` route 및 Relay owner를 유지하고 기존 `Tabs`, `PostListItem`, pagination lifecycle만 재사용한다.
- Alternatives Considered: 하나의 mode-driven timeline route는 canonical URL과 owner 격리를 흐리고, 범용 timeline framework는 두 화면에 비해 과도하다.
- Consequences: 작은 route markup 중복을 허용하고 공용 컴포넌트는 탭과 기존 목록 경계에 한정한다.
- Confirmation / Follow-up: `RelayActorProvider` unit에서 Store 교체와 이전 Local connection·edge·cursor record 제거를
  확인하고, Web E2E에서 전환·selected Local refresh·Profile 전환 뒤 Local 재조회와 새 응답 수렴을 확인한다.

### Underline 인디케이터와 TabList 하단 boundary를 겹쳐 표시한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/local-timeline.md`, `PROD-649`, Figma `Tab/Underline` `4508:31047`
- Status: Active
- Context / Problem: 2px 선택 인디케이터는 넓은 Home/Local 탭에서 약하게 보이고, 탭과 타임라인 콘텐츠 사이의
  경계도 불분명하다. Home과 Local 사이의 세로선은 탭끼리만 분리하므로 이 문제를 해결하지 않는다.
- Decision Outcome: 공용 `Tab/Underline` 인디케이터를 중앙 64×4px 별도 채움으로 유지하고, TabList 하단 전체에는
  1px `border/subtle` boundary를 표시한다. 탭 사이와 바깥 좌우에는 border를 추가하지 않는다.
- Alternatives Considered: 인디케이터를 border로 바꾸면 선택 상태와 구조 구분의 역할이 섞이고, 탭 사이 세로선은
  타임라인 콘텐츠와의 경계를 만들지 못하며, 하단 boundary를 생략하면 화면군 분리가 계속 약하다.
- Consequences: 모든 underline 소비자는 더 선명한 4px 인디케이터와 semantic subtle 하단 boundary를 상속하고,
  Home/Local 사이에는 세로선이 표시되지 않는다.
- Confirmation / Follow-up: Storybook과 실제 `/home`·`/local`에서 64×4 인디케이터, 1px 하단 boundary, 세로선
  부재를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
