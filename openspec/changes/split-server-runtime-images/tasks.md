## 1. PROD-831 Current single-image baseline과 build contract

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-831`

**Deliverable**

현재 Linux/ARM64 single image의 command별 실행 경계, compressed/uncompressed size, layer와 포함 dependency를 재현 가능한 baseline으로 기록하고 server artifact build 도구를 workspace의 명시적 contract로 준비한다.

**Guardrails**

- Base image와 Node major를 이번 변경에서 함께 바꾸지 않는다.
- Transitive dependency로 우연히 설치된 bundler에 의존하지 않는다.
- Baseline image build 성공을 새 artifact나 dev/production runtime 성공으로 간주하지 않는다.

**Verification**

- 현재 Docker target을 Linux/ARM64로 build하고 Web/API/Worker/Fedify/Migration command, image inspect/history와 size를 기록한다.
- Bundler가 package manifest/lockfile에 명시적으로 선언되고 clean install/build에서 resolution되는지 확인한다.

- [x] 1.1 현재 single image의 Linux/ARM64 build, 다섯 command, filesystem/dependency, compressed/uncompressed size와 layer baseline을 기록한다.
- [x] 1.2 선택한 JavaScript bundler를 pnpm CLI로 명시적 workspace build dependency에 추가하고 lockfile 정합성을 확인한다.
- [x] 1.3 Server artifact build의 입력·출력·target Node/ESM·source map·dependency metadata contract와 clean/stale output 처리를 구현한다.
- [x] 1.4 Build script의 성공, compile 오류, 누락 entry와 stale artifact 제거를 검증하고 관련 package/type check를 통과시킨다.

## 2. PROD-831 Web·API·Fedify·Migration JavaScript artifact

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-516`
- `PROD-831`

**Deliverable**

Web BFF, GraphQL API, Fedify Consumer와 migration이 TypeScript source/`tsx` 없이 사전 생성 JavaScript와 필요한 asset으로 시작되고 API/Web 오류의 source map 정합성을 유지한다.

**Guardrails**

- 기존 API/Web health, Expo static root, GraphQL/Fedify routing, consumer lifecycle와 migration history/lock/transaction 계약을 바꾸지 않는다.
- Migration artifact는 version-controlled `drizzle/` SQL만 사용하고 database/schema authority input을 추가하지 않는다.
- Sentry upload token과 server source map은 final image/runtime/log에 남기지 않는다.

**Verification**

- 네 artifact를 Node에서 직접 실행하고 dynamic import, `import.meta.main`, health/static route, queue shutdown과 migration asset path의 focused test/smoke를 수행한다.
- API/Web external source map의 sourcesContent/debug identity, upload-required 실패와 final artifact map/reference 제거를 검증한다.

- [x] 2.1 Web/API/Fedify Consumer production entry graph를 ESM JavaScript artifact로 생성하고 기존 runtime 행동을 보존한다.
- [x] 2.2 Migration JavaScript entry와 `drizzle/` asset의 deterministic path를 구현하고 기존 migration history·lock·transaction tests를 통과시킨다.
- [x] 2.3 API/Web server source map을 기존 Sentry release build에 inject·upload·validate하고 final runtime artifact에서 map/reference를 제거한다.
- [x] 2.4 네 artifact가 `tsx`와 TypeScript source 없이 시작되는 package/focused smoke를 추가하고 dynamic loading·shutdown 회귀를 검증한다.

## 3. PROD-831 Temporal Worker prebuilt artifact와 native runtime

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-730`
- `PROD-831`

**Deliverable**

Temporal Worker가 고정 business registry를 가진 사전 생성 host JavaScript와 exact SDK version의 prebuilt Workflow bundle로 Linux/ARM64에서 시작하며, 필요한 native/runtime dependency만 Worker image 경계에 남는다.

**Guardrails**

- Workflow/Activity type, ID, task queue, registration, health/readiness와 SIGTERM drain 계약을 변경하지 않는다.
- Production에서 `workflowsPath`로 TypeScript source를 다시 bundle하지 않는다.
- Target ABI를 확인하지 않은 native binary 삭제·이동 또는 다른 runtime image와의 Temporal dependency 공유를 하지 않는다.

**Verification**

- Prebuilt Workflow bundle의 모든 production Workflow export와 build/runtime SDK version 일치를 검사한다.
- Linux/ARM64 Node 26.5.1 container에서 native load, connect/create, health/readiness와 startup/running SIGTERM lifecycle을 검증한다.

- [x] 3.1 Production Workflow registry를 exact `@temporalio/worker` version으로 build-time bundle하고 누락/추가 Workflow export를 검증한다.
- [x] 3.2 Worker host가 production에서 prebuilt `workflowBundle`을 사용하고 기존 fixed Activity registry와 task queue를 보존하게 한다.
- [x] 3.3 Worker host bundle의 external runtime 경계와 Linux/ARM64 Temporal native/runtime production dependency tree를 조립한다.
- [x] 3.4 Worker package tests와 Linux/ARM64 container smoke로 native load, Workflow bundle, health/readiness 및 graceful shutdown을 검증한다.

## 4. PROD-831 다섯 final image와 artifact gate

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-831`

