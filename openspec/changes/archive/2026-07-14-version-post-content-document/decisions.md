## Context

이 기록은 Linear PROD-341의 공통 PostContent 계약, 완료된 PROD-267 Plain Text 전환, 활성 `add-activitypub-remote-post-ingestion` change와 2026-07-14 사용자 결정을 반영한다. 특히 V1에서 `pre`를 제외하고 현재 비프로덕션 Post 데이터를 보존하지 않는다는 결정을 구현 전에 고정한다.

## Decision Records

### 실제 ProseMirror schema가 V1 document 경계를 소유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: ProseMirror처럼 보이는 임의 JSON을 수동 검사하면 node content expression, mark와 attr 규칙이 실제 schema 동작과 drift할 수 있다.
- Decision Outcome: server-only V1 `Schema`는 `doc: paragraph+`, `paragraph: inline*`, non-empty `text`, mark를 허용하지 않는 `hard_break`와 `href`만 가진 `link` mark를 정의한다. 모든 JSON은 `nodeFromJSON()`, `check()`, canonical tree 재구성과 `toJSON()`을 통과한다.
- Alternatives Considered: Zod만으로 JSON을 검증하는 방식은 실제 ProseMirror semantics를 재구현한다. TipTap extensions는 editor/view 생태계와 불필요한 runtime을 다시 끌어온다.
- Consequences: `prosemirror-model`은 core server subpath의 runtime dependency가 된다. V1에 없는 node, mark와 attr는 fail closed한다.
- Confirmation / Follow-up: malformed JSON, content expression, unknown attr/node/mark와 actual `Node.check()` fixture로 검증한다.

### V1에서 pre node를 지원하지 않는다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 초기 PROD-341/PROD-259 범위에는 `pre` 보존이 있었지만 제품 검토에서 V1에 필요하지 않다고 확정했다.
- Decision Outcome: V1 node는 `doc`, `paragraph`, `text`, `hard_break`만 지원한다. remote `<pre>` 처리는 PROD-259에서 visible text와 개행을 보존하는 비지원 block 처리로 한정하고 전용 node를 만들지 않는다.
- Alternatives Considered: `pre` node를 유지하면 공백 보존과 native renderer typography 정책까지 공통 계약에 추가해야 한다. 원문 HTML 저장은 보안·canonical storage 제약과 충돌한다.
- Consequences: code-block semantics와 고정폭 표시는 손실된다. PROD-259, PROD-261과 remote-post OpenSpec의 pre 전제는 제거한다.
- Confirmation / Follow-up: repository와 Linear 범위에서 V1 pre 지원 문구가 남지 않는지 검사한다.

### revision을 versioned PostContent document 하나로 저장한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Content Warning도 작성자가 입력하고 글자 수에 포함되는 revision content다. version, body와 별도 컬럼으로 두면 revision snapshot을 복사·비교·import할 때 일부 필드를 빠뜨릴 수 있고 향후 summary 구조 변경도 canonical document version과 분리된다.
- Decision Outcome: `post_content.document` JSONB에 exact `{ version, summary, body }` envelope를 non-null로 저장한다. V1 `summary`는 nullable Plain Text이고 `body`만 ProseMirror root `doc`다. 같은 version equality는 전체 canonical envelope의 구조로 판정하고, cross-version equality는 등록된 migration으로 같은 target version에 올린 뒤 판정한다.
- Alternatives Considered: schema version, body document와 Content Warning을 별도 컬럼으로 저장하면 DB query는 단순하지만 revision completeness가 호출자 규율에 의존한다. `doc.attrs`나 body의 전용 CW node는 summary를 ProseMirror body schema와 renderer 책임으로 섞는다. raw JSON 문자열 비교는 key/mark ordering 차이에 취약하다.
- Consequences: JSON 하나만으로 revision authored content를 완전히 전달할 수 있다. summary 존재 여부의 DB query가 중요해지면 canonical 값을 복제하지 않는 expression index 또는 재구성 가능한 projection을 사용한다. migration 없는 version은 비교·렌더링에서 지원되지 않는 값이다.
- Confirmation / Follow-up: summary/body 변경, key ordering, adjacent text, duplicate mark와 URL spelling 차이가 canonical envelope equality에 반영되는지 테스트한다.

