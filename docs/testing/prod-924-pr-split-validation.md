# PROD-924 PR 계층 검증

통합 기준은 `3122940aa`이며, 이 기준의 통과 결과를 분리 계층의 통과로 재사용하지 않는다.
재구성 기준 main은 `e15787c41f929dde416e486adf9b424d31719fce`, 병합 #1094는 `7248b8f27dc8a9bbefbb2cbae9139bf54883bee4`다.
원격 #961 head는 `2d2d231154f17531ca23a3c912b4e14b6d756f8f`, #940 head는 `6a2f1b682bb7f53edfcdd6a3d7e0bb2a31e7bbcb`다.
두 원격 PR의 base ref는 main이며 API가 보고한 base OID는 각각 `22bf28a4a7`, `29dc3cd051`이다.
이는 현재 main ref를 재조회한 SHA와 다르므로 실제 하위 후보 검증 base에는 위의 최신 main을 사용한다.

## 분리 경계

하위 #961은 common consent model·Source lookup index를 유지하며 Quote owner, inbound proof/reconciliation,
Source 잠금 및 atomic bulk 철회를 제공한다. 기존 Local create/delete의 직접 consent writer는 공통 owner bridge로
연결한다. native Local Source 작성 계약과 원격 Source 작성 거부는 유지하며 정책 enum/column은 추가하지 않는다.
상위 #940은 그 bridge 위에서 원격 Source 작성·정책·API admission·Composer 및 Source local orchestration을 확장한다.
#940은 #961 없이 적용 가능한 PR이 아니다. 두 계층의 공유 DTO·registry·service·protocol projection은 기능 hunk로 나눈다.

## 운영 검증 경계

최신 main의 실제 migration 이력 60개를 적용한 격리 PostgreSQL에서 하위 migration을 실행하고 이력 불변,
폐기된 activitypub_post_quote 부재, 두 consent 컬럼 및 멱등 재실행을 확인했다.
구형 young_mercury migration이 운영 이력에 이미 존재한다면 이 파일을 제외한 tree의 history Gate가 실패한다.
운영 이력은 미확인이며, 이 경우 history를 삭제하는 우회는 허용하지 않는다.

로컬 production bundle replay·SDK shutdown·owner finish/drain·CAN·새 Run bootstrap과 실제 production history
replay·구형 writer fleet drain은 별도 근거다. 운영 Temporal namespace는 kosmo-prod, retention은 30일이다.
이번 작업에서 운영 cluster/history/DB 이력은 조회하지 않았다. 강제 Terminate의 Query 통과 후 늦은 commit,
외부 exactly-once 및 Source/Quote 외부 delivery 전체 순서는 보장하지 않는다.

## 실행 기록

각 계층의 고정 head와 최종 aggregate 결과는 상위 재구성 완료 시 이 기록에 추가한다. 로컬 checkpoint의 pending
실행을 PASS로 취급하지 않는다. CI Ubuntu ARM runner·원격 CI 및 production 검증과 로컬 실행을 구분한다.

### 하위 #961 새 실행 결과

재구성된 최신 main + #961 패킷에서 실제 명령을 실행했다. 통합본의 결과를 복사하지 않았다.

| Gate                                                | 결과                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Core `pnpm --filter @kosmo/core test`               | unit 110/110·migration 19/19·smoke·service 256/256 PASS, exit 0                   |
| API `pnpm --filter @kosmo/api test`                 | unit 44/44·integration 346 PASS/1 SKIP, exit 0                                    |
| Worker `pnpm --filter @kosmo/worker test`           | unit 10·workflow 42·DB 69·migration 21·Quote 41 = 183/183 PASS, exit 0            |
| Fedify `pnpm --filter @kosmo/fedify test`           | unit 355/355(protocol 7 포함)·Consumer build/tsc·1/1 PASS, exit 0                 |
| Composer E2E `test:e2e:database e2e/compose.e2e.ts` | 실제 5개 서버, 12/12 PASS, exit 0                                                 |
| main → #961 migration                               | history 60개 불변·폐기 테이블/새 policy 컬럼 부재·멱등 재실행 PASS                |
| local history replay                                | production Workflow bundle로 fresh Run replay·DB consent/source/content 불변 PASS |

