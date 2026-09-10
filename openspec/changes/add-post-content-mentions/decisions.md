## Context

이 decision log는 `proposal.md`, `specs/post-content-mentions/spec.md`, `design.md`와 현재 canonical Post/Post Content 문서 및 Linear 계약을 함께 반영한다. `PROD-340`의 공통 저장 계약과 `PROD-910`의 renderer·Profile 이동·통합/archive를 이 change에서 연결하고, `PROD-911`의 Notification·FCM은 별도 consumer change로 남긴다.

## Decision Records

### 검증된 typed Mention만 canonical projection으로 인정

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`
- Status: Active
- Context / Problem: inbound Note에는 일반 anchor, audience actor URI와 typed `Mention`이 함께 나타날 수 있어 이를 같은 의미로 취급하면 Profile 관계와 권한 의미가 오염된다.
- Decision Outcome: target·anchor에 담긴 identity 증거가 저장된 Profile stable identity와 일치하고 표시 label이 안전한 표시·구조 검증을 통과한 typed `Mention`만 canonical Mention projection의 입력으로 인정한다. 표시 label이 Profile 이름·handle과 같다는 사실만으로 identity를 확정하지 않으며, 일반 anchor와 `to`/`cc`는 Mention으로 추론하지 않는다.
- Alternatives Considered: anchor나 audience actor URI를 편의상 Mention으로 추론하거나 표시 label exact match만으로 Profile을 연결하는 방식은 현재 authority가 허용하지 않는 의미 변경이므로 선택하지 않는다.
- Consequences: 검증되지 않은 tag는 관계를 만들 수 없고, downstream renderer와 별도 Notification consumer는 같은 검증된 identity 경계를 사용한다.
- Confirmation / Follow-up: valid typed Mention, 일반 link, audience-only 입력을 분리하는 수신·저장 검증으로 확인한다.

### Mention node와 revision-owned Profile 관계는 하나의 저장 경계에 속함

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-259`, `PROD-340`
- Status: Active
- Context / Problem: Current Post에만 관계를 두거나 relation write를 별도 후처리하면 immutable revision의 의미와 rollback 보장이 깨진다.
- Decision Outcome: canonical versioned Post Content node와 그 immutable revision의 Mentioned Profile 관계를 `post_mentions` table에서 Post Content revision과 Profile을 가리키는 foreign-key persisted projection으로 저장하고, Current Content pointer와 함께 저장한다. relation은 canonical node에서 파생되고 Current Post는 현재 revision을 투영하며, 과거 revision과 관계는 변경하지 않는다.
- Alternatives Considered: Post-level mutable source를 별도로 두거나 새 revision마다 과거 relation을 재작성하는 방식은 canonical revision ownership과 충돌하므로 배제한다.
- Consequences: relation 저장 실패는 새 Post/Content/pointer와 함께 rollback해야 하고, renderer는 current 또는 historical revision의 일관된 projection을 읽어야 한다.
- Confirmation / Follow-up: 최초 Create, 새 revision, 저장 중간 실패를 포함한 transaction 검증으로 확인한다.

### 해결 실패 Mention은 안전한 본문 fallback으로 낮춤

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`
- Status: Active
- Context / Problem: malformed, unresolved 또는 identity mismatch tag를 관계로 강제하면 잘못된 Profile 연결과 신규 원격 materialization이 발생한다.
- Decision Outcome: 실패한 부분은 기존 안전한 일반 link 또는 표시 text로 보존하고 Mention node·Profile 관계를 만들지 않는다. 이 경로에서는 WebFinger, actor/profile fetch 또는 신규 원격 Profile materialization을 수행하지 않는다.
- Alternatives Considered: 수신 중 원격 lookup으로 누락된 Profile을 만들거나 Note 전체를 실패시키는 방식은 current contract의 fallback과 범위를 벗어나므로 선택하지 않는다.
- Consequences: 일부 typed metadata는 잃을 수 있지만 나머지 검증된 Note와 본문은 보존되며, 안전 parser 경계를 재사용해야 한다.
- Confirmation / Follow-up: mismatch, malformed, unresolved 입력에서 lookup 부재와 안전 본문 결과를 함께 검증한다.

### Duplicate Create는 first-write-wins no-op으로 유지

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`
- Status: Active
- Context / Problem: 같은 remote object URI의 duplicate Create를 새 revision처럼 처리하면 Mention relation과 timestamp가 중복되거나 기존 의미가 바뀐다.
- Decision Outcome: 이미 materialize된 remote Note object URI의 duplicate Create는 Post, Current Content, revision-owned relation과 timestamp를 그대로 유지하는 no-op으로 처리한다. remote `Update(Note)` lifecycle은 이 change에서 다루지 않는다.
- Alternatives Considered: body 또는 Mention 의미가 달라졌다는 이유로 duplicate Create를 Update로 승격하는 방식은 현재 first-write-wins 경계를 변경하므로 배제한다.
- Consequences: 변경된 duplicate Create도 기존 저장값을 갱신하지 않으며, Update 계약은 후속 scope에서 별도로 결정해야 한다.
- Confirmation / Follow-up: 동일 의미와 변경된 body를 각각 재전송해 새 revision·relation·timestamp가 생성되지 않는지 확인한다.

