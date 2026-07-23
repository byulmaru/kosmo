## 1. PROD-396 Bookmark를 저장한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-391`
- `PROD-396`

**Deliverable**

Bookmark가 Owner Profile과 Target Post, 불변 생성 시각을 보존하고 같은 Profile/Post 조합에 하나만 존재하며 Profile별 안정적 최신순 조회를 지원한다.

**Guardrails**

- UUIDv7 식별자와 ID-only cursor 순서를 사용하고 같은 millisecond의 실제 생성 순서는 보장하지 않는다.
- Target Post가 Tombstone이 되거나 조회 불가능해져도 Bookmark 관계를 유지하고, 물리 삭제되면 cascade 삭제한다.
- 생성·삭제 API, 목록 GraphQL과 UI를 이 구현에 포함하지 않는다.
- additive migration만 사용하고 기존 데이터 backfill을 만들지 않는다.

**Verification**

- 빈 DB와 기존 데이터가 있는 이전 migration chain에서 schema migration을 검증한다.
- 필수 FK 실패, 동일 Profile/Post 순차·동시 중복 거부, 서로 다른 Profile의 독립 저장, ID-only index, Target Post 상태 변경 뒤 관계 유지와 물리 삭제 FK lifecycle을 DB 수준에서 검증한다.

- [x] 1.1 Bookmark 저장 모델에 필수 관계·생성 시각·Profile/Post 유일성과 안정적 최신순 index를 구현한다.
- [x] 1.2 기존 schema에 Bookmark 저장 구조를 추가하는 forward-only additive migration과 schema metadata를 생성한다.
- [x] 1.3 Bookmark 제약·index·관계 lifecycle을 증명하는 focused DB regression 검증을 추가한다.
- [x] 1.4 core migration·database test와 관련 정적 검사를 실행해 PROD-396 결과를 검증한다.

## 2. PROD-408 Bookmark를 생성한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `PROD-408` 본문과 2026-07-21 생성 API·책임 경계 확정 댓글
- `PROD-391`
- `PROD-408`

**Deliverable**

Active Local Profile이 조회 가능한 Post를 자신의 Bookmark로 저장하고 현재 Bookmark 상태를 API 응답으로 확인할 수 있다.

**Guardrails**

- GraphQL resolver가 Account 활성 상태, Profile membership·상태·locality와 Target Post 조회 정책을 검증하고, 권한 검사와 생성을 같은 transaction에서 수행한다.
- Core service는 검증된 Profile/Post 관계의 생성과 unique 경쟁 정규화만 담당하며 인증·Account·membership·가시성 조회를 수행하지 않는다.
- 같은 Profile/Post 조합은 순차·동시 요청에서도 하나만 유지하고 기존 Bookmark를 성공으로 반환하며 생성 시각을 바꾸지 않는다.
- `createBookmark(input: { postId })`는 현재 `usingProfile`을 Owner로 사용하고 `CreateBookmarkPayload.bookmark`로 Owner Profile·Target Post 관계를 식별할 수 있게 한다.
- Bookmark 생성은 Post Author Notification을 만들지 않는다.

**Verification**

- Core에서 정상 생성, 순차·동시 중복의 같은 ID/생성 시각, Profile 격리와 transaction rollback을 검증한다.
- GraphQL에서 사용할 수 없는 actor, 조회 불가 Target의 비공개 오류 의미, payload 관계 정규화와 무알림을 검증한다.

- [x] 2.1 duplicate create 응답과 생성 mutation의 공유 GraphQL 계약을 사용자와 확정하고 specs·decisions에 반영한다.
- [x] 2.2 검증된 Profile/Post 조합을 멱등하게 생성하고 호출 transaction에 참여하는 core 동작을 구현한다.
- [x] 2.3 Account/Profile/Post 권한을 검증하고 현재 Profile/Post 관계를 정규화하는 생성 mutation 계약을 구현한다.
- [x] 2.4 core 생성·중복·rollback과 GraphQL 권한·가시성·payload·무알림 검증을 추가하고 관련 check를 통과시킨다.

