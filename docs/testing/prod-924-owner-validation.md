# PROD-924 로컬 owner 검증 기록

검증일: 2026-10-09 및 2026-10-12. 통합 기준: #940 `6a2f1b682`, #961 `2d2d23115`, 병합된 #1094 `7248b8f27`.
로컬 worktree `/private/tmp/kosmo-prod924-owner`에서 실행했다. 원격 push·리뷰·merge·배포는 하지 않았다.

## 2026-10-09 실행 결과

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
- 10월 9일에는 두 keyboard Storybook만 실행했고 Composer E2E는 미실행이었다. 아래 10월 12일 결과가 이 gate의 최신 기록이다.
- 모든 원격 issuer와의 HTTP/cache/redirect 상호운용, body 없는 410 및 반복 current-invalid 최종 상태는 확정하지 않았다.
- 강제 Terminate/Reset의 이미 fence를 통과한 transaction 취소, 외부 exactly-once 및 Source/Quote의 외부 delivery 전체 순서는 보장하지 않는다.
- retention 이후 Source-less Quote의 원래 target/Request 복구에는 원본 이벤트가 필요할 수 있다.
- 구형 writer inventory·실제 history replay·production admission 전환과 장애 복구는 남아 있다. 로컬 실제 Worker lifecycle 검증은 아래 결과와 구분한다.

배포·PR 반영 책임과 자세한 운영 경계는 [ADR 0030](../architecture/decisions/0030-quote-consent-owner.md)을 따른다.

## 2026-10-12 남은 Gate 재검증

기준은 로컬 통합 `fb3177ef56a6c6e26ca45ef2b2a6dcb84d597375`이다. 소실된 임시 checkout을 동일 commit에서 복원했고,
기존 `PROD-1053` checkout과 사용자 수정은 건드리지 않았다. Node 26.3.0·pnpm 11.27.1, 실제 로컬 Temporal·격리
PostgreSQL·Playwright Chromium을 사용했다. CI의 Ubuntu ARM runner 자체나 원격 CI 성공을 증명하는 결과는 아니다.
아래 최종 결과는 해당 기준에 이번 테스트·fixture·test-runtime 수선을 적용한 상태의 결과다.
수선 전 실패와 assertion summary 뒤 정상 종료하지 못한 실행은 최종 성공과 구분한다.

| Gate             | 실행 명령/경계                                                                                 | 결과                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Composer E2E     | 실제 5개 서버, `playwright test e2e/compose.e2e.ts`                                            | 12/12 PASS; focused 1/1 PASS                                                      |
| Worker lifecycle | 실제 #961 writer와 production `src/index.ts`, PG 잠금·SIGTERM·replacement·CAN·finish·fresh Run | 5/5 PASS                                                                          |
| Root             | `pnpm test:eslint`                                                                             | 8/8 PASS                                                                          |
| Admin            | `pnpm --filter @kosmo/admin test`                                                              | check PASS, unit 7/7·DB 3/3 PASS                                                  |
| Web              | `pnpm --filter @kosmo/web check && pnpm --filter @kosmo/web test:unit`                         | check PASS, 46/46 PASS                                                            |
| Helm             | CI의 dev/prod `helm lint`·`helm template` 4개 명령                                             | PASS                                                                              |
| Admin Image      | `docker build --target runtime` 및 CI의 HTTP security assertions                               | PASS; 로컬 image tag, macOS의 GNU timeout 부재만 유한 대기로 대체                 |
| Lint             | `pnpm run '/^lint:.*/'`·`pnpm --recursive --parallel --if-present run '/^lint:.*/'`            | PASS; thread guard 적용 후 전체 명령 exit 0                                       |
| Fedify           | `pnpm --filter @kosmo/fedify test`                                                             | PASS; unit 352/352·Protocol 7/7·Consumer build/tsc 및 1/1, 전체 exit 0            |
| Core             | `pnpm --filter @kosmo/core test`                                                               | PASS; unit 108/108·migration 19/19·smoke·service 254/254                          |
| API              | `pnpm --filter @kosmo/api test`                                                                | PASS; unit 42/42·integration 340 PASS/1 SKIP (외부 Media Storage Service 미설정)  |
| App              | `pnpm --filter @kosmo/app test` 및 전체 Storybook 재검증                                       | PASS; check/build·unit 920/920·Storybook 902/902                                  |
| Worker           | `pnpm --filter @kosmo/worker test`                                                             | PASS; unit 10/10·workflow 41/41·DB 64/64·migration 21/21·Quote 41/41, 전체 exit 0 |
| Web E2E          | CI의 `test:e2e:database --shard=N/3`                                                           | PASS; shard 1: 60/60·shard 2: 52/52·shard 3: 56/56 (168/168)                      |

### 확인한 실패와 수선 경계

- 기존 #940 CI run `37014379946`의 Composer FOLLOWERS focus assertion을 동일하게 재현했다. 승인된 keyboard
  dismiss·trigger focus 계약을 테스트에 반영하고 메뉴 재열기로 기존 Tab-dismiss coverage를 유지했다.
