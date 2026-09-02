## Why

현재 하나의 Docker image가 Web, API, Temporal Worker, Fedify Consumer와 migration의 TypeScript source 및 production dependency를 모두 포함하고 `tsx`로 직접 실행되어, 각 workload가 사용하지 않는 dependency와 특히 큰 Temporal native runtime까지 함께 배포한다. PROD-831은 각 runtime을 사전 생성 JavaScript artifact와 전용 image로 분리하되, 기존 immutable release와 migration barrier를 runtime별 digest set으로 일반화해 이미지 크기를 줄이고 배포 안전성을 유지한다.

## What Changes

- 다섯 runtime의 workspace application code를 JavaScript artifact로 bundle하고, third-party package는 각 workspace의 root lockfile 기반 production dependency tree로 배치한다. 생성 runtime manifest 없이 최종 image에서 TypeScript source와 `tsx`를 제거한다.
- Temporal Worker application/Activity host code와 Workflow code를 build 단계에서 각각 준비하고, Worker production dependency tree에서 target Linux/ARM64 native/runtime artifact를 보존한다.
- Web, API, Worker, Fedify Consumer와 migration을 서로 다른 final image로 만들고 각 image의 dependency 구성, boot 동작과 크기를 검증한다.
- **BREAKING** Helm과 dev/production release identity를 단일 application image digest에서 동일 source SHA와 승인된 build run이 생성한 다섯 runtime image digest의 검증된 release set으로 변경한다.
- 전용 migration image가 같은 release set의 workload image보다 먼저 실행되고 성공해야 한다는 Argo CD migration barrier를 유지한다.
- Server JavaScript source map을 Sentry release에 연결하되 upload credential과 source map을 최종 image에서 제외한다.
- Artifact build·boot·dependency·size gate가 통과하기 전에는 Helm과 release workflow의 runtime별 image set 전환을 시작하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`; 적용되는 `docs/design` 문서 없음.
- Linear Contract: `PROD-831` (Issue Gate 승인: 2026-08-25).
- Linear Implementations: 없음. 관련 선행 계약은 `PROD-288`, `PROD-516`, `PROD-730`, `PROD-783`.

## Capabilities

### New Capabilities

- `server-runtime-images`: 다섯 server runtime의 사전 생성 JavaScript artifact, 전용 final image, dependency·boot·size 검증과 server source map 경계를 정의한다.

### Modified Capabilities

- `production-release`: 승인된 production build와 감사 identity를 하나의 digest가 아니라 동일 source/build의 runtime image digest set으로 전달한다.
- `production-migration-gate`: migration과 workload의 동일 digest 조건을 같은 release set의 전용 migration/workload digest 및 기존 wave barrier로 일반화한다.
- `dev-database-migrations`: dev migration Job과 workload가 같은 mutable image가 아니라 같은 build의 runtime별 image set을 사용하게 한다.
- `temporal-worker-runtime-foundation`: 공통 runtime image의 TypeScript Worker source 실행을 사전 생성 host/Workflow artifact와 전용 Worker image로 전환한다.
- `fedify-postgres-message-queue-runtime`: Fedify producer와 consumer가 단일 공통 image 대신 같은 release set에서 각자 지정된 runtime image를 사용한다.

## Impact

- Build/runtime: `Dockerfile`, server build script와 package manifest, `docker-entrypoint.sh`, Worker Workflow bundling, migration artifact path, Expo Web static artifact 조립.
- Deployment: Helm image values/helper와 Web/API/Worker/Fedify Consumer/Migration template, Argo CD parameter 전달과 migration wave.
- Delivery: dev Docker Build/Deploy workflow, automatic·manual production release workflow, runtime별 digest 검증·감사 기록과 Trivy 대상.
- Observability: API/Web server source map 생성·Sentry upload와 최종 image 제외.
- Dependencies: JavaScript bundler를 명시적 build dependency로 추가한다. 각 runtime의 production dependency는 workspace manifest와 root lockfile에서 배치하며, Temporal Worker image만 target ABI native package를 유지한다.
