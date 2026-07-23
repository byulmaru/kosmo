## Context

Bookmark의 도메인 계약은 `docs/domain/objects/bookmark.md`와 Accepted ADR 0010에 정의되어 있고, `PROD-396` 저장 table, `PROD-408` 생성, `PROD-409` 삭제, `PROD-410` owner-only 목록·Node GraphQL, `PROD-420` viewer-relative 조회 API까지 구현됐다. 부모 [PROD-391](https://linear.app/byulmaru/issue/PROD-391/bookmark-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)은 전체 계약과 통합 검증·archive를 소유하고, 일곱 구현 이슈는 저장, 생성, 삭제, 목록, viewer-relative 조회 API, 목록 presentation, 실제 route 통합을 독립적으로 구현하고 검증한다. `PROD-452`는 실제 connection 없는 presentation을 제공하고, `PROD-421`은 그 결과를 실제 route·Relay connection·navigation에 통합한다.

서버는 PostgreSQL/Drizzle 저장 계층, core service, Pothos GraphQL/Relay Node 계층으로 나뉜다. 클라이언트는 Android·iOS·Web에서 하나의 Expo Router route tree와 React Relay actor store를 사용하고, `apps/web`은 Expo SPA를 서빙한다. 현재 Post 가시성은 Post·작성자 Profile·Instance 상태와 공개 범위를 함께 검사하며, selected Profile 전환은 Relay Environment 자체를 교체한다.

## Goals / Non-Goals

**Goals:**

- Profile/Post 유일성과 관계 유지 정책을 데이터베이스 제약부터 보장한다.
- Owner Profile만 생성·삭제·Node·목록에 접근하고 Target Post 가시성을 우회하지 못하게 한다.
- 가시성 필터 이후에도 page limit과 UUIDv7 ID-only cursor 순서가 정확한 목록을 제공한다.
- selected Profile별 `Post.viewerBookmark` 조회 API와 connection을 격리한 공용 Expo 목록 화면을 제공한다.
- 각 Linear 구현 이슈가 자기 결과와 테스트를 소유하면서 부모가 최종 vertical flow를 검증할 수 있게 한다.

**Non-Goals:**

- 공통 Post Action Bar의 설계·rollout
- Bookmark action adapter, mutation orchestration, pending·실패 UX와 Relay mutation/cache 처리
- 공개 Bookmark, Folder/Collection/태그 분류, bulk 작업
- Target Post가 조회 불가능할 때 Bookmark 자동 삭제
- Post Media, Notification, ActivityPub federation
- Block·Mentioned Profiles·Domain Block 등 공용 Post 조회 정책에 아직 없는 데이터 모델과 정책의 신규 구현
- 기존 데이터 backfill 또는 외부 dependency 도입

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`는 UUIDv7 primary key와 `createdAt()` helper, 명시적 FK·unique·index를 사용한다. Bookmark 목록은 UUIDv7 ID만 cursor로 사용하며 같은 millisecond 안의 실제 생성 순서는 보장하지 않는다.
- Post는 Tombstone과 가시성 정책으로 조회 가능성을 바꾸면서 row를 유지한다. Bookmark는 Post 상태나 Block 변화에는 유지하지만 Post row가 물리적으로 삭제되면 함께 삭제한다.
- Post 가시성 predicate는 ACTIVE Post, 작성자 Profile/Instance 상태, 공개 범위와 viewer 관계를 함께 검사한다. Bookmark row에 먼저 limit을 적용하고 Target Post를 나중에 Node loader나 JavaScript에서 거르면 짧거나 빈 페이지와 잘못된 cursor가 생긴다.
- GraphQL context와 resolver는 session Account, 현재 `usingProfile`과 Post visibility predicate를 이미 소유한다. Bookmark 생성 core service가 이 정보를 다시 조회하면 transport 권한 경계와 persistence action의 책임이 중복된다.
- 현재 공용 Post 가시성 predicate가 도달 가능한 범위는 ACTIVE Post, 작성자 Profile/Instance 상태, Public/Unlisted, 작성자 본인과 Followers Only follower다. Block·Mentioned Profiles·Domain Block 등 아직 공용 데이터 모델이 없는 정책은 `PROD-410`에서 새로 만들지 않으며, 후속 공용 predicate 확장을 Bookmark 조회가 자동으로 상속해야 한다.
- 비공개 owner connection은 session의 행동 주체 Profile과 요청 owner가 같은지 먼저 확인해야 한다. Relay global ID만으로 Bookmark를 조회하거나 삭제할 때도 존재 여부가 다른 Profile에 노출되면 안 된다.
- selected Profile 전환은 새 Relay Environment/Store를 만든다. 전역 singleton state, Profile을 포함하지 않은 connection identity 또는 이전 Environment의 늦은 mutation callback은 Profile 간 상태를 섞을 수 있다.
- `PostListItem`은 Profile과 Post의 canonical Link를 직접 소유한다. Bookmark 목록 presentation은 이 카드를 그대로 재사용하며 Target 선택 callback이나 Bookmark 전용 navigation을 추가하지 않는다.
- `/bookmarks`는 보호된 `(tabs)` route여야 한다. `apps/web`에는 별도 화면 구현이 아니라 Expo SPA direct-navigation fallback만 필요하다.
- `Post.viewerBookmark`는 한 GraphQL 요청에서 여러 Post에 반복될 수 있으므로 request-scoped batch loader로 selected Profile/Post 관계를 조회해야 한다.

### Recommended Approach

1. **PROD-396 저장 계층**: 별도 Bookmark table에 UUIDv7 ID, Owner Profile FK, Target Post FK와 생성 시각을 저장한다. `(profileId, postId)` unique 제약과 `(profileId, id DESC)` index를 둔다. Owner Profile과 Target Post FK는 물리 삭제에 cascade하되 Target Post의 Tombstone·가시성 변화에는 Bookmark를 유지한다. additive Drizzle migration과 focused DB 검증을 함께 추가한다.
2. **PROD-408 생성**: GraphQL mutation이 transaction 안에서 session Account 활성 상태, 현재 `usingProfile`의 membership·상태·locality와 Target Post 가시성을 모두 검증한다. 검증된 `profileId`·`postId`와 transaction connection을 core service에 전달하고, core service는 Account나 인증 정보를 조회하지 않은 채 Bookmark insert와 unique 경쟁 정규화만 수행한다. 같은 조합이 이미 있으면 기존 Bookmark를 반환하며, payload의 Bookmark Node로 Owner Profile·Target Post 관계를 정규화한다.
3. **PROD-409 삭제**: `deleteBookmark(input: { id })`는 현재 `usingProfile`, session Account와 Bookmark ID를 함께 조건으로 원자적 삭제를 수행한다. Resolver의 사전 권한 검증 뒤 Profile 비활성화나 membership 제거가 경합해도 삭제 statement가 Account/Profile membership과 Account·Profile·local Instance의 활성 상태를 다시 확인하며 별도 비관적 lock은 추가하지 않는다. 첫 Owner 삭제는 삭제된 Bookmark ID와 현재 조회 가능한 Target Post를 반환하고, 숨겨진 Target이면 Post를 `null`로 반환한다. missing·non-owner·반복 또는 동시 삭제 loser와 검증 직후 actor 권한이 사라진 요청은 같은 `bookmarkId: null`, `post: null` 성공으로 정규화한다.
4. **PROD-410 목록**: 현재 선택된 Profile의 `Profile.bookmarks` owner-only connection query에서 Bookmark와 Target Post·작성자 Profile·Instance를 결합하고 기존 Post 가시성 predicate를 SQL `WHERE`에 적용한 뒤 UUIDv7 ID-only cursor, order, limit을 적용한다. `Bookmark`는 Owner만 조회하는 Relay Node로 두고, Owner가 숨겨진 Target의 관계도 관리할 수 있도록 `Bookmark.post`는 nullable로 둔다. 개별 Node의 숨겨진 Target은 `null`, 목록의 같은 Bookmark edge는 결과 제외로 처리한다. 다른 Profile의 connection은 일반적인 권한 거부, 비Owner Node 조회는 `null`로 정규화한다.
5. **PROD-420 viewer-relative 조회 API**: nullable `Post.viewerBookmark`를 추가하고 request-scoped batch loader가 현재 selected Profile과 요청 Post ID들에 해당하는 Bookmark만 조회하게 한다. guest, selected Profile 없음과 미저장 상태는 `null`로 정규화하고 여러 Post 조회에서 N+1을 만들지 않는다.
6. **PROD-452 목록 presentation**: 실제 Bookmark connection 없이 loading·error·empty·populated와 추가 로딩 상태를 props로 제공하고 fixture로 검증한다. populated 상태는 기존 `PostListItem` fragment를 그대로 렌더링해 Profile·Post canonical Link를 유지한다. Storybook은 Relay mock fixture로 fragment ref를 만들고, error retry와 mock pagination callback만 presentation 상호작용으로 검증한다.
7. **PROD-421 목록 route 통합**: `/bookmarks` route의 selected Profile fragment에 `@refetchable`·`@connection` pagination 계약을 두고 PROD-452 presentation에 실제 상태와 edge를 전달한다. 선택 Profile이 없으면 query를 실행하지 않고, Profile 전환 뒤에는 새 connection/cursor를 사용한다. 다음 페이지 요청이 실패하면 기존 edge를 유지한 채 목록 아래에 retry를 제공한다. Web full·compact sidebar와 mobile drawer가 공유하는 `SidebarNavigation`의 Bookmark 항목을 `/menu` placeholder에서 canonical route로 바꾸며, mobile bottom tab이나 별도 header 버튼은 추가하지 않는다.
8. **PROD-391 통합**: 저장 → 생성 → `Post.viewerBookmark`/목록 조회 → Target 숨김·재노출 → 삭제를 하나의 계약 흐름으로 검증하고, 모든 구현 이슈의 검증 증거와 canonical/OpenSpec 정합성을 확인한 뒤 archive한다.

### Allowed Alternatives

- `createBookmark(input: { postId })`, `CreateBookmarkPayload.bookmark`, `deleteBookmark(input: { id })`와 nullable 삭제 payload는 확정 계약이다.
- `PROD-410`의 owner connection·Node·nullable Target shape는 공개 계약으로 확정됐다. 이를 바꾸는 대안은 먼저 Linear와 specs·decisions를 갱신한 경우에만 허용한다.
- `Post.viewerBookmark`는 PROD-420의 확정 공개 계약이다. 다른 viewer state wrapper나 boolean으로 바꾸려면 Linear와 specs·decisions를 먼저 갱신해야 한다.
- Target Post reverse lookup이나 정리 경로가 실제로 필요해지면 `postId` 보조 index를 추가할 수 있다. 현재 개인 최신순 조회만으로는 미리 추가하지 않는다.

### Known Traps

- Target 가시성을 page limit 뒤에 검사하거나 Relay/Node resolver에만 맡기면 pagination 계약이 깨진다.
- 생성 core service에서 Account·membership·Profile locality·Post visibility를 다시 조회하면 GraphQL 권한 경계와 persistence 책임이 섞인다.
- Bookmark 전용 축약 predicate를 만들거나 현재 공용 predicate가 아직 지원하지 않는 Block·Mentioned Profiles·Domain Block을 지원 완료로 주장하면 staged 계약을 위반한다.
- Block/Tombstone 처리에서 Bookmark를 지우거나 물리 삭제 cascade를 상태 변화에 잘못 적용하면 관계 유지와 재노출 요구사항을 위반한다.
- Bookmark Node ID 또는 삭제 mutation으로 owner가 아닌 사용자에게 관계 존재를 구분 가능하게 만들면 안 된다.
- ID-only cursor는 같은 millisecond의 실제 생성 순서를 보장하지 않으므로 이를 생성 시각의 완전한 순서로 설명하면 안 된다.
- Profile을 포함하지 않은 Relay connection key는 selected Profile 전환 시 목록 정보를 섞는다.
- `Post.viewerBookmark`를 Post별 독립 query로 조회하면 목록에서 N+1이 발생한다.
- Bookmark 목록에서 기존 `PostListItem` 대신 별도 Target 선택 callback이나 복제 카드를 만들면 canonical detail/side-view 동작과 Post 표시 계약이 갈라질 수 있다.
- generated migration·Relay artifact를 수동 편집하거나 `apps/web`에 중복 UI를 구현하지 않는다.

## Risks / Trade-offs

- **[가시성 변화 중 pagination]** cursor 사이의 Target 가시성이 달라지면 사용자가 보는 항목 수가 변할 수 있다. → UUIDv7 ID cursor는 Bookmark 자체에 고정하고 매 요청 시 현재 가시성을 limit 전에 적용하며 중복·누락 경계를 통합 테스트한다.
- **[동시 생성 경쟁]** 사전 존재 확인만으로는 같은 Profile/Post 중복을 막지 못한다. → DB unique 제약을 최종 보장으로 사용하고 기존 Bookmark를 반환하는 idempotent success로 경쟁 결과를 정규화한다.
- **[비공개 존재 노출]** Node·delete 오류 차이가 다른 Profile의 Bookmark 존재를 드러낼 수 있다. → owner 확인을 모든 진입점에 적용하고 비소유 결과를 같은 외부 의미로 정규화한다.
- **[여러 PR의 계약 drift]** storage/API/client가 서로 다른 cursor·payload·상태 의미를 가정할 수 있다. → 공유 specs·decisions를 각 자식의 guardrail로 사용하고 부모에서 vertical contract를 재검증한다.

## Migration Plan

1. PROD-396에서 nullable 전환이나 backfill이 없는 additive Bookmark table·제약·index migration을 생성하고, 빈 DB와 기존 migration chain 모두에서 검증한다.
2. migration을 애플리케이션 코드보다 먼저 또는 같은 배포 단위에서 먼저 적용한다. 새 table을 사용하지 않는 기존 서버에는 영향이 없다.
3. PROD-408/409/410 API와 PROD-420 viewer-relative 조회 API를 배포한 뒤 PROD-452 목록 presentation을 제공하고 PROD-421 목록 surface를 활성화한다. Bookmark action adapter와 production surface 연결은 별도 `PROD-432/433/434` 순서를 따른다.
4. 롤백은 client 목록 진입점과 API 호출을 먼저 제거한 뒤 서버 코드를 되돌린다. 생성된 Bookmark 데이터가 있으면 table drop은 파괴적이므로 contract migration을 별도 승인하기 전에는 유지한다.

## Open Questions

없음.