API의 외부 Media Storage Service 테스트 1건은 환경 미설정으로 skip했다.
최초 Core 실패 3건은 상위 policy/remote-Source 작성 테스트가 하위에 들어간 범위 오류였다.
이를 분리하고 하위의 기존 원격 Source 작성 거부 및 remote Reject CAS를 보존했다(focused 31/31).
최초 API 실패 3건은 legacy effects-only start spy였다. 실제 owner admission 실패의 ACTIVE/GraphQL error,
Source owner history의 Activity와 cached Update 및 완료 후 재요청의 tombstone/deletedAt/content 불변을
검증하도록 정렬했다(focused 56/56). 단일 Run의 effect 횟수와 새 Run terminal effect 복구를 혼동하지 않는다.
최초 Worker startup은 30초 fixture timeout이었다. 실제 정상 entrypoint 계측 23.5초·단독 29.3초를 확인한 뒤
테스트 deadline만 120초로 맞췄다. 제품 timeout과 종료 처리는 변경하지 않았다.

로그는 `/private/tmp/prod924-lower-core-final.log`, `prod924-split-lower-api-final.log`,
`prod924-split-worker-aggregate.log`, `prod924-lower-fedify-full.log`, `prod924-lower-compose-e2e.log`,
`prod924-lower-migration-transition.log`, `prod924-split-lifecycle-replay.log`에 있다.
최초 최종 lint에서 상위 테스트 분리 후 남은 unused import 3건을 확인해 제거했다.
전체 root 및 recursive lint/typecheck를 이 정렬 후 새로 실행해 exit 0을 확인했다.

### 상위 #940 분리 및 migration 검증

하위 고정 head는 `cd7c5c694e7df3315af88732c8e04eb6488e22d9`이며 최신 main과 원격 #961 두 parent를 보존한다.
상위는 이 head와 통합 `3122940aa`를 merge하여 기존 #940 이력을 유지한다. 원격 PR ref/base는 아직 변경하지 않았다.

최신 main → #961 → #940 실제 PostgreSQL migration은 이력 60 → 60 → 61로 통과했다.
local ACTIVE contentful Post만 EVERYONE으로 backfill하고 remote·DELETED·contentless는 NULL을 유지했다.
기존 본문 JSON/CW·링크·media binding·content ID·repostSourceId·APPROVED/approval URI가 변하지 않았다.
구버전의 정책 없는 INSERT도 확장된 스키마에서 실행됐고, 두 consent 컬럼과 폐기 테이블 부재 및 재실행 멱등성을 확인했다.
이는 구형 consent writer와 새 owner의 동시 운영 허용 증거가 아니다.
로그: `/private/tmp/prod924-upper-migration-transition.log` (exit 0). 초기 실험 fixture의 잘못된 MANUAL enum과
postgres.js Result/Array prototype assertion을 수정한 뒤 다시 실행했다. 제품 SQL 변경으로 처리한 실패가 아니다.

정책 migration SQL 및 디렉터리 이름은 통합본과 동일하다. 기존 snapshot의 비정책 hunk를 제외하고
최신 main snapshot의 424개 DDL을 그대로 보존한 뒤 enum·column 2개만 추가했다.
최신 main snapshot과 새 policy snapshot을 격리 출력 경로에 놓고 공식
`drizzle-kit check --dialect postgresql --out /private/tmp/prod924-snapshot-validator`를 실행해 exit 0을 확인했다.
전체 과거 snapshot을 읽는 generate/check는 종료되지 않았으며 PASS로 기록하지 않는다.
동일 최신 main의 전체 snapshot만 놓은 대조 check도 25초 안에 끝나지 않아 해당 소유 process group만 종료했다.
최신 main 전체 snapshot 대조의 미종료 문제와 정책 SQL의 실제 migration 통과를 구분한다.
전체 generate가 정상 종료한 증거는 없으며 향후 schema generation 시 별도 도구 검증이 필요하다.

Fedify protocol database 7건은 하위부터 unit glob에 포함돼 있다. 상위 통합본 root script의 별도 중복 호출은
제외했고, test 실행 횟수를 고유 테스트 수로 부풀리지 않는다.

### 공유 파일의 hunk 책임

