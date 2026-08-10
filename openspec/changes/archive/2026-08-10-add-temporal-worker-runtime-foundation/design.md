## Context

현재 monorepo의 production entrypoint는 API, Web과 migration뿐이며 Docker runtime install/copy 목록도 이 세 경로를 전제로 한다. Helm chart는 API/Web Rollout과 namespace provisioning Job을 소유하지만 Temporal Worker workload는 없다. `docs/architecture/core-services.md`는 worker가 transport-neutral core service를 호출할 수 있는 별도 진입점임을 이미 허용한다.

PROD-730은 첫 business Workflow가 들어오기 전의 runtime 기반만 준비한다. 따라서 이번 변경에서 실제 Temporal task queue를 poll하는 process나 live workload를 만들면 범위를 넘어선다. 반대로 후속 capability가 package, image, health lifecycle와 chart를 다시 설계하게 두면 공통 runtime 책임이 중복된다.

## Goals / Non-Goals

**Goals:**

- 독립 Worker package와 production image entrypoint를 준비한다.
- business capability가 정적으로 registration을 제공했을 때 Temporal Worker lifecycle과 HTTP health를 실행할 composition boundary를 둔다.
- registration이 없는 현재 상태에서는 외부 connection 전에 즉시 실패한다.
- 기본 비활성 Worker Deployment를 dev/prod 모두 결정적으로 render한다.
- 기존 PostgreSQL 역할별 credential을 Worker environment로 투영할 seam을 둔다.

**Non-Goals:**

- smoke 또는 business Workflow/Activity와 task queue를 등록하지 않는다.
- Worker를 dev/prod에서 활성화하거나 live readiness를 검증하지 않는다.
- Fedify PostgreSQL MessageQueue를 Temporal task queue로 대체하지 않는다.
- Temporal namespace, 인증·인가 또는 PostgreSQL credential 자체를 생성하지 않는다.
- core service, notification 또는 ActivityPub delivery 행동을 변경하지 않는다.

## Implementation Guidance

### Current Constraints

- `Dockerfile`의 workspace manifest, production filter와 source copy 목록은 명시적이므로 새 package를 세 단계에 모두 포함해야 한다.
- `docker-entrypoint.sh`는 지원 command를 명시적으로 분기한다.
- root `pnpm dev`는 `dev` script가 있는 workspace package를 재귀 실행하므로 Worker package에 일반 `dev` script를 두면 opt-in 계약을 깨뜨린다.
- Temporal Worker SDK는 production install에서 native runtime artifact를 포함할 수 있으므로 현재 Node/ARM64 image build 경계에서 설치와 startup 검증이 필요하다.
- 현재 Helm의 PostgreSQL credential helper는 `api`와 `fedify` 역할을 완전한 trio로 검증한다. Worker는 이 값을 소비만 하고 새 credential role을 만들지 않는다.
- Kubernetes HTTP probe는 Service 없이 Pod container port를 직접 조회할 수 있으므로 Worker용 ClusterIP Service는 필요하지 않다.

### Recommended Approach

`apps/worker`는 process entrypoint와 하나의 Worker lifecycle module만 둔다. entrypoint는 build-time에 정적으로 구성된 business Worker registration을 확인하고, 하나도 없으면 Temporal connection이나 health server를 만들기 전에 설명 가능한 구성 오류로 종료한다. 후속 capability는 이 정적 composition 지점에 자신의 task queue와 Workflow/Activity를 등록한다. runtime plugin loader나 동적 evaluator는 만들지 않는다.

등록이 있을 때 Node 표준 HTTP server가 고정된 `/health`와 `/ready` endpoint를 제공한다. readiness는 별도 상태나 polling timer를 만들지 않고 Temporal SDK의 `Worker.getState()`를 직접 반영한다. Worker가 실행된 뒤의 SIGTERM 처리와 drain은 SDK Runtime에 맡긴다. connect/create 중에는 SDK Worker shutdown callback이 아직 없으므로 SIGTERM을 OS 기본 종료로 다시 전달하고, `Worker.run()`이 끝나면 connection과 HTTP server를 정리한다. package test는 fail-fast·환경·SDK 상태 매핑과, 실제 SDK connection이 대기 중인 child process가 SIGTERM으로 종료되는 startup 경계를 검증한다. 실제 RUNNING 이후 readiness 전이와 task drain은 Worker를 활성화하는 첫 business capability가 Temporal 통합 환경에서 검증한다.

