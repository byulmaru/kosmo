# Fedify × Temporal 큐 PoC

이 디렉터리는 기존 Temporal 인프라를 사용하는 애플리케이션이 Fedify
`MessageQueue`를 같은 Worker에 연결할 수 있는지 확인하는 로컬 PoC다.
운영 Worker와 PostgreSQL MessageQueue를 바꾸지 않는다.

## 실행

먼저 로컬 Temporal 서버를 실행한 뒤 다음처럼 명시적으로 시작한다.

```sh
TEMPORAL_ADDRESS=127.0.0.1:7233 \
TEMPORAL_NAMESPACE=default \
pnpm --filter @kosmo/worker poc:fedify-temporal
```

프로세스가 시작되면 실제 `src/activities.ts` registry와 기존
`src/workflows/index.ts`를 같은 Worker에 등록한다. PoC는 process-wide DB와
기존 Fedify PostgreSQL queue가 열려 있는 환경을 거부하므로, 개발 셸의
`DATABASE_URL`, `PG*`, `FEDIFY_QUEUE_DATABASE_*` 값을 먼저 해제해야 한다.
Temporal endpoint도 loopback 주소만 허용한다.

실제 registry는 Worker 등록 호환성을 확인하기 위해 포함하지만, 아래 합성 demo
handler는 DB domain Activity를 호출하지 않는다. 따라서 domain Activity의 실제
PostgreSQL 효과와 운영 credential 권한은 이 PoC의 검증 범위가 아니다.

Fedify handler와 producer가 실제로 동작하는 장면을 보려면 다음처럼 한 번의
합성 inbox `Follow`를 enqueue한다. handler가 실행되면
`fedify-temporal-demo-follow` JSON 로그가 출력된다.

```sh
FEDIFY_TEMPORAL_DEMO=1 \
TEMPORAL_ADDRESS=127.0.0.1:7233 \
TEMPORAL_NAMESPACE=default \
pnpm --filter @kosmo/worker poc:fedify-temporal
```

기본 Task Queue는 `kosmo-fedify-poc`으로 격리된다. 기존 `kosmo` Worker와
합류하는 실험이 필요할 때만 `TEMPORAL_TASK_QUEUE=kosmo`를 명시한다. 이 경우
기존 Worker도 아래 PoC Workflow를 등록한 동일한 Workflow bundle을 사용해야
한다.

앱 진입점은 Temporal `Client`와 `NativeConnection`을 만들고, `TemporalFedifyQueue`를
실제 `createFederation({ queue, manuallyStartQueue: true })`에 전달한다. 이어
Fedify의 public `federation.startQueue(undefined, { signal })`를 호출해
`processQueuedTask` handler를 queue에 binding한 뒤, 같은 앱이
`Worker.create({ workflowsPath, activities })`를 실행한다. `listen()`은 이
handler를 binding하고 AbortSignal까지 대기할 뿐 Worker를 만들거나 실행하지
않는다.

호출하는 앱이 소유하는 Worker 조립은 다음처럼 기존 domain registry와 PoC
Activity를 한 번에 등록하는 형태다.

```ts
const domainActivities = await import('../../src/activities');
const worker = await Worker.create({
  activities: {
    ...domainActivities,
    ...createFedifyTemporalActivities(queue),
  },
  connection,
  namespace,
  taskQueue,
  workflowsPath,
});
```

검증 명령은 다음과 같다.

```sh
pnpm --filter @kosmo/worker build:poc:fedify-temporal
pnpm --filter @kosmo/worker test:poc:fedify-temporal
```

테스트는 Temporal CLI ephemeral server와 실제 Worker를 사용해 다음 경계를
실행한다. unkeyed delay, ordering key FIFO와 delayed item 건너뛰기, key별 병렬성,
Activity retry 소진 뒤 후속 메시지 진행, Worker 재시작 뒤 delayed Workflow 재개,
Continue-As-New 뒤 pending 보존, 그리고 Fedify `startQueue()`에서 typed inbox
listener까지의 전달을 확인한다. 이 명령은 `@kosmo/worker`의 기본 `test`에도
포함되며, 실행 중인 로컬 Temporal server를 요구하지 않는다.

## 처리 계약

- ordering key가 없으면 메시지마다 `fedifyMessageWorkflow`를 시작한다.
- ordering key가 있으면 `fedify-temporal:<task-queue-scope>:key:<sha256>` Workflow에
  `enqueue` Signal-With-Start를 보낸다.