| 영역                       | #961 공통 경계                                                              | #940 상위 기능                                         |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| core `post.ts`             | Local compatibility bridge·Source owner·잠금·atomic revoke                  | 원격 Source PENDING 작성·정책 검증/저장                |
| core consent service       | status/approval/source CAS·Source lock·공통 Source 표시 규칙                | local policy/follow eligibility                        |
| core DTO / Worker registry | INITIALIZE/REQUEST/DECIDE·read/write/fence/drain/bootstrap·공통 Source 삭제 | 기존 DTO에 nullable quotePolicy 입력 전달              |
| Fedify                     | inbound·Approval dispatcher·proof/reconciliation·terminal effect            | local Note의 policy approval audience projection       |
| API                        | 기존 service caller가 lower compatibility bridge 사용                       | 직접 owner admission·정책 입력/응답·Source 표시 loader |
| DB                         | #1094 두 consent 컬럼·Source lookup index 유지                              | nullable policy enum/column과 local Post backfill      |
| UI                         | main의 기존 작성·Mention·keyboard 계약 유지                                 | Profile policy 초기화·policy 메뉴 및 keyboard dismiss  |

#961은 latest main + merged #1094에서 독립 실행한다. #940은 #961 head를 base로 해야 한다.
기존 두 PR이 둘 다 main을 가리키는 원격 상태는 그대로 두었으며, 향후 승인된 Stack 반영 시
#940 base를 #961 branch로 정렬해야 한다. 순서는 공통 모델(병합됨) → #961 → policy migration → #940 application이다.
별도 Source writer를 상위에 재구현하지 않는다. 구형 writer admission freeze/drain은 코드 병합 순서와 별도 운영 Gate다.

### 로컬 상위 실행 기록

| Gate                             | 실제 결과                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Root 및 recursive lint/typecheck | exit 0                                                                         |
| API                              | schema/tsc·unit 44/44·integration 346 PASS/1 기존 SKIP, exit 0                 |
| App                              | Relay/tsc·unit 952/952·Storybook build·138 files/908 interactions PASS, exit 0 |
| Core                             | unit 110/110·migration 19/19·smoke·service 257/257 PASS, exit 0                |
| Web                              | check 및 unit PASS, exit 0; 전체 E2E shard 종료 결과는 아래 최종 기록          |

UI/API 독립 hunk 검토에서도 actionable 회귀를 발견하지 않았다. 최신 main의 Mention·Enter/Space/Escape,
Profile ID guard, FOLLOWERS Arrow dismiss/focus 및 공통 Source 표시/owner admission 재사용을 확인했다.
전체 CI 중 변경 영역의 Core/API/Fedify/Worker/App/Web 및 focused Composer를 실행하며,
무관한 Admin/Helm/Admin Image job과 원격 Ubuntu ARM 실행 및 GitHub CI는 이번 로컬 증거에 포함하지 않는다.

Root `pnpm test:eslint`는 하위/상위 각각 8/8, Web check+unit도 각각 46/46 PASS·exit 0이었다.
상위 Web E2E shard 1/3은 60/60, 2/3은 53/53 PASS·exit 0이다.
각 계층 전체 변경 경로는 [파일 manifest](./prod-924-pr-split-files.json)에 기록한다.
원래 primary `PROD-1053` checkout과 사용자 변경, 통합 `3122940aa` checkout은 보존했다.

상위 Worker 최종 동결 exact aggregate는 183/183 PASS·exit 0이었다(unit 10, Workflow 42, DB 69,
migration 21, Quote 41). nullable 정책 input 전달과 AUTHOR의 실제 INITIALIZE DB 저장을 추가 관측했다.
Source 경쟁·deadlock rollback/retry·ABA·timeout·CAN·Worker 복구·local history replay도 이 run에 포함된다.
최초 sandbox listen EPERM 결과는 제품 실패로 바꾸지 않고 로그를 보존했으며 실제 환경 권한으로 재실행했다.
최종 Fedify script는 고유 unit 356/356·Consumer build/tsc 1/1 PASS·exit 0이었다.
중복 protocol 별도 호출을 제외한 현재 script로 재실행했다. 새 policy JSON-LD와 기존 Mention/terminal 전달도 통과했다.
로그는 `/private/tmp/prod924-upper-worker-aggregate.log`, `prod924-upper-fedify-final.log`,
`prod924-upper-core-final.log`, `prod924-split-upper-api-final.log`, `prod924-split-upper-app-final.log`,
`prod924-upper-lint-recursive.log`, `prod924-upper-web-unit.log`에 있다.

