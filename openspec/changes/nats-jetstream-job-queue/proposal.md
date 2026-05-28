## Why

이미지 처리, 리모트 미디어 캐싱, federation 입출력처럼 요청-응답 경로에서 분리해야 할 비동기 작업이 늘어날 예정이다. PostgreSQL 테이블이나 API 프로세스 내부 메모리 큐에 작업 실행 책임을 두지 않고, NATS JetStream 기반의 durable 작업 큐를 먼저 마련해 후속 워커 기능을 안정적으로 얹을 수 있게 한다.

## What Changes

- NATS JetStream을 kosmo의 공통 작업 큐 인프라로 도입한다.
- API와 다른 서버 프로세스가 작업을 enqueue할 수 있는 typed producer API를 추가한다.
- 별도 worker 프로세스가 JetStream durable consumer로 작업을 가져와 처리할 수 있게 한다.
- 작업 envelope에 job type, job id, payload, enqueue 시각, attempt 관련 metadata를 포함한다.
- at-least-once delivery를 기준으로 ack, retry, JetStream max delivery 중심의 terminal failure 정책을 정의한다.
- 동일 job id 중복 publish를 줄이기 위해 JetStream message id 기반 deduplication을 사용한다.
- NATS 연결은 초기에는 `NATS_URL` 하나로 관리하고, stream, consumer, retry 관련 런타임 설정을 환경변수로 관리한다.
- Helm 배포에 API와 worker가 같은 NATS 설정을 사용할 수 있는 값을 추가한다.
- 초기 구현은 큐 프레임워크와 대표 smoke job에 집중하고, 실제 이미지 변환/리모트 fetch/federation 작업은 후속 변경에서 연결한다.

## Capabilities

### New Capabilities

- `job-queue`: NATS JetStream 기반 작업 enqueue, consume, retry, terminal failure 관측, worker 실행 계약.

### Modified Capabilities

- 없음.

## Impact

- `packages/core`: 공통 NATS JetStream client, queue producer/consumer helper, job type registry, 환경 설정 parsing.
- `apps/api`: 요청 처리 중 필요한 비동기 작업을 enqueue할 수 있는 queue producer 연결점.
- `apps/worker`: JetStream durable consumer를 실행하는 별도 worker app 추가.
- `apps/helm`: NATS/JetStream 설정, worker rollout, 관련 secret/env wiring 추가.
- `package.json` / workspace manifests: NATS client와 worker package 실행 스크립트 추가.
- 운영 인프라: 배포 환경에 NATS 서버 또는 관리형 NATS endpoint가 필요하다.
