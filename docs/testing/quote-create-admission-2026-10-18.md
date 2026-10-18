# Quote 작성 admission 회귀 검증 (2026-10-18)

## 범위와 기준

- 원격 기준: #961 `930dedfe7`, #940 `e9bf567cc`, #962 `767b556a3`.
- 최종 구현 코드: #961 `df704d45d`, #940 `a16d8a68e`, #962 `784b0dfbd`.
- 하위 전파 뒤 source tree가 검증 시 저장한 tree `100e7ba1bac98525aa40e990693288ad9104cc78`와 동일한지 Git tree diff로 확인했다.
- 기존 원격 커밋은 모두 각 로컬 HEAD의 조상이다. `main → PROD-792 → PROD-924 → PROD-793` 순서를 유지했고,
  하위 수정은 merge로 전파했다. 원래 dirty checkout의 파일과 branch는 수정하지 않았다.
- push, 리뷰 답글, resolve, merge, 배포는 실행하지 않았다. 아래 결과는 로컬 실행 증거이며 원격 CI 통과가 아니다.
- 최신 main 반영은 이번 변경에 포함하지 않았다. `gh stack view`에서 #961은 기존처럼 `needsRebase=true`이며,
  #940·#962는 현재 하위 HEAD를 포함해 `needsRebase=false`다. 원격 전달 전에 최신 main/CI/mergeability를 다시 확인해야 한다.
- 최종 원격 readback도 기존 HEAD/base 그대로였다. #961은 `DIRTY`, #940·#962는 `BLOCKED`다.
  이번 로컬 변경으로 최신 main 충돌이나 원격 CI가 해결됐다고 주장하지 않으며 merge-ready 판정도 하지 않는다.

## 변경과 리뷰 대응

기존 코드는 Local 생성 entrypoint 전체를 Workflow로 통일하고 Quote의 최초 INSERT를 owner에 연결했다.
Quote의 단일 writer, Source 잠금, 원자적 생성에 필요한 것은 Quote INITIALIZE의 owner 연결이며 일반 작성의 이전은 필요하지 않다.
robin-maki 지적에 따라 일반 작성은 `createPostPersisted → commit → postCreateEffectsWorkflow`로 복구했다.
yeeun-uwu가 확인한 timeout 중복은 실제 회귀로 재현하고 아래 안정적인 identity 및 결과 회수로 수정했다.

| PR   | 변경                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #961 | 일반 작성 직접 저장; Quote admission·결과 회수; Post/최초 Content ID 결속; Mention/Push 복구; caller의 결과 미확정 안내; 회귀 테스트와 기존 CI fixture 수리 |
| #940 | API resolver의 직접 Workflow 우회를 제거하고 core `createPost` 사용; Quote policy를 payload에 결속; Composer policy 전달 및 기존 기본값 hash 호환           |
| #962 | 하위 수정을 전파; private Source 조회·권한·서명·재조회 및 기존 잠금/fence 계약 보존                                                                         |

새 DB 컬럼, migration, consent 상태를 추가하지 않았다. Quote owner의 Source → Quote 잠금, Run/token fence,
CAS와 원자적 INSERT는 유지한다. 생성 후 알림·protocol effects는 기존 소유권 경계를 유지한다.

## 작성별 보장

| 작성            | 계약                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 일반 Post/Reply | Quote owner 또는 `runWorkflow`의 30초 대기와 무관하게 직접 commit한다. 같은 내용을 다시 제출하면 새 작성이며 HTTP 응답 유실 중복의 일반적인 해결책은 아니다.                                                                                                |
| Quote           | 첫 제출 직전에 만든 timestamp:UUID admission을 timeout·편집·재제출에도 보존한다. Profile/Account/본문/Source/Media/Visibility/Quote policy의 원래 payload에 결속한다.                                                                                       |
| 진행 중/완료    | 모든 요청은 payload별 기존 Update 결과를 먼저 조회한다. 진행 중이면 기다리고 완료된 Run에서도 같은 Post ID를 회수한다. 조회와 시작 사이 완료 경합도 다시 조회한다.                                                                                          |
| history 없음    | 최초 시작은 5분 이내, 미래 clock skew는 30초까지 허용한다. 그 뒤에는 결과 조회만 하며 NotFound에도 새 실행을 시작하지 않는다. 현재 retention 설정 증가로 과거 identity가 다시 유효해지지 않는다.                                                            |
| DB 회수         | admission으로 Post UUIDv7, admission+canonical payload로 최초 Content UUIDv7을 결정한다. owner Activity가 재계산하고 기존 currentContentId, ACTIVE, Profile, Source, Visibility, Reply 없음 조건을 확인한다. history가 없어도 새 Post ID를 발급하지 않는다. |
| caller          | timeout/연결 오류/확인할 수 없는 응답은 결과 미확정이다. 명시적 domain 거절은 실패로, admission 불일치/만료는 새 초안이 필요한 거절로 표시한다. 성공 또는 초안 폐기 전 identity를 자동 교체하지 않는다.                                                     |

