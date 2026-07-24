## Context

이 기록은 `proposal.md`, 네 capability의 delta specs, `design.md`, canonical Bookmark 문서와 `PROD-391` 부모/자식 이슈 구조를 반영한다. `PROD-396` 저장, `PROD-408` 생성, `PROD-409` 삭제, `PROD-410` 목록, `PROD-420` viewer-relative 조회 API slice가 완료된 현재 구현 상태와 `PROD-452` 목록 presentation·`PROD-421` 실제 route 통합의 분리 책임을 반영한다. 기존 기록의 legacy `Accepted` 상태는 해당 결정을 실제로 수정하거나 대체할 때 새 형식으로 전환한다.

## Decision Records

### 하나의 Bookmark 계약과 이슈별 구현 소유권

- Decision Date: 2026-07-20
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-391`, `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-452`, `PROD-421`
- Status: Active
- Context / Problem: 저장, 생성, 삭제, 목록과 UI를 별도 PR로 리뷰하면서도 같은 사용자 결과와 lifecycle·권한·pagination 계약을 공유해야 한다.
- Decision Outcome: 부모 `PROD-391`이 단일 `add-profile-bookmarks` OpenSpec, 최종 통합 검증과 archive를 소유한다. `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-452`, `PROD-421`은 각각 자기 구현 결과와 테스트를 소유한다. `PROD-452`는 실제 connection 없는 목록 presentation을 제공하고, `PROD-421`은 그 결과를 Relay connection·route·navigation에 통합한다.
- Alternatives Considered: DB/API/UI별 OpenSpec 분리 — 같은 계약을 중복하고 일부 계층만 배포해도 완료로 보일 수 있어 채택하지 않았다. 모든 구현을 부모 한 PR에 포함 — 독립 리뷰·전달 책임을 잃어 채택하지 않았다.
- Consequences: `tasks.md`의 최상위 구현 group은 직접·중첩 child를 포함한 Linear 구현 이슈와 1:1로 대응한다. 개별 PR 완료만으로 change를 archive하지 않는다.
- Confirmation / Follow-up: Linear 부모/자식 관계와 각 이슈의 검증 책임을 기준으로 확인한다.

### Bookmark 저장 식별자와 안정적 최신순 index

- Decision Date: 2026-07-20
- Status: Superseded by `UUIDv7 ID-only 저장과 pagination`
- Context / Problem: Profile/Post 유일성을 경쟁 요청에서도 보장하고 같은 millisecond에 생성된 row를 포함해 최신순 cursor pagination을 안정적으로 지원해야 한다.
- Decision Outcome: Bookmark는 UUIDv7 surrogate primary key, 필수 Owner Profile FK, 필수 Target Post FK와 immutable `createdAt`을 가진다. 데이터베이스는 `(profileId, postId)` unique 제약과 `(profileId, createdAt DESC, id DESC)` 목록 index를 제공한다.
- Alternatives Considered: Profile/Post composite primary key — 독립 Relay Node 식별과 immutable 생성 시각 기반 pagination에 불필요한 결합을 만들어 채택하지 않는다. `(profileId, id DESC)` index — UUIDv7이 같은 millisecond 안의 단조 순서를 보장하지 않아 채택하지 않는다. Target Post 단독 index — 현재 reverse lookup 요구가 없어 미리 추가하지 않는다.
- Consequences: migration은 additive하며 backfill이 없다. 생성 경쟁의 최종 보장은 DB unique 제약이 맡고, service는 선택된 API 의미로 unique violation을 정규화해야 한다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인했다. `PROD-396` DB 검증에서 중복 거부, Profile별 독립성, index tuple과 동률 순서를 확인한다.

### Target Post 가시성과 Bookmark FK lifecycle 분리

- Decision Date: 2026-07-20
- Status: Superseded by `Target Post 상태와 물리 삭제 lifecycle 분리`
- Context / Problem: Target Post가 Tombstone이 되거나 Block·공개 범위 때문에 보이지 않아도 Bookmark 관계를 유지해야 한다. 물리 FK cascade를 잘못 사용하면 canonical 계약을 우회해 관계가 사라진다.
- Decision Outcome: Target Post FK에는 cascade delete를 사용하지 않고, Post 상태·가시성 변경은 Bookmark row를 수정하거나 삭제하지 않는다. Owner Profile FK는 Profile 소유 관계의 기존 관례에 따라 cascade를 기본 선택으로 한다.
- Alternatives Considered: Target Post cascade — 관계 유지·재노출 요구를 위반해 채택하지 않는다. Target FK 제거 또는 nullable snapshot — `Bookmark -> Post` 필수 관계와 referential integrity를 약화해 채택하지 않는다. Owner Profile FK restrict — 소유자가 없어진 private row를 남길 이유가 없어 기본안에서 제외한다.
- Consequences: Target Post hard-delete가 새로 필요해지면 Bookmark 보존 계약과 함께 canonical 문서·OpenSpec을 먼저 재검토해야 한다. 현재 Post lifecycle은 Tombstone row를 유지한다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인했다. `PROD-396`에서 Post Tombstone 전환 뒤 관계 유지와 Owner Profile 삭제 lifecycle을 DB 수준에서 검증한다.

### 가시성 필터 이후 composite pagination

- Decision Date: 2026-07-20
- Status: Superseded by `UUIDv7 ID-only 저장과 pagination`
- Context / Problem: Bookmark row를 먼저 limit하고 Target Post를 나중에 숨기면 page limit, cursor와 재노출 순서가 깨지고 비공개 Target 정보가 우회 노출될 수 있다.
- Decision Outcome: Owner equality와 기존 Target Post visibility predicate를 Bookmark query의 SQL 조건에 적용한 뒤 `(createdAt, id)` cursor, 내림차순 정렬과 limit을 적용한다. Bookmark Node의 owner 권한과 `Bookmark.post`의 Target 가시성은 분리해 Owner가 숨겨진 Target의 관계도 삭제할 수 있게 한다.
- Alternatives Considered: Node resolver 또는 JavaScript post-filter — 짧거나 빈 페이지를 만들기 때문에 채택하지 않는다. 숨겨진 Bookmark 자동 삭제 — canonical 관계 유지 계약을 위반한다.
- Consequences: 목록 query는 Post·작성자 Profile·Instance visibility join을 재사용해야 한다. visibility 변화로 보이는 항목은 달라질 수 있지만 Bookmark cursor tuple과 생성 시각은 변하지 않는다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인했다. `PROD-410`에서 숨겨진 최신 row 뒤의 조회 가능한 row로 page limit을 채우고, 숨김·재노출·동률 cursor를 검증한다.

### UUIDv7 ID-only 저장과 pagination

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Bookmark 목록의 저장 index와 API cursor가 하나의 정렬 키를 공유하면서 Profile별 최신순 pagination을 단순하고 안정적으로 제공해야 한다.
- Decision Outcome: Bookmark는 UUIDv7 surrogate primary key, 필수 Owner Profile FK, 필수 Target Post FK와 immutable `createdAt`을 가진다. 데이터베이스는 `(profileId, postId)` unique 제약과 `(profileId, id DESC)` 목록 index를 제공한다. 목록은 Target 가시성을 limit 전에 적용한 뒤 UUIDv7 `id DESC`로 정렬하고 ID만 cursor로 사용한다.
- Alternatives Considered: `(profileId, createdAt DESC, id DESC)` composite index와 cursor — 실제 생성 시각을 더 정밀하게 반영하지만 storage와 API가 두 정렬 키를 공유해야 하므로 채택하지 않는다. Profile/Post composite primary key — 독립 Relay Node 식별을 불필요하게 결합해 채택하지 않는다.
- Consequences: UUIDv7은 millisecond 간 시간 순서를 제공하지만 같은 millisecond 안에서는 실제 생성 순서와 UUID 순서가 다를 수 있으며 이 임의 순서를 제품이 수용한다. migration은 additive하고 backfill이 없다. 생성 경쟁의 최종 보장은 DB unique 제약이 맡는다.
- Confirmation / Follow-up: 2026-07-20 PR #298 리뷰 결정과 사용자 승인을 반영했다. `PROD-396`은 ID-only index와 same-millisecond 결과를 기록하고, `PROD-410`은 ID-only cursor의 중복·누락과 visibility-before-limit을 검증한다.

### Target Post 상태와 물리 삭제 lifecycle 분리

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Target Post의 Tombstone·가시성 변화에는 Bookmark를 유지해야 하지만, Target Post row가 물리적으로 사라진 뒤 유효하지 않은 필수 관계를 남겨서는 안 된다.
- Decision Outcome: Target Post FK는 `ON DELETE CASCADE`를 사용한다. Tombstone·Block·공개 범위 같은 상태와 가시성 변화는 Post row를 유지하므로 Bookmark를 삭제하지 않으며, Target Post가 물리적으로 삭제될 때만 연결된 Bookmark를 함께 삭제한다. Owner Profile FK도 소유 관계에 따라 cascade한다.
- Alternatives Considered: Target Post FK `NO ACTION` — 물리 삭제를 차단하고 삭제된 Target의 private 관계를 정리하지 못해 채택하지 않는다. Target FK 제거 또는 nullable snapshot — 필수 관계와 referential integrity를 약화해 채택하지 않는다. 상태 변화 때 application cascade — Tombstone·재노출 계약을 위반해 채택하지 않는다.
- Consequences: Tombstone과 hard-delete 테스트를 분리해야 한다. 물리 삭제는 복구 가능한 상태 변화가 아니며 Bookmark도 함께 사라진다.
- Confirmation / Follow-up: 2026-07-20 PR #298 리뷰 결정과 사용자 승인을 반영했다. `PROD-396` DB 검증에서 Tombstone 유지와 Target Post hard-delete cascade를 각각 확인한다.

### 보호된 공용 Bookmark route와 Profile별 목록 격리

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-391`, `PROD-421` 본문과 2026-07-24 Bookmark 목록 UX와 navigation 계약 댓글
- Status: Active
- Context / Problem: Android·iOS·Web이 같은 개인 목록을 제공하면서 selected Profile 전환 때 pagination cache가 섞이지 않아야 한다.
- Decision Outcome: `/bookmarks`를 `(tabs)` 아래의 보호된 universal Expo route로 사용한다. 목록 connection은 현재 Relay actor store 안에서 selected Profile별로 식별하며, Profile 전환은 새 Environment/Store와 connection/cursor를 사용한다.
- Alternatives Considered: `/menu` placeholder 유지 — canonical 목록 route와 direct navigation을 제공하지 못해 채택하지 않는다. `apps/web` 별도 화면 — universal route/component 계약을 중복해 채택하지 않는다. app-global Bookmark 목록 store — Profile 간 비공개 목록을 섞을 수 있어 채택하지 않는다.
- Consequences: guest는 `/`로 이동하고, 선택 Profile이 없으면 목록 query를 실행하지 않는다. Bookmark action adapter와 production Post surface는 `PROD-432/433/434`가 별도로 소유한다.
- Confirmation / Follow-up: `PROD-421`에서 세 플랫폼 route parity, guest/no-Profile, Profile 전환과 connection 격리를 검증한다.

