# Temporal Workflow Memory

## Purpose

- Kosmo의 Temporal Workflow, Activity 등록과 domain transaction 이후 Workflow start 코드를 작성하거나 리뷰할 때 이 문서를 따른다.
- 이 문서는 코드 구조와 실행 경계에 관한 개발 규칙이다. 각 domain의 실제 transition, retry 허용 범위와 delivery 성공 의미는 canonical domain 문서와 해당 capability가 소유한다.

## Ownership And Flow

- domain state transition, 권한, transaction과 멱등성 판정은 `packages/core/services`의 transport-neutral policy가
  소유한다. capability 계약에 따라 caller가 직접 호출하거나 Temporal transaction Activity가 호출할 수 있다.
- 기본 effects-only capability는 실제 transition commit 뒤 core service가 Workflow를 시작한다. Follow처럼
  durable admission부터 transaction을 연결해야 하는 capability는 caller 검증 뒤 directed Profile pair Workflow를
  Update-with-Start하고 transaction Activity가 core policy를 실행한다.
- Workflow는 결정론적 orchestration만 수행한다. DB domain transition은 Activity에서 실행하고, pair Workflow의
  source identity와 effect queue는 JSON-serializable한 Workflow state로 보존한다.
- Activity는 Notification projection이나 Fedify queue handoff처럼 retry 가능한 하나의 외부 효과 경계를 소유한다.
- Workflow start 실패가 이미 commit된 domain 결과를 바꾸지 않는 capability에서는 start 호출부가 deadline과 오류 격리를 명시한다.

## Workflow Source Structure

- `apps/worker/src/workflows`에서는 exported Workflow 하나를 파일 하나가 소유한다. create/delete처럼 lifecycle이 다르면 파일도 나눈다.
- `workflows/index.ts`는 Worker bundle에 포함할 Workflow를 re-export하기만 한다. 실행 로직이나 adapter를 두지 않는다.
- 한 Workflow에서 서로 독립적인 sibling Activity를 모두 시도해야 하면 공용 `settleEffects`를 사용한다. 이 helper는 모든 Promise가 settle될 때까지 기다린 뒤 실패가 있으면 하나를 다시 throw한다. Follow pair Workflow의
  transition effects는 domain contract가 정한 FIFO queue에 넣고, queue 순서를 보존해 drain한다.
- `settleEffects` 같은 deterministic Workflow 전용 공통 로직은 `workflows` 아래 공용 모듈 한 곳에 둔다. 특정 domain Workflow 파일에 복사하거나 그 파일의 private helper로 두지 않는다.
- Workflow effect는 개수와 관계없이 `settleEffects`로 정산해 종료와 실패 보고 경계를 일관되게 유지한다.
- origin이나 transition variant와 무관하게 실행하는 Activity는 match 바깥에서 선언한다. `ts-pattern`의 exhaustive match는 variant별 추가 Activity만 선택하고, 공통 Activity를 각 branch에 반복해서 나열하지 않는다.
- notification과 effect 목록처럼 한 번만 소비하는 중간 변수는 만들지 않는다. 공통 Activity와 variant별 추가 Activity를 `settleEffects([...])` 호출에 함께 인라인해 실제 실행 조합을 한 위치에서 읽을 수 있게 한다.
- Workflow code에서는 wall clock, network, database와 process-local state에 직접 접근하지 않고 Temporal이 허용하는 deterministic API와 proxied Activity만 사용한다.

## Starting A Workflow

- commit 결과와 transition을 소유한 service가 Workflow type, input과 stable Workflow ID를 호출 위치에서 읽을 수 있게 직접 적는다.
- Workflow type, ID prefix와 log message만 채우는 domain 전용 pass-through wrapper는 만들지 않는다. 이런 wrapper는 실제 transition과 Workflow identity를 떨어뜨리고 다른 service의 직접 start 패턴과 어긋난다.
- 조건별 Workflow start가 대부분 하나이고 각 start 오류를 이미 격리한다면 Promise를 `effects` 배열에 push한 뒤 `Promise.all`로 모으지 않는다. 한 transaction 결과에서 두 Workflow가 필요한 경우에도 각 조건에서 직접 `await`해 type, input과 identity를 가까이 둔다. 실제 동시 start가 계약인 경우에만 배열과 병렬 대기를 사용한다.
- start에는 repository의 공통 task queue와 bounded deadline을 명시한다. 일반적인 새 실행은 `USE_EXISTING` conflict
  policy와 `REJECT_DUPLICATE` reuse policy를 사용하지만, directed Profile pair Workflow는 실행 중인 lifecycle에는
  `USE_EXISTING`을 사용하고 완료된 lifecycle의 새 실행에는 `ALLOW_DUPLICATE` reuse policy를 사용한다.