최종 원격 read-back에서 main `e15787c41f` 및 두 기존 PR head는 최초 snapshot과 같았다.
기존 #961 remote CI와 이번 로컬 후보 검증은 별도다. #940 remote old head의 App·Web shard 1/3·총괄 Test
실패는 여전히 남아 있으며 로컬 통과로 원격 상태를 수정하지 않았다. 후보 head의 원격 CI는 미실행이다.

제품 코드의 추가 blocker는 현재 발견하지 않았다. 원격 push/답글/resolve/merge/deploy는 사용자 지시로 보류한다.
production history export/replay·운영 DB 구형 migration inventory·실제 writer fleet drain이 미실행이므로
production 전환 준비 완료라고 표시하지 않는다. 강제 Terminate 뒤 늦은 commit, 외부 exactly-once 및
Source/Quote 간 외부 delivery 전체 순서도 보장 범위에서 제외한다.

상위 Web E2E 마지막 shard 3/3은 56/56 PASS·exit 0이었다. 전체는 **169/169**(60+53+56)로
실제 production entrypoint 5개 서버에서 실행했다. Composer 12건도 포함됐으며 새로운 실패는 없었다.
하위는 UI 변경이 없어 focused Composer 12건과 Web check/unit 46건을 실행했고 전체 Web E2E
3-shard 및 App Storybook을 재실행한 것으로 표시하지 않는다.

로컬 최종 반영은 기존 PR branch 이름 `PROD-792`와 `PROD-924`를 격리 clone에서 채택하는
main → #961 → #940 Stack이다. 원래 candidate branch는 비교용으로 보존하고 원격 기존 head는 유지한다.
원래 #961/#940 head가 각각 새 후보의 ancestor이므로 이력 rewrite 없이 fast-forward 반영할 수 있다.
다만 원격 #940 base 변경·원격 CI 및 Stack push/submit은 별도 사용자 승인 후 작업이다.

### #962 private Source owner 이식의 focused 검증 (2026-10-12)

이 계층은 #940 `9987966eb324f6449a40afecdfc41a6eeeabe651`과 기존 #962 이력을 병합한 작업 트리다.
기존 #962의 직접 consent writer·transaction callback을 복사하지 않고, 인증된 Source 준비 DTO와
공통 Quote owner의 fenced transaction을 사용했다. 신규 private Source·Content·Media와 consent는 같은
commit/rollback 경계에 있다. 기존 Public/Unlisted hydration과 signed-fetch Public fallback은 유지한다.

- signed follower/key 일치 테스트는 최초 실행에서 null/APPROVED mismatch로 실패했다.
  이식 후 private·Public·URI winner·Follow 해제·audience·동시 중복·revoke/CAS focused 12/12 PASS, exit 0.
- 실제 PostgreSQL·Temporal owner focused는 13개 child와 parent를 합쳐 Node summary 14/14 PASS, exit 0.
  Source·Media commit, Query timeout rollback/SDK retry, CAS revoke, Follow 해제, Query 후 Follow 해제,
  inactive Profile/Instance, URI author/visibility mismatch 및 commit 응답 유실 복구를 실행했다.
  Source 삭제의 실제 bulk revoke와 Quote Content 보존, 생성 effect startup retry의 동일 ID,
  성공 child의 closed AlreadyStarted 검증은 SDK 예외 mock을 사용했다. 추가 native Temporal child에서는
  실제 postCreateEffectsWorkflow 완료 후 동일 ID의 REJECT_DUPLICATE 시작이 SDK AlreadyStarted를 던지고,
  production effect Activity 재호출이 이를 처리하는 것을 확인했다. notification Activity 전달 경계만 stub하며
  각 kind별 1회인 총 3회 이후 추가 effect 실행이 없었다.
  prepared DTO 뒤 삽입된 동일 author/FOLLOWERS URI winner를 연결하며 Source SHARE·Query를 유지한 상태에서
  실제 Source delete owner를 동시에 시작했다. PostgreSQL Lock 대기와 delete 미완료를 확인하고 fence를
  해제한 뒤 binding commit → bulk REVOKED 및 작성 본문/Media 보존을 검증했다.