### Plain Text는 파생 projection이고 local composer 입력만 호환 유지한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 읽기, 검색, 접근성, 최대 길이 검증과 현재 composer에는 Plain Text가 필요하지만 이를 document와 함께 canonical 저장하면 두 source of truth가 생긴다.
- Decision Outcome: DB `body_text`는 제거한다. 서버는 `document.body`에서 Plain Text를 결정적으로 파생하고 GraphQL `bodyText` 호환 output으로 제공한다. `document.summary`는 GraphQL `contentWarning` 호환 output으로 제공한다. 500자 제한은 summary와 body projection을 함께 계산한다. `CreatePostInput.bodyText`와 Plain Text composer UX는 유지하되 server converter가 summary `null`인 canonical V1 document를 만든다.
- Alternatives Considered: `body_text`를 materialized projection으로 계속 저장하면 동기화 invariant와 migration 책임이 생긴다. document input을 즉시 composer에 노출하면 rich editor가 없는 클라이언트에 불필요한 API 복잡성을 준다.
- Consequences: 조회 resolver에 작은 projection 비용이 생긴다. 검색 index가 필요해지면 canonical document에서 재구축 가능한 별도 projection으로 설계해야 한다.
- Confirmation / Follow-up: local create round trip, 500자 validation, multi-line projection과 DB column migration을 검증한다.

### GraphQL은 version과 JSON을 묶고 앱은 제한 renderer를 사용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 앱이 canonical document를 렌더링해야 하지만 ProseMirror runtime을 native bundle에 포함할 수 없다.
- Decision Outcome: GraphQL `PostContent.document`는 version, summary와 body를 포함한 output-only typed JSON scalar를 제공한다. 기존 `bodyText`와 `contentWarning`은 호환 projection이다. Relay는 native-safe `PostContentDocumentV1` 타입을 import한다. 앱은 V1 `document.body`의 paragraph/text/hard-break/link만 React Native primitive로 렌더링하고 미지원 값은 파생 `bodyText`로 fallback한다.
- Alternatives Considered: node별 GraphQL union은 PM JSON과 별도 wire schema를 유지해야 한다. 앱에서 `prosemirror-model`을 실행하면 bundle/runtime 제약을 어긴다. HTML 렌더링은 실행 가능한 markup 경계를 연다.
- Consequences: client type guard가 server schema와 함께 관리되어야 한다. link action은 absolute HTTP(S)만 허용하고 접근성 metadata를 제공한다.
- Confirmation / Follow-up: Relay custom scalar import, renderer fixture, unsafe link fallback과 Expo bundle import graph를 검증한다.

### 비프로덕션 기존 Post를 삭제하는 단일 breaking migration을 사용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: `body_text`를 non-null versioned document로 교체하는 production migration은 expand/transition/contract가 필요하지만 현재 프로덕션 DB 자체가 존재하지 않으며 사용자가 비프로덕션의 모든 Post 삭제를 허용했다.
- Decision Outcome: migration은 `post.current_content_id`를 정리한 뒤 기존 `post_content`와 `post`를 모두 삭제하고 `body_text`와 `content_warning`을 non-null versioned `document` JSONB 컬럼으로 즉시 교체한다.
- Alternatives Considered: 기존 Plain Text backfill과 dual-write는 production rollback에는 안전하지만 현재 환경에서 불필요한 compatibility code와 후속 contract를 만든다. JSON default를 두면 새 row가 잘못된 implicit document를 가질 수 있다.
- Consequences: 모든 기존 게시글과 revision을 잃고 down migration을 제공하지 않는다. production 또는 보존 요구가 생기면 이 결정을 적용할 수 없다.
- Confirmation / Follow-up: migration fixture로 데이터 삭제, FK 순서, 새 non-null column과 새 insert 성공을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-14의 “schema version과 document를 revision에 별도 저장한다” 결정은 리뷰 중 확정한 “version, summary와 body를 canonical PostContent document 하나에 저장한다” 결정으로 대체한다. Content Warning은 authored revision content이고 최대 길이에 포함되며, 향후 rich summary 전환도 PostContent document version이 소유해야 하기 때문이다.

- 2026-07-12 `simplify-post-content-to-plain-text`의 “Plain Text를 유일한 canonical 입력·저장 본문으로 사용한다” 결정은 “versioned ProseMirror document JSON을 canonical 저장 본문으로 사용하고 Plain Text는 입력·파생 projection으로만 유지한다”로 대체한다. 일반 link와 후속 구조적 entity 의미를 실행 가능한 HTML이나 별도 offset annotation 없이 보존해야 하기 때문이다.
- 같은 change의 “DB·API·앱을 한 번의 breaking Plain Text release로 전환한다” 결정 중 현재 storage shape는 이번 비프로덕션 destructive document migration으로 대체한다. production migration 일반 규칙은 대체하지 않는다.
- 2026-07-12 `simplify-post-content-to-plain-text`의 “구조적 본문 참조는 canonical bodyText와 revision-owned token relation으로 확장한다” 결정은 canonical document node와 재구축 가능한 revision-owned DB relation을 함께 사용하는 방향으로 대체한다. JSON entity reference만으로 DB referential integrity를 대신하지 않는 제약은 유지한다.