caller의 identity는 현재 Composer 시도에 보관한다. 초안 폐기·화면 unmount 뒤 새 초안은 다른 시도다.
이 변경은 영구 idempotency receipt 또는 기기 재시작 뒤 초안 복원 저장소를 추가하지 않는다.
이미 수정/삭제된 행을 새 생성으로 추측해 복구하지 않는다. 보존된 Update가 반환한 Post ID는 현재 Post를 조회한다.

알림 projection은 기존 unique/first-judgment 계약을 사용하며 Push Workflow ID는 Notification ID로 고정한다.
Activity 재실행은 같은 알림과 dispatch identity를 사용한다. 외부 Push/ActivityPub 전송은 기존 재시도 계약이며
외부 수신의 exactly-once를 새로 보장하지 않는다. 일반 저장 뒤 effects 시작 전 process 종료 gap도 이번 범위 밖이다.

## 수정 전 실제 재현

정확한 #961 HEAD `930dedfe7`에서 Temporal CLI 1.8.2 및 격리 PostgreSQL로 실행했다.

| 경로       | 관찰                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| 일반 Local | 30,007ms caller timeout 때 Post 0개. gate 해제 뒤 늦은 commit과 동일 입력 재제출로 Post 2개.                   |
| Quote      | 30,005ms caller timeout 때 Post 0개. gate 해제 뒤 늦은 commit과 동일 입력 재제출로 Quote Post 2개/Content 2개. |

일반 Local 중복 ID: `01a14f50-18c2-7f46-9142-b970effa95fc`, `01a14f50-190f-71fa-8a80-53b91a48420f`.
Quote 중복 ID: `01a14f3b-bf06-7b65-9358-4c428b5e91c2`, `01a14f3b-bf87-7fcc-8ac4-b7bb4e336971`.
이것은 schema 거부나 synthetic timeout이 아닌 실제 Workflow 대기 경계의 재현이다.

## 검증 결과

아래는 전체 파일 집합 실행과 실패 수정 후 해당 그룹 재검증의 최종 결과다. 검증 후 하위부터 재전파했으며, 최종 코드가 검증 당시와 동일함을 Git tree diff로 확인했다.