- History의 준비 DTO에 미리 할당된 Source Post ID를 현재 연결 ID와 대조하고, fresh proof/CAS
  reconciliation에 그 ID가 유지되는 경우에만 생성 effect를 재개한다. 응답 유실 테스트에서 Source·Media는
  하나이고 생성 effect도 한 번 호출됐다. 응답 유실 뒤 fresh proof가 일시 실패(NOOP retryable)하고
  이후 valid proof로 다시 처리되는 경우에도 이미 commit된 Source 생성 effect는 한 번 정산됐다.
  이 정산은 Quote 재승인이나 Source 접근권 변경을 수행하지 않는다. status/approval URI만으로 소유권을 추론하지 않는다.
- 전체 inbound Quote 최초 실행은 44 PASS/1 FAIL이었다. 실패는 구형 fixture가 원래 target 없이 DB에
  직접 만든 PENDING 상태였다. owner input에 원래 Source binding을 명시한 focused 재실행은 1/1 PASS다.
  이 수정은 원래 binding이 사라진 운영 데이터의 자동 복구 허용을 뜻하지 않는다.
- canonical followers URI가 없는 stored Actor의 signed Public fallback 추가 테스트는 1/1 PASS, exit 0.
- URL-only FEP 승인 참조의 미저장 Source는 승인 증거 → Local Follower 서명 조회로 통일하고,
  Follower 없는 Public도 조회 없이 PENDING으로 유지한다는 2026-10-12 사용자 결정을 반영했다.
  기존 generic Source preflight는 실제 owner 경로의 3개 진단 테스트에서 Source URI 1회씩 관측돼
  RED였다. 좁은 materialization guard를 추가한 최종 production owner focused는 10/10 PASS, exit 0.
  unknown stored author·no follower·no key의 zero unsigned/lookup, selected signed identity,
  Follower 없는 Public PENDING/no Source, approved embedded Public, no-approval URL-only Public·legacy·
  signed Public fallback을 검증했다. Public fixture에 Follower를 추가하지 않았다.
  로그는 `prod924-962-unsigned-red.log`, `prod924-962-policy-focused.log`이며, scoped fix artifact는
  `/private/tmp/prod924-962-policy-fix-against-checkpoint.diff`다. Worker runtime은 이 수정에서 바꾸지 않았다.
- Worker/Fedify TypeScript와 scoped ESLint·Prettier 및 diff whitespace 검증은 exit 0이었다.
  전체 패키지 aggregate, API·원격 CI와 운영 acceptance는 별도 최종 기록에 기재한다.

로그: `/private/tmp/prod924-962-red.log`, `prod924-962-private-third.log`,
`prod924-962-owner-private-native.log`, `prod924-962-pending-fixture-final.log`,
`prod924-962-signed-public-final.log`, `prod924-962-worker-type-native.log`,
`prod924-962-fedify-type-final5.log`, `prod924-962-eslint-native.log`, `prod924-962-prettier-native.log`.
프로덕션 history replay·migration inventory·writer fleet drain·강제 Terminate 복구와 외부 exactly-once를
이번 focused 실행의 PASS로 표시하지 않는다.

### #962 최종 전체 패키지 검증

2026-10-12, 위 merge 작업 트리에서 Core 전체(unit110/migration19/smoke/services257),
API(unit44/integration346 PASS, 기존 외부 storage1 SKIP), Fedify(unit372/Consumer1)는 exit0이었다.
API 최초 실행의 DTO visibility 타입 오류는 DIRECT 제외 narrowing으로 수정한 뒤 전체 재검증했다.
최종 root ESLint/Prettier/syncpack 및 recursive lint/type/schema 검증은 모두 exit0이다.
Root behavioral tooling test8도 PASS다. migration은 기존 #940 정책 migration 그대로이며 새 schema/state는 없다.

