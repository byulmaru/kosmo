## Context

현재 `Dockerfile`은 모든 workspace production dependency를 한 runtime stage에 설치하고 API, Web, Worker, Fedify Consumer, Core/Fedify source 및 `drizzle/`을 함께 복사한다. `docker-entrypoint.sh`는 다섯 command를 모두 `node --import tsx`로 실행한다. 이 구조에서는 Web/API/Fedify/Migration Pod도 Temporal Worker의 native bridge와 Webpack/SWC dependency를 포함하며, 현재 설치 기준 `@temporalio/core-bridge`는 여러 platform binary를 함께 보유한다.

Helm의 모든 workload와 migration Job은 공통 `image`/`imageDigest`를 사용하고 production release workflow는 하나의 digest를 Argo CD에 전달한다. 이 단일 digest는 mutable tag race를 막지만 runtime image를 분리하려면 동일 source와 build를 증명하는 원자적인 digest set으로 일반화해야 한다.

Temporal Worker는 일반 server bundle과 다르다. `@temporalio/worker`는 Node native module을 사용하고 현재 `workflowsPath`는 startup 때 TypeScript Workflow source를 Webpack으로 bundle한다. SDK는 production에서 `bundleWorkflowCode`로 만든 bundle을 `workflowBundle`로 전달하는 경로를 제공하며, build와 runtime의 Temporal Worker version이 정확히 같아야 한다. Migration은 현재 `drizzle.config.ts`의 `import.meta.url` 기준 상대 경로로 SQL directory를 찾으므로 bundle 위치를 바꾸면 asset 경로가 깨질 수 있다.

`deploy-production-from-main-or-sha` change가 아직 active인 상태에서 canonical `production-release` spec은 이전 tag 기반 계약을 담고 있다. 이 change의 production-release delta는 그 active change가 canonical로 archive된 뒤 적용할 수 있도록 integration 순서를 명시해야 한다.

## Goals / Non-Goals

**Goals:**

- 다섯 runtime을 TypeScript loader 없이 사전 생성 JavaScript artifact로 실행한다.
- 각 final image가 자신의 artifact, asset과 필요한 production runtime dependency만 포함하게 한다.
- Worker Workflow를 build 때 사전 bundle하고 Linux/ARM64 native runtime 경계를 검증한다.
- 같은 source full SHA와 build run의 다섯 immutable digest를 하나의 release set으로 원자적으로 전달한다.
- 기존 dev/production migration barrier, Environment 승인, automatic/manual SHA release와 감사 경계를 보존한다.
- 동일 Linux/ARM64 조건에서 현재 단일 image와 새 image의 compressed/uncompressed size 및 layer를 비교한다.

**Non-Goals:**

- Node major 또는 base image 선택 변경
- Browser runtime config 도입이나 dev/prod Web artifact 통합
- Temporal Server 배포, Workflow/Activity domain contract 또는 task queue identity 변경
- Database schema/down migration 변경
- Production 승인 없는 live apply

## Implementation Guidance

### Current Constraints

- API/Web/Fedify code와 `packages/core/services`에는 static string dynamic import가 있고 entrypoint/migration에는 `import.meta.main` 또는 `import.meta.url` 경계가 있다. Bundle smoke는 단순 build 성공 외에 이 runtime branch를 실행해야 한다.
- Web image만 Expo export, font와 precompressed static asset이 필요하다. 다른 image가 `apps/app/dist`를 상속하면 분리 효과가 줄어든다.
- Worker host를 일반 server와 함께 완전 bundle하면 Temporal native `.node` resolution과 SDK 내부 bundler dependency가 깨질 수 있다. 반대로 `workflowsPath`를 유지하면 final image에서 TypeScript source와 runtime Webpack을 제거할 수 없다.
- `@temporalio/core-bridge` package는 여러 OS/architecture binary를 포함한다. Worker image는 target Linux/ARM64 artifact를 보존하면서 다른 platform artifact를 제거했을 때 SDK resolution이 실제 container에서 성공하는지 확인해야 한다.
- Migration artifact는 `drizzle/` SQL directory를 별도 asset으로 가져야 한다. Runtime-configurable database/schema authority를 새로 만들지 않고 artifact layout에서 deterministic하게 경로를 계산해야 한다.
- Production Argo parameter update가 다섯 digest 중 일부만 적용되면 migration과 workload가 서로 다른 release가 된다. 생성, validation과 parameter mutation은 완전한 set 단위여야 한다.
- Current Temporal SDK의 공식 지원 Node 범위와 repository의 Node 26 target이 다를 수 있으므로, Linux/ARM64 Node 26.5.1 container boot와 Worker lifecycle 증거 없이 host build 성공만으로 호환성을 주장하지 않는다.