### 구 reader는 기존 bodyText 기반 plain text fallback을 사용

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `PROD-340` (2026-09-10 schema version decision), 2026-09-10 사용자 선택
- Status: Active
- Context / Problem: Mention 전용 표시를 모르는 구 reader에서도 저장 활성화 뒤 본문을 읽을 수 있어야 하지만, link 동작과 문단 구조를 완전히 보존하는 호환 경계는 현재 보장되지 않는다.
- Decision Outcome: 구 reader는 기존 `bodyText` fallback을 재사용한 plain text 표시를 허용한다. 글자·Media·Content Warning은 보존하고 link 클릭 동작과 문단 구조의 일시적 저하는 허용한다. 서버의 본문 파생값부터 구 reader 표시까지 이 보존을 검증한 뒤 Mention 저장을 활성화한다.
- Alternatives Considered: 구 reader에서 link 동작과 문단 구조까지 반드시 보존하도록 schema와 reader를 동시에 고정하는 방식은 현재 사용자 선택 범위를 넘어가므로 기본 계약으로 삼지 않는다.
- Consequences: rollout 검증은 full rich rendering이 아니라 body text·Media·Content Warning 보존을 증명해야 하며, 이 change는 기존 Post Content V1에 additive한 Mention node를 저장한다. document schema version bump나 V1/V2 dual-read 또는 document version 변환은 도입하지 않지만, revision 관계 persistence를 위한 additive DB migration은 허용한다.
- Confirmation / Follow-up: 서버 canonicalizer → GraphQL `bodyText` → legacy renderer 경로의 end-to-end 검증으로 확인한다.

### Mention 확장은 Post Content V1에 additive하게 적용

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `PROD-340` (2026-09-10 schema version decision), 2026-09-10 사용자 선택
- Status: Active
- Context / Problem: 현재 Post Content V1은 기존 document와 의미를 보존하는 additive 확장을 허용하며, Mention 저장에는 typed node와 revision-owned 관계가 필요하다. 이 의미 변경은 document version migration을 요구하지 않지만, 구 reader compatibility gate는 별도로 필요하다.
- Decision Outcome: 검증된 typed Mention은 기존 Post Content V1에 additive한 node로 보존하고, revision-owned Profile 관계는 `post_mentions` table에서 Post Content revision과 Profile을 가리키는 foreign-key persisted projection으로 저장한다. 기존 V1 document와 기존 node 의미는 유지하고, document schema version을 올리거나 V1/V2 dual-read 또는 document version 변환을 이 change에 도입하지 않는다. exact Mention node와 relation shape는 제품 요구사항이 아닌 구현 선택으로 아래 기록에 확정하며, 관계 persistence에 필요한 additive DB migration은 허용한다.
- Alternatives Considered: document schema V2와 V1/V2 dual-read 또는 document version 변환은 기존 V1 document를 재작성하거나 breaking 의미를 도입할 필요가 없고 reader bodyText fallback gate로 호환을 검증할 수 있으므로 채택하지 않는다. `post_mentions` 외에 Post-level mutable relation을 두거나 relation persistence를 위한 additive DB migration을 금지하는 것은 이 결정의 범위가 아니다.
- Consequences: V1 canonicalizer와 기존 document equality 경계를 유지하면서 Mention projection을 `post_mentions`에 추가하고, 저장 활성화 전 legacy body text·Media·Content Warning 보존 증거를 요구한다.
- Confirmation / Follow-up: 기존 V1 document, V1 additive Mention document, unknown version과 unsupported node 방어 및 GraphQL `bodyText` → legacy renderer compatibility matrix를 실행 검증한다.