초기 Worker 전체 실행194/194는 후속 effect retry 수정 이전 기록이다. 수정 뒤 private focused13/13을
실행했다. 최종 전체 Worker 재실행은 unit10 + Workflow42 + DB69 + migration21 + Quote54,
합계196/196 PASS·exit0였다. 후속 계약 경계의 진단 테스트/수정과 원격 CI는 이 결과와 별도로 기록한다. sandbox EPERM으로 Temporal의 loopback
listen이 차단된 실행은 제품 실패나 PASS로 처리하지 않고 서버 실행 권한으로 다시 실행했다.
App/전체 Web E2E는 #962에서 다시 실행한 것으로 표시하지 않는다. Composer/UI는 부모998과 동일하지만
부모의 PASS를 이 계층 전체 PASS로 복사하지 않는다. 새 원격 HEAD의 Actions 결과를 따로 확인한다.

전체 로그: `/private/tmp/prod924-962-core-full.log`, `prod924-962-api-final.log`,
`prod924-962-fedify-frozen-final.log`, `prod924-962-root-lint-frozen.log`,
`prod924-962-recursive-frozen.log`, `prod924-962-root-test-final.log`,
`prod924-962-worker-frozen-final.log`.

### 확정된 URL-only FEP 승인 조회 경계의 재검증

기존 production owner의 MATERIALIZE→VERIFY 경로를 계측한 진단3건은 Source URI의 비인증 조회1회를
발견해 RED였다. Audience가 없는 URL-only 참조에서는 조회 전 Public/FOLLOWERS 구분이 불가능하다.
사용자는 issuer 증거→저장된 작성자→Local Follower 서명 조회로 통일하고, 적격 Follower가 없는
Public/Unlisted 원문도 PENDING에 유지하는 정책을 확정했다. 이를 canonical/ADR/runtime에 정렬했다.
수정 뒤 실제 owner focused10/10이 PASS이며, 적격 private Source는 unsigned0/signed1,
미저장 작성자·Follower 없음·key 없음·Public no-follower는 Source fetch0/PENDING을 확인했다.
embedded Public 및 승인 없는 URL-only/legacy 확보와 signed Public fallback도 통과했다.

정책 수정 뒤 전체 Fedify374/374·Consumer1/1, recursive lint/type/schema와 root lint는 exit0이었다.
Root lint 최초 실패는 review 도구가 만든 미추적 `.serena/project.yml`의 formatting만이었고
로컬 파일을 포맷한 후 재실행했다. 이 파일은 PR에 포함하지 않는다.

전체 Worker 최초 최종 실행의 quote aggregate는53PASS/2FAIL이었다. 두 FAIL은 parent와 같은 child이며,
기존 `drain barrier prevents … normal renew` 테스트의 새 Run polling에서 NOT_OPEN Query가
CONTINUED_AS_NEW(status6) 이전 Run을 조회해 QueryRejectedError를 전파했다. 해당 fixture/runtime은
부모998과 동일하며, write fence/DB 변경 실패가 아니다. 이전196전체 PASS와 이번 nativeclosedWorkflow
focused14/14 PASS를 이 실패의 PASS로 복사하지 않는다. 같은 코드 전체 Worker를 별도 부하 없이 다시
실행한 결과는 다음 최종 기록에 명시한다. 이 timing 가능성은 기록으로 유지한다.

로그: `/private/tmp/prod924-962-unsigned-red.log`, `prod924-962-policy-focused.log`,
`prod924-962-fedify-policy-final.log`, `prod924-962-worker-policy-final.log`,
`prod924-962-worker-policy-final2.log`, `prod924-962-root-policy-final2.log`,
`prod924-962-recursive-policy-final.log`. task review와 최종 통합 review의 scoped 재검토는 모두
알려진 정책 blocker 해소·추가 blocking defect 없음으로 판정했다. 원격 CI는 아직 별도 미실행이다.

최종 동일 코드 Worker 단독 재실행은 unit10 + Workflow42 + DB69 + migration21 + Quote55,
합계197/197 PASS·exit0였다. normal renew도 실제 실행에서 PASS였다. fixture와 write fence는 수정하지
않았으며 최초 QueryRejected(status6) polling timing 기록은 알려진 테스트 위험으로 유지한다.
