## 1. PROD-494 Reply Parent FK future-proofing

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-494

**Deliverable**

현재 physical delete flow를 추가하지 않으면서 Parent Tombstone에는 Reply Parent 관계가 유지되고 Reply Parent
FK는 향후 actual row 삭제 시 관계만 `null`로 만들도록 정렬된다.

**Guardrails**

- Tombstone은 canonical Post 삭제 행동이며 physical row deletion으로 취급하지 않는다.
- Parent Post를 물리 삭제하는 application action, service 또는 API를 추가하지 않는다.
- migration은 기존 Reply Parent 값, Post state와 Content를 backfill하거나 rewrite하지 않는다.
- Reply Parent 직접 self-reference check, nullable column과 하위 조회 index를 유지한다.

**Verification**

- FK delete action은 Drizzle schema·migration snapshot 선언으로 확인한다.
- Parent Tombstone 뒤 관계 보존은 Local Note·Reply 제품 테스트로 검증한다. application에 없는 physical delete를 직접 DB fixture로 모사하지 않는다.

- [x] 1.1 Reply Parent FK의 physical delete 동작을 `SET NULL`로 정렬하는 additive forward migration과 schema 선언을 추가한다.
- [x] 1.2 FK nullification 선언을 Drizzle schema·migration snapshot에 정렬하고 기존 Parent Tombstone 관계 보존을 제품 테스트로 검증한다.

## 2. PROD-502 PostContent ProseMirror HTML serialization

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-341
- PROD-494
- PROD-502

**Deliverable**

PROD-341 canonical PostContent document를 기존 server-only ProseMirror schema로 결정적인 HTML로 직렬화할 수
있다.

**Guardrails**

- PROD-341의 node·mark·canonicalization·validation을 다시 정의하지 않는다.
- 기존 server-only ProseMirror schema의 `toDOM`과 `DOMSerializer.fromSchema()`로 HTML을 export하고 별도 수동
  node renderer를 만들지 않는다.
- Fedify Note, ActivityPub URI, audience, signed fetch와 `inReplyTo`를 구현하지 않는다.
- React Native/Web 앱 bundle에 `prosemirror-model` runtime을 추가하지 않는다.

**Verification**

- PROD-341 canonical fixture의 ProseMirror HTML export와 결정성을 검증한다.
- malformed·unsupported document 거부와 server-only runtime boundary를 검증한다.

- [x] 2.1 기존 ProseMirror schema의 DOM serialization metadata와 server-only HTML serializer를 구현한다.
- [x] 2.2 PROD-341 canonical fixture, invalid input과 bundle boundary 검증을 추가한다.

## 3. PROD-494 Local Post identity, Note dispatcher와 authorized fetch

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-494
- PROD-502

**Deliverable**

Local/Remote Post가 `packages/fedify`의 하나의 안정적인 ActivityPub identity 경계를 사용한다. 외부 requester는
`/ap/note/{postId}`에서 PROD-502 HTML을 포함한 Public·Unlisted Note를 익명으로, Followers Only Note를 Author
또는 established Follower의 verified signed fetch로 역참조하며 안정적인 Parent identity를 받을 수 있다.

**Guardrails**

- URI resolver, Post load, authorization과 FK 작업은 PROD-502 완료 전에도 독립적으로 진행할 수 있다.
- 이 section의 완료 상태는 PROD-494의 원래 core Note 범위만 나타낸다. 후속 Media attachment·sensitive 확장은
  ADR 0022와 `attach-local-media-to-post` change가 소유하며 이 task를 다시 열거나 해당 change 완료를 대신하지 않는다.
- Local Post URI origin은 Author Profile이 속한 `Instances.canonicalOrigin`에서 읽고 resolver caller가 origin이나
  Local Instance ID를 다시 전달하지 않는다.
- Note `content` 연결과 PROD-494 최종 완료만 PROD-502 serializer 결과에 의존한다.
- Followers Only는 signed actor URI가 Author이거나 stored established Follow의 follower일 때만 허용한다.
- pending FollowRequest, anonymous, unknown actor와 non-follower는 권한을 부여하지 않는다.
- followers audience identity는 `/ap/actor/{authorProfileId}/followers`이며 collection GET과 actor `followers`
  속성은 열지 않는다.