### 공용 SidebarNavigation으로 Bookmark 진입점 통일

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-421` 본문과 2026-07-24 Bookmark 목록 UX와 navigation 계약 댓글
- Status: Active
- Context / Problem: Web full·compact sidebar와 mobile drawer가 같은 `SidebarNavigation`을 사용하지만 Bookmark 항목은 현재 일반 `/menu` placeholder를 가리킨다. Mobile bottom tab은 홈·검색·글쓰기·알림·Profile의 다섯 항목을 고정으로 제공한다.
- Decision Outcome: Web full·compact sidebar와 mobile drawer의 공용 Bookmark 메뉴 항목을 모두 canonical `/bookmarks` route로 연결한다. Mobile은 기존 메뉴 drawer를 Bookmark 진입점으로 사용하며 bottom tab이나 별도 header 버튼을 추가하지 않는다.
- Alternatives Considered: Bookmark bottom tab 추가 — 기존 다섯 항목의 shell 계약과 배치를 바꾸므로 채택하지 않는다. Mobile header에 별도 Bookmark 버튼 추가 — drawer의 공용 메뉴와 진입 계약을 중복하므로 채택하지 않는다. `/menu` placeholder 유지 — canonical route로 직접 이동하지 못하므로 채택하지 않는다.
- Consequences: `SidebarNavigation`의 단일 Bookmark 항목이 Web과 mobile에서 같은 route를 제공한다. Drawer는 기존 `onNavigate` 흐름으로 이동 뒤 닫히며, 다른 `/menu` placeholder 항목과 bottom tab 구성은 이 결정에서 바꾸지 않는다.
- Confirmation / Follow-up: `PROD-421` task 7.3에서 Web full·compact sidebar와 mobile drawer의 href·이동을 검증하고, task 7.4에서 세 플랫폼 route parity를 확인한다.

### Bookmark 다음 페이지 실패 시 기존 목록 유지

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-421` 본문과 2026-07-24 Bookmark 목록 UX와 navigation 계약 댓글
- Status: Active
- Context / Problem: 첫 목록 요청 실패와 기존 edge를 표시한 뒤의 다음 페이지 요청 실패는 보존할 수 있는 사용자 데이터가 다르다. 다음 페이지 실패를 전체 error 화면으로 바꾸면 이미 조회한 Bookmark를 불필요하게 숨긴다.
- Decision Outcome: 첫 목록 요청이 실패하고 표시할 edge가 없으면 전체 목록 error·retry 상태를 표시한다. 기존 edge가 있는 상태에서 다음 페이지 요청이 실패하면 기존 Post 카드를 유지하고 목록 아래에 `북마크를 더 불러오지 못했어요` alert와 `다시 시도` action을 표시한다. 재시도는 같은 connection의 다음 cursor를 다시 요청하며 성공하면 pagination error를 지운다.
- Alternatives Considered: 다음 페이지 실패 때 전체 목록 교체 — 이미 성공한 edge를 숨겨 채택하지 않는다. 오류를 표시하지 않고 load-more action만 유지 — 실패와 재시도 의미를 사용자에게 전달하지 못해 채택하지 않는다. 자동 재시도 — 요청 횟수와 실패 상태를 숨기므로 채택하지 않는다.
- Consequences: `BookmarkList`는 items가 있는 error 상태에서도 Post 카드를 유지하고 pagination error·retry를 렌더링해야 한다. Relay connection edge와 cursor를 수동으로 지우거나 재구성하지 않는다.
- Confirmation / Follow-up: `PROD-421` task 7.2에서 실제 `loadNext` error state를 presentation props에 연결하고, task 7.4에서 기존 edge 유지·alert·재시도 성공을 검증한다.