### Recommended Approach

1. 명시적인 server build dependency로 esbuild를 추가하고 공통 build script에서 Web, API, Fedify Consumer, migration 및 Worker host entry를 ESM JavaScript로 생성한다. Metafile을 남겨 runtime별 포함 dependency와 크기 검증에 사용한다.
2. Worker Workflow는 같은 lockfile의 `@temporalio/worker`가 제공하는 `bundleWorkflowCode`로 별도 생성한다. Production host는 `workflowsPath` 대신 image 안의 prebuilt `workflowBundle.codePath`를 사용한다. Worker host bundle은 Temporal native/runtime package를 external로 두고, 전용 production dependency tree와 target native binary를 Worker image에만 복사한다.
3. Migration entry는 final artifact 위치에서 함께 복사된 `drizzle/` directory를 deterministic하게 resolve해 `runDatabaseMigrations({ migrationsFolder })`에 전달한다. Database target·credential 입력 계약은 바꾸지 않는다.
4. Dockerfile은 공통 dependency/build stage와 `web`, `api`, `worker`, `fedify-consumer`, `migration` final target을 둔다. 각 final target은 고정된 Node entrypoint를 사용하고 다중 runtime source/command dispatcher를 복사하지 않는다. Web target만 Expo asset을 받는다.
5. 같은 repository에 runtime별 immutable build tag를 push하고 build output의 다섯 digest를 하나의 manifest/structured output으로 조립한다. Digest는 정규식뿐 아니라 runtime key 완전성, source full SHA와 build run identity를 검증한다.
6. Helm values는 공통 repository와 runtime별 digest/version map을 받고 helper가 workload 이름에 대응하는 image reference를 만든다. Production은 모든 runtime에 digest를 요구하고, dev는 같은 build가 발행한 runtime별 tag 또는 digest를 사용한다.
7. Argo CD parameter mutation은 한 command/job에서 다섯 값을 함께 설정한 뒤 source revision과 실제 parameter set을 다시 읽어 검증한다. Migration Job은 `migration` image로 wave 1, 네 workload는 대응 image로 wave 2를 유지한다.
8. Sentry upload stage는 API/Web server external source map을 기존 browser artifact와 함께 inject/upload/validate하고, final image 복사 전에 map과 sourceMappingURL을 제거한다. Secret mount를 사용하고 token을 build argument나 layer로 전달하지 않는다.
9. Artifact gate는 동일 Linux/ARM64 platform에서 build, filesystem/dependency inspection, container boot/health, image size와 layer 비교를 수행한다. 이 gate와 OpenSpec/issue review가 끝난 뒤에만 Helm·workflow 전환 slice를 시작한다.

### Allowed Alternatives

- esbuild 대신 ESM, static dynamic import, `import.meta` 의미, source map과 metafile-equivalent dependency 검증을 만족하는 다른 bundler를 사용할 수 있다.
- Runtime별 image는 같은 OCI repository의 runtime tag를 공유하거나 별도 repository를 사용할 수 있다. Helm에는 최종 `repository@digest`가 runtime별로 명확하고 release set이 원자적으로 검증되어야 한다.
- Worker host는 검증 결과 완전 bundle보다 production-only external dependency tree가 더 안전하면 Temporal package 전체를 external로 유지할 수 있다. 어느 경우에도 Workflow는 prebuilt bundle이어야 하고 다른 runtime image에는 Worker dependency가 들어가면 안 된다.

### Known Traps