### Canonical Mention은 Profile identity만 저장하고 inbound URI는 보존하지 않음

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340` (구체 shape는 위임된 구현 선택)
- Implementation Evidence: `packages/core/post-content/schema/nodes/mention.ts`, `packages/core/services/post.ts`, `packages/core/post-content/server.ts`, `packages/core/db/tables.ts`, `drizzle/20260910073222_sleepy_justin_hammer/migration.sql`
- Status: Active
- Context / Problem: canonical node와 revision relation을 구현하려면 typed Mention의 저장 attrs와 Profile identity 조회 기준을 고정해야 하지만, 이 세부를 제품 요구사항으로 확장해서는 안 된다.
- Decision Outcome: 사용자 승인으로 기존 `{ target, href, label }` 저장 결정을 대체하고, 현재 canonical `mention` node attrs는 정확히 `{ profileId, label }`이다. `profileId`는 inbound typed Mention의 target URI를 기존 Profile identity로 검증한 값이고, `label`은 normalized visible label이다. inbound candidate는 parser 경계에서만 `{ targetHref, label, profileId }`로 전달하며, parser는 candidate의 normalized `targetHref`와 원문 anchor의 normalized href 및 label을 일치시킬 때만 `{ profileId, label }` node를 만든다. target/href external URI는 identity 검증 입력이며 canonical document에 저장하지 않는다. Core Post 저장은 document의 `profileId`를 common relation input으로 수집하고 같은 transaction에서 `post_mentions`를 저장하며, 별도 ActivityPub actor lookup이나 fallback 재검증을 수행하지 않는다. `post_mentions`는 `post_content_id`와 `profile_id` column, `(post_content_id, profile_id)` composite primary key, `profile_id` index와 Post Content/Profile foreign key(`ON DELETE CASCADE`)를 유지한다. Local Post Content validator는 Mention node를 write 전에 거부한다.
- Alternatives Considered: `{ target, href, label }`를 canonical document에 저장하거나 Profile domain·handle에서 remote URL을 추정하는 방식은 저장 JSON에 transport identity를 결합하고 renderer가 외부 URI를 재해석하게 하므로 사용하지 않는다. label·handle exact match만으로 Profile을 연결하거나 unresolved URI를 위해 원격 lookup/materialization을 수행하는 방식도 stable identity 경계를 약화하므로 사용하지 않는다.
- Consequences: canonical document와 renderer는 Profile identity와 label만 소비하고 outbound HTML은 label text만 생성한다. `post_mentions` shape와 transaction/revision ownership은 변경하지 않으며, `PROD-910`은 이 projection을 소비할 read shape와 renderer를 별도로 검증한다.
- Confirmation / Follow-up: inbound candidate resolution, valid/fallback/duplicate/rollback 저장 검증, canonical document equality, local validator와 label-only HTML serialization을 실행 검증한다.

### 공통 저장 계약은 `PROD-340`과 `PROD-910`이 함께 완료하고 Notification은 분리함

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-340`, `PROD-910`, `PROD-911`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`
- Status: Active
- Context / Problem: Mention 저장 결과와 renderer/Profile 이동은 하나의 사용자-visible 결과를 구성하지만 Notification·FCM은 별도의 lifecycle과 검증 책임을 가진다.
- Decision Outcome: 이 change는 `PROD-340`의 공통 계약·구현 gate와 `PROD-910`의 renderer·Profile 이동·접근성·통합 및 archive를 포함한다. `PROD-911`은 이 capability를 소비하는 별도 Notification/FCM change로 유지한다.
- Alternatives Considered: 세 이슈의 모든 consumer를 한 change에서 구현하거나 저장 계약만 만들고 `PROD-910` 통합을 후속으로 미루는 방식은 현재 issue responsibility와 완료 조건을 흐리므로 선택하지 않는다.
- Consequences: `PROD-910`은 common node/relation과 통합 검증의 완료 증거를 소유하고, Notification 결정은 이 change의 tasks나 guardrail에 들어오지 않는다.
- Confirmation / Follow-up: `PROD-340` 저장 gate와 `PROD-910` 통합/archive 증거를 각각 확인한 뒤 change 완료를 판단한다.

### 공통 projection과 기존 Post transaction을 구현 경계로 사용

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-259`, `PROD-340`
- Status: Active
- Context / Problem: Fedify adapter, core content canonicalizer와 Post 저장이 따로 Mention을 해석하면 inbound 경로별 결과가 달라지거나 relation이 partial write가 될 수 있다.
- Decision Outcome: tag 후보 수집은 inbound adapter에서 전달하되 identity 검증·fallback·canonicalization은 공통 content projection 경계에서 수행하고, document·`post_mentions` persisted revision-to-Profile relation·Current pointer write는 기존 Post 생성 transaction의 저장 경계에 포함한다. 같은 revision/Profile relation은 set semantics를 가지며, 구체 파일·helper 이름은 제품 계약으로 고정하지 않는다.
- Alternatives Considered: adapter마다 독립 canonicalization을 두거나 transaction 이후 별도 relation job으로 저장하는 방식은 결과 일관성과 원자성을 약화하므로 기본 경로로 채택하지 않는다.
- Consequences: 구현자는 기존 안전 parser와 duplicate early no-op을 재사용해야 하며, JSON-only read-time parsing으로 persisted relation을 대체하지 않는다. GraphQL read shape는 `PROD-910`에서 검증한다.
- Confirmation / Follow-up: inbound valid/fallback/duplicate/rollback 통합 검증과 기존 content canonicalization check로 확인한다.

## Remaining Implementation Choices

- GraphQL read projection과 UI route는 `PROD-910`에서 정한다. 선택 결과는 기존 V1 document 의미, canonical equality, identity 검증, revision ownership과 legacy reader compatibility gate를 약화해서는 안 된다.

## Superseded Decisions

- 없음.
