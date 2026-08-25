## Context

이 기록은 2026-08-25에 승인된 Linear `PROD-831`, 현재 single-image Docker/Helm/release 구조, `PROD-288`과 `PROD-783`의 immutable release 안전성, `PROD-730`의 Temporal Worker 경계 및 `PROD-516`의 server source map 계약을 반영한다. 제품 도메인 행동은 바꾸지 않고 server artifact, container와 release identity를 분리한다.

## Decision Records

### 다섯 runtime별 사전 생성 JavaScript artifact와 전용 image

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-831`
- Status: Active
- Context / Problem: 공통 runtime image가 Web, API, Worker, Fedify Consumer와 migration의 source와 dependency를 모두 포함하고 `tsx`로 실행해 각 workload의 pull/runtime surface가 불필요하게 크다.
- Decision Outcome: Web, API, Temporal Worker, Fedify Consumer와 migration을 build 단계의 JavaScript artifact와 서로 다른 다섯 final image로 제공한다. Workspace application code는 bundle하고 third-party runtime dependency는 build graph에서 자동 생성한 artifact별 manifest로 설치한다. Web/API/Fedify/Migration image에는 TypeScript source, `tsx`, 범용 workspace `node_modules`와 개발 dependency를 두지 않고 Web image만 Expo static artifact를 포함한다.
- Alternatives Considered: 하나의 image에서 JavaScript만 사전 compile하는 방식은 Worker와 Web asset/dependency를 모든 workload에 계속 배포하므로 제외했다. Runtime별 source tree와 production `node_modules`만 prune하는 방식은 `tsx` 직접 실행과 불필요한 package surface를 유지하므로 제외했다.
- Consequences: Docker build와 registry output은 다섯 개로 늘지만 각 workload는 자신의 runtime layer만 pull한다. Runtime import가 바뀌면 manifest가 자동으로 따라가며 Dockerfile이나 검사 코드의 package allowlist를 함께 수정하지 않는다. Helm, scanner와 release workflow도 runtime별 identity를 처리해야 한다.
- Confirmation / Follow-up: 같은 Linux/ARM64 build에서 artifact, filesystem, dependency graph, boot/health와 compressed/uncompressed image size를 runtime별로 기록한다.

### Artifact gate 통과 뒤 release 계약을 전환한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-831`
- Status: Active
- Context / Problem: Dynamic import, `import.meta`, native module, Workflow bundle 또는 migration asset 경로가 깨진 상태에서 Helm과 release input까지 동시에 바꾸면 artifact 실패와 배포 계약 실패를 분리하기 어렵다.
- Decision Outcome: 먼저 다섯 artifact와 image의 build·boot·dependency·size gate를 완료하고, 모든 결과가 통과한 뒤에만 Helm과 dev/production workflow를 runtime digest set으로 전환한다.
- Alternatives Considered: Docker, Helm과 production workflow를 한 번에 전환하는 방식은 사용자가 선택한 검증 선행 경계와 맞지 않아 제외했다. 검증만 하고 배포 전환을 별도 이슈로 미루는 방식은 승인된 통합 이슈 범위와 맞지 않아 제외했다.
- Consequences: 하나의 Linear/OpenSpec 안에 두 implementation slice가 생긴다. 첫 slice의 성공은 두 번째 slice나 dev/production 적용 성공을 증명하지 않는다.
- Confirmation / Follow-up: Tasks와 PR evidence에서 artifact/CI, dev rollout, production 적용을 별도 proof tier로 보고한다.