### Post.viewerBookmark viewer-relative 조회 계약

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `PROD-391`, `PROD-420` 본문과 2026-07-23 책임 경계 승인
- Status: Active
- Context / Problem: Post Action Bar가 selected Profile의 Bookmark 상태를 소비하려면 private Bookmark 관계를 다른 Profile과 섞지 않는 선행 GraphQL 조회 계약이 필요하다.
- Decision Outcome: GraphQL은 nullable `Post.viewerBookmark`로 현재 selected Profile과 Post를 연결하는 Bookmark를 반환한다. guest, selected Profile 없음과 미저장 상태는 `null`이며, resolver는 request-scoped batch loader로 여러 Post의 관계를 조회한다.
- Alternatives Considered: `isBookmarked` boolean — 삭제와 정규화에 필요한 Bookmark identity를 잃어 채택하지 않는다. `Post.viewerState.bookmark` wrapper — 현재 단일 관계에 불필요한 wrapper를 추가해 채택하지 않는다. top-level viewer query — Post fragment에서 재사용할 viewer-relative 상태를 분리해 채택하지 않는다.
- Consequences: PROD-420은 GraphQL field·batch loader·API 검증만 소유한다. Bookmark action adapter, mutation orchestration, pending·실패 UX와 Relay cache/production surface는 `PROD-432/433/434`가 소유한다.
- Confirmation / Follow-up: PROD-420 API 통합 검증에서 저장·미저장·guest·selected Profile 없음·Profile 격리와 여러 Post batch 조회를 확인한다.

