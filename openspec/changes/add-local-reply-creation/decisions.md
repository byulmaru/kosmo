## Context

이 기록은 PROD-424 backend, PROD-425 UI/thread, PROD-426 Notification/inbox와 후행 PROD-423 통합·archive 구조, Post·Notification canonical 계약, 현재 Reply Parent·thread·Notification 구현 기반을 반영한다.

## Decision Records

### Reply 작성은 기존 Post mutation의 nullable Parent 확장이다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-424`
- Status: Active
- Context / Problem: Reply를 별도 Post type이나 mutation으로 표현할지, 기존 Content·Reply Parent 관계 조합으로 표현할지 결정해야 한다.
- Decision Outcome: 기존 `createPost`/`CreatePostInput`에 nullable concrete `Post` `replyParentId`를 추가하고 기존 `CreatePostPayload.post`를 유지한다. Parent는 행동 주체 Profile이 조회할 수 있는 contentful Post여야 하며 Reply Visibility는 Parent와 독립적이다. `repostSourceId`는 입력에 추가하지 않는다.
- Alternatives Considered: 별도 `createReply` mutation은 기존 Post 작성·payload를 중복한다. Parent Visibility 강제는 canonical의 독립 Visibility 계약과 다르다. `repostSourceId`를 함께 받으면 제외된 Reply+Quote 작성이 열린다.
- Consequences: 기존 client는 입력 생략으로 그대로 동작하고, API는 global ID type·Parent visibility·Content를 write와 같은 transaction에서 검증해야 한다.
- Confirmation / Follow-up: PROD-424 schema/resolver/integration 테스트에서 일반 Post 회귀, wrong type, hidden/missing/contentless Parent, 독립 Visibility와 rollback을 검증한다.

### Reply UI는 기존 composer와 선행 thread 계약을 재사용한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `PROD-425`
- Status: Active
- Context / Problem: Reply 작성 화면·상태·payload를 별도로 만들지, 기존 universal Post composer와 thread 조회 계약을 확장할지 결정해야 한다.
- Decision Outcome: contentful Post의 Reply action은 기존 composer를 Parent 맥락으로 열고 기존 Post fragment·mutation payload를 사용한다. Content 없는 Repost에서는 action을 disabled로 표시하고 callback·composer 진입을 차단한다. 성공 결과는 선행 thread connection 계약을 통해 현재 thread에 반영한다.
- Alternatives Considered: Reply 전용 composer는 현재 본문·Visibility 상태와 검증을 중복한다. Contentless Repost에 action을 숨기는 방식은 PROD-425의 disabled 표시 계약과 다르다.
- Consequences: PROD-425 구현은 PROD-422의 thread API/UI가 제공하는 public connection shape을 선행 조건으로 삼고, generated Relay artifact를 commit하지 않는다.
- Confirmation / Follow-up: PROD-425 component·route/cache 테스트에서 contentful Parent 진입, disabled Repost, pending/error, selected Profile 격리와 성공 thread 반영을 검증한다.

### Reply Notification은 source commit 후 기존 projection에 Best Effort로 추가한다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-426`
- Status: Active
- Context / Problem: Reply Notification을 Reply transaction 내에 포함하거나 별도 inbox/storage로 만들면 source 성공 격리 또는 기존 Notification 계약이 깨진다.
- Decision Outcome: Reply commit 후 같은 request에서 source-only 멱등 Notification 저장 경계를 await/catch한다. Reply kind는 기존 Notification projection·interface·connection·count·Read·badge/cache에 additive로 통합하고, source Reply에서 Parent Author Recipient, Reply Related Post, Reply Author Related Profile을 파생한다.
- Alternatives Considered: source transaction 내 저장은 Notification 실패가 Reply를 rollback한다. fire-and-forget은 process 종료와 오류 관찰 경계가 불명하다. 별도 Reply inbox/table은 기존 Notification API와 client를 중복한다.
- Consequences: Notification 저장 실패 시 item이 누락될 수 있지만 Reply는 유지된다. mixed kind visible predicate는 connection limit 전 SQL에서 적용하고 connection·count·Node·Read가 동일한 source 정합성을 사용해야 한다.
- Confirmation / Follow-up: PROD-426에서 self-reply, invisible result, duplicate/concurrent source, 저장 실패 격리와 mixed inbox/count/Read/Node/client 이동을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