**Deliverable**

Web, API, Worker, Fedify Consumer와 Migration final image가 고정 entrypoint와 runtime별 최소 artifact/dependency만 포함하고, 전환 전에 build·boot·dependency·size gate를 모두 통과한다.

**Guardrails**

- Web image만 Expo static/precompressed asset을 포함한다.
- Final image에는 다른 runtime command를 고르는 공통 dispatcher를 두지 않는다.
- 각 image의 compressed size는 같은 Linux/ARM64 baseline single image보다 작아야 한다.
- 하나라도 gate가 실패하면 Helm/release workflow 전환을 시작하지 않는다.

**Verification**

- 다섯 Docker target을 Linux/ARM64로 build하고 고정 command, non-root 실행, filesystem, package tree, asset과 health/exit를 검사한다.
- 각 target의 compressed/uncompressed size와 history를 baseline과 비교하고 dependency/layer 감소 원인을 기록한다.

- [x] 4.1 공통 build cache를 재사용하면서 Web/API/Worker/Fedify Consumer/Migration을 분리하는 다섯 final Docker target을 구현한다.
- [x] 4.2 각 final image를 고정 Node entrypoint와 non-root runtime으로 실행하고 기존 다중 command dispatcher 의존을 제거한다.
- [x] 4.3 Runtime별 filesystem/dependency allow/deny, static/migration/Workflow asset과 `tsx`·TypeScript source 부재 검증을 추가한다.
- [x] 4.4 다섯 image의 Linux/ARM64 boot/health/exit smoke와 baseline 대비 compressed/uncompressed size/layer gate를 통과시키고 결과를 PROD-831에 기록한다.
- [x] 4.5 Artifact gate 결과를 리뷰해 모두 통과하지 않으면 후속 Helm/CI/CD task를 시작하지 않고 실패 원인과 남은 증거를 보고한다.

## 5. PROD-831 OpenSpec integration과 Helm runtime image set

**Authority / Provenance**

- `memory/issue-openspec-workflow.md`
- `PROD-288`
- `PROD-730`
- `PROD-783`
- `PROD-831`

**Deliverable**

Current main/manual SHA production-release contract를 canonical에 보존한 뒤 Helm이 같은 source/build의 완전한 runtime image set을 각 workload와 migration에 적용한다.

**Guardrails**

- `deploy-production-from-main-or-sha`가 canonical에 archive되기 전에 이 change의 production-release delta를 구현 완료 또는 archive하지 않는다.
- Production은 다섯 valid digest를 모두 요구하며 partial/mixed set을 render하지 않는다.
- Migration은 `migration` image로 wave 1, API/Web/Worker/Fedify Consumer는 대응 image로 wave 2를 유지한다.
- DB role/credential, queue database, replica, probe와 workload 상시 activation 계약을 바꾸지 않는다.

**Verification**

- Linear PROD-783/current comments, active change status와 canonical production-release requirement를 refresh해 archive 순서를 증명한다.
- Dev/prod Helm render에서 runtime별 image, 누락/invalid/mixed input 실패, migration wave와 workload command/env/probe를 검증한다.

- [ ] 5.1 `deploy-production-from-main-or-sha`의 remaining tasks, Linear authority와 archive 상태를 refresh하고 canonical main/manual SHA production-release contract를 확인한다.
- [ ] 5.2 공통 repository와 runtime별 version/digest set을 표현하는 Helm values/helper contract를 구현하고 production 완전성 검증을 추가한다.
- [ ] 5.3 Web/API/Worker/Fedify Consumer/Migration template이 대응 image와 고정 entrypoint를 사용하도록 전환하고 기존 runtime env, probe와 wave를 보존한다.
- [ ] 5.4 Dev/prod render에서 valid set, 누락·invalid·mixed set 거부, legacy activation inertness와 migration-before-workload 순서를 검증한다.

## 6. PROD-831 Dev build·scan·deployment release set

**Authority / Provenance**

- `PROD-288`
- `PROD-783`
- `PROD-831`

**Deliverable**

Main dev build가 동일 full SHA/build run의 다섯 runtime image를 GHCR에 게시·검사하고, 완전한 set을 한 번에 dev Argo CD에 전달해 migration 뒤 workload를 배포한다.

**Guardrails**

- 후속 build가 실행 중 dev release의 image identity를 부분적으로 바꾸지 않는다.
- 한 runtime build/scan/digest가 실패하면 불완전한 set을 deploy하지 않는다.
- Deploy Dev 직렬화와 migration 실패 시 workload restart 차단을 유지한다.