### 멱등 Bookmark 생성 mutation 계약

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `PROD-408` 본문과 2026-07-21 생성 API·책임 경계 확정 댓글
- Status: Active
- Context / Problem: Profile/Post 유일성은 확정되어 있지만 순차·동시 중복 요청의 외부 응답과 생성 mutation의 exact GraphQL shape가 열려 있었다.
- Decision Outcome: `createBookmark(input: { postId })`는 현재 `usingProfile`을 Owner로 사용하고 `CreateBookmarkPayload.bookmark`를 반환한다. Bookmark Node는 ID, Owner Profile, 현재 조회 가능한 Target Post와 불변 생성 시각을 제공한다. Target Post가 나중에 조회 불가능해져도 Owner의 Bookmark Node는 유지하며 `post`는 `null`을 반환한다. 같은 Profile/Post 요청이 이미 존재하거나 경쟁에서 패하면 기존 Bookmark를 성공으로 반환하고 `createdAt`을 변경하지 않는다.
- Alternatives Considered: duplicate conflict — 경쟁 winner와 loser의 외부 의미가 달라지고 client 재시도를 복잡하게 만들어 채택하지 않는다. Owner Profile ID 입력 — 현재 actor가 아닌 Profile을 지정할 여지를 만들어 채택하지 않는다. 생성 여부 boolean — 현재 client 계약에 필요한 관계 Node 외 상태를 추가하므로 채택하지 않는다.
- Consequences: DB unique 제약이 최종 유일성을 보장하며 mutation 응답은 생성·기존 경로에서 같은 shape를 가진다. Relay는 반환된 Bookmark의 Owner/Target 관계를 현재 actor store에 정규화할 수 있다.
- Confirmation / Follow-up: `PROD-408` core/API 검증에서 순차·동시 중복이 같은 ID와 기존 생성 시각을 반환하는지 확인한다.