## 3. PROD-409 Bookmark를 삭제한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `PROD-391`
- `PROD-409`

**Deliverable**

Bookmark Owner Profile이 Target Post의 현재 가시성과 관계없이 자신의 Bookmark를 삭제할 수 있다.

**Guardrails**

- 다른 Profile에는 비공개 Bookmark의 존재 여부를 노출하지 않는다.
- 숨겨진 Target의 Bookmark도 Owner가 삭제할 수 있어야 한다.
- missing·non-owner·반복/동시 loser는 오류 없는 `bookmarkId: null`, `post: null` 성공으로 정규화한다.
- 첫 Owner 삭제는 exact deleted Bookmark ID와 현재 조회 가능한 Target Post를 반환하고, 숨겨진 Target이면 Post를 `null`로 반환한다.

**Verification**

- Owner 성공, 비Owner·missing의 동일 외부 의미, 반복·동시 삭제, 숨겨진 Target 삭제, exact deleted relation 식별과 transaction 결과를 core/API 수준에서 검증한다.

- [x] 3.1 missing/non-owner 삭제 응답과 삭제 mutation의 공유 GraphQL 계약을 사용자와 확정하고 specs·decisions에 반영한다.
- [x] 3.2 Owner 권한과 숨겨진 Target 관계 삭제를 보장하는 core 동작을 구현한다.
- [x] 3.3 Relay가 제거할 관계와 영향받은 Post 상태를 식별할 수 있는 삭제 mutation 계약을 구현한다.
- [x] 3.4 Owner·비Owner·missing·반복/동시 삭제와 숨겨진 Target 삭제 검증을 추가하고 관련 check를 통과시킨다.

## 4. PROD-410 Bookmark 목록을 조회한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-391`
- `PROD-410`

**Deliverable**

Owner Profile이 조회 가능한 Target의 Bookmark를 안정적인 최신순 connection으로 탐색하고, 숨겨진 Target의 관계는 유지된 채 가시성 회복 시 다시 확인할 수 있다.

**Guardrails**

- Owner 이외에는 Bookmark Node와 목록의 존재를 공개하지 않는다.
- 다른 Profile의 `Profile.bookmarks` 접근은 `PERMISSION_DENIED`, 비Owner의 Bookmark Node 조회는 `null`로 처리한다.
- Owner의 개별 `Bookmark.post`는 nullable이고 숨겨진 Target을 `null`로 반환하며, 목록은 같은 Bookmark edge를 제외한다.
- Target Post 가시성은 cursor·order·limit보다 먼저 적용한다.
- Bookmark 전용 가시성 규칙을 만들지 않고 현재 공용 Post 조회 predicate를 재사용하며, 후속 공용 정책 확장을 자동으로 상속한다.
- Block·Mentioned Profiles·Domain Block 등 현재 공용 데이터 모델에 없는 정책을 이 이슈에서 새로 구현하거나 지원 완료로 주장하지 않는다.
- 순서는 UUIDv7 `id DESC`이며 ID-only cursor를 사용한다.
- 숨겨진 Target을 client post-filter로 처리하거나 Bookmark를 자동 삭제하지 않는다.

**Verification**

- owner/non-owner connection과 Node ID 우회 방지, 개별 Node의 nullable Target과 목록 edge 제외, 같은 millisecond의 ID-only pagination, 숨겨진 최신 row 뒤의 조회 가능한 row로 page limit 충족, 현재 도달 가능한 공용 Post 정책의 숨김·관계 유지·재노출과 공용 predicate 위임을 API/DB 수준에서 검증한다.