**Verification**

- Workflow static validation에서 다섯 build output, source/build identity, set completeness, artifact 전달과 scan fan-out/fan-in을 확인한다.
- Dev sync에서 migration Job과 네 workload의 실제 image reference, source SHA, health와 실패 차단을 관찰한다.

- [ ] 6.1 Main Docker Build가 다섯 target을 같은 full SHA/build run으로 build·push하고 runtime별 immutable digest를 structured artifact로 출력하게 한다.
- [ ] 6.2 Trivy와 build result가 다섯 image를 모두 검사하고 하나의 실패도 release set/deploy 성공으로 합치지 않게 한다.
- [ ] 6.3 Deploy Dev가 완전한 runtime image set과 source revision을 Argo CD에 원자적으로 설정하고 post-write 값을 다시 검증하게 한다.
- [ ] 6.4 Workflow static checks와 dev live sync에서 migration image wave 1, 네 workload 대응 image wave 2, health와 release set identity를 검증한다.

## 7. PROD-831 Production runtime digest set release

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-564`
- `PROD-783`
- `PROD-831`

**Deliverable**

Automatic main과 manual full-SHA production release가 한 번의 `prod` 승인 뒤 같은 gated build run의 다섯 immutable digest를 만들고 migration-gated Argo sync와 감사 기록에 사용한다.

**Guardrails**

- 승인 전 production checkout, Vault/Sentry credential, image build와 Argo mutation을 실행하지 않는다.
- Automatic/manual 경로는 같은 set validation·concurrency·migration barrier를 사용한다.
- Partial set, mutable tag, 다른 SHA/build digest 혼합, migration 실패와 scanner 실패는 workload activation 전에 release를 실패시킨다.
- Production live release는 별도 명시적 승인과 current-state refresh 없이 실행하지 않는다.

**Verification**

- Workflow/action static validation으로 approval boundary, five-digest output, automatic/manual target SHA, set validation, single Argo mutation, post-write check와 audit summary를 검증한다.
- 승인된 live release에서 source SHA/build run, 다섯 GHCR digest, Argo revision, migration result, workload images/health와 smoke를 각각 기록한다.

- [ ] 7.1 승인 뒤 production build가 다섯 runtime image를 GHCR에 게시하고 완전한 digest set을 검증하도록 automatic/manual 공용 release 경계를 전환한다.
- [ ] 7.2 Production Argo mutation이 source full SHA와 다섯 digest를 원자적으로 설정·재조회하고 `migration` wave 성공 뒤 네 workload를 활성화하게 한다.
- [ ] 7.3 Production workflow summary/audit가 trigger, requester, workflow ref, target SHA, build run, 다섯 digest, Argo revision과 단계별 결과를 기록하게 한다.
- [ ] 7.4 Action/workflow/Helm/OpenSpec strict validation과 관련 repository check를 통과시키고 PR/CI/dev/production evidence를 분리해 보고한다.
- [ ] 7.5 별도 production 승인 후에만 current Argo/GHCR/database/runtime 상태를 refresh하고 첫 runtime digest set release와 smoke를 수행·기록한다.

## 8. PROD-831 Documentation, completion과 archive

**Authority / Provenance**

- `memory/issue-openspec-workflow.md`
- `PROD-516`
- `PROD-783`
- `PROD-831`

**Deliverable**

Build, runtime, release와 운영 문서가 runtime image set 계약과 실제 검증 결과에 일치하고, PROD-831 전체 범위의 완료 증거를 소유한 작업에서 OpenSpec과 Linear를 완료한다.

**Guardrails**

- Artifact/CI, dev runtime, production release 증거를 서로 대체하지 않는다.
- PROD-516 source map 소유권과 `deploy-production-from-main-or-sha` canonical sync를 중복·상충 상태로 남기지 않는다.
- 구현 PR 하나의 완료나 production 배포 없이 문서가 작성됐다는 이유만으로 change를 archive하지 않는다.

**Verification**

- 운영 문서, active/canonical OpenSpec, Linear 관계와 실제 Docker/Helm/workflow 상태를 대조한다.
- 모든 task, required validation, dev 증거와 승인된 production evidence가 있을 때 strict archive를 수행한다.

- [ ] 8.1 Docker build, dev deployment, production release/migration, rollback과 Sentry runbook을 runtime image set 계약에 맞게 갱신한다.
- [ ] 8.2 PROD-516과 PROD-783 관련 OpenSpec/Linear artifact의 superseded·shared scope를 정리하고 중복된 single-digest 문장을 동기화한다.
- [ ] 8.3 Full repository checks, OpenSpec strict validation, image size report, dev runtime과 승인된 production evidence를 최종 대조한다.
- [ ] 8.4 PROD-831의 모든 완료 조건과 integration verification이 충족된 뒤 이 change를 strict archive하고 Linear 상태를 갱신한다.
