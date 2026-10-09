# PROD-924 로컬 owner 검증 기록

검증일: 2026-10-09. 통합 기준: #940 `6a2f1b682`, #961 `2d2d23115`, 병합된 #1094 `7248b8f27`.
로컬 worktree `/private/tmp/kosmo-prod924-owner`에서 실행했다. 원격 push·리뷰·merge·배포는 하지 않았다.

## 실행 결과

| 검증                                                   | 결과  | 실제 실행 경계                                                                                                |
| ------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------- |
| Source 삭제 legacy baseline                            | 7/7   | 실제 Temporal·PostgreSQL. 잠금 없는 기존 구조의 잘못된 최종 상태를 반례로 확인                                |
| Source 잠금·ABA·timeout·retry·crash·Run lifecycle 실험 | 26/26 | 실제 Temporal·PostgreSQL. 아래 강제 종료 반례는 안전성 PASS가 아닌 반례 관찰 성공                             |
| Production Quote owner                                 | 10/10 | production Workflow/registry 및 실제 DB fence·bootstrap·drain·CAS. proof/외부 transport만 fixture             |
| 기존 inbound Quote                                     | 30/30 | 실제 local Temporal Worker/production registry·PG. protocol network proof만 fixture                           |
| Protocol 판정 및 delivery                              | 24/24 | 실제 PG 및 issuer 응답 fixture. HTTP 실패·invalid proof의 기존 승인 유지                                      |
| 기존 Delete·Note 회귀                                  | 32/32 | 격리 PostgreSQL 및 기존 Temporal harness                                                                      |
| Core consent 및 Post transition                        | 6/6   | 실제 PostgreSQL state/CAS/transaction                                                                         |
| API Mention 회귀                                       | 6/6   | 실제 Temporal·PostgreSQL·GraphQL, 작성 Profile 및 invalid rollback                                            |
| API Source 노출                                        | 3/3   | 실제 PostgreSQL·GraphQL                                                                                       |
| Composer 상태                                          | 9/9   | 로컬 unit/state 검증. Storybook/browser interaction 실행과는 구분                                             |
| Post transition orchestration                          | 3/3   | 실제 Temporal Workflow, DB/effect adapter fixture                                                             |
| Composer keyboard Storybook                            | 2/2   | 실제 Chromium: Quote Policy Keyboard Contract, Keyboard Followers Dismiss Contract. 나머지 42개는 filter skip |
| 전체 Worker Workflow suite                             | 41/41 | 실제 Temporal, 각 테스트의 adapter fixture·history replay 포함                                                |
| Migration smoke                                        | 성공  | 격리된 빈 PostgreSQL에서 migration 적용 및 두 consent 컬럼 계약 확인                                          |

Worker·API·App·Fedify TypeScript 및 GraphQL runtime schema 동기화를 확인했다. 관련 파일 ESLint와 diff whitespace를 확인한다.
현재 로컬 HEAD에 대한 원격 CI는 실행하지 않았다.

## 재현한 실행 순서와 수정

1. **Source 삭제 경쟁**: 승인 UPDATE → commit 전 대기 → Source 삭제 commit → 승인 commit에서 삭제된 Source의 APPROVED Quote를 재현했다.
   신규 Quote 연결도 같은 문제가 있었다. Source SHARE → Quote UPDATE를 승인·연결 transaction에 적용하고,
   Source 삭제 UPDATE → 정렬된 Quote 잠금·bulk 철회를 하나의 transaction으로 유지했다. 수정 후 삭제 대기/승인 거절을 검증했다.
2. **다중 Quote 철회**: bulk UPDATE 뒤 commit 전 reader는 기존 상태만 보고, commit 뒤 모든 Quote가 REVOKED가 된다.
   Source 관계와 작성 document/content identity는 보존된다.
3. **교차 Quote deadlock**: 서로가 Source인 Quote의 잠금 경쟁에서 실제 SQLSTATE `40P01`을 관찰했다.
   PostgreSQL abort 후 Activity retry로 두 작업이 수렴했다. deadlock 자체를 없앴다고 주장하지 않는다.
4. **timeout/ABA**: A1 잠금 전 대기 → timeout → A2 commit → B 철회 → A1 재개.
   fence 없는 대조군의 복구 쓰기를 재현하고, 현재 Run/token fence가 과거 쓰기를 차단함을 검증했다.
5. **Query 뒤 늦은 commit**: Query 성공 → Workflow timeout/다음 명령 준비 → 이전 transaction 지연.
   정상 경로는 token 폐기 뒤 drain이 해당 transaction 종료를 기다려 다음 명령을 직렬화한다.
6. **강제 종료 반례**: Query 성공 → Terminate → 이전 DB transaction commit은 실제로 가능했다.
   새 Run bootstrap은 기존 transaction을 기다리지만 이미 발생한 일시적 상태·외부 effect를 소급 취소하지 못한다.