- [x] 4.1 Owner connection·Bookmark Node·nullable Target과 공용 Post 정책 위임 계약을 Linear·specs·decisions에 일치시킨다.
- [x] 4.2 Owner·Target 가시성을 limit 전에 적용하는 안정적 최신순 Bookmark connection을 구현한다.
- [x] 4.3 Owner-only Bookmark Node와 숨겨진 Target의 nullable `post`·connection edge 경계를 구현한다.
- [x] 4.4 owner 격리·Node 보안·nullable Target·ID-only cursor·visibility-before-limit·공용 Post 정책 위임·재노출 검증을 추가하고 관련 check를 통과시킨다.

## 5. PROD-420 Post에서 selected Profile의 Bookmark 상태를 조회한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `PROD-391`
- `PROD-420`

**Deliverable**

인증된 세션의 selected Profile이 Post를 저장한 현재 Bookmark 관계를 nullable `Post.viewerBookmark`로 조회할 수 있다.

**Guardrails**

- 현재 selected Profile과 Post의 Bookmark 관계만 반환하고 다른 Profile의 존재를 노출하지 않는다.
- guest, selected Profile 없음과 미저장 상태는 `null`로 정규화한다.
- 여러 Post의 관계는 request-scoped batch loader로 조회해 N+1을 방지한다.
- 생성·삭제 mutation, Bookmark action UI, Relay mutation/cache 처리와 production surface 연결을 포함하지 않는다.

**Verification**

- 저장·미저장·guest·selected Profile 없음, Profile별 격리와 여러 Post batch 조회를 API integration 수준에서 검증한다.

- [x] 5.1 `Post.viewerBookmark` 조회 shape와 PROD-432의 action UI 책임 경계를 Linear·specs·decisions에 일치시킨다.
- [x] 5.2 selected Profile/Post 관계를 반환하는 nullable field와 request-scoped batch loader를 구현한다.
- [x] 5.3 저장·미저장·guest·selected Profile 없음·Profile 격리와 여러 Post batch 조회 API 검증을 추가한다.
- [x] 5.4 API 정적 검사·통합 테스트와 OpenSpec strict validation을 실행해 PROD-420 결과를 검증한다.

## 6. PROD-452 Bookmark 목록의 프레젠테이션 상태를 구현한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- [PROD-452](https://linear.app/byulmaru/issue/PROD-452/bookmark-%EB%AA%A9%EB%A1%9D%EC%9D%98-%ED%94%84%EB%A0%88%EC%A0%A0%ED%85%8C%EC%9D%B4%EC%85%98-%EC%83%81%ED%83%9C%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4)

**Deliverable**

실제 Bookmark connection 없이도 Bookmark 목록의 loading·error·empty·populated와 추가 로딩 상태를 재현하고, Target Post는 기존 Post 카드의 canonical navigation 동작으로 표시한다.

**Guardrails**

- 기존 `PostListItem`의 Profile·Post canonical Link를 재사용하고 Bookmark 전용 Target 선택 callback이나 navigation·side-view를 추가하지 않는다.
- private route, 실제 Bookmark connection·Relay pagination, unavailable Target 제거와 selected Profile 격리를 구현하지 않는다.
- 목록 상태와 pagination 요청은 실제 route가 나중에 연결할 수 있는 presentation props와 mock callback 경계로 제공한다.
- 기존 Post 카드의 Relay fragment 계약을 유지하고 raw object cast로 우회하지 않는다.

**Verification**

- fixture만으로 loading·error·empty·populated와 추가 로딩 상태를 Storybook에서 재현한다.
- 기존 Post 카드의 canonical detail href, error retry, pagination 요청과 loading 중 중복 방지를 component interaction 수준에서 검증한다.

- [x] 6.1 기존 `PostListItem`을 사용하는 Bookmark 목록 presentation과 loading·error·empty·populated 상태를 구현한다.
- [x] 6.2 실제 connection 없이 pagination callback과 추가 로딩 상태를 제공하고 Storybook 상태 조합을 추가한다.
- [x] 6.3 canonical detail href, retry·pagination interaction과 접근성 검증을 추가하고 관련 check를 통과시킨다.

