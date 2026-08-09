## Why

Kosmo에는 후속 Temporal capability가 재사용할 독립 Worker 애플리케이션, container entrypoint와 Kubernetes component가 없다. 실제 Workflow와 Activity가 정해지기 전에 임의의 task queue를 poll하거나 dev/prod에 상시 배포하지 않으면서도, 첫 business capability가 runtime 기반부터 다시 만들지 않도록 foundation을 준비한다.

## What Changes

- API/Web와 독립적으로 build·test할 수 있는 `apps/worker` workspace 애플리케이션을 추가한다.
- Kosmo runtime image에 Worker package와 명시적 Worker entrypoint를 포함한다.
- 실제 task queue와 handler가 생기기 전까지 기본 비활성인 Worker Deployment·ServiceAccount Helm component를 추가한다.
- 활성화 시 사용할 환경별 Temporal endpoint·namespace, Worker DB Secret/env 입력, dev 1/prod 2 replica와 HTTP health probe 계약을 추가한다.
- Worker lifecycle의 readiness 전이와 SIGTERM graceful shutdown을 package-level test로 검증한다.
- smoke Workflow/Activity, 검증 전용 task queue와 실제 dev/prod Worker 활성화는 추가하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. transport-neutral core service와 worker 진입점의 의존 방향은 `docs/architecture/core-services.md`를 따른다.
- Linear Contract: [PROD-730](https://linear.app/byulmaru/issue/PROD-730/kosmo-temporal-worker-runtime-foundation을-준비한다)
- Linear Implementations: PROD-730

## Capabilities

### New Capabilities

- `temporal-worker-runtime-foundation`: 비활성 상태로 배포 가능한 Kosmo Temporal Worker 애플리케이션, image entrypoint, health lifecycle와 Helm component 계약.

### Modified Capabilities

없음.

## Impact

- `apps/worker` workspace package와 Temporal TypeScript SDK dependency가 추가된다.
- root workspace command, test CI, `Dockerfile`과 `docker-entrypoint.sh`가 Worker package를 인식한다.
- `apps/helm`에 기본 비활성 Worker values, Deployment와 ServiceAccount가 추가된다.
- 기존 API/Web runtime, Fedify PostgreSQL MessageQueue, Temporal namespace provisioning과 business Workflow에는 행동 변경이 없다.