### Third-party runtime dependency는 build graph에서 자동 도출한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-831`, 2026-08-25 사용자 재검토
- Status: Active
- Context / Problem: 최초 artifact 구현은 일부 external package 이름을 build script와 Dockerfile에 수동으로 나열하고 검사 코드가 정확한 root dependency 집합을 고정했다. API가 Temporal client를 사용하거나 package asset·dynamic import 경계가 바뀌면 여러 파일을 동시에 수정해야 해 runtime 분리가 미래의 정상적인 의존성 변경을 깨뜨릴 수 있었다.
- Decision Outcome: Workspace-owned application code는 bundle하되 third-party bare import는 모두 같은 규칙으로 externalize한다. Build graph에서 artifact별 package와 설치 version을 자동 수집한 runtime manifest를 생성하고 package manager가 transitive dependency와 package-relative asset/native layout을 설치한다. 정확한 package 이름 집합이나 package-manager 내부 경로는 Dockerfile과 테스트 계약에 수동으로 고정하지 않는다.
- Alternatives Considered: `pnpm deploy --legacy` 전체 tree는 workspace TypeScript source, `tsx`와 사용하지 않는 production dependency까지 포함해 image 분리 효과를 크게 줄이므로 제외했다. 일부 package만 수동 externalize하는 방식은 사용자가 지적한 변경 취약성을 유지하므로 폐기했다. 모든 third-party package를 bundle하는 방식은 filesystem asset과 native/dynamic resolution을 package별로 다시 구현해야 하므로 제외했다.
- Consequences: Final image에는 artifact별 작은 production `node_modules`가 존재하지만 범용 workspace tree나 source는 없다. 새 third-party import는 build 결과와 manifest를 통해 자동 반영되며 Worker만 target native binary pruning을 추가로 수행한다.
- Confirmation / Follow-up: Metafile external import와 generated manifest 일치, `@kosmo/*`·`tsx` 부재, package install, 다섯 container boot/health와 non-Worker Temporal native 부재를 검증한다.

### Temporal Workflow는 production image 시작 전에 bundle한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-730`, `PROD-831`
- Status: Active
- Context / Problem: 현재 Worker는 `workflowsPath`의 TypeScript source를 startup 때 Webpack으로 bundle한다. 일반 server처럼 완전 bundle하면 Temporal native `.node` resolution이 깨질 수 있고, 기존 경로를 유지하면 TypeScript source와 Webpack/SWC를 runtime artifact 경계에 계속 요구한다.
- Decision Outcome: Build와 runtime에서 exact same `@temporalio/worker` version을 사용해 Workflow code를 `bundleWorkflowCode`로 사전 생성하고, production Worker는 `workflowBundle`을 전달한다. Worker host의 third-party package도 공통 build-graph manifest 경계를 따르며 final image에는 target Linux/ARM64에서 SDK resolution에 필요한 production dependency와 native artifact만 둔다.
- Alternatives Considered: Production `workflowsPath` 유지 방식은 runtime bundling과 TypeScript source 제거 목표를 위반해 제외했다. Native package를 single-file bundle 안에 강제로 넣는 방식은 ABI와 dynamic resolution 위험 때문에 제외했다. Temporal Worker 전체 dependency tree를 다른 runtime에도 공유하는 방식은 image 분리 목적을 위반해 제외했다.
- Consequences: Worker image는 다른 image보다 크고 external package tree를 가질 수 있다. Workflow bundle 생성과 Worker runtime package version은 lockfile과 build에서 일치해야 한다.
- Confirmation / Follow-up: Linux/ARM64 Node 26.5.1 container에서 native load, Worker create, health/readiness와 SIGTERM lifecycle을 검증하고 다른 runtime image에 Temporal Worker dependency가 없는지 확인한다.

### Runtime image는 고정 entrypoint를 사용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-831`
- Status: Active
- Context / Problem: 기존 `docker-entrypoint.sh`는 하나의 image에서 command로 다섯 TypeScript entrypoint를 고른다. 전용 image에서도 이 dispatcher를 유지하면 잘못된 runtime command와 source/dependency 재결합 가능성이 남는다.
- Decision Outcome: 각 final image는 자신의 사전 생성 Node JavaScript만 시작하는 고정 entrypoint를 사용하고 다른 runtime command를 선택하는 공통 dispatcher를 포함하지 않는다.
- Alternatives Considered: 동일 dispatcher를 모든 image에 복사하되 사용 가능한 command만 줄이는 방식은 불필요한 shell 분기와 동일 파일 소유권을 유지하므로 제외했다.
- Consequences: Helm template의 `args: web|api|worker|fedify-queue|migrate`는 제거되거나 image 고유 command와 충돌하지 않게 정리해야 한다. Runtime 선택은 image reference가 소유한다.
- Confirmation / Follow-up: 각 rendered workload/Job의 image와 command를 검사하고 다른 runtime command로 시작할 수 없음을 container smoke에서 확인한다.

