## Context

kosmo는 현재 API 요청 처리와 PostgreSQL/Drizzle 도메인 모델을 중심으로 구성되어 있다. 이미지 업로드 이후의 변환, 리모트 미디어 fetch/cache, federation 입출력처럼 재시도 가능한 비동기 작업은 요청-응답 경로와 분리되어야 하지만, 아직 공통 작업 큐와 worker 실행 단위가 없다.

이번 변경은 NATS JetStream을 durable 작업 큐로 도입한다. PostgreSQL은 도메인 상태 저장소로 유지하고, 작업 전달과 redelivery 책임은 JetStream에 둔다. 구현은 API와 worker가 공유할 수 있는 queue module, NATS 설정, typed job registry, worker app, 배포 설정을 추가하는 방향으로 진행한다.

## Goals / Non-Goals

**Goals:**

- API와 서버 코드가 공통 producer API로 typed job을 enqueue할 수 있게 한다.
- 별도 `apps/worker` 프로세스가 JetStream durable consumer로 작업을 처리하게 한다.
- at-least-once delivery를 전제로 명시적 ack, retry, JetStream max delivery 중심의 terminal failure 관측 흐름을 제공한다.
- job envelope와 payload validation을 표준화해 후속 이미지 처리/federation 작업이 같은 큐를 재사용하게 한다.
- `NATS_URL` 연결 정보, stream/consumer 이름, retry 한도, worker concurrency를 환경변수와 Helm values로 설정한다.
- 대표 smoke job을 추가해 로컬/배포 환경에서 enqueue-consume 경로를 검증할 수 있게 한다.

**Non-Goals:**

- 이미지 변환, 썸네일 생성, 리모트 이미지 프록시, federation delivery 자체를 구현하지 않는다.
- exactly-once delivery를 보장하지 않는다. handler는 job id 기준 idempotency를 고려해야 한다.
- PostgreSQL 기반 outbox/inbox 테이블을 이번 변경에서 설계하지 않는다.
- 큐 payload에 대용량 바이너리나 장기 보관이 필요한 도메인 데이터를 저장하지 않는다.
- NATS 서버 자체를 애플리케이션 코드로 provision하지 않는다.
- 애플리케이션이 별도 dead-letter subject를 publish하는 DLQ 구현은 이번 변경에서 제외한다.

## Decisions

1. NATS JetStream을 work queue retention stream으로 사용한다.

   `kosmo.jobs.*` 형태의 subject를 담는 stream을 만들고, worker는 durable pull consumer로 메시지를 가져온다. JetStream은 메시지 저장, ack 대기, redelivery, delivery count metadata를 제공하므로 API 프로세스 재시작과 worker 재배포에도 작업이 유실되지 않는다.

   대안으로 PostgreSQL job table을 둘 수 있지만, locking, polling, retry scheduling, worker scaling 규칙을 직접 구현해야 한다. 현재 목표는 도메인 DB와 작업 전달 책임을 분리하는 것이므로 JetStream을 큐 책임자로 둔다.

2. 하나의 공통 queue module이 producer와 consumer를 모두 제공한다.

   `packages/core`에 NATS 연결 생성, JetStream stream 보장, job envelope encoding/decoding, payload validation, publish helper, consumer helper를 둔다. API와 worker가 같은 타입과 validator를 공유하면 job type 추가 시 producer와 handler의 계약이 한 곳에서 관리된다.

   queue module은 framework 독립적인 함수로 유지한다. API route나 worker main loop는 이 module을 호출만 하며, Hono/GraphQL 객체를 core queue module에 넘기지 않는다.

3. job type registry와 zod payload schema를 사용한다.

   각 job type은 kebab-case 또는 dot-separated 문자열 identifier, subject suffix, payload schema, handler binding을 가진다. producer는 publish 전에 payload를 validate하고, worker는 consume 후 envelope와 payload를 다시 validate한다.

   envelope는 `id`, `type`, `version`, `payload`, `enqueuedAt`, 선택적 `traceId`를 포함한다. payload에는 DB id나 object key처럼 재조회 가능한 작은 참조만 넣고, 바이너리나 secret은 넣지 않는다.

4. publish deduplication은 JetStream message id로 처리한다.

   producer는 job id를 생성하고 `Nats-Msg-Id` header로 publish한다. JetStream의 duplicate window 안에서는 같은 job id 재발행이 중복 저장되지 않는다. 이 동작은 네트워크 재시도 중 중복 enqueue를 줄이기 위한 장치이며, exactly-once 처리 보장은 아니다.

5. worker는 at-least-once 처리 모델을 명시적으로 노출한다.

   worker는 메시지를 처리한 뒤 성공 시 ack한다. 실패하면 delivery count와 설정된 최대 시도 횟수를 포함한 structured log를 남기고 JetStream redelivery를 요청한다. handler는 같은 job id가 여러 번 실행될 수 있다고 가정하고, 도메인 side effect는 별도의 idempotency 조건으로 보호한다.

6. terminal failure는 JetStream consumer 정책 중심으로 다룬다.

   초기 구현은 worker가 별도 `kosmo.jobs.dlq.<type>` subject를 publish하지 않는다. 실패한 메시지는 configured max delivery, consumer state, worker structured log를 통해 관측한다. 재처리 도구, 앱 관리 DLQ, 운영 알림은 실제 job type의 운영 요구가 생긴 뒤 별도 변경으로 설계한다.

