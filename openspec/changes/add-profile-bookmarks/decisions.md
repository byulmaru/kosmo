## Context

이 기록은 `proposal.md`, 네 capability의 delta specs, `design.md`, canonical Bookmark 문서와 `PROD-391` 부모/자식 이슈 구조를 반영한다. 초기 `PROD-396` 저장 slice에서 확정한 선택과 현재 `PROD-408` 생성 slice 및 후속 API·client 구현 전에 확정할 선택을 구분한다. 저장, pagination과 공용 route에 관한 제안은 2026-07-20 OpenSpec Gate에서 승인되었다.

## Decision Records

### 하나의 Bookmark 계약과 이슈별 구현 소유권

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 저장, 생성, 삭제, 목록과 UI를 별도 PR로 리뷰하면서도 같은 사용자 결과와 lifecycle·권한·pagination 계약을 공유해야 한다.
- Decision Outcome: 부모 `PROD-391`이 단일 `add-profile-bookmarks` OpenSpec, 최종 통합 검증과 archive를 소유한다. `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-421`은 각각 자기 구현 결과와 테스트를 소유한다.
- Alternatives Considered: DB/API/UI별 OpenSpec 분리 — 같은 계약을 중복하고 일부 계층만 배포해도 완료로 보일 수 있어 채택하지 않았다. 모든 구현을 부모 한 PR에 포함 — 독립 리뷰·전달 책임을 잃어 채택하지 않았다.
- Consequences: `tasks.md`의 최상위 구현 group은 Linear 자식 이슈와 1:1로 대응한다. 개별 PR 완료만으로 change를 archive하지 않는다.
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

### 보호된 공용 Bookmark route와 Profile별 Relay 격리

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Android·iOS·Web이 같은 개인 목록을 제공하면서 selected Profile 전환 때 Bookmark 상태와 pagination cache가 섞이지 않아야 한다.
- Decision Outcome: `/bookmarks`를 `(tabs)` 아래의 보호된 universal Expo route로 사용한다. action과 목록 connection은 현재 Relay actor store 안에서 selected Profile별로 식별하며, Profile 전환은 새 Environment/Store와 connection/cursor를 사용한다. Post action은 목록·상세의 독립 control로 제공하고 공통 Post Action Bar rollout과 분리한다.
- Alternatives Considered: `/menu` placeholder 유지 — canonical 목록 route와 direct navigation을 제공하지 못해 채택하지 않는다. `apps/web` 별도 화면 — universal route/component 계약을 중복해 채택하지 않는다. app-global Bookmark store — Profile 간 비공개 상태를 섞을 수 있어 채택하지 않는다.
- Consequences: guest는 `/`로 이동하고, 선택 Profile이 없으면 목록 query를 실행하지 않는다. 목록 카드의 control은 상세 navigation보다 자기 동작을 우선해야 한다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인했다. `PROD-420/421`에서 세 플랫폼 route parity, guest/no-Profile, Profile 전환, action event 경계와 connection 격리를 검증한다.

### 멱등 Bookmark 생성 mutation 계약

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `PROD-408` 본문과 2026-07-21 생성 API·책임 경계 확정 댓글
- Status: Active
- Context / Problem: Profile/Post 유일성은 확정되어 있지만 순차·동시 중복 요청의 외부 응답과 생성 mutation의 exact GraphQL shape가 열려 있었다.
- Decision Outcome: `createBookmark(input: { postId })`는 현재 `usingProfile`을 Owner로 사용하고 `CreateBookmarkPayload.bookmark`를 반환한다. Bookmark Node는 ID, Owner Profile, Target Post와 불변 생성 시각을 제공한다. 같은 Profile/Post 요청이 이미 존재하거나 경쟁에서 패하면 기존 Bookmark를 성공으로 반환하고 `createdAt`을 변경하지 않는다.
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

## Remaining Decisions

- **PROD-409 — missing/non-owner delete 응답:** 둘을 구분하지 않는 idempotent success와 nullable deleted ID를 기본안으로 검토한다. 구분 불가능한 not-found 의미도 허용 후보이며 `PROD-409` 구현 전에 확정한다.
- **PROD-410/420 — GraphQL 목록·viewer-relative shape:** `Profile.bookmarks`와 Post의 viewer-relative Bookmark 관계를 기본안으로 검토한다. 생성 mutation과 Bookmark Node의 기본 관계 shape는 확정됐으며, 목록 connection과 Post 상태 field는 두 이슈 구현 전에 함께 확정한다.
- **PROD-420 — mutation feedback:** 기존 client 관례인 response-driven 갱신을 기본안으로 검토한다. Relay optimistic update를 선택하면 actor 전환 race와 rollback을 추가 검증한다.
- **PROD-421 — mobile navigation entry:** `/bookmarks` route는 고정하되 sidebar 외 mobile shell에서의 정확한 진입 control은 구현 전에 확정한다.

위 Remaining Decisions는 현재 `PROD-408` 생성 mutation 계약을 막지 않는다. 각 owner 이슈에 착수하기 전 관련 결정을 `Decision Records`에 추가하고 사용자 승인을 받아야 한다.

## Superseded Decisions

- `Bookmark 저장 식별자와 안정적 최신순 index`와 `가시성 필터 이후 composite pagination`은 `UUIDv7 ID-only 저장과 pagination`으로 대체했다.
- `Target Post 가시성과 Bookmark FK lifecycle 분리`는 `Target Post 상태와 물리 삭제 lifecycle 분리`로 대체했다.