### 단일 digest를 원자적인 runtime digest release set으로 일반화한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-288`, `PROD-783`, `PROD-831`
- Status: Active
- Context / Problem: 기존 migration과 workload의 동일 digest는 mutable tag race를 막지만 전용 runtime image는 서로 다른 content digest를 가진다.
- Decision Outcome: 하나의 release는 동일 source full SHA와 승인된 단일 build run이 생성한 `web`, `api`, `worker`, `fedify-consumer`, `migration`의 digest-pinned reference를 정확히 하나씩 가진다. 다섯 값을 완전한 set으로 검증·기록·Argo mutation하고, migration image의 wave 1 성공 뒤 같은 set의 workload image를 wave 2에 적용한다.
- Alternatives Considered: Migration과 workload가 서로 다른 SHA/build의 digest를 독립 선택하는 방식은 기존 compatibility barrier를 잃어 제외했다. 모든 runtime content를 다시 하나의 OCI image로 합치는 방식은 image 분리 목표를 무효화해 제외했다. 일부 실패 digest를 이전 release에서 채우는 방식은 release atomicity를 깨므로 제외했다.
- Consequences: 하나의 `imageDigest` parameter와 audit field가 다섯 runtime 값으로 확장된다. Build, Trivy, Helm과 production summary는 누락과 partial mutation을 실패로 처리해야 한다.
- Confirmation / Follow-up: Automatic main과 manual full-SHA release 모두 source SHA, build run, 다섯 digest, Argo source/parameter와 migration/workload image를 대조한다.

### Server source map은 build secret 경계에서 업로드하고 image에서 제거한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-516`, `PROD-831`
- Status: Active
- Context / Problem: JavaScript bundle 전환은 runtime stack 위치를 바꾸므로 source map 없이 API/Web 오류 symbolication이 악화된다. 반대로 map이나 upload token이 final image에 남으면 source와 credential 노출이 생긴다.
- Decision Outcome: API/Web server bundle의 external source map을 같은 Sentry release로 inject·upload·validate한 뒤 final image 복사 전에 map과 sourceMappingURL을 제거한다. Upload token은 BuildKit secret 경계로만 전달한다.
- Alternatives Considered: Source map을 생성하지 않는 방식은 PROD-516/831 observability 계약을 충족하지 않아 제외했다. Map을 final image에 두는 방식과 token을 build argument로 전달하는 방식은 노출 위험 때문에 제외했다.
- Consequences: Server bundle build가 Sentry artifact stage와 연결되고 upload-required build에서는 upload 실패가 release build를 실패시킨다.
- Confirmation / Follow-up: Upload 결과와 API/Web artifact debug identity를 확인하고 final image filesystem, metadata와 runtime env에 map/token이 없는지 검사한다.

### Production-release delta는 선행 active change archive 뒤 적용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/issue-openspec-workflow.md`, Linear `PROD-783`, `PROD-831`
- Status: Active
- Context / Problem: Current canonical `production-release` spec은 과거 tag 계약이고, main/manual SHA 계약은 아직 active `deploy-production-from-main-or-sha` change의 delta에 있다. 두 active change가 같은 requirement를 서로 다른 archive 순서로 수정하면 canonical sync가 충돌할 수 있다.
- Decision Outcome: Artifact/image gate는 독립 진행할 수 있지만, PROD-831의 production-release implementation과 archive 전에 `deploy-production-from-main-or-sha`의 current authority, remaining tasks와 archive 상태를 refresh하고 main/manual SHA delta를 canonical에 먼저 동기화한다. 이 change는 그 canonical requirement를 runtime digest set으로 수정한다.
- Alternatives Considered: 두 active delta를 archive 순서 없이 병렬 적용하는 방식은 requirement provenance와 archive 결과가 비결정적이어서 제외했다. PROD-831을 기존 change에 합치는 방식은 unrelated remaining live credential/release completion과 image 최적화 생명주기를 결합하므로 제외했다.
- Consequences: Artifact slice가 완료돼도 선행 change archive가 끝나지 않으면 release contract slice와 이 change archive는 완료할 수 없다. 이를 blocker 우회 없이 별도 evidence gap으로 보고한다.
- Confirmation / Follow-up: Release slice 시작 전에 `openspec status`, canonical `production-release` 내용과 PROD-783 Linear/current comments를 다시 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
