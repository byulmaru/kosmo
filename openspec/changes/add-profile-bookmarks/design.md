## Context

Bookmark의 도메인 계약은 `docs/domain/objects/bookmark.md`와 Accepted ADR 0010에 이미 정의되어 있지만, 현재 저장 table·service·GraphQL·client route는 없다. 부모 [PROD-391](https://linear.app/byulmaru/issue/PROD-391/bookmark-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)은 전체 계약과 통합 검증·archive를 소유하고, 여섯 자식 이슈는 저장, 생성, 삭제, 목록, action UI, 목록 UI를 독립적으로 구현하고 검증한다.

서버는 PostgreSQL/Drizzle 저장 계층, core service, Pothos GraphQL/Relay Node 계층으로 나뉜다. 클라이언트는 Android·iOS·Web에서 하나의 Expo Router route tree와 React Relay actor store를 사용하고, `apps/web`은 Expo SPA를 서빙한다. 현재 Post 가시성은 Post·작성자 Profile·Instance 상태와 공개 범위를 함께 검사하며, selected Profile 전환은 Relay Environment 자체를 교체한다.

## Goals / Non-Goals

**Goals:**

- Profile/Post 유일성과 관계 유지 정책을 데이터베이스 제약부터 보장한다.
- Owner Profile만 생성·삭제·Node·목록에 접근하고 Target Post 가시성을 우회하지 못하게 한다.
- 가시성 필터 이후에도 page limit과 UUIDv7 ID-only cursor 순서가 정확한 목록을 제공한다.
- selected Profile별 Bookmark 상태와 connection을 격리한 공용 Expo action·목록 화면을 제공한다.
- 각 Linear 구현 이슈가 자기 결과와 테스트를 소유하면서 부모가 최종 vertical flow를 검증할 수 있게 한다.

**Non-Goals:**

- 공통 Post Action Bar의 설계·rollout
- 공개 Bookmark, Folder/Collection/태그 분류, bulk 작업
- Target Post가 조회 불가능할 때 Bookmark 자동 삭제
- Post Media, Notification, ActivityPub federation
- 기존 데이터 backfill 또는 외부 dependency 도입

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`는 UUIDv7 primary key와 `createdAt()` helper, 명시적 FK·unique·index를 사용한다. Bookmark 목록은 UUIDv7 ID만 cursor로 사용하며 같은 millisecond 안의 실제 생성 순서는 보장하지 않는다.
- Post는 Tombstone과 가시성 정책으로 조회 가능성을 바꾸면서 row를 유지한다. Bookmark는 Post 상태나 Block 변화에는 유지하지만 Post row가 물리적으로 삭제되면 함께 삭제한다.
- Post 가시성 predicate는 ACTIVE Post, 작성자 Profile/Instance 상태, 공개 범위와 viewer 관계를 함께 검사한다. Bookmark row에 먼저 limit을 적용하고 Target Post를 나중에 Node loader나 JavaScript에서 거르면 짧거나 빈 페이지와 잘못된 cursor가 생긴다.
- GraphQL context와 resolver는 session Account, 현재 `usingProfile`과 Post visibility predicate를 이미 소유한다. Bookmark 생성 core service가 이 정보를 다시 조회하면 transport 권한 경계와 persistence action의 책임이 중복된다.
- 비공개 owner connection은 session의 행동 주체 Profile과 요청 owner가 같은지 먼저 확인해야 한다. Relay global ID만으로 Bookmark를 조회하거나 삭제할 때도 존재 여부가 다른 Profile에 노출되면 안 된다.
- selected Profile 전환은 새 Relay Environment/Store를 만든다. 전역 singleton state, Profile을 포함하지 않은 connection identity 또는 이전 Environment의 늦은 mutation callback은 Profile 간 상태를 섞을 수 있다.
- `PostListItem` 카드 전체는 상세 route로 이동한다. 내부 Bookmark control은 독립 interactive sibling으로 구성해 카드 navigation을 유발하지 않아야 한다.
- `/bookmarks`는 보호된 `(tabs)` route여야 한다. `apps/web`에는 별도 화면 구현이 아니라 Expo SPA direct-navigation fallback만 필요하다.

### Recommended Approach

1. **PROD-396 저장 계층**: 별도 Bookmark table에 UUIDv7 ID, Owner Profile FK, Target Post FK와 생성 시각을 저장한다. `(profileId, postId)` unique 제약과 `(profileId, id DESC)` index를 둔다. Owner Profile과 Target Post FK는 물리 삭제에 cascade하되 Target Post의 Tombstone·가시성 변화에는 Bookmark를 유지한다. additive Drizzle migration과 focused DB 검증을 함께 추가한다.
2. **PROD-408 생성**: GraphQL mutation이 transaction 안에서 session Account 활성 상태, 현재 `usingProfile`의 membership·상태·locality와 Target Post 가시성을 모두 검증한다. 검증된 `profileId`·`postId`와 transaction connection을 core service에 전달하고, core service는 Account나 인증 정보를 조회하지 않은 채 Bookmark insert와 unique 경쟁 정규화만 수행한다. 같은 조합이 이미 있으면 기존 Bookmark를 반환하며, payload의 Bookmark Node로 Owner Profile·Target Post 관계를 정규화한다. `PROD-409` 삭제의 exact 응답과 책임 경계는 해당 Remaining Decision을 확정한 뒤 정렬한다.
3. **PROD-410 목록**: owner-scoped connection query에서 Bookmark와 Target Post·작성자 Profile·Instance를 결합하고 기존 Post 가시성 predicate를 SQL `WHERE`에 적용한 뒤 UUIDv7 ID-only cursor, order, limit을 적용한다. Bookmark Node 자체는 Owner가 숨겨진 Target의 관계도 삭제할 수 있도록 owner 권한과 Target 표시 권한을 분리하되, `Bookmark.post`와 목록 edge는 Target 가시성을 우회하지 않는다.
4. **PROD-420 action UI**: 공용 Post fragment에 viewer-relative Bookmark 상태를 포함하고 재사용 가능한 action component를 `PostListItem`과 Post detail 표면에 둔다. 현재 프로젝트 관례인 응답 기반 갱신, pending disable, 실패 후 확정 상태 유지 방식을 기본으로 하며, mutation 응답으로 현재 actor store만 정규화한다.
5. **PROD-421 목록 UI**: `/bookmarks` route의 selected Profile fragment에 `@refetchable`·`@connection` pagination 계약을 두고 loading·error·empty·load-more를 기존 connection component 관례와 맞춘다. 선택 Profile이 없으면 query를 실행하지 않고, Profile 전환 뒤에는 새 connection/cursor를 사용한다. 현재 `/menu` placeholder인 사이드바 Bookmark 항목을 canonical route로 연결하고 mobile 진입 경계도 함께 검증한다.
6. **PROD-391 통합**: 저장 → 생성 → action/목록 반영 → Target 숨김·재노출 → 삭제를 하나의 사용자 흐름으로 검증하고, 모든 자식의 검증 증거와 canonical/OpenSpec 정합성을 확인한 뒤 archive한다.

### Allowed Alternatives

- `createBookmark(input: { postId })`와 `CreateBookmarkPayload.bookmark`는 확정 계약이다. 아직 열려 있는 `Profile.bookmarks`, Post의 viewer-relative Bookmark 관계와 삭제 payload는 owner 격리, Relay 정규화, exact deleted edge 식별과 pagination 계약을 동일하게 충족하는 다른 shape도 가능하며, 관련 구현 slice 전에 `decisions.md`에 확정해야 한다.
- response-driven action 대신 Relay optimistic update와 자동 rollback을 사용할 수 있다. selected Profile actor store 격리, pending 중 중복 방지와 실패 복구를 증명하고 구현 전에 deferred decision을 확정해야 한다.
- action의 정확한 시각적 배치는 Post 목록·상세의 독립 control 계약과 공통 Action Bar 제외 범위를 지키는 한 조정할 수 있다.
- Target Post reverse lookup이나 정리 경로가 실제로 필요해지면 `postId` 보조 index를 추가할 수 있다. 현재 개인 최신순 조회만으로는 미리 추가하지 않는다.

### Known Traps

- Target 가시성을 page limit 뒤에 검사하거나 Relay/Node resolver에만 맡기면 pagination 계약이 깨진다.
- 생성 core service에서 Account·membership·Profile locality·Post visibility를 다시 조회하면 GraphQL 권한 경계와 persistence 책임이 섞인다.
- Block/Tombstone 처리에서 Bookmark를 지우거나 물리 삭제 cascade를 상태 변화에 잘못 적용하면 관계 유지와 재노출 요구사항을 위반한다.
- Bookmark Node ID 또는 삭제 mutation으로 owner가 아닌 사용자에게 관계 존재를 구분 가능하게 만들면 안 된다.
- ID-only cursor는 같은 millisecond의 실제 생성 순서를 보장하지 않으므로 이를 생성 시각의 완전한 순서로 설명하면 안 된다.
- Profile을 포함하지 않은 Relay connection key나 app-global Bookmark state는 selected Profile 전환 시 정보를 섞는다.
- 카드 navigation Link/Pressable 안에 action을 중첩하거나 event 전파에 의존하면 Bookmark 동작이 상세 이동을 유발할 수 있다.
- generated migration·Relay artifact를 수동 편집하거나 `apps/web`에 중복 UI를 구현하지 않는다.

## Risks / Trade-offs

- **[가시성 변화 중 pagination]** cursor 사이의 Target 가시성이 달라지면 사용자가 보는 항목 수가 변할 수 있다. → UUIDv7 ID cursor는 Bookmark 자체에 고정하고 매 요청 시 현재 가시성을 limit 전에 적용하며 중복·누락 경계를 통합 테스트한다.
- **[동시 생성 경쟁]** 사전 존재 확인만으로는 같은 Profile/Post 중복을 막지 못한다. → DB unique 제약을 최종 보장으로 사용하고 기존 Bookmark를 반환하는 idempotent success로 경쟁 결과를 정규화한다.
- **[비공개 존재 노출]** Node·delete 오류 차이가 다른 Profile의 Bookmark 존재를 드러낼 수 있다. → owner 확인을 모든 진입점에 적용하고 비소유 결과를 같은 외부 의미로 정규화한다.
- **[actor 전환 race]** Profile 전환 직전 mutation이 새 화면 상태를 오염할 수 있다. → mutation updater를 요청 당시 Relay Environment에 한정하고 전환 시 새 actor store를 사용한다.
- **[여러 PR의 계약 drift]** storage/API/client가 서로 다른 cursor·payload·상태 의미를 가정할 수 있다. → 공유 specs·decisions를 각 자식의 guardrail로 사용하고 부모에서 vertical contract를 재검증한다.

## Migration Plan

1. PROD-396에서 nullable 전환이나 backfill이 없는 additive Bookmark table·제약·index migration을 생성하고, 빈 DB와 기존 migration chain 모두에서 검증한다.
2. migration을 애플리케이션 코드보다 먼저 또는 같은 배포 단위에서 먼저 적용한다. 새 table을 사용하지 않는 기존 서버에는 영향이 없다.
3. PROD-408/409/410 API를 배포한 뒤 PROD-420/421 client surface를 활성화한다.
4. 롤백은 client 진입점과 API 호출을 먼저 제거한 뒤 서버 코드를 되돌린다. 생성된 Bookmark 데이터가 있으면 table drop은 파괴적이므로 contract migration을 별도 승인하기 전에는 유지한다.

## Open Questions

- **PROD-409**: 이미 없거나 비소유인 Bookmark 삭제를 구분 불가능한 idempotent success로 할지, 구분 불가능한 not-found 의미로 할지 확정해야 한다.
- **PROD-410/420**: `Profile.bookmarks`와 Post의 viewer-relative Bookmark 관계의 exact GraphQL shape를 두 구현 slice가 시작되기 전에 함께 확정해야 한다. 생성 mutation과 Bookmark Node의 기본 관계 shape는 `PROD-408`에서 확정했다.
- **PROD-420**: 기존 관례의 response-driven 갱신을 유지할지 optimistic update를 도입할지 확정해야 한다.
- **PROD-421**: desktop sidebar 외 mobile shell에서 `/bookmarks`로 들어가는 정확한 navigation entry를 확정해야 한다.