### GraphQL 권한 검사와 core persistence 책임 분리

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-408` 본문과 2026-07-21 생성 API·책임 경계 확정 댓글
- Status: Active
- Context / Problem: GraphQL context가 이미 Account와 현재 `usingProfile`을 소유하는데 생성 core service가 인증·Account·membership·가시성을 다시 조회하면 권한 경계와 persistence 책임이 중복된다.
- Decision Outcome: GraphQL resolver가 하나의 transaction 안에서 Account 활성 상태, `usingProfile` membership·상태·locality와 Target Post 조회 가능성을 모두 검증한다. Core service는 검증된 `profileId`, `postId`와 선택적 transaction connection만 받아 Bookmark insert, unique 경쟁 정규화와 row 반환만 수행하며 인증이나 Account·권한·가시성 조회를 하지 않는다.
- Alternatives Considered: core service가 actor와 Target 권한을 재검증 — transport context와 business persistence 책임을 섞고 같은 조회를 반복해 채택하지 않는다. GraphQL이 DB insert까지 직접 수행 — 공통 생성 persistence action과 집중된 경쟁 처리를 잃어 채택하지 않는다.
- Consequences: 권한·가시성 실패는 GraphQL integration test가 소유하고 core test는 생성·멱등성·Profile 격리·transaction 참여를 검증한다. Resolver는 권한 검사와 core 호출이 같은 transaction connection을 사용하게 해야 한다.
- Confirmation / Follow-up: API 검증에서 사용할 수 없는 actor는 `PERMISSION_DENIED`, 없거나 숨겨진 Post는 동일 `NOT_FOUND`인지 확인하고, core test에서 Account 조회 없이 검증된 ID만으로 생성되는지 확인한다.

### 존재를 숨기는 멱등 Bookmark 삭제 mutation 계약

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `PROD-409` 본문과 2026-07-24 Bookmark 삭제 API 계약 댓글
- Status: Active
- Context / Problem: Owner 전용 삭제와 반복·동시 삭제 검증은 확정됐지만, missing·non-owner·경쟁 loser의 외부 의미와 Relay가 정규화할 exact payload가 열려 있었다.
- Decision Outcome: `deleteBookmark(input: { id })`는 현재 `usingProfile`, session Account와 Bookmark ID를 함께 조건으로 삭제한다. Resolver가 actor 권한을 먼저 검증해 사용할 수 없는 actor에는 `PERMISSION_DENIED`를 반환하고, core의 원자적 DELETE가 같은 Account/Profile membership과 Account·Profile·local Instance의 활성 상태를 다시 조건으로 결합해 검증 직후 권한이 사라지는 경합을 막는다. 첫 Owner 삭제는 nullable `DeleteBookmarkPayload.bookmarkId`로 삭제된 Bookmark 관계를 정확히 식별하고 nullable `post`로 현재 조회 가능한 Target Post를 반환한다. Target이 숨겨졌으면 관계는 삭제하되 `post`는 `null`이다. missing·non-owner·순차 반복·동시 loser와 검증 직후 actor 권한이 사라진 요청은 오류 없이 `bookmarkId: null`, `post: null`인 동일 성공으로 정규화한다.
- Alternatives Considered: missing·non-owner 모두 `NOT_FOUND` — 존재는 숨기지만 client 재시도와 경쟁 loser를 오류로 만들기 때문에 채택하지 않는다. non-owner만 `PERMISSION_DENIED` — 비공개 Bookmark 존재를 노출해 채택하지 않는다. 삭제 성공 boolean — Relay가 제거할 exact 관계를 식별하지 못해 채택하지 않는다.
- Consequences: client는 nullable ID로 실제 삭제 여부를 구분하되 null 이유를 추론할 수 없다. Target Post visibility는 삭제 권한을 막지 않으며 `post` loader가 현재 가시성을 적용한다. 원자적 조건부 `DELETE ... RETURNING`으로 경쟁 winner 하나만 ID를 얻고, actor 권한 재검증도 같은 statement에 포함해 별도 비관적 lock은 사용하지 않는다. 생성 persistence action은 검증된 ID만 받는 기존 책임을 유지하고, 삭제 persistence action만 권한 상실 경합을 닫는 데 필요한 Account ID를 추가로 받는다.
- Confirmation / Follow-up: core/API 검증에서 Owner 성공, missing·non-owner의 동일 payload, 순차·동시 한 요청만 deleted ID 반환, 숨겨진 Target의 `post: null`, transaction rollback과 검증 직후 Profile 비활성화·membership 제거 경합을 확인한다.

### PROD-410 Owner-scoped GraphQL 조회 shape

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `PROD-391`, `PROD-410`
- Status: Active
- Context / Problem: private Bookmark 목록과 개별 관계를 Relay Node로 제공하면서 Owner 격리, Target Post 가시성, pagination과 global ID 우회 방지를 하나의 공개 GraphQL 계약으로 고정해야 한다.
- Decision Outcome: 현재 선택된 Profile의 `Profile.bookmarks`를 owner-only connection으로 제공하고 `Bookmark`를 Owner만 조회할 수 있는 Relay Node로 제공한다. 다른 Profile의 connection 접근은 `PERMISSION_DENIED`, 비Owner의 Bookmark Node 조회는 `null`로 정규화한다. Owner가 조회한 `Bookmark.post`는 nullable이며 숨겨진 Target은 `null`을 반환하고, 목록에서는 같은 Bookmark edge를 cursor·order·limit 전에 제외한다.
- Alternatives Considered: top-level viewer Bookmark query — Profile 소유 관계와 Relay cache identity가 약해 채택하지 않는다. 비Owner 목록에 빈 connection 반환 — 권한 실패와 실제 empty 결과를 혼합해 채택하지 않는다. 숨겨진 Target 때문에 Bookmark Node 자체를 숨김 — Owner의 관계 관리 경로를 막아 채택하지 않는다.
- Consequences: connection field, Bookmark Node loader와 `Bookmark.post`가 각각 Owner와 Target 가시성 경계를 일관되게 적용해야 한다. global ID 입력으로 owner 범위를 우회할 수 없어야 한다.
- Confirmation / Follow-up: `PROD-410` API 검증에서 Owner/non-Owner connection, Bookmark Node ID 우회, 숨겨진 Target의 nullable `post`와 목록 edge 제외를 확인한다.

### PROD-410 공용 Post 조회 정책 위임과 단계적 적용

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-391`, `PROD-410`
- Status: Active
- Context / Problem: Bookmark가 Target Post 조회 가능성을 독자적으로 재구현하면 Post Node와 목록의 정책이 어긋난다. 동시에 Block·Mentioned Profiles·Domain Block 등 일부 canonical Post 정책은 현재 공용 데이터 모델과 predicate에 아직 도입되지 않았다.
- Decision Outcome: Bookmark connection과 `Bookmark.post`는 현재 공용 Post 조회 predicate의 판정을 사용하고 Bookmark 전용 가시성 subset을 만들지 않는다. `PROD-410`은 현재 도달 가능한 ACTIVE Post, 작성자 Profile/Instance 상태, Public/Unlisted, 작성자 본인과 Followers Only follower 조건을 검증한다. 아직 공용 계층에 없는 정책은 이 이슈에서 새로 구현하지 않으며, 후속 공용 predicate 확장을 Bookmark 조회가 자동으로 상속한다. 미구현 정책을 지원 완료로 주장하지 않는다.
- Alternatives Considered: Bookmark 전용 predicate 복제 — 정책 drift를 만들어 채택하지 않는다. 누락된 Post 정책과 데이터 모델을 `PROD-410`에 포함 — 승인된 이슈 범위를 확장하므로 채택하지 않는다. 현재 helper 동작을 전체 canonical 정책 충족으로 간주 — 검증되지 않은 지원을 주장하므로 채택하지 않는다.
- Consequences: pagination query와 nullable Target 조회는 같은 공용 판정을 공유해야 한다. 현재 API 검증은 도달 가능한 정책과 위임 경계를 증명하고, 미래 공용 정책 검증은 해당 정책 소유 이슈와 부모 통합 검증이 담당한다.
- Confirmation / Follow-up: `PROD-410` 검증에서 공용 predicate가 숨긴 최신 row 뒤의 조회 가능한 row로 page limit을 채우고, 숨김·관계 유지·재노출과 Node/connection 경계를 확인한다.

