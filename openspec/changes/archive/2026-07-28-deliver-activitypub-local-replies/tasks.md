## 1. PROD-497 Reply Create/Delete Fedify delivery

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-497

**Deliverable**

Local Reply가 기존 canonical Note 표현과 identity를 사용하는 안정적인 `Create(Note)`·`Delete` activity로 현재
허용된 remote Parent Author에게 전달된다.

**Guardrails**

- Create는 PROD-494의 Local Note content, summary, audience와 Local/Remote Parent `inReplyTo`를 재사용한다.
- Delete는 생성 때 사용한 canonical Note URI를 가리키며 별도 Tombstone endpoint나 mapping row를 만들지 않는다.
- Public/Unlisted는 remote Parent Author만 direct recipient로 허용하고 Followers Only·Direct는 전달하지 않는다.
- ACTIVE ActivityPub Instance의 usable HTTP(S) actor endpoint만 사용하고 UNRESPONSIVE/SUSPENDED는 제외한다.
- Fedify Context, actor URI와 Note identity는 Reply Author Profile의 Local Instance `canonicalOrigin`에서 파생한다.
- Create는 `{noteUri}#create`, Delete는 `{noteUri}#delete`, ordering domain은 canonical Note URI를 사용한다.
- follower 직접 조회·fanout, followers/outbox collection, queue, retry/history와 새 DB schema를 추가하지 않는다.

**Verification**

- Local/Remote Parent의 Create Note projection과 Delete object identity를 검증한다.
- configured origin과 다른 Local Instance Author의 Create/Delete identity와 Context origin을 검증한다.
- visibility, Parent Author, endpoint와 Instance state recipient matrix를 검증한다.
- 반복 delivery ID, Create/Delete ordering key, shared inbox와 no-recipient no-op을 검증한다.

- [x] 1.1 기존 Local Note projection을 Create delivery에서도 동일하게 사용할 수 있도록 Fedify 내부 경계를 정렬한다.
- [x] 1.2 stable activity identity와 ordering domain을 사용하는 Reply Create/Delete delivery를 구현한다.
- [x] 1.3 현재 visibility·Parent Author·Instance·actor endpoint 계약에 맞는 direct recipient selection을 구현한다.
- [x] 1.4 Create/Delete projection, recipient matrix, 반복 호출과 delivery option의 Fedify 검증을 추가한다.

## 2. PROD-497 Post-commit application integration

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-447
- PROD-497

**Deliverable**

Local Reply domain transaction이 commit된 뒤에만 Create/Delete delivery가 실행되고, remote delivery 실패에도
GraphQL application 결과와 committed Reply state가 성공으로 유지된다.

**Guardrails**

- transaction callback 또는 optional caller transaction 내부에서 delivery하지 않는다.
- core Post public contract에 GraphQL·Fedify 타입, callback이나 speculative delivery port를 추가하지 않는다.
- delivery Promise를 fire-and-forget하지 않고 await한 뒤 실패를 Reply identity와 함께 관측한다.
- 기존 Reply Notification과 Post 삭제 Notification cleanup의 best-effort lifecycle을 재정의하지 않는다.
- Reply가 아닌 Post의 생성·삭제에는 이 capability의 activity를 전달하지 않는다.

**Verification**

- transaction rollback에서 delivery가 호출되지 않고 commit 뒤에만 호출되는지 검증한다.
- Create/Delete remote failure에서 GraphQL 성공 payload와 committed DB state가 일치하는지 검증한다.
- 일반 Post, Repost와 remote-origin Post lifecycle이 Reply delivery를 만들지 않는지 회귀 검증한다.

- [x] 2.1 Local Reply 생성의 outer transaction commit 뒤 Create delivery를 연결하고 실패를 application 결과와 격리한다.
- [x] 2.2 Local Reply Tombstone commit 뒤 Delete delivery를 연결하고 실패를 application 결과와 격리한다.
- [x] 2.3 create/delete rollback, delivery rejection, 반복 삭제와 non-Reply 경계의 API integration 검증을 추가한다.

## 3. PROD-497 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `docs/architecture/core-services.md`
- PROD-497

**Deliverable**

PROD-497의 Reply Create/Delete delivery 범위가 기존 Local Note, Reply 작성·삭제, Notification과 federation routing을
회귀시키지 않고 검증되며 OpenSpec lifecycle이 완료된다.

**Guardrails**

- PROD-512의 followers fanout이나 PROD-448의 transactional outbox, NATS, Fedify MessageQueue와 worker를 선행 구현하지 않는다.
- inbound Reply, Repost, Reaction, Mention, Media, Direct와 사용자용 delivery status를 포함하지 않는다.
- PROD-494의 미완료 archive task를 이 change가 흡수하거나 대신 완료하지 않는다.
- 이 change의 모든 requirement와 task가 완료되기 전에는 archive하지 않는다.

**Verification**

- Fedify package test/typecheck, core Post test와 API Post GraphQL integration을 통과한다.
- workspace ESLint, Prettier, Syncpack과 관련 회귀 검증을 통과한다.
- change strict validation과 전체 OpenSpec strict validation을 통과한다.

- [x] 3.1 관련 package·core·API test와 workspace lint·format 검증을 통과시킨다.
- [x] 3.2 canonical·Linear·구현·OpenSpec 정합성과 명시적 제외 범위를 최종 대조한다.
- [x] 3.3 모든 구현·검증 완료 뒤 delta spec을 active capability에 동기화하고 change를 archive한 뒤 전체 strict validation을 통과시킨다.