7. **오래된 proof 재검증**: U1 조회 실패 → 최신 U2 승인 → U1 재시도는 최신 admission epoch로 폐기한다.
   중복 Create는 현재 승인 조회 retry를 불필요하게 폐기하지 않는다.
8. **commit 응답 유실**: DB commit 뒤 Activity 결과를 유실시켰다. 현재 proof 재조회와 새 fenced CAS로 복구하며
   INITIALIZE가 같은 Post를 중복 생성하지 않는다. effect retry는 동일 deterministic Activity ID를 사용한다.
9. **실제 protocol 회귀**: embedded Source를 command에 전달하고 malformed FEP의 PENDING 표식을 보존했다.
   retryable 판정의 caller 전달과 Source-less Quote 삭제 후 과거 PENDING write 차단을 확인했다. 실제 federation factory의 Authorization dispatcher 누락도 복구하고 HTTP endpoint의 승인 projection·철회 후 차단을 검증했다.
10. **병합 회귀**: 이전 #940 파일 수용으로 제거된 최신 #961의 API·Composer Mention 기능을 복구했다. Quote 정책 선택과 Temporal 작성 경로를 함께 유지한다.

## 재실행

Temporal CLI v1.8.2, SDK 1.22.0을 사용했다. test-db runner가 고유 DB를 만들고 제거한다.
이미 실행 중인 로컬 Postgres Compose project를 지정했으며 다른 환경에서는 해당 project 이름으로 바꾼다.

```sh
COMPOSE_PROJECT_NAME=kosmo node scripts/test-db.mjs run -- sh -c 'pnpm db:test:push && pnpm --filter @kosmo/worker exec node --import tsx --test --test-concurrency=1 src/quote-cas-experiment.database.test.ts src/quote-owner.workflow.database.test.ts'
COMPOSE_PROJECT_NAME=kosmo node scripts/test-db.mjs run -- sh -c 'pnpm db:test:push && KOSMO_TEST_TEMPORAL_RUNTIME=0 pnpm --filter @kosmo/fedify exec node --import tsx --import ../../packages/core/temporal/test-client.ts --test src/inbound-quote.test.ts src/local-post-delivery.test.ts src/quote-owner-protocol.database.test.ts'
```

현재 실험 파일은 수정된 Source 잠금 경로만 실행한다. 잠금 없는 Source baseline은 수정 전 common applier에서
실행한 별도 기록이며, 현재 코드에서 옵션만 바꾸어 잠금 없는 구현을 재현했다고 주장하지 않는다.

로컬 로그는 `/private/tmp/prod924-source-owner-baseline-verified.log`,
`prod924-owner-final-experiments.log`, `prod924-owner-final-verification.log`,
`prod924-inbound-owner-verified.log`, `prod924-fedify-delete-note-verified.log`, `prod924-dispatcher-protocol-final.log`, `prod924-api-mentions.log`,
`prod924-core-transition-tests.log`, `prod924-api-source-tests.log`, `prod924-ui-mentions-final.log`, `prod924-ui-keyboard-stories-complete.log`,
`prod924-post-transition-workflow-tests.log`, `prod924-workflows-final-verification.log`, `prod924-migration-smoke.log`에 있다.
로그는 일시적인 로컬 증거이며 이 문서의 검증 범위를 대체하지 않는다.

## 미완료 및 보장하지 않는 사항

- 최초 전체 Workflow 실행에서 Quote resolution 두 건이 각 120초 timeout이었다. 이후 time-skipping 서버 bootstrap을 분리 확인하고 해당 5건 및 전체 suite를 재실행하여 각각 5/5·41/41을 확인했다. 최초 timeout의 정확한 원인은 확정하지 않았다.
- 두 keyboard Storybook은 현재 통합본으로 실제 Chromium에서 통과했다. 기존 원격 CI의 Storybook 실패 두 건 전체가 이 결과로 해결됐다고 표시하지 않는다. Composer E2E는 OIDC·Temporal·Worker·API·Expo/BFF 서버 및 전체 build가 필요한 별도 gate로 미실행이다.
- 모든 원격 issuer와의 HTTP/cache/redirect 상호운용, body 없는 410 및 반복 current-invalid 최종 상태는 확정하지 않았다.
- 강제 Terminate/Reset의 이미 fence를 통과한 transaction 취소, 외부 exactly-once 및 Source/Quote의 외부 delivery 전체 순서는 보장하지 않는다.
- retention 이후 Source-less Quote의 원래 target/Request 복구에는 원본 이벤트가 필요할 수 있다.
- 구형 writer inventory, 실제 history replay, 기존 Worker drain과 admission 전환, production 장애 복구 검증은 남아 있다.

배포·PR 반영 책임과 자세한 운영 경계는 [ADR 0030](../architecture/decisions/0030-quote-consent-owner.md)을 따른다.

## 변경 파일