공통 image는 Worker package manifest를 workspace install에 포함하고 production dependency/source를 runtime stage에 복사한다. 기존 entrypoint에 `worker` command를 추가하며 root에는 명시적인 opt-in command만 제공한다.

Helm에는 `worker.enabled: false`, 환경별 replica 기본값, health port, resources와 Temporal frontend/namespace 입력을 둔다. enabled일 때만 전용 ServiceAccount와 Deployment를 render한다. Probe path는 runtime endpoint와 같은 `/health`와 `/ready`로 고정한다. Pod는 Worker command를 사용하고 service account token 자동 mount를 끄며 기존 `env` Secret을 공유한다. API 역할의 `DATABASE_URL`/`DATABASE_PASSWORD`와 완전하게 구성된 경우의 Fedify 역할 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 기존 helper 계약대로 주입하지만, foundation process는 이를 읽어 connection을 열지 않는다.

### Allowed Alternatives

- 동일한 readiness와 graceful shutdown 상태 전이를 보존한다면 health HTTP routing은 repository의 기존 HTTP server dependency를 재사용할 수 있다. 새 framework dependency는 추가하지 않는다.
- 후속 capability가 하나의 process에서 여러 Temporal Worker registration을 필요로 하면 같은 lifecycle host 아래 정적 목록으로 확장할 수 있다. 이번 변경은 실제 registration을 추가하지 않는다.

### Known Traps

- smoke Workflow나 이름만 예약한 task queue를 추가해 entrypoint를 억지로 상시 실행시키는 것.
- registration 검증 전에 Temporal connection, DB connection 또는 health-only 대기 process를 시작하는 것.
- Worker package에 `dev` script를 추가해 root 기본 dev command가 Worker를 자동 실행하게 하는 것.
- Worker component를 기본 활성화하거나 이번 변경에서 Argo/Vault restart target과 live rollout을 추가하는 것.
- Worker를 API/Web process에 결합해 scaling과 shutdown lifecycle을 공유하는 것.
- DB URL만 또는 password Secret 일부만 주입해 역할별 credential validation을 우회하는 것.

## Risks / Trade-offs

- [foundation 시점의 Worker command는 단독으로 성공 실행되지 않음] → 구성 누락을 명확히 실패시키고 chart를 기본 비활성화한다. 첫 business capability가 registration과 live activation을 함께 소유한다.
- [Temporal SDK native artifact가 current Node/ARM64 image와 호환되지 않을 수 있음] → frozen production install, package test와 실제 runtime image build/start 검증을 완료 조건에 포함한다.
- [후속 capability가 lifecycle composition seam과 맞지 않을 수 있음] → dynamic plugin API 대신 최소한의 정적 registration 경계만 두고 첫 consumer가 필요로 하는 형태 이상을 일반화하지 않는다.
- [DB credential env가 현재 미사용임] → chart rendering만 검증하고 process가 connection을 열지 않게 한다. 실제 DB client와 권한 전환은 PROD-715 또는 해당 capability에서 검증한다.
- [default-disabled manifest는 실행 중 drain과 live health를 증명하지 못함] → 이번 변경은 startup SIGTERM child-process 경계와 Helm render까지만 증명하며 실제 RUNNING 이후 readiness 전이·task drain·cluster readiness는 첫 activation issue의 gate로 남긴다.

## Migration Plan

1. Worker package, dependency와 lifecycle test를 추가한다.
2. 공통 runtime image의 install/copy/entrypoint를 확장하고 image build와 빈 registration 실패를 검증한다.
3. 기본 비활성 Helm component와 DB/Temporal 입력을 추가하고 dev/prod disabled/enabled render를 검증한다.
4. CI에 Worker package 검증을 연결하되 dev/prod workload는 활성화하지 않는다.
5. 첫 business capability가 실제 registration과 task queue를 추가하고 Worker component 활성화, Argo/Vault restart, live readiness를 별도 검증한다.

문제가 생기면 Worker package와 image/chart wiring을 함께 되돌린다. component가 기본 비활성이므로 이번 변경 자체는 실행 중인 workload나 durable Temporal history를 남기지 않는다.

## Open Questions

없음.
