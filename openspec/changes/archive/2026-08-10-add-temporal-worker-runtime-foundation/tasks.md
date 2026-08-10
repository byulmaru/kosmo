## 1. PROD-730 Worker package와 lifecycle

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-730

**Deliverable**

API/Web와 독립적으로 build·test할 수 있는 Worker 애플리케이션이 business registration 유무에 따라 안전하게 시작 또는 거부되고, 등록된 Worker의 HTTP health와 graceful shutdown 경계를 제공한다.

**Guardrails**

- business registration이 없으면 Temporal·DB connection과 health-only 대기 전에 구성 오류로 즉시 종료한다.
- smoke Workflow/Activity, 검증 전용 task queue, dynamic plugin system을 추가하지 않는다.
- root 기본 dev command가 Worker를 자동 실행하지 않는다.
- worker 진입점은 transport별 인증과 표현을 core service에 넘기지 않는다.

**Verification**

- Worker package build/typecheck와 unit test를 실행한다.
- registration 미등록, 환경 입력, SDK Worker 상태별 health 응답과 connect 중 SIGTERM child-process 종료를 검증한다.
- 외부 connection 없이 fail-fast하는지 확인한다.

- [x] 1.1 Worker workspace package와 Temporal Worker production dependency를 추가한다.
- [x] 1.2 business registration을 검증하고 미등록 상태를 외부 connection 전에 거부하는 production entrypoint 경계를 구현한다.
- [x] 1.3 등록된 Worker가 사용할 HTTP liveness/readiness와 SIGTERM graceful shutdown lifecycle을 구현한다.
- [x] 1.4 fail-fast, 환경·SDK Worker 상태별 readiness와 connect 중 SIGTERM child-process package test를 추가하고 Worker build/test를 통과시킨다.
- [x] 1.5 root 기본 dev와 분리된 명시적 Worker local command를 추가하고 자동 실행되지 않는지 확인한다.

## 2. PROD-730 Runtime image packaging

**Authority / Provenance**

- PROD-730

**Deliverable**

Kosmo 공통 production image가 Worker package와 dependency를 포함하고 기존 command와 분리된 Worker entrypoint를 제공한다.

**Guardrails**

- 기존 API, Web과 migration image command를 변경하지 않는다.
- Worker command는 registration 미등록 상태에서 성공 process로 대기하지 않는다.
- current production Node/target architecture에서 Temporal SDK runtime artifact가 실제로 설치·로드되어야 한다.

**Verification**

- production dependency install과 runtime image build를 실행한다.
- Worker command가 해당 package entrypoint를 선택하고 미등록 오류로 종료하는지 확인한다.
- 기존 command와 unknown-command 분기를 회귀 검증한다.

- [x] 2.1 workspace dependency install과 runtime source copy 범위에 Worker package를 포함한다.
- [x] 2.2 공통 image entrypoint에 Worker command를 추가한다.
- [x] 2.3 production image를 build하고 Worker dependency load와 fail-fast command를 검증한다.

## 3. PROD-730 기본 비활성 Helm component

**Authority / Provenance**

- PROD-730
- PROD-709
- PROD-715

**Deliverable**

Helm chart가 기본적으로 Worker resource를 만들지 않으며, 명시적으로 활성화하면 환경별 replica, Temporal 입력, 역할별 DB 입력, HTTP probe와 전용 ServiceAccount를 가진 Deployment를 render한다.

**Guardrails**

- 기본값은 비활성이며 이번 변경에서 live dev/prod rollout을 수행하지 않는다.
- dev replica 기본은 1, prod는 2다.
- API/Fedify DB credential은 기존 complete-trio validation을 보존하며 foundation은 DB connection을 열지 않는다.
- ServiceAccount token을 필요 없이 자동 mount하지 않는다.
- Worker용 ClusterIP Service, HPA, Argo Rollout과 Vault restart target을 이번 범위에 추가하지 않는다.

**Verification**

- dev/prod disabled render에서 Worker Deployment·ServiceAccount가 없는지 확인한다.
- dev/prod enabled render에서 replica, image command, probes, Temporal endpoint·namespace와 DB Secret/env를 확인한다.
- incomplete DB credential render 실패와 Helm lint를 검증한다.

- [x] 3.1 기본 비활성 Worker values와 환경별 replica·health port·resource inputs를 추가한다.
- [x] 3.2 enabled Worker Deployment와 전용 ServiceAccount manifest를 추가한다.
- [x] 3.3 기존 API/Fedify 역할별 DB credential과 Temporal endpoint·namespace를 Worker environment에 투영한다.
- [x] 3.4 dev/prod disabled/enabled와 incomplete credential Helm render 검증을 추가·실행한다.

## 4. PROD-730 CI와 최종 범위 검증

**Authority / Provenance**

- PROD-730

**Deliverable**

Worker foundation이 repository CI에서 독립적으로 검증되고, business capability나 live workload 없이 merge 가능한 상태다.

**Guardrails**

- 실제 Workflow/Activity, task queue, Fedify PostgreSQL MessageQueue와 dev/prod activation을 포함하지 않는다.
- PROD-719 OpenSpec 완료나 archive를 PROD-730의 로컬 foundation 검증으로 대신하지 않는다.

**Verification**

- Worker package가 test matrix에서 실행되는지 확인한다.
- workspace lint/typecheck/test, strict OpenSpec validation과 변경 diff를 검토한다.
- GitHub hosted checks는 로컬 검증과 구분해 PR에서 확인한다.

- [x] 4.1 Worker package build/test를 repository CI matrix에 연결한다.
- [x] 4.2 영향 범위의 lint, typecheck, test와 Helm 검증을 실행한다.
- [x] 4.3 `openspec validate add-temporal-worker-runtime-foundation --strict`를 통과시킨다.
- [x] 4.4 최종 diff에서 smoke/task queue/live activation과 Fedify transport scope가 추가되지 않았는지 검토한다.
