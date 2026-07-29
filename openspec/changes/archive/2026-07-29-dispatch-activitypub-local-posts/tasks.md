## 1. PROD-512 공통 outbound recipient dispatcher

**Authority / Provenance**

- `docs/domain/objects/instance.md`
- `docs/domain/objects/profile.md`
- PROD-512

**Deliverable**

Activity lifecycle이 direct Profile과 Author followers target을 넘기면 공통 경계가 usable remote Recipient를
확장·중복 제거하고 Fedify direct delivery를 수행한다.

**Guardrails**

- dispatcher는 Activity 종류·identity·audience와 domain target 의미를 재정의하지 않는다.
- canonical Instance/Profile eligibility와 HTTP(S) actor·personal inbox 조건을 적용한다.
- invalid shared inbox는 valid personal inbox recipient를 제거하지 않는다.
- 외부 followers collection 공개 동작을 추가하지 않는다.

**Verification**

- direct target, followers target, 두 target 중복, 빈 followers와 no-recipient를 검증한다.
- Instance/Profile 상태, invalid actor·personal/shared inbox와 personal fallback matrix를 검증한다.
- 같은 Activity, ordering key, Author signing identity가 Fedify delivery에 전달되는지 검증한다.

- [x] 1.1 direct Profile과 established followers target을 공통 remote Recipient 집합으로 확장한다.
- [x] 1.2 canonical remote eligibility, HTTP(S) endpoint 검증과 shared-inbox fallback을 적용한다.
- [x] 1.3 actor identity 기준으로 recipient를 중복 제거하고 no-recipient를 정상 no-op 처리한다.
- [x] 1.4 이미 구성된 Activity와 ordering key를 Author Local Instance signing context에서 전달한다.
- [x] 1.5 dispatcher target·eligibility·deduplication·delivery 검증을 추가한다.

## 2. PROD-512 일반 Local Post Create/Delete delivery

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-494
- PROD-512
- PROD-376

**Deliverable**

Root Post와 Reply를 구분하지 않는 모든 Local content Post가 canonical Note를 사용하는 안정적인
`Create(Note)`·`Delete(Note URI)`와 논리적 outbound target을 제공한다.

**Guardrails**

- Reply의 표현 차이는 PROD-494 Note projection의 `inReplyTo`뿐이며 Reply 전용 builder를 만들지 않는다.
- Content 없는 Repost와 지원하지 않는 Visibility를 Local Note lifecycle에 포함하지 않는다.
- Public/Unlisted remote Reply만 Parent author direct target을 추가하고 Followers Only visibility를 우회하지 않는다.
- actor·Note·activity·signing identity는 Post Author의 Local Instance에서 파생한다.
- secondary Local Instance의 production Actor·Note HTTP routing은 PROD-376으로 유지한다.
- Create/Delete 반복 호출은 stable activity identity와 같은 Note ordering domain을 사용한다.

**Verification**

- Root Post, Local Parent Reply, remote Parent Public/Unlisted/Followers Only Reply의 Create와 target matrix를 검증한다.
- Root Post와 Reply Delete, Content 없는 Repost 제외와 반복 호출 identity·ordering을 검증한다.
- configured origin과 다른 Author Local Instance에서 모든 federation identity와 signing key를 검증한다.

- [x] 2.1 PROD-494 full Note projection을 Root Post와 Reply의 공통 Create object로 재사용한다.
- [x] 2.2 Tombstone Local content Post에서 canonical Delete identity·audience와 target 의미를 복원한다.
- [x] 2.3 visibility와 Reply 관계를 followers·direct Profile target으로 변환하고 dispatcher에 전달한다.
- [x] 2.4 Author Local Instance 기반 identity와 stable Create/Delete activity·ordering을 유지한다.
- [x] 2.5 Root Post·Reply·Delete·unsupported structure와 multi-origin 검증을 추가한다.

## 3. PROD-512 core Post lifecycle 연결

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/post.md`
- PROD-447
- PROD-512
- PROD-533

**Deliverable**

통합 Post application action이 Local content Post의 commit 결과에 따라 공통 delivery를 실행하고, rollback 또는
delivery 실패에도 persistence와 application 결과가 canonical transaction 계약을 따른다.

**Guardrails**

- GraphQL resolver가 Notification 또는 Fedify lifecycle을 직접 조립하지 않는다.
- optional caller transaction 입력과 Post origin은 독립적으로 유지한다.
- transaction 인자의 존재 여부로 Local Post lifecycle 자체를 켜거나 끄지 않는다.
- Reply Notification은 ActivityPub delivery와 분리해 caller transaction에 참여한다.
- rollback된 transition의 Activity를 전달하지 않고 committed result를 remote delivery 실패로 뒤집지 않는다.

**Verification**

- top-level Root Post·Reply Create/Delete의 delivery 호출과 failure isolation을 검증한다.
- 생성·삭제 rollback zero-call과 caller-owned transaction의 현재 committed-read no-op 제한을 검증한다.
- Reply Notification commit/rollback과 GraphQL resolver 책임 경계를 검증한다.

- [x] 3.1 처음 commit된 Local content Post 생성 결과를 일반 Create delivery에 연결한다.
- [x] 3.2 처음 commit된 Local content Post Tombstone 결과를 일반 Delete delivery에 연결한다.
- [x] 3.3 delivery 실패를 관측하되 committed create/delete 결과와 반환값을 유지한다.
- [x] 3.4 optional caller transaction·origin·Reply Notification 계약을 보존한다.
- [x] 3.5 core와 API integration에서 commit·rollback·failure isolation과 resolver 경계를 검증한다.

## 4. PROD-512 Reply 전용 경계 제거와 통합 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-512

**Deliverable**

기존 Reply 전용 delivery capability와 implementation이 일반 Local Post delivery 및 공통 dispatcher로 완전히
대체되고, PROD-534 sibling migration 없이 PROD-512 범위만 독립 검증된다.

**Guardrails**

- archived 과거 OpenSpec 이력을 rewrite하지 않는다.
- Repost·Reaction·Follow·Mention delivery를 이번 change에서 migration하지 않는다.
- outbox, queue, worker, retry/history와 future transport abstraction을 추가하지 않는다.
- DB schema와 GraphQL payload를 변경하지 않는다.

**Verification**

- active Reply 전용 capability가 제거되고 새 두 capability의 strict validation이 통과하는지 확인한다.
- Reply 전용 delivery export·query·helper가 production 경로에 남지 않았는지 정적 검색으로 확인한다.
- core, Fedify와 API 관련 테스트·TypeScript·lint·format을 통과시킨다.

- [x] 4.1 Reply 전용 active capability를 두 일반 capability로 migration하고 archived 이력은 보존한다.
- [x] 4.2 Reply 전용 recipient query·delivery helper와 public export를 제거한다.
- [x] 4.3 기존 PROD-497 구현에서 새 경계에 필요한 일반 Note·origin·identity 동작만 유지한다.
- [x] 4.4 Repost와 다른 sibling interaction에 의도하지 않은 변경이 없는지 확인한다.
- [x] 4.5 OpenSpec strict validation과 관련 workspace 검증을 모두 통과시킨다.
