## 1. PROD-396 Bookmark를 저장한다

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

**Deliverable**

Bookmark Owner Profile이 Target Post의 현재 가시성과 관계없이 자신의 Bookmark를 삭제할 수 있다.

**Guardrails**

- 다른 Profile에는 비공개 Bookmark의 존재 여부를 노출하지 않는다.
- 숨겨진 Target의 Bookmark도 Owner가 삭제할 수 있어야 한다.
- missing/non-owner 응답 의미와 삭제 mutation payload는 구현 전에 Remaining Decisions에서 확정한다.

**Verification**

- Owner 성공, 비Owner·missing의 동일 외부 의미, 반복·동시 삭제, 숨겨진 Target 삭제, exact deleted relation 식별과 transaction 결과를 core/API 수준에서 검증한다.

- [ ] 3.1 missing/non-owner 삭제 응답과 삭제 mutation의 공유 GraphQL 계약을 사용자와 확정하고 specs·decisions에 반영한다.
- [ ] 3.2 Owner 권한과 숨겨진 Target 관계 삭제를 보장하는 core 동작을 구현한다.
- [ ] 3.3 Relay가 제거할 관계와 영향받은 Post 상태를 식별할 수 있는 삭제 mutation 계약을 구현한다.
- [ ] 3.4 Owner·비Owner·missing·반복/동시 삭제와 숨겨진 Target 삭제 검증을 추가하고 관련 check를 통과시킨다.

## 4. PROD-410 Bookmark 목록을 조회한다

**Deliverable**

Owner Profile이 조회 가능한 Target의 Bookmark를 안정적인 최신순 connection으로 탐색하고, 숨겨진 Target의 관계는 유지된 채 가시성 회복 시 다시 확인할 수 있다.

**Guardrails**

- Owner 이외에는 Bookmark Node와 목록의 존재를 공개하지 않는다.
- Target Post 가시성은 cursor·order·limit보다 먼저 적용한다.
- 순서는 UUIDv7 `id DESC`이며 ID-only cursor를 사용한다.
- 숨겨진 Target을 client post-filter로 처리하거나 Bookmark를 자동 삭제하지 않는다.

**Verification**

- owner 격리와 Node ID 우회 방지, 같은 millisecond의 ID-only pagination, 숨겨진 최신 row 뒤의 조회 가능한 row로 page limit 충족, 숨김·관계 유지·재노출을 API/DB 수준에서 검증한다.

- [ ] 4.1 생성·삭제 slice와 공유하는 owner/관계 GraphQL shape를 확정된 decisions와 일치시킨다.
- [ ] 4.2 Owner·Target 가시성을 limit 전에 적용하는 안정적 최신순 Bookmark connection을 구현한다.
- [ ] 4.3 Owner-only Bookmark Node와 숨겨진 Target 관계 삭제 경계를 구현한다.
- [ ] 4.4 owner 격리·Node 보안·ID-only cursor·visibility-before-limit·재노출 검증을 추가하고 관련 check를 통과시킨다.

## 5. PROD-420 Bookmark action을 제공한다

**Deliverable**

Post를 조회하는 Local Profile이 목록과 상세 표면에서 자신의 현재 Bookmark 상태를 확인하고 저장하거나 해제할 수 있다.

**Guardrails**

- selected Profile별 상태와 Relay actor store를 격리한다.
- pending 중 같은 동작의 중복 요청을 막고 실패 시 마지막 확정 상태와 재시도 경로를 제공한다.
- 목록 카드 안의 action은 게시글 상세 navigation보다 자기 동작을 우선한다.
- 공통 Post Action Bar를 새로 만들거나 그 rollout을 이 이슈에 포함하지 않는다.
- response-driven/optimistic feedback 선택은 구현 전에 Remaining Decisions에서 확정한다.

**Verification**

- 저장 전·후·해제, pending 중복 방지, 선택한 실패 복구, Profile 전환 격리, 목록 카드 event 경계, 상세 action과 접근성을 component/integration 수준에서 검증한다.

- [ ] 5.1 mutation feedback 정책을 사용자와 확정하고 specs·decisions에 반영한다.
- [ ] 5.2 현재 Profile/Post Bookmark 상태와 생성·삭제를 연결하는 공용 action 동작을 구현한다.
- [ ] 5.3 목록과 상세 Post 표면에 독립 action을 연결하고 selected Profile별 Relay 상태를 정규화한다.
- [ ] 5.4 상태 전환·pending·실패/재시도·Profile 격리·navigation·접근성 검증을 추가하고 관련 check를 통과시킨다.

## 6. PROD-421 Bookmark 목록 화면을 제공한다

**Deliverable**

선택된 Profile이 보호된 `/bookmarks` route에서 자신의 Bookmark를 최신순으로 탐색하고 조회 가능한 Target Post로 이동할 수 있다.

**Guardrails**

- Android·iOS·Web은 같은 Expo route와 공용 component·Relay 계약을 사용한다.
- selected Profile이 없으면 목록 query를 실행하지 않고, Profile 전환 뒤 이전 edge·cursor를 재사용하지 않는다.
- 서버가 숨긴 Target Post를 client fallback으로 복원하거나 노출하지 않는다.
- mobile navigation entry는 구현 전에 Remaining Decisions에서 확정한다.

**Verification**

- guest redirect, no-selected-Profile, loading·error·retry·empty·pagination, Target 이동, Profile 격리, mobile entry와 Web direct navigation을 route/component integration 수준에서 검증한다.

- [ ] 6.1 mobile shell의 `/bookmarks` navigation entry를 사용자와 확정하고 specs·decisions에 반영한다.
- [ ] 6.2 selected Profile별 pagination connection을 사용하는 공용 Bookmark 목록 route와 화면 상태를 구현한다.
- [ ] 6.3 desktop·mobile navigation과 Target Post 이동을 canonical route에 연결한다.
- [ ] 6.4 세 플랫폼 route parity와 목록 상태·pagination·Profile 격리·direct navigation 검증을 추가하고 관련 check를 통과시킨다.

## 7. PROD-391 Bookmark 계약 통합 검증과 archive

**Deliverable**

저장·생성·삭제·목록·개별 action·목록 화면이 하나의 개인 Bookmark 사용자 계약으로 동작하고 canonical 문서와 OpenSpec이 최종 구현을 반영한다.

**Guardrails**

- 각 자식 이슈가 자기 구현 결과와 테스트를 완료하기 전에는 부모를 완료하거나 change를 archive하지 않는다.
- 공통 Post Action Bar와 다른 Non-Goals를 통합 범위에 추가하지 않는다.
- PR readiness와 OpenSpec 전체 완료·archive를 별도로 판단한다.

**Verification**

- 선택 Profile의 저장 → action/목록 반영 → Target 숨김·관계 유지·재노출 → 해제 vertical flow를 검증한다.
- 모든 requirement scenario, 자식 검증 증거, canonical 문서·active specs 정합성, archive 전후 strict validation을 확인한다.

- [ ] 7.1 여섯 구현 자식의 결과·테스트와 Remaining Decisions 해소 상태를 대조한다.
- [ ] 7.2 Bookmark vertical flow와 Profile·가시성·pagination 경계의 최종 통합 검증을 실행한다.
- [ ] 7.3 구현에서 확정된 계약을 canonical 문서·OpenSpec artifacts와 동기화하고 archive diff를 검토한다.
- [ ] 7.4 Completion Gate 승인 후 change를 archive하고 archive 후 strict validation을 통과시킨다.