#961 HEAD 기준 로컬 통합 변경 목록이다. #940에서 수용한 기존 구현과 이번 owner 변경을 함께 포함한다.

```text
apps/api/schema.graphql
apps/api/src/graphql/enums.ts
apps/api/src/graphql/resolvers/post/field/post.ts
apps/api/src/graphql/resolvers/post/loader/quote-policy.ts
apps/api/src/graphql/resolvers/post/loader/repost-source.ts
apps/api/src/graphql/resolvers/post/mutation/create.ts
apps/api/src/graphql/resolvers/post/mutation/delete.ts
apps/api/src/graphql/resolvers/post/ref.ts
apps/api/tests/integration/graphql/post-repost-source.test.ts
apps/api/tests/integration/graphql/post-repost.test.ts
apps/api/tests/integration/graphql/post.test.ts
apps/app/src/components/post/PostComposer.test.ts
apps/app/src/components/post/PostComposer.tsx
apps/app/src/components/post/PostComposerController.tsx
apps/app/src/components/post/PostMuteWiring.test.ts
apps/app/src/components/post/postComposerState.test.ts
apps/app/src/components/post/postComposerState.ts
apps/app/src/components/post/postQuotePolicyPresentation.ts
apps/app/src/stories/components/PostComposerMediaItems.tests.stories.tsx
apps/app/src/stories/fixtures.ts
apps/app/src/stories/patterns/PostComposer.stories.tsx
apps/app/src/stories/patterns/PostComposer.tests.stories.tsx
apps/app/src/stories/patterns/Posts.stories.tsx
apps/web/e2e/compose.e2e.ts
apps/web/e2e/post-detail.e2e.ts
apps/web/e2e/timelines.e2e.ts
apps/worker/package.json
apps/worker/src/activities.ts
apps/worker/src/activities/post-transition.database.test.ts
apps/worker/src/activities/post-transition.ts
apps/worker/src/activities/quote-owner.ts
apps/worker/src/post-transition.workflow.test.ts
apps/worker/src/quote-cas-experiment.database.test.ts
apps/worker/src/quote-owner.workflow.database.test.ts
apps/worker/src/test-fixtures/quote-cas-db-probe.ts
apps/worker/src/test-fixtures/quote-cas-experiment.ts
apps/worker/src/workflows/delete.ts
apps/worker/src/workflows/index.ts
apps/worker/src/workflows/post-create.ts
apps/worker/src/workflows/post-delete-mutation.ts
apps/worker/src/workflows/quote-owner.ts
docs/architecture/decisions/0030-quote-consent-owner.md
docs/design/post-action-bar.md
docs/design/post-composer.md
docs/domain/decisions/0029-quote-consent-and-federation.md
docs/domain/objects/post.md
docs/domain/objects/profile-block.md
docs/testing/prod-924-owner-validation.md
drizzle/20261009150000_prod_924_quote_policy/migration.sql
drizzle/20261009150000_prod_924_quote_policy/snapshot.json
memory/temporal/activities.md
openspec/changes/define-quote-consent-and-federation/decisions.md
openspec/changes/define-quote-consent-and-federation/design.md
openspec/changes/define-quote-consent-and-federation/proposal.md
openspec/changes/define-quote-consent-and-federation/specs/activitypub-quote-federation/spec.md
openspec/changes/define-quote-consent-and-federation/specs/post/spec.md
openspec/changes/define-quote-consent-and-federation/specs/quote-consent/spec.md
openspec/changes/define-quote-consent-and-federation/tasks.md
package.json
packages/core/db/enums.ts
packages/core/db/migrate.smoke.test.ts
packages/core/db/tables.ts
packages/core/enums.ts
packages/core/package.json
packages/core/services/index.ts
packages/core/services/notification.test.ts
packages/core/services/post-quote-consent.test.ts
packages/core/services/post-quote-consent.ts
packages/core/services/post-quote-identity.ts
packages/core/services/post-repost.test.ts
packages/core/services/post.test.ts
packages/core/services/post.ts
packages/core/temporal/post-quote-owner.ts
packages/core/temporal/post.ts
packages/fedify/index.ts
packages/fedify/src/federation.ts
packages/fedify/src/inbound-accept.ts
packages/fedify/src/inbound-create.ts
packages/fedify/src/inbound-delete.test.ts
packages/fedify/src/inbound-delete.ts
packages/fedify/src/inbound-observability.ts
packages/fedify/src/inbound-quote-command.ts
packages/fedify/src/inbound-quote.test.ts
packages/fedify/src/inbound-quote.ts
packages/fedify/src/inbound-reject.ts
packages/fedify/src/inbound-update.ts
packages/fedify/src/local-post-delivery.test.ts
packages/fedify/src/local-post-delivery.ts
packages/fedify/src/local-post-note.ts
packages/fedify/src/local-quote-authorization.ts
packages/fedify/src/outbound-recipient-dispatch.ts
packages/fedify/src/quote-owner-protocol.database.test.ts
```