- Transitive esbuild 설치에 의존해 build script를 추가하지 않는다. 사용 도구는 workspace의 명시적 dependency여야 한다.
- Worker `workflowsPath`를 `.js`로만 바꾸고 startup bundling을 유지하지 않는다. 이는 Webpack/SWC와 Workflow source를 runtime에 다시 넣는다.
- Native package directory를 임의로 평탄화하거나 `.node` 파일 하나만 위치를 바꿔 copy하지 않는다. SDK의 platform resolution 경로를 보존하고 container에서 load한다.
- Migration bundle의 새 `import.meta.url`에서 기존 `drizzle.config.ts` 상대 경로가 우연히 맞는다고 가정하지 않는다.
- 한 digest가 실패했을 때 이전 release의 해당 runtime digest로 채워 완전한 set처럼 만들지 않는다.
- Dev의 mutable `main` tag 하나를 다섯 runtime에 다시 사용하거나 production digest 검증을 tag 존재로 대체하지 않는다.
- Source map upload 실패를 성공으로 삼키거나 source map/token을 final layer에 복사하지 않는다.
- Image build/CI 성공을 dev rollout, production approval 또는 production health 증거로 보고하지 않는다.

## Risks / Trade-offs

- [다섯 image build로 CI job과 registry artifact 수가 증가한다] → 공통 BuildKit stage/cache를 공유하고 release manifest 하나로 digest를 조립하되 각 runtime 결과와 scanner 상태를 별도로 보존한다.
- [Worker image는 native bridge 때문에 다른 image보다 계속 클 수 있다] → 다른 runtime에서 완전히 격리하고 target binary만 남기며, Worker 크기는 현재 단일 image와 별도로 비교한다.
- [Bundling이 package의 dynamic loading 또는 filesystem asset을 누락할 수 있다] → metafile inspection과 실제 container boot/health 및 주요 dynamic path test를 gate로 둔다.
- [Server source map upload가 build credential 범위를 넓힌다] → 기존 Sentry secret mount와 승인 경계를 재사용하고 final image 및 로그의 부재를 검사한다.
- [Runtime별 digest를 부분 적용하면 migration/workload compatibility가 깨진다] → 완전한 set validation, 단일 Argo mutation과 post-write verification 후에만 sync한다.
- [Active production-release change와 archive 순서가 충돌할 수 있다] → `deploy-production-from-main-or-sha`의 current contract를 먼저 canonical에 동기화·archive하고 이 change의 release delta를 적용한다. Artifact slice는 이 integration gate와 독립적으로 검증할 수 있다.

## Migration Plan

1. 현재 single image를 Linux/ARM64에서 다시 build해 size/layer와 다섯 command의 baseline을 기록한다.
2. JavaScript artifact와 다섯 Docker target을 추가하고 local/package/container gate를 통과시킨다. 이 단계에서는 Helm과 배포 workflow 입력을 바꾸지 않는다.
3. `deploy-production-from-main-or-sha`의 remaining authority/archive 상태를 refresh하고 production-release canonical spec이 main/manual SHA 계약을 포함하는지 확인한다.
4. Dev build가 runtime별 image/tag와 완전한 digest manifest를 게시하되 기존 deploy consumer는 유지해 registry output만 검증한다.
5. Helm과 Deploy Dev를 runtime image set으로 원자적으로 전환하고 render, migration wave, workload health와 image reference를 dev에서 검증한다.
6. Production workflow를 승인 뒤 다섯 image build, set validation, migration-gated sync와 audit summary로 전환한다. Static validation과 review가 끝나도 별도 production 승인을 받기 전에는 live sync하지 않는다.
7. 승인된 production release에서 migration과 네 workload의 source SHA/build run/digest, health와 smoke를 확인한다.

Rollback은 DB-compatible 이전 full SHA를 같은 five-image build와 approval 경로로 새 release set으로 build·배포한다. Partial runtime digest rollback, mutable tag 이동과 database history rollback은 사용하지 않는다. 배포 계약 전환 전 artifact 단계의 rollback은 새 Docker target/build script 사용을 중단하고 기존 single-image workflow를 유지한다.

## Open Questions

없음.