- post-commit start 오류는 최소 identity와 transition context로 관찰하고 committed action 결과와 분리한다. observer callback 자체의 실패도 결과를 바꾸지 않는다.
- 공용 start helper는 여러 domain이 정말 같은 호출 정책과 오류 계약을 공유하고, Workflow type·ID·input을 호출부에서 숨기지 않을 때만 도입한다. 한 domain의 두 Workflow를 줄이기 위한 wrapper는 공용 abstraction의 근거가 아니다.

## Follow Pair Update-With-Start

- Follow의 orchestration 단위는 방향성을 가진 Profile pair다. Workflow ID는
  `profile-follow-pair:{followerProfileId}:{followeeProfileId}`처럼 follower와 followee를 포함한 결정적 ID를
  사용한다. 같은 pair의 실행 중인 lifecycle에는 `USE_EXISTING`을 적용하고, terminal이 된 lifecycle의 새 Follow
  시도에는 `ALLOW_DUPLICATE`로 새 Run을 시작한다.
- `FOLLOW`는 caller 검증 뒤 항상 이 pair Workflow에 Update-with-Start한다. transaction Activity가 Open policy면
  Follow Relationship을 commit하고, Approval Required면 Follow Request를 commit한다. Open 결과는 Update handler가
  commit 결과를 즉시 반환한 뒤 FIFO effects를 drain하고 Workflow를 종료한다. Approval Required 결과는 Request가
  승인·수락·거절·취소될 때까지 Pending으로 남는다.
- `APPROVE`, remote `ACCEPT`, `REJECT`, `CANCEL`은 별도 Workflow type이나 request 전용 시작 경계를 만들지 않고
  같은 pair Workflow의 Update다. Pending 상태에서 terminal command가 commit되면 handler는 commit 결과를 먼저
  반환하고, 선언된 순서의 effects를 FIFO로 drain한 뒤 Workflow를 종료한다. terminal effect failure는 commit을
  rollback하지 않으며, drain이 끝난 뒤 Workflow 결과에 기록해 성공/실패를 관찰할 수 있게 한다.
- Pending 동안 Request create effect가 terminal failure가 되어도 그 실패를 Workflow state에 기록하고 Pending
  command 대기를 계속한다. 이후 terminal command는 이전 effect failure에 막히지 않고 자신의 transaction과 queued
  effects를 처리하며, 마지막 drain 뒤 누적된 terminal failure를 결과에 반영한다.
- 한 pair Workflow는 동시에 서로 다른 lifecycle command를 처리하지 않는다. Update handler는 command를 시작할 때
  in-flight guard를 세우고, 같은 Update ID 재전송은 Temporal deduplication에 맡기며 다른 command는 conflict로
  거부한다. DB unique constraint와 exact-row 조건은 Workflow 밖에서 발생하는 race의 최종 방어선이다.

- Terminal Update가 DB commit 결과를 반환한 뒤에도 기존 run은 effects를 drain하는 동안 잠시 실행 중일 수 있다.
  이 창에서 같은 pair의 새 Follow attempt가 들어오면 active terminal run이 이를 재시도 가능한 충돌로 거부할 수
  있다. 새 generation을 미리 queue하거나 별도 lease/operation identity를 두지 않으며, caller가 기존 run 종료 뒤
  재시도하는 위험을 의도적으로 수용한다.
- Follow pair command에는 server-generated random `operationId`나 operation receipt를 추가하지 않는다. Activity
  retry는 exact expected row와 Workflow history에 미리 배정한 candidate domain row ID로 commit 결과를
  재구성한다. candidate ID는 실제 Follow/Request row에만 쓰며 command identity가 아니다.
  Temporal Update ID는 RPC deduplication용 메타데이터일 뿐 domain identity나 durable receipt가 아니다.
- 새 pair run의 첫 `FOLLOW`도 mutation 전에 기존 pending request ID만 read-only Activity로 history에 남긴다.
  그래야 OPEN 정책 승격 transaction이 commit된 직후 Activity completion이 유실되어도 request cleanup effect를
  재구성할 수 있다. 장수명 PENDING run에는 execution timeout을 걸지 않되, UWS caller RPC에는 bounded deadline을 둔다.