- 기존 Storybook `Quote Modal Failure Lifecycle`·`Universal Compact Composer Lifecycle`의 같은 계약 불일치를
  수선했다. focused 3/3에서 이 두 건과 Media editor를 확인했다. 제품 메뉴 동작을 되돌리지 않았다.
- 첫 전체 App 실행의 Media editor upload-ready timeout은 단독 재실행과 두 번째 전체 실행에서 통과했다.
  두 번째·후속 전체 실행은 별도 Media Viewer의 lazy thread-loading timeout 1건이었다. 단독 실행은 통과했고, 유한 observation deadline을 1초에서 5초로 조정한 뒤 전체 902/902를 확인했다. UI assertions와 제품 timeout은 바꾸지 않았다. 각 실패를 최종 PASS와 별도 기록한다.
- Core notification fixture가 Local create effects 시작 후 Reply 관계를 추가하던 경쟁을 제거했다. 완성된
  Reply+Quote+Mention 저장 shape를 한 transaction으로 seed한 후 실제 notification materializer 경쟁과 readState를
  검증했다(9/9). 제거된 consent DTO를 참조하던 `post.test.ts`는 기존 FK/status 조회로 정렬했다. 저장 rollback
  테스트는 private persistence 경계(27/27), ActivityPub post-commit effects 실패는 public 경계를 유지한다.
- 신규 Local Temporal admission의 저장 없음은 API mutation, Activity/effect ordering은 Worker Workflow suite가
  별도로 검증한다. persistence 테스트 성공을 public owner admission 증명으로 대체하지 않는다.
- `--ignore-scripts` install의 누락된 executable shim은 정상 frozen-lockfile install로 복구했다. manifest/lockfile은
  변경하지 않았다. lifecycle legacy fixture의 30초 Activity timeout 및 Worker unit의 5초 cold-start deadline 실패는
  테스트 환경 실패로 기록하고 fixture 90초·unit 30초로 조정했다. 제품 timeout은 바꾸지 않았다.

- Worker database suite는 `KOSMO_TEST_TEMPORAL_RUNTIME=0` 때문에 새로운 Local admission을 실제 Worker 없이
  기다려 실패했다. 실제 production test-runtime을 켜도록 테스트 script를 정렬했다. 해당 실패는 assertion
  통과 뒤 무시한 것이 아니라 aggregate를 중단(exit 130)하고 처음부터 재검증했다.
- 전체 Web 수집의 제거된 `createPostQuoteConsent` 참조는 Source 상세 navigation fixture의 atomic APPROVED seed로
  교체했다. services barrel이 불필요한 JSON module을 로드하던 collection 오류도 해소했다. 이것은 신규 승인
  검증을 우회한 acceptance 결과가 아닌, 이미 승인된 DB projection의 navigation 테스트다.
- API ancestor fixture는 타인 Source와 같은 작성자를 혼동하던 기대값을 정렬했다. 타인의 NULL/PENDING/REJECTED/
  REVOKED Source는 숨기고 APPROVED만 노출하며, 자기 인용 예외는 별도 assertion으로 유지했다.

- Fedify 352건·Worker DB 63건의 assertion 완료 후 preload가 runtime을 유지해 다음 command로 진행하지 않는
  종료 Gate를 재현했다. 최소 1개 test는 native/tsx 모두 exit 0이었지만 실제 inbound Quote 30개는 native에서도
  summary 뒤 hang했다. CLI 교체로 해결을 주장하지 않고 공통 preload를 Node test child에만 적용했다. 생성 시의
  owned connection만 after에서 닫으며, 테스트가 교체한 독립 environment 연결을 닫던 초기 수선의 반례도 수정했다.
  이어 SDK Workflow thread가 `--import`와 `NODE_TEST_CONTEXT`를 상속해 별도 production runtime을 시작하는
  실제 반례를 확인했다. `isMainThread` 가드를 추가하고 thread의 Temporal 주소가 main test 주소를 유지하는
  behavior test 1/1·exit 0 및 실제 inbound Quote 30/30·exit 0으로 확인했다. runner 교체는 하지 않았다.
- Web E2E shard 2의 Remote Block/follow timeout은 `beforeEach`였다. 거부된 Quote 명령의 장기 owner `result()`를
  reset이 계속 기다린 것이다. owner에 finish Signal을 보내 정상 drain 완료를 기다린 뒤 DB를 reset한다.
  강제 Terminate나 Remote Block·승인 policy 변경은 하지 않았다.
- Web E2E shard 3은 55 PASS·1 FAIL이었다. 기존 #961과 동일한 Home/actor 코드 및 테스트에서 요청 count 2
  기대값 대신 3을 재현했다. 첫 alpha 요청의 강제 실패 뒤 두 요청 모두 beta actor였다. 기존 cached Home
  mount의 network-only 재검증을 허용하되 복구 요청 1~2회, 모든 요청·응답의 새 Profile 일치와 실제 timeline
  복구 및 요청 안정성을 검증하도록 테스트만 정렬했다. Home 제품 코드는 변경하지 않았다.

### lifecycle의 실제 보장 범위