7. worker app을 별도 workspace package로 둔다.

   `apps/worker`는 `@kosmo/worker` package로 추가하고 `dev`, `start`, `lint:tsc` script를 제공한다. 루트 `pnpm --recursive --parallel --if-present dev` 흐름에 자연스럽게 들어가며, 배포에서는 API와 별도 rollout/replica로 scale한다.

8. 인증은 `NATS_URL`만 사용한다.

   초기 구현은 별도 username/password, token, creds file 설정을 받지 않는다. 운영 환경에서 인증이 필요한 경우 credential이 포함된 NATS URL 또는 플랫폼 secret injection으로 `NATS_URL` 전체를 제공한다. 인증 방식 확장이 필요해지면 별도 변경에서 설정 surface를 늘린다.

9. worker는 NATS 설정을 필수로 요구하고, API는 producer 사용 시점에만 요구한다.

   worker는 큐 소비가 유일한 책임이므로 `NATS_URL`이 없으면 시작 실패한다. API는 이번 변경에서 실제 도메인 작업을 enqueue하지 않으므로 서버 시작 자체는 기존 `/health`와 `/graphql` 동작을 유지한다. 다만 API 코드가 queue producer를 초기화하거나 enqueue를 수행하는 시점에는 `NATS_URL` 누락을 명확한 설정 오류로 반환한다.

10. 하나의 durable consumer가 전체 job subject를 받아 dispatch한다.

초기 구현은 `kosmo.jobs.*` 전체를 구독하는 하나의 durable consumer를 만들고 worker 내부 job registry가 type별 handler로 dispatch한다. job type별 consumer 분리는 처리량, 우선순위, 격리 요구가 생긴 뒤 도입한다.

11. 기본 큐 설정은 고정값으로 시작한다.

기본 subject prefix는 `kosmo.jobs`, stream name은 `KOSMO_JOBS`, durable consumer name은 `kosmo-worker`, ack wait은 `30s`, max deliver는 `5`, worker concurrency는 `4`로 둔다. 환경변수가 있으면 이 값을 override할 수 있게 한다.

12. smoke enqueue는 worker package script로 제공한다.

API에 내부용 endpoint를 추가하지 않는다. `apps/worker`에 `pnpm --filter @kosmo/worker smoke:enqueue` 형태의 script를 두고, 이 script가 smoke job을 publish해 configured NATS/JetStream과 worker dispatch 경로를 검증한다.

## Risks / Trade-offs

- [Risk] NATS가 내려가면 API의 enqueue가 실패한다. -> API 서버 시작은 유지하되 producer 초기화와 publish 실패를 호출자에게 명확히 반환하고, 실제 도메인 기능에서 큐 실패 시 사용자 응답 정책을 별도로 결정한다.
- [Risk] `NATS_URL` 하나에 인증 정보를 포함하면 secret 회전과 부분 설정 변경이 거칠 수 있다. -> 초기 설정 surface를 작게 유지하고, 복잡한 인증 방식은 운영 요구가 확정된 뒤 확장한다.
- [Risk] at-least-once delivery로 handler side effect가 중복될 수 있다. -> 모든 handler는 job id와 대상 resource id를 기준으로 idempotent하게 작성하도록 queue contract와 task에 포함한다.
- [Risk] payload schema 변경 시 오래된 queued message가 worker에서 반복 실패할 수 있다. -> envelope `version`을 포함하고, worker decoder가 지원하지 않는 version/type은 structured log와 JetStream delivery metadata로 관측한다.
- [Risk] 앱 관리 DLQ가 없으면 terminal failure 재처리 경험이 제한된다. -> 초기 범위는 큐+스모크에 맞춰 JetStream consumer state와 로그 확인으로 제한하고, 재처리 도구와 DLQ는 실제 job 도입 시 후속 변경으로 설계한다.
- [Risk] work queue stream/consumer 설정을 잘못 잡으면 여러 worker가 같은 메시지를 중복 처리하거나 소비하지 못할 수 있다. -> stream/consumer 생성을 queue module에서 중앙화하고, smoke job으로 배포 검증을 수행한다.

## Migration Plan

1. NATS JetStream endpoint를 `NATS_URL`로 배포 환경에 준비한다.
2. queue module과 `apps/worker`를 추가하되, 기존 API 기능은 아직 실제 도메인 작업을 enqueue하지 않게 둔다.
3. Helm values와 rollout에 worker와 NATS env wiring을 추가한다.
4. smoke job으로 API 또는 스크립트에서 publish하고 worker가 consume/ack하는 경로를 검증한다.
5. 후속 변경에서 이미지 처리, 리모트 fetch, federation 작업을 job type으로 하나씩 연결한다.

Rollback은 producer 연결을 비활성화하고 worker rollout을 0 replica로 낮추는 방식으로 수행한다. 이번 변경은 기존 DB schema나 API 응답 계약을 바꾸지 않으므로, 생성된 JetStream stream은 보존하거나 운영 절차에 따라 제거할 수 있다.

## Open Questions

- production NATS를 자체 운영할지 관리형 서비스로 사용할지 결정이 필요하다.
- 기본 retry backoff와 max delivery 값은 첫 실제 job type의 실패 특성에 맞춰 조정해야 한다.
- 앱 관리 DLQ, 재처리 UI/CLI, 운영 알림은 첫 실제 job 도입 시 별도 변경으로 설계해야 한다.
