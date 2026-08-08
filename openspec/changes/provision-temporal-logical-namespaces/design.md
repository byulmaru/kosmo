## Context

Temporal Server는 PROD-695가 EKS의 `temporal` Kubernetes namespace에 배포했으며 SDK frontend는 `temporal-frontend.temporal.svc.cluster.local:7233` ClusterIP로만 제공한다. `kosmo-dev`와 `kosmo-prod` workload의 TCP 7233 접근은 허용되어 있지만 외부 Terraform runner는 cluster DNS와 ClusterIP를 직접 사용할 수 없다.

`apps/helm`에는 이미 database migration을 위한 Argo CD PreSync Job 패턴이 있다. 반면 `apps/terraform`에는 Temporal provider가 없고 Terraform workflow는 외부 Mac runner에서 실행된다. Namespace 두 개를 위해 third-party provider와 별도 Tailscale/EKS 접속 경로를 추가하지 않고, 환경 내부의 Temporal CLI Job을 재사용하는 편이 현재 운영 경계에 맞다.

## Goals / Non-Goals

**Goals:**

- dev/prod namespace name, owner와 retention을 환경별 Helm desired input으로 둔다.
- in-cluster PreSync Job이 namespace를 멱등 생성·갱신한다.
- provisioning 실패가 후속 workload sync를 차단한다.
- Worker runtime과 독립적으로 배포·검증한다.

**Non-Goals:**

- Application Terraform provider/resource/state를 추가하지 않는다.
- Temporal frontend를 Tailscale 또는 public endpoint로 노출하지 않는다.
- 외부 runner EKS access·port-forward 또는 전용 runner를 추가하지 않는다.
- Temporal Server, Worker package, task queue 또는 business Workflow를 변경하지 않는다.
- Namespace 삭제와 폐기 workflow를 구현하지 않는다.
- dev/prod namespace authorization을 구현하지 않는다.

## Implementation Guidance

### Current Constraints

- 현재 Temporal frontend는 PROD-695에서 인증 없는 동일 trust boundary로 운영하며 인증·인가는 PROD-704로 유예했다.
- Namespace Job은 `kosmo-dev`와 `kosmo-prod` 안에서 실행해야 기존 NetworkPolicy의 frontend 접근 계약을 따른다.
- Argo CD PreSync hook 실패는 해당 application의 나머지 sync를 차단하므로 Job은 빠르고 bounded하게 종료해야 한다.
- Namespace create와 update는 서로 다른 Temporal CLI 명령이며, create의 already-exists 결과와 실제 연결 실패를 최종 성공 여부에서 구분해야 한다.
- Job image는 target CPU architecture에서 실행되고 배포된 Temporal Server와 호환되는 Temporal CLI를 포함해야 한다.

### Recommended Approach

환경별 Helm values에 namespace name, owner email, retention을 선언하고 같은 template에서 PreSync Job을 render한다. Job image는 platform과 같은 `temporalio/admin-tools:1.31.2`의 multi-architecture digest `sha256:dbc5fcd6ee8f0f4d808bf765af9a87dea9d8a283abfdcfbd2fc148496ba66107`로 고정한다.

Job script는 선언값으로 namespace create를 먼저 시도한다. Create가 성공하면 종료하고, already-exists를 포함해 create가 성공하지 않으면 같은 owner·retention으로 update를 실행해 최종 상태를 검증한다. Connection/auth 오류라면 create와 update가 모두 실패하므로 Job도 실패한다. Update 성공 없이 create 오류를 삼키지 않는다. 모든 명령은 명시적 frontend address, `--tls=false`, namespace, email, retention과 command timeout을 전달한다.

Hook은 database migration과 구분되는 name/label을 사용하고 PreSync 단계에서 실행한다. 실패한 Job log는 조사할 수 있어야 하며 active deadline, retry/backoff와 Pod security context/resource request를 명시한다. Namespace delete 명령은 image command와 script에 포함하지 않는다.

### Allowed Alternatives

- Create/update fallback과 같은 실패 전파를 보존한다면 작은 repository-owned command로 감쌀 수 있다.
- 성공한 hook의 보존 기간과 재생성 정책은 기존 Helm 운영 관례에 맞출 수 있다. 실패한 실행의 log는 반드시 남아야 한다.

### Known Traps

- `create || true` 또는 `update || true`로 실제 연결·권한·CLI 실패를 성공 처리하는 것.
- latest/floating CLI image를 사용해 server/CLI 호환성을 배포마다 바꾸는 것.
- Terraform provider, Tailscale frontend 또는 외부 port-forward 경로를 다시 추가하는 것.
- Namespace bootstrap을 Worker process startup에 넣어 관리자 책임과 Worker lifecycle을 결합하는 것.
- Helm release 삭제에 맞춰 Temporal namespace를 삭제하는 것.

## Risks / Trade-offs

- [Temporal 장애가 전체 application sync를 차단함] → Job timeout/backoff를 제한하고 실패 log를 보존한다. 이는 namespace 준비 전 workload를 진행하지 않는 선택의 의도된 결과다.
- [CLI 동작이 image version에 따라 달라질 수 있음] → multi-architecture image digest를 고정하고 create/existing/drift/connection-failure cases를 실제 CLI로 검증한다.
- [인증 없는 frontend에서 Job이 namespace 관리자 명령을 실행함] → 현재 PROD-695의 동일 trust boundary만 사용하고 외부 endpoint를 추가하지 않는다. PROD-704 도입 시 Job client 설정을 함께 전환한다.
- [PreSync Job이 매 sync마다 update를 호출함] → 동일 값 update가 안전한지 검증하고, 필요하면 machine-readable describe 결과로 실제 drift가 있을 때만 update한다.

## Migration Plan

1. 환경별 values와 PreSync Job을 추가하고 dev/prod Helm render를 검증한다.
2. 고정 CLI image에서 namespace create, existing, drift와 connection-failure 동작을 검증한다.
3. dev sync로 `kosmo-dev`를 생성하고 재동기화와 retention drift 수렴을 확인한다.
4. dev 증거 뒤 prod sync로 `kosmo-prod`를 생성하고 재동기화와 retention drift 수렴을 확인한다.
5. 문제가 생기면 Job template/values를 되돌리되 생성된 Temporal namespace는 삭제하지 않는다.

## Open Questions

없음.