- Signal handler는 `{ id, message, availableAt }` envelope를 동기적으로 pending
  목록에 넣고, Workflow main loop가 준비된 항목 하나씩
  `processFedifyMessage` Activity를 실행한다.
- 같은 key의 Activity retry가 끝날 때까지 다음 항목은 시작하지 않는다. 지연된
  항목이 있어도 이미 준비된 뒤 항목은 처리할 수 있다.
- Activity retry는 세 번으로 제한한다. 재시도 소진은 keyed Workflow 결과의
  `failures`에 기록하고 다음 메시지를 계속 처리한다. 별도 DLQ나 네이티브
  deduplication은 제공하지 않는다. 실패 envelope은 Temporal history에서 확인해
  운영자가 원본 메시지를 다시 `enqueue`하는 수동 재생 절차를 사용한다.
- 장시간 실행되는 keyed Workflow는 pending과 `processedCount`·`failedCount`를
  다음 Continue-As-New 입력으로 전달한다. `failures` 상세 목록은 현재 Run 결과에
  남기며, 이전 Run의 Activity history가 보존 기간 안에 원본 실패 증거를 제공한다.
  envelope와 pending 목록은 Temporal payload 크기 제한을 받으므로 이 PoC가
  무제한 backlog 저장소를 제공한다고 해석하면 안 된다.

Fedify 2.3에서 `MessageQueue`가 제공하는 `delay`, `orderingKey`, `listen`과
`nativeRetrial`만 사용한다. 최신 upstream 계약에만 있는 native deduplication,
원자적 batch 옵션을 이 구현이 지원한다고 가정하지 않는다. Fedify가
`Retry-After` 또는 circuit breaker 보류로 새 메시지를 enqueue하면 그것은 별도
Temporal Workflow 입력이며, 기존 Fedify 재-enqueue 의미를 대체하지 않는다.

`availableAt`은 enqueue 호출을 수행한 process의 wall clock에서 계산한다. 서로
다른 host 사이의 시계 오차나 Temporal server clock과의 보정은 이 PoC가 증명하지
않는다. `nativeRetrial`은 Temporal Activity retry로 하나의 handler 실행을
재시도한다는 뜻이며, Fedify가 `Retry-After`·circuit breaker에 따라 다시 enqueue한
메시지는 별도 Temporal Workflow 입력으로 남는다.

이 방식은 Fedify PostgreSQL queue를 대체하는 운영 설계가 아니다. Temporal
payload/history가 envelope와 pending backlog를 담기 때문에 history 증가, payload
크기, retention과 수동 replay 운영을 함께 검토해야 한다. 현재 운영 queue의
PostgreSQL connection·schema·consumer lifecycle은 그대로 유지하고, 이 PoC의
Temporal queue와 동일한 메시지를 동시에 소유하지 않는다.

운영 차이는 다음처럼 읽는다.

| 경계         | 기존 Fedify PostgreSQL queue                     | 이 PoC의 Temporal queue                       |
| ------------ | ------------------------------------------------ | --------------------------------------------- |
| 보관 단위    | 전용 PostgreSQL queue row와 queue consumer       | Workflow payload/history의 envelope와 pending |
| 재시도 owner | Fedify의 retry·`Retry-After`·circuit breaker     | Temporal Activity retry와 keyed Workflow      |
| 확인할 비용  | queue DB connection, schema와 consumer lifecycle | history 증가, payload/retention과 수동 replay |

이 작업은 설치된 API의 동작을 확인하는 local spike다. canonical production
runtime contract, Helm 구성과 OpenSpec은 변경하지 않는다.

설치된 Fedify 2.3 API에는 위 네 가지 queue 계약만 있으므로 구현도 그 범위에
머문다. upstream-main에서 queue에 native deduplication이나 batch 옵션이 추가되더라도
그 동작은 별도 API·retry·crash 검증 뒤에만 확장할 수 있다.

## PoC 결과를 읽는 법

이 PoC가 보여주는 것은 애플리케이션이 Worker 등록과 lifecycle을 소유하면서
Fedify handler를 Activity 경계 뒤에 둘 수 있다는 점이다. 실제 운영 전환에는
동일 Task Queue의 모든 Worker가 새 Workflow와 Activity를 등록하는지, Temporal
history/payload 크기와 실패 재생 절차가 충분한지, Fedify의 재-enqueue와
Temporal Activity retry를 별도로 관측할 수 있는지를 추가로 확인해야 한다.
