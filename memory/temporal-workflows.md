# Temporal Workflow Memory

## Purpose

- Kosmo의 Temporal Workflow, Activity 등록과 domain transaction 이후 Workflow start 코드를 작성하거나 리뷰할 때 이 문서를 따른다.
- 이 문서는 코드 구조와 실행 경계에 관한 개발 규칙이다. 각 domain의 실제 transition, retry 허용 범위와 delivery 성공 의미는 canonical domain 문서와 해당 capability가 소유한다.

## Ownership And Flow

- domain state transition, 권한, transaction과 멱등성 판정은 `packages/core/services`가 소유한다.
- 실제 transition이 commit된 뒤 그 결과를 소유한 core service가 `temporalClient.workflow.start(...)`를 직접 호출한다.
- Workflow는 적용할 effect를 선택하고 Activity를 조율한다. DB domain transition을 Workflow나 Activity로 옮기지 않는다.
- Activity는 Notification projection이나 Fedify queue handoff처럼 retry 가능한 하나의 외부 효과 경계를 소유한다.
- Workflow start 실패가 이미 commit된 domain 결과를 바꾸지 않는 capability에서는 start 호출부가 deadline과 오류 격리를 명시한다.

## Workflow Source Structure

- `apps/worker/src/workflows`에서는 exported Workflow 하나를 파일 하나가 소유한다. create/delete처럼 lifecycle이 다르면 파일도 나눈다.
- `workflows/index.ts`는 Worker bundle에 포함할 Workflow를 re-export하기만 한다. 실행 로직이나 adapter를 두지 않는다.
- 한 Workflow에서 서로 독립적인 sibling Activity를 모두 시도해야 하면 공용 `settleEffects`를 사용한다. 이 helper는 모든 Promise가 settle될 때까지 기다린 뒤 실패가 있으면 하나를 다시 throw한다.
- `settleEffects` 같은 deterministic Workflow 전용 공통 로직은 `workflows` 아래 공용 모듈 한 곳에 둔다. 특정 domain Workflow 파일에 복사하거나 그 파일의 private helper로 두지 않는다.
- Activity가 하나뿐이면 배열이나 `settleEffects`로 감싸지 않고 직접 `await`한다.
- origin이나 transition variant가 실행할 Activity 조합을 바꾸면 early return을 반복하지 않고 `ts-pattern`의 exhaustive match로 실행 Promise를 선택한 뒤 한 번만 `await`한다.
- Workflow code에서는 wall clock, network, database와 process-local state에 직접 접근하지 않고 Temporal이 허용하는 deterministic API와 proxied Activity만 사용한다.

## Starting A Workflow

- commit 결과와 transition을 소유한 service가 Workflow type, input과 stable Workflow ID를 호출 위치에서 읽을 수 있게 직접 적는다.
- Workflow type, ID prefix와 log message만 채우는 domain 전용 pass-through wrapper는 만들지 않는다. 이런 wrapper는 실제 transition과 Workflow identity를 떨어뜨리고 다른 service의 직접 start 패턴과 어긋난다.
- 조건별 Workflow start가 대부분 하나이고 각 start 오류를 이미 격리한다면 Promise를 `effects` 배열에 push한 뒤 `Promise.all`로 모으지 않는다. 한 transaction 결과에서 두 Workflow가 필요한 경우에도 각 조건에서 직접 `await`해 type, input과 identity를 가까이 둔다. 실제 동시 start가 계약인 경우에만 배열과 병렬 대기를 사용한다.
- start에는 repository의 공통 task queue, bounded deadline, `USE_EXISTING` conflict policy와 `REJECT_DUPLICATE` reuse policy를 명시한다. capability가 다른 정책을 요구하면 canonical/Linear/OpenSpec 결정을 먼저 갱신한다.
- post-commit start 오류는 최소 identity와 transition context로 관찰하고 committed action 결과와 분리한다. observer callback 자체의 실패도 결과를 바꾸지 않는다.
- 공용 start helper는 여러 domain이 정말 같은 호출 정책과 오류 계약을 공유하고, Workflow type·ID·input을 호출부에서 숨기지 않을 때만 도입한다. 한 domain의 두 Workflow를 줄이기 위한 wrapper는 공용 abstraction의 근거가 아니다.

## Activity Registration And Adapters

- `apps/worker/src/activities.ts`는 production Activity registry다.
- 기존 core/fedify 함수의 input, return과 오류 의미가 Activity 계약과 같으면 `export { source as activityName }`로 직접 alias한다.
- 단순히 같은 인자를 다음 함수에 전달하고 같은 Promise를 반환하는 Worker adapter 파일이나 async wrapper를 만들지 않는다.
- adapter는 input 변환, dependency composition, retry 경계에 필요한 validation 또는 Activity 고유 관찰처럼 실제 책임이 있을 때만 둔다.
- Activity 이름은 Workflow history와 운영 조회에 남는 public runtime identity이므로 rename은 호환성 영향을 검토한다.

## Inputs And Identity

- Workflow input은 JSON-serializable한 immutable 최소 snapshot이어야 한다. 삭제 뒤 필요한 값은 source transaction 결과에서 확보하고, Activity가 삭제된 source row를 다시 읽는 것으로 복원하지 않는다.
- create effect는 stable source identity를 우선 사용하고 Activity가 현재 projection을 조회하게 한다.
- input type은 한 Workflow에서만 쓰면 Workflow 파일 가까이에 둔다. Worker, core와 protocol adapter가 실제로 같은 shape를 소비할 때만 neutral contract module로 공유한다. 이름만 같은 type을 package마다 복제하지 않는다.
- Workflow ID는 logical generation을 구분하는 immutable source ID를 포함한다. create/delete와 서로 다른 source kind가 완료된 같은 ID를 공유하지 않게 한다.

## Verification

- Worker build로 Workflow bundle과 Activity type wiring을 확인한다.
- production registry를 사용하는 Workflow test로 origin/transition 분기, sibling Activity 전부 시도, retry와 restart 재개를 확인한다.
- core service test로 실제 commit에만 start되는지, duplicate/no-op/rollback에서는 start되지 않는지, type/input/ID와 start 실패 격리를 확인한다.
- PR/CI 검증과 exact revision dev의 Temporal history, Activity retry, Worker restart 증거를 구분한다.
