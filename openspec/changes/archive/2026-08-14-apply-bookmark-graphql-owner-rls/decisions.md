## Context

이 기록은 PROD-771의 Bookmark GraphQL owner RLS, hidden Target Post 관계 유지, 최소 command 범위와 downstream principal cutover 분리를 구현 가능한 선택으로 구체화한다. Post/PostContent를 포함한 다른 table policy, 역할·ACL·session writer·credential cutover와 production 운영은 독립 경계에 남는다.

## Decision Records

### Bookmark policy는 kosmo_api에만 적용하고 owner와 Worker 우회를 유지한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, PROD-771, PROD-707, PROD-767
- Status: Active
- Context / Problem: GraphQL Bookmark owner 권한을 database에서 강제하면서 trusted Worker와 migration owner workload를 같은 policy로 제한하면 Project의 실행 경계가 섞인다.
- Decision Outcome: `bookmark`는 RLS를 활성화하되 FORCE RLS는 비활성화하고 policy role은 `kosmo_api`로 한정한다. `kosmo_worker` policy는 만들지 않고 기존 BYPASSRLS를 유지한다.
- Alternatives Considered: `PUBLIC` policy나 Worker 전용 permissive policy는 GraphQL-only 범위를 넓히며 이미 선언된 BYPASSRLS 경계를 중복한다.
- Consequences: migration은 owner runtime에서 additive하게 준비할 수 있지만 실제 GraphQL enforcement 활성화는 PROD-716 principal cutover가 소유한다.
- Confirmation / Follow-up: PostgreSQL catalog에서 RLS/FORCE/roles를 확인하고 owner·Worker 결과를 실제 SQL로 검증한다.

### Bookmark row owner 권한과 Target Post 노출을 분리한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-771
- Status: Active
- Context / Problem: Bookmark row가 Owner에게 보이는 조건과 Target Post가 GraphQL 관계·목록에서 보이는 조건은 생명주기가 다르다. 둘을 같은 RLS predicate에 묶으면 Post가 숨겨졌을 때 Owner도 Bookmark Node를 잃고 삭제할 수 없다.
- Decision Outcome: Bookmark SELECT/DELETE는 `bookmark.profile_id` owner equality만 사용하고 Post visibility를 조회하지 않는다. `Bookmark.post`와 connection edge는 기존 Post 조회 경계를 계속 적용한다.
- Alternatives Considered: Bookmark policy에서 Post RLS 결과나 visibility predicate를 함께 요구하면 목록 필터는 database에 모일 수 있지만 hidden Target 관계 유지와 owner delete 계약을 깨뜨린다.
- Consequences: hidden Target에서도 Owner는 Bookmark row와 Node를 조회·삭제할 수 있고, GraphQL Post field는 nullable이며 connection은 edge를 제외한다.
- Confirmation / Follow-up: hidden Target Node, nullable Post, connection 제외와 owner delete를 기존 GraphQL integration 및 role-level SQL로 검증한다.

### SELECT, INSERT와 DELETE를 command별 owner policy로 제한한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-771
- Status: Active
- Context / Problem: 하나의 `FOR ALL` owner policy는 구현이 짧지만 상태와 mutable attribute가 없는 Bookmark에 현재 승인되지 않은 UPDATE command까지 연다.
- Decision Outcome: `kosmo_api`에 SELECT `USING owner`, INSERT `WITH CHECK owner`, DELETE `USING owner` policy만 둔다. current Profile은 `public.kosmo_current_profile_id()`를 사용하고 helper가 `NULL`이면 equality가 fail-closed 된다. UPDATE policy는 만들지 않는다.
- Alternatives Considered: 하나의 `FOR ALL USING owner WITH CHECK owner`는 predicate 중복을 줄이지만 불필요한 UPDATE를 허용한다. 하나의 SECURITY DEFINER helper는 새 권한 경계를 추가하므로 필요하지 않다.
- Consequences: create의 insert/conflict-select와 delete-returning은 owner context에서 동작하고 다른 actor와 invalid context는 차단된다. 향후 Bookmark UPDATE 계약이 생기면 별도 upstream 승인과 policy가 필요하다.
- Confirmation / Follow-up: catalog command/role/qual/check와 owner/other/missing/empty/malformed INSERT·SELECT·DELETE 및 UPDATE 거부 matrix를 검증한다.

### application predicate와 production cutover는 downstream 경계에 유지한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: PROD-771, PROD-767, PROD-716
- Status: Active
- Context / Problem: 이 slice가 policy를 추가했다는 사실만으로 모든 GraphQL consumer coverage, default credential 또는 production runtime이 전환됐다고 볼 수 없다.
- Decision Outcome: Bookmark GraphQL application owner predicate와 operation session lifecycle은 유지한다. production preflight, sync/apply, principal cutover와 live 검증은 이 change에서 수행하지 않고 별도 명시 승인을 요구한다.
- Alternatives Considered: 이번 PR에서 predicate 제거와 credential cutover까지 함께 하면 작은 diff로 최종 상태에 접근하지만 다른 domain coverage와 cross-domain gate를 우회한다.
- Consequences: Ready PR과 OpenSpec 완료는 Bookmark 구현·비운영 증거만 뜻하며 production 활성화 증거가 아니다.
- Confirmation / Follow-up: diff에서 다른 table/predicate/credential 변경이 없는지 확인하고 PR 본문에 비운영·production 상태를 분리한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