- pair transaction/bootstrap Activity가 retry를 모두 소진하면 Update 실패를 기록하고 기존 effects를 drain한 뒤 run을
  typed failure로 닫는다. PENDING으로 무기한 대기시키지 않으며 known domain failure DTO는 lifecycle을 계속 유지한다.
- Update 응답에는 full DB row나 `Temporal.Instant`를 넣지 않고 domain row ID와 pair identity만 보존한다.
  exact F1 removal retry 시 현재 row가 F2여도 expected F1 ID로 F1 delete effect만 재구성하고 F2는 보존한다.
- 이 Follow 규칙이 다른 capability의 retry 계약을 제거하지는 않는다. 삭제 source identity나 effect plan을 DB 상태만으로
  복원할 수 없는 별도 Temporal capability는 최소 domain-specific receipt를 transition과 같은 transaction에 기록하고,
  해당 결과가 History에 기록된 뒤 정리할 수 있다. 이를 범용 command ledger나 lifecycle exactly-once 보장으로
  일반화하지 않는다.
- Unfollow는 이미 성립된 Follow Relationship의 별도 짧은 Workflow다. Follow pair Workflow는 Unfollow까지 살아
  있지 않고, inbound Follow의 actor/object/recipient 검증과 직접 Accept delivery 경계도 기존 Fedify handler에
  남긴다. Follow effect의 origin guard는 ActivityPub outbound echo를 계속 막는다.

## Activity Registration And Adapters

- `apps/worker/src/activities.ts`는 production Activity registry다.
- 각 Workflow는 `proxyActivities<typeof activities>`와 로컬 destructuring으로 실제 사용하는 Activity를 한 번만
  나열한다. 같은 이름을 `Pick` generic에 다시 적는 compile-time allowlist는 런타임 격리나 보안 경계가 아니므로
  만들지 않는다. 실제 capability 격리가 필요하면 Worker registry나 task queue 경계로 분리한다.
- 여러 Workflow가 같은 retry와 timeout 정책을 사용할 때는 immutable Activity options만 Workflow 공용 모듈에
  둔다. proxied Activity 객체 자체나 domain별 호출 wrapper를 공용화해 실제 Activity 이름을 숨기지 않는다.
- durable source ID를 DB projection과 Workflow input으로 복원하고 retry/no-op을 판정하는 Activity 전용 adapter는
  `apps/worker`가 소유한다. `packages/core`와 `packages/fedify`에는 각각 domain policy와 protocol delivery primitive만
  남기며, Temporal input shape를 맞추기 위한 공개 함수를 추가하지 않는다.
- 기존 core/fedify 함수의 input, return과 오류 의미가 Activity 계약과 같으면 `export { source as activityName }`로 직접 alias한다.
- 단순히 같은 인자를 다음 함수에 전달하고 같은 Promise를 반환하는 Worker adapter 파일이나 async wrapper를 만들지 않는다.
- adapter는 input 변환, dependency composition, retry 경계에 필요한 validation 또는 Activity 고유 관찰처럼 실제 책임이 있을 때만 둔다.
- Activity 이름은 Workflow history와 운영 조회에 남는 public runtime identity이므로 rename은 호환성 영향을 검토한다.

## Inputs And Identity

- Workflow input은 JSON-serializable한 immutable source identity여야 한다. 삭제 뒤 필요한 값은 exact source ID와 pair identity로 표현하고, Activity가 삭제된 source row를 다시 읽는 것으로 복원하지 않는다.
- create effect는 stable source identity를 우선 사용하고 Activity가 현재 projection을 조회하게 한다.
- input type은 한 Workflow에서만 쓰면 Workflow 파일 가까이에 둔다. Worker, core와 protocol adapter가 실제로 같은 shape를 소비할 때만 neutral contract module로 공유한다. 이름만 같은 type을 package마다 복제하지 않는다.
- Workflow ID는 logical generation을 구분하는 immutable source ID를 포함한다. create/delete와 서로 다른 source kind가 완료된 같은 ID를 공유하지 않게 한다.

## Verification

- Worker build로 Workflow bundle과 Activity type wiring을 확인한다.
- production registry를 사용하는 Workflow test로 origin/transition 분기, sibling Activity 전부 시도, retry와 restart 재개를 확인한다.
- core service test로 실제 commit에만 start되는지, duplicate/no-op/rollback에서는 start되지 않는지, type/input/ID와 start 실패 격리를 확인한다.
- PR/CI 검증과 exact revision dev의 Temporal history, Activity retry, Worker restart 증거를 구분한다.
