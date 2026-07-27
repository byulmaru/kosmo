## 1. PROD-358 원격 Reply와 Parent identity 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-358
- PROD-494

**Deliverable**

공개 원격 Note의 유효한 단일 HTTP(S) `inReplyTo`를 저장된 Local 또는 Remote Post identity로 해석하고 Parent 적합성을 기존 core 계약으로 검증할 수 있다.

**Guardrails**

- Local Post는 Fedify의 canonical Note object route, Remote Post는 existing mapping exact URI를 사용한다.
- URI identity lookup은 Post의 현재 Content 보유 여부와 독립적이다.
- Content 없는 Repost를 Parent로 허용하지 않는다.
- 현재 수신 처리에서 Parent network fetch나 재귀 materialization을 수행하지 않는다.
- raw `inReplyTo`를 별도 source of truth로 저장하지 않는다.

**Verification**

- Local/Remote Parent 성공, 다른 origin의 유사 Local path, multiple/non-HTTP URI, unknown/contentless Parent의 top-level fallback과 network call 부재를 검증한다.

- [x] 1.1 Fedify Local object route와 Remote mapping으로 저장된 Local/Remote ActivityPub Post identity를 Content와 독립적으로 역해석한다.
- [x] 1.2 `inReplyTo` cardinality·scheme을 판정하고 미해석 또는 부적합 Parent를 top-level fallback으로 저장한다.
- [x] 1.3 Parent identity와 top-level fallback 경계의 unit/DB integration test를 추가한다.

## 2. PROD-358 원격 Reply 원자적 materialization

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- PROD-358
- PROD-393
- PROD-256

**Deliverable**

해석 가능한 Parent를 가진 PUBLIC/UNLISTED 원격 Reply가 Content와 직접 Reply Parent 관계를 가진 기존 Post로 원자적으로 저장된다.

**Guardrails**

- 기존 ActivityPub Post creation transaction과 object URI first-write-wins 계약을 유지한다.
- `repostSourceId`, Post Kind, Reply concrete type을 추가하지 않는다.
- duplicate Create가 기존 Parent 관계를 변경하지 않는다.
- top-level fallback의 duplicate Create가 기존 nullable Parent 관계를 변경하지 않는다.

**Verification**

- PUBLIC/UNLISTED Reply 저장 결과, duplicate/concurrent delivery, rollback과 기존 top-level Create 회귀를 검증한다.

- [x] 2.1 검증된 Parent ID를 기존 원격 Post creation transaction에 연결한다.
- [x] 2.2 유효한 Reply와 top-level fallback의 duplicate delivery가 각각 최초 저장 관계 및 first-write-wins 계약을 지키는지 검증한다.
- [x] 2.3 personal/shared inbox와 기존 top-level Note ingestion 회귀 test를 통과시킨다.

## 3. PROD-358 조회 호환과 완료 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- PROD-358
- PROD-398

**Deliverable**

materialize된 원격 Reply가 기존 GraphQL 단일 Post Node의 Content와 `replyParent` 관계로 조회되고, 변경 계약과 구현 증거가 동기화된다.

**Guardrails**

- GraphQL schema와 DB schema를 불필요하게 변경하지 않는다.
- Parent fetch의 장기 lifecycle을 PROD-358 완료 조건으로 확정하지 않는다.

**Verification**

- 실제 materialized row의 기존 GraphQL `Post.replyParent` 조회, 관련 package 검사, strict OpenSpec validation과 전체 formatting 검사를 수행한다.

- [x] 3.1 실제 원격 Reply materialized row를 기존 GraphQL Post와 `replyParent` field로 조회하는 integration test를 추가한다.
- [x] 3.2 관련 unit/integration test와 TypeScript, ESLint, Prettier 검사를 통과시킨다.
- [x] 3.3 OpenSpec task와 구현 결과를 동기화하고 strict validation을 통과시킨다.