## 7. PROD-421 Bookmark 목록 화면을 제공한다

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `PROD-391`
- `PROD-421`

**Deliverable**

선택된 Profile이 보호된 `/bookmarks` route에서 자신의 Bookmark를 최신순으로 탐색하고 조회 가능한 Target Post로 이동할 수 있다.

**Guardrails**

- Android·iOS·Web은 같은 Expo route와 공용 component·Relay 계약을 사용한다.
- PROD-452의 목록 presentation을 재사용하고 기존 Post 카드의 canonical navigation을 Bookmark 전용 callback으로 대체하지 않는다.
- selected Profile이 없으면 목록 query를 실행하지 않고, Profile 전환 뒤 이전 edge·cursor를 재사용하지 않는다.
- 서버가 숨긴 Target Post를 client fallback으로 복원하거나 노출하지 않는다.
- 다음 페이지 요청이 실패하면 기존 Post 카드를 유지하고 목록 아래에 alert와 retry action을 제공한다.
- Web full·compact sidebar와 mobile drawer는 공용 `SidebarNavigation`의 Bookmark 항목을 `/bookmarks`로 연결하고, mobile bottom tab이나 별도 header 버튼을 추가하지 않는다.

**Verification**

- guest redirect, no-selected-Profile, loading·initial error·empty·pagination, 다음 페이지 실패 시 기존 edge 유지·retry, Target 이동, Profile 격리, mobile entry와 Web direct navigation을 route/component integration 수준에서 검증한다.

- [x] 7.1 Web full·compact sidebar와 mobile drawer의 공용 Bookmark 메뉴를 `/bookmarks`로 연결하고 bottom tab은 유지하기로 사용자와 확정해 specs·decisions에 반영한다.
- [ ] 7.2 selected Profile별 pagination connection과 PROD-452 presentation을 연결하는 공용 Bookmark 목록 route를 구현한다.
- [ ] 7.3 desktop·mobile navigation entry와 기존 Post 카드의 canonical detail Link가 shell/router 정책으로 동작하게 한다.
- [ ] 7.4 세 플랫폼 route parity와 실제 connection의 목록 상태·pagination·Profile 격리·direct navigation 검증을 추가하고 관련 check를 통과시킨다.

## 8. PROD-391 Bookmark 계약 통합 검증과 archive

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-391`
- `PROD-396`, `PROD-408`, `PROD-409`, `PROD-410`, `PROD-420`, `PROD-452`, `PROD-421`

**Deliverable**

저장·생성·삭제·목록·viewer-relative 조회 API·목록 화면이 하나의 개인 Bookmark 사용자 계약으로 동작하고 canonical 문서와 OpenSpec이 최종 구현을 반영한다.

**Guardrails**

- 각 자식 이슈가 자기 구현 결과와 테스트를 완료하기 전에는 부모를 완료하거나 change를 archive하지 않는다.
- Bookmark action adapter·공통 Post Action Bar와 다른 Non-Goals를 통합 범위에 추가하지 않는다.
- PR readiness와 OpenSpec 전체 완료·archive를 별도로 판단한다.

**Verification**

- 선택 Profile의 저장 → `Post.viewerBookmark`/목록 조회 → Target 숨김·관계 유지·재노출 → 해제 vertical flow를 검증한다.
- 모든 requirement scenario, 자식 검증 증거, canonical 문서·active specs 정합성, archive 전후 strict validation을 확인한다.

- [ ] 8.1 일곱 구현 이슈의 결과·테스트와 Remaining Decisions 해소 상태를 대조한다.
- [ ] 8.2 Bookmark vertical flow와 Profile·가시성·pagination 경계의 최종 통합 검증을 실행한다.
- [ ] 8.3 구현에서 확정된 계약을 canonical 문서·OpenSpec artifacts와 동기화하고 archive diff를 검토한다.
- [ ] 8.4 Completion Gate 승인 후 change를 archive하고 archive 후 strict validation을 통과시킨다.