### Bookmark 목록에서 기존 Post 카드 navigation 재사용

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-452](https://linear.app/byulmaru/issue/PROD-452/bookmark-%EB%AA%A9%EB%A1%9D%EC%9D%98-%ED%94%84%EB%A0%88%EC%A0%A0%ED%85%8C%EC%9D%B4%EC%85%98-%EC%83%81%ED%83%9C%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4), 2026-07-21 사용자 결정
- Status: Active
- Context / Problem: 실제 Bookmark connection 없이 목록 presentation을 먼저 검증하면서도 Target Post의 상세 화면 또는 desktop side-view 동작이 기존 Post 표면과 갈라지지 않아야 한다.
- Decision Outcome: `PROD-452`의 populated 상태는 기존 `PostListItem` Relay fragment와 Profile·Post canonical Link를 그대로 재사용한다. Bookmark 전용 `onTargetPostPress` callback, navigation route 또는 side-view를 추가하지 않는다. 목록 props는 loading·error·empty·pagination 상태와 retry/load-more callback만 소유하고, 실제 Bookmark connection과 route 연결은 `PROD-421`이 담당한다.
- Alternatives Considered: Bookmark 전용 Post 카드를 복제 — Post 표시와 navigation 계약이 갈라져 채택하지 않는다. `PostListItem`에 Target 선택 callback을 추가 — shell/router가 이미 canonical Link에 따라 상세 화면 또는 side-view를 결정하므로 불필요한 두 번째 navigation 계약이 되어 채택하지 않는다.
- Consequences: Storybook fixture는 Relay mock으로 `PostListItem_post$key`를 제공해야 하며 raw object cast로 fragment 계약을 우회하지 않는다. component interaction은 callback 대신 canonical detail href를 확인하고, presentation callback 검증은 retry와 pagination에 한정한다.
- Confirmation / Follow-up: 2026-07-21 PROD-452 Linear 본문과 사용자 확인을 반영했다. `PROD-452`는 fixture 상태와 canonical href를 검증하고, `PROD-421`은 실제 connection·route·shell 동작을 통합 검증한다.

## Remaining Decisions

없음.

## Superseded Decisions

- `Bookmark 저장 식별자와 안정적 최신순 index`와 `가시성 필터 이후 composite pagination`은 `UUIDv7 ID-only 저장과 pagination`으로 대체했다.
- `Target Post 가시성과 Bookmark FK lifecycle 분리`는 `Target Post 상태와 물리 삭제 lifecycle 분리`로 대체했다.