- Followers Only 역참조는 Fedify object dispatcher의 authorization 경계에서 판정하고 Web은 Fedify 응답을
  그대로 반환한다.
- `inReplyTo`는 Parent visibility와 requester에 따라 필터링하지 않고 relation이 있을 때 Local/Remote identity를
  사용한다. Tombstone Parent 관계와 identity는 유지한다.
- unavailable 원인을 구분해 노출하지 않고 Reply·Repost·Reaction 또는 Tombstone/Delete activity delivery를
  추가하지 않는다.

**Verification**

- Public/Unlisted/Follower audience와 anonymous/Author/follower/non-follower/unknown signed fetch를 검증한다.
- process restart·alternate request host에서 Local URI 안정성, Local mapping 미생성과 Remote mapping URI 재사용을 검증한다.
- signed success와 동일 URI의 후속 unauthorized request가 representation을 받지 않음을 검증한다.
- Local/Remote/private/Tombstone/null Parent의 `inReplyTo`와 requester-independent body를 검증한다.
- missing/non-local/Tombstone/contentless/unsupported visibility/unavailable Author·Instance를 같은 미제공 경계로
  검증한다.

- [x] 3.1 `packages/fedify`에 Local/Remote Post ActivityPub URI resolver를 구현한다.
- [x] 3.2 PROD-502 HTML을 사용하는 Local Note object dispatcher와 제공 가능 Post load 경계를 구현한다.
- [x] 3.3 Post Visibility audience와 signed actor 기반 Followers Only authorization을 구현한다.
- [x] 3.4 requester-independent Local/Remote Parent `inReplyTo` projection을 연결한다.
- [x] 3.5 identity, mapping, audience, authorization, Parent와 unavailable matrix의 federation integration test를 추가한다.

## 4. PROD-494 Federation routing 회귀와 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-494

**Deliverable**

Local Note 역참조가 기존 federation-first BFF 경계에서 제공되고 actor, inbox, WebFinger, GraphQL, health와 SPA
요청을 회귀시키지 않으며 전체 PROD-494 계약이 검증된다.

**Guardrails**

- ActivityPub 요청은 BFF/SPA보다 먼저 Fedify에서 처리하고 처리된 Note 요청을 GraphQL proxy로 넘기지 않는다.
- non-federation 요청과 기존 actor/inbox/WebFinger 계약을 변경하지 않는다.
- PROD-494 외 activity delivery handler, queue, retry, backfill과 GraphQL schema를 추가하지 않는다.
- OpenSpec archive는 모든 task와 통합 검증이 완료된 뒤에만 수행한다.

**Verification**

- ActivityPub Accept header의 Note 200/미제공, HTML navigation fallback과 기존 actor/inbox/WebFinger/BFF test를
  통과시킨다.
- package typecheck/lint/test, migration runner·blank full replay smoke, `openspec validate add-activitypub-local-post-note --strict`와 전체
  strict validation 결과를 기록한다.

- [x] 4.1 federation-first web routing에서 Note 응답과 기존 BFF/SPA fallback 회귀를 검증한다.
- [x] 4.2 관련 workspace checks와 PROD-494 전체 계약 통합 검증을 통과시킨다.
- [ ] 4.3 구현·검증 완료 뒤 delta spec 정합성을 확인하고 `add-activitypub-local-post-note` change를 archive한다.
- Local identity는 configured Local Instance canonical origin과 immutable Post DB UUID의 `/ap/note/{postId}`다.
- Local Post에 remote ActivityPub Post mapping row를 만들지 않으며 Remote Post는 기존 mapping URI를 사용한다.
- Post URI resolver는 `packages/fedify`가 소유하고 Web 공유 참조는 Note `url`로 별도 제공한다.
- Note content는 PROD-502 serializer 결과를 사용하고 serializer를 이 이슈에서 복제하지 않는다.