| 검증                                                 | 결과                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 실제 DB·Temporal admission 집중 회귀 (#961)          | 13 tests PASS                                                                                |
| 일반 직접 저장 Core 서비스 전체 (#961)               | 266 tests PASS                                                                               |
| Core unit (#961)                                     | 122 tests PASS                                                                               |
| 구형 postCreateWorkflow history replay 및 transition | 4 tests PASS                                                                                 |
| Composer 집중 단위 (#940)                            | 23 tests PASS                                                                                |
| #940 API policy mismatch/직접 저장                   | 2 tests PASS                                                                                 |
| Core 전체 (최상위)                                   | unit 122 / migration 19 / smoke PASS; 서비스 최종 재검증 중                                  |
| Worker 전체 (최상위)                                 | 진행 중                                                                                      |
| Fedify 전체 (최상위)                                 | 381 + standalone consumer 1 PASS                                                             |
| API 전체 (최상위)                                    | unit 44 PASS; integration 365 PASS / 외부 Media Storage 1 skip; Source 제거 경계 집중 1 PASS |
| Web E2E 전체 (최상위)                                | 진행 중                                                                                      |
| App check/Posts Storybook (최상위)                   | Relay/TypeScript PASS; Composer unit 23 PASS; Storybook 114 PASS                             |

일반 작성 집중 테스트는 Root Post 2개와 Reply 1개를 직접 commit하고 owner RPC 0회를 확인한다.
같은 내용을 명시적으로 재제출한 일반 Post는 별개 작성이다. Quote 집중 테스트의 timeout 재제출은 Post/Content 각 1개로 수렴한다.

집중 회귀에는 최초 생성, 30초 timeout/late commit/동일 identity 재제출, 동시 reconnect,
완료된 Run 결과 회수, 변경 payload 거절, Worker 교체, transition/apply Activity commit 응답 유실,
effect 실패 이후 결과 회수, 같은 Post ID의 다른 INITIALIZE 경합, Source 제거 우회 거절, Source 삭제 경쟁이 포함된다.

history 삭제 API 호출은 로컬 서버에서 metadata가 남을 수 있다. 따라서 같은 DB와 별도의 새 Temporal 서버를
사용한 child process에서 history가 없는 상태를 별도로 증명했다. 원래 payload는 같은 Post/Content를 회수하고,
다른 body의 같은 admission은 DB Content ID 결속으로 거절된다. protocol 송신은 이 집중 테스트에서 stub했으며,
실제 송신 동작은 별도의 기존 Fedify/E2E 검증과 구분한다. Native 기기 실행과 운영 배포 검증은 수행하지 않았다.

최초 전체 E2E에서는 새 admission 입력이 빠진 기존 차단 정책 테스트 2건이 실패했고 fixture를 수정했다.
기존 Worker fixture의 중복 notification INSERT와 Fedify wrapper error/cause 기대값도 실제 계약에 맞춰 수정했다.

## 재실행 명령

```sh
COMPOSE_PROJECT_NAME=kosmo pnpm --filter @kosmo/core test
COMPOSE_PROJECT_NAME=kosmo pnpm --filter @kosmo/worker test
# 마지막 테스트 수정 뒤 재실행한 전체 Quote 그룹:
COMPOSE_PROJECT_NAME=kosmo node scripts/test-db.mjs run -- sh -c 'pnpm db:test:push && pnpm --filter @kosmo/worker exec node --import tsx --test --test-concurrency=1 src/quote-cas-experiment.database.test.ts src/quote-owner.workflow.database.test.ts src/quote-owner-lifecycle.database.test.ts src/quote-private-source.database.test.ts src/post-create-admission.database.test.ts'
COMPOSE_PROJECT_NAME=kosmo pnpm --filter @kosmo/fedify test
COMPOSE_PROJECT_NAME=kosmo pnpm --filter @kosmo/api test
COMPOSE_PROJECT_NAME=kosmo KOSMO_TEST_PORT_OFFSET=1000 pnpm test:e2e
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/post/PostComposer.test.ts
pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/patterns/Posts.stories.tsx
```

DB wrapper는 실행별 별도 DB를 만들고 삭제한다. E2E는 기존 개발 서버와 분리된 포트를 사용했다.
Worker 전체 명령 실행에서 새 알림 테스트의 비동기 effects 완료 가정이 실패해 수정하고 전체 명령을 재실행했다.
재실행의 unit 10 / workflow 44 / DB 99 + 21은 모두 통과했다. 마지막 Quote 그룹에서는 동시 RPC의 도착 순서 가정이
실패해 이를 수정한 뒤, CAS·owner lifecycle·private Source·admission의 전체 Quote 그룹 68개를 다시 실행해 통과했다.
따라서 위 Worker 결과는 단일 최종 전체 명령의 exit code를 주장하는 것이 아니라 모든 하위 그룹의 통과 집합이다.
동시 INITIALIZE는 먼저 도착한 한 payload만 저장되고 다른 payload는 거절되는지 검증한다.
Relay PayloadError 분류는 최소 호환 타입으로 정리했다.

## 변경 파일

- `apps/api/schema.graphql`
- `apps/api/src/graphql/resolvers/post/mutation/create.ts`
- `apps/api/tests/integration/graphql/post.test.ts`
- `apps/app/src/components/post/PostComposer.test.ts`
- `apps/app/src/components/post/PostComposerController.tsx`
- `apps/app/src/components/post/postComposerAdmission.ts`
- `apps/app/src/components/post/postComposerAdmission.web.ts`
- `apps/app/src/stories/patterns/Posts.stories.tsx`
- `apps/web/e2e/profile-block.e2e.ts`
- `apps/worker/package.json`
- `apps/worker/src/activities.database.test.ts`
- `apps/worker/src/activities/post-transition.ts`
- `apps/worker/src/activities/quote-owner.ts`
- `apps/worker/src/post-create-admission.database.test.ts`
- `apps/worker/src/post-transition.workflow.test.ts`
- `apps/worker/src/test-fixtures/legacy-post-create-workflow.ts`
- `apps/worker/src/workflows/post-create.ts`
- `apps/worker/src/workflows/quote-owner.ts`
- `docs/architecture/decisions/0030-quote-consent-owner.md`
- `docs/design/post-composer.md`
- `docs/domain/objects/post.md`
- `memory/temporal/activities.md`
- `packages/core/package.json`
- `packages/core/services/post.test.ts`
- `packages/core/services/post.ts`
- `packages/core/services/quote-notification.test.ts`
- `packages/core/temporal/client.test.ts`
- `packages/core/temporal/client.ts`
- `packages/core/temporal/post-admission.test.ts`
- `packages/core/temporal/post-admission.ts`
- `packages/core/temporal/post-quote-owner.ts`
- `packages/core/temporal/post.ts`
- `packages/fedify/src/inbound-accept-reject.test.ts`
- `packages/fedify/src/inbound-follow.test.ts`