기존 #961 writer의 UPDATE 뒤 미commit transaction은 SDK Worker shutdown 중에도 존재했고, 새 owner bootstrap은
그 DB 잠금 뒤 완료 상태를 읽었다. production Worker SIGTERM은 Workflow를 종료하지 않았으며 replacement는 같은
Run을 재개했다. production write Activity가 PG 잠금을 기다릴 때 SIGTERM을 보내고 Query deadline rollback·retry
뒤 replacement가 승인 완료하는 순서도 실행했다. CAN·정상 finish·fresh Run에서는 작성 document/link가 보존된다.

SDK shutdown은 owner finish/drain의 대체 수단이 아니다. 구형 writer admission 차단과 미완료 Activity/history·DB
session·process inventory가 전환 조건이며, 이 운영 전환을 production에서 실행한 것은 아니다. 강제 Terminate의
Query 통과 후 늦은 commit은 기존 반례 그대로 남는다. 이번 정상 lifecycle PASS로 해결됐다고 표시하지 않는다.

### PR별 반영 순서와 미실행 경계

최신 확인 HEAD는 #940 `6a2f1b682`, #961 `2d2d231154`, 병합 #1094 `7248b8f2`, main `e15787c41`이다.
통합본은 공유 DTO·registry·common applier·local policy 때문에 파일 단위 독립 반영이 불가능하다.

1. #1094의 두 consent 컬럼·fresh-proof 공통 모델을 기반으로 유지한다.
2. #961 하위 계층에 owner·inbound·reconciliation 및 Source 삭제의 **공통 안전 경계**를 함께 반영한다.
   Source 공유 잠금과 atomic bulk 철회가 없는 상태에서 owner 승인만 독립 배포하면 안 된다.
3. #940 상위 계층에 local INITIALIZE/REQUEST/DECIDE와 Source 삭제 local orchestration, policy-only migration,
   API/Composer를 반영한다. 중복 consent migration을 추가하지 않는다.
   #1094의 기존 Source lookup index를 유지하고, `20261009150000_prod_924_quote_policy`의 nullable column/enum
   추가와 local ACTIVE Post backfill을 새 application 시작 전에 적용한다. production lock 시간·데이터 규모와
   구버전 workload 호환은 별도 확인 대상이다.
4. shared DTO/registry/policy projection을 hunk 단위로 나눈 뒤 각 layer의 build·migration·Source 경쟁을 다시 실행한다.
   현재 common applier의 `Posts.quotePolicy` 조회와 local INITIALIZE 입력은 #940 책임이다. #961에는 기존 정책
   경계를 유지하고, 이 column 조회를 schema 없이 먼저 배포하지 않는다. 공유 파일 전체를 하위 PR로 복사하는
   방식은 독립 build·DB 호환을 보장하지 않는다.

각 PR layer 재구성·독립 build, 실제 기존 production history replay·rollout inventory, 원격 CI/merge-group 및 Ubuntu
runner·production 환경 검증은 미실행이다. 통합본의 로컬 Gate와 분리한다. 원격 push·리뷰 답글·resolve·merge·배포는
이번 세션에서 수행하지 않았다.

최종 로컬 로그는 `/private/tmp/prod924-compose-e2e-full.log`, `prod924-lifecycle-gate-final.log`,
`prod924-worker-aggregate-gate.log`, `prod924-gate-fedify-thread-guard-verified.log`,
`prod924-gate-core-threadguard-final.log`, `prod924-gate-api-threadguard-final.log`,
`prod924-gate-app-final.log`, `prod924-web-shard-1-verified.log`, `prod924-web-shard-2-verified.log`,
`prod924-web-shard-3-final.log`, `prod924-gate-lint-commit-final.log`에 남겼다.
로컬 임시 로그의 보존을 원격 CI artifact 보존으로 간주하지 않는다.

### 이번 Gate 수선 변경 파일

`fb3177ef5` 이후의 변경은 아래 22개 파일이다. 제품 runtime·schema·dependency·lockfile은 추가 변경하지 않았다.

```text
apps/api/tests/integration/graphql/post.test.ts
apps/app/src/stories/patterns/PostMediaViewer.tests.stories.tsx
apps/app/src/stories/patterns/Posts.stories.tsx
apps/app/src/stories/patterns/Shell.tests.stories.tsx
apps/web/e2e/compose.e2e.ts
apps/web/e2e/db-fixtures.ts
apps/web/e2e/post-detail.e2e.ts
apps/web/e2e/profile-switcher.e2e.ts
apps/worker/package.json
apps/worker/src/worker.test.ts
apps/worker/src/quote-owner-lifecycle.database.test.ts
apps/worker/src/test-runtime.database.test.ts
apps/worker/src/test-fixtures/legacy-quote-consent-961.ts
apps/worker/src/test-fixtures/legacy-quote-writer.ts
apps/worker/src/test-fixtures/runtime-worker-thread.ts
packages/core/services/mention-notification.test.ts
packages/core/services/post.test.ts
packages/core/temporal/test-client.ts
packages/core/temporal/test-runtime.ts
docs/architecture/decisions/0030-quote-consent-owner.md
docs/testing/prod-924-owner-validation.md
memory/temporal/activities.md
```

## 로컬 통합 변경 파일

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
