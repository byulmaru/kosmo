# Production release 운영

이 문서는 `main`에서 생성한 환경 중립 canonical artifact를 dev와 production에 같은 digest로 승격하는 절차를 정의한다. `Docker Build`는 main full SHA를 한 번만 build하고 GHCR에 immutable digest와 `canonical-release-manifest`를 게시한다. `Deploy Dev`는 그 manifest를 자동 소비하고, production release는 `main` ref의 `workflow_dispatch`로만 요청해 같은 runtime digest를 사용한다.

Production release는 `prod` GitHub Environment의 required reviewer가 한 번 승인한 뒤에만 production runtime secret 접근과 Argo CD 상태 변경을 수행한다. 승인 전 preflight는 target SHA의 성공한 main `Docker Build` run과 digest artifact를 read-only로 확인한다. 승인 전에는 production checkout, Vault/Sentry DSN 조회, image build, Argo token과 mutation을 실행하지 않는다.

## Release identity

별도 production branch나 Git tag는 production source, approval, rollback selector가 아니다. `target_sha`를 입력하면 repository에 존재하는 정확한 40자리 commit SHA를 사용하고, 비워 두면 preflight가 최신 `main` commit을 immutable target으로 고정한다. Workflow definition ref와 release target SHA를 항상 구분해 기록한다.

Canonical manifest는 현재 `{ "runtimes": { "runtime": "sha256:..." } }`만 저장한다. Source SHA와 build run은 artifact가 연결된 GitHub Docker Build run이 소유한다. 후속 PROD-831 runtime 분리에서는 `runtimes` map을 `web`, `api`, `worker`, `fedify-consumer`, `migration`으로 확장한다.

`main`, `sha-*`, `stable` 등 mutable tag와 승인 시점의 최신 main ref는 release identity가 아니다. Rollback도 DB와 호환되는 full SHA의 검증된 canonical artifact를 선택하는 forward release다.

## 첫 전환 준비

1. 현재 `main`, 기존 production Argo source revision·image digest·migration 상태를 read-only로 대조한다. production에만 존재하는 hotfix는 먼저 `main`에 수렴시킨다.
2. `prod` Environment required reviewer와 main workflow의 deployment policy를 설정하고 모든 workflow_dispatch release가 `production-release` concurrency 경계를 공유하는지 확인한다.
3. Vault OIDC trust에는 exact `repo:byulmaru/kosmo:environment:prod` identity만 허용한다. `production` branch와 tag identity는 release source가 아니다.
4. Production runtime public config는 승인 후 Argo Helm parameter 또는 environment Secret으로 주입한다. Browser 공개 OpenPanel client ID는 image build arg가 아니며, server secret·session·database·confidential OIDC 값은 runtime config로 노출하지 않는다.
5. 첫 release에서 preflight summary의 target SHA·canonical build run·digest manifest를 확인하고, 승인 후 Argo source revision·migration barrier·workload digest를 대조한다.

GitHub Environment, OIDC trust, Vault ACL과 Argo Application 상태는 live API/workflow 결과로 확인한다. 저장소 문서나 green CI는 production 완료 증거가 아니다.

## Main dev build and workflow_dispatch production release

1. `main` push가 `Docker Build`를 시작한다. Build는 production Vault/Argo credential 없이 `SENTRY_RELEASE=kosmo@<full SHA>`로 source map을 업로드하고 environment-neutral image를 GHCR에 게시한다.
2. Build 성공 후 `Deploy Dev`가 같은 workflow run의 manifest에서 digest를 읽어 `kosmo-dev`에 source SHA와 `imageDigest`를 설정한다. Migration Job과 API·Web·Worker·Fedify workload는 chart의 같은 digest를 사용한다.
3. Production release는 `main` ref의 `workflow_dispatch`로만 시작한다. `target_sha`를 입력하면 해당 full SHA를, 비워 두면 최신 `main` full SHA를 고정하고 성공한 main `Docker Build` run과 non-expired manifest를 찾는다. 없으면 approval 전에 실패한다.
4. Reviewer는 preflight summary와 `prod` Environment 화면에서 workflow definition ref, target SHA, canonical build run, exact digest와 migration compatibility를 확인한 뒤 한 번 승인한다.
5. 승인 job은 preflight output으로 고정된 digest를 사용하며 target code를 checkout하거나 image를 다시 build하지 않는다. Production Application에 `version`, `imageDigest`, runtime public config와 `migration.enabled=true`를 한 번에 설정한다.
6. Migration Job이 성공하고 Application이 Healthy가 된 뒤 API·Web·Worker·Fedify workload의 source revision과 Helm `imageDigest`가 expected 값과 일치하는지 확인한다.
7. [Production migration 실행 경계](./production-migrations.md)의 postflight와 [OpenPanel 제품 분석 운영](./openpanel.md), [Sentry 오류 수집 운영](./sentry.md)의 배포 후 검증을 별도 evidence로 남긴다.

Production job에는 target checkout, Docker Buildx, `docker/build-push-action`, production Sentry DSN Vault lookup 또는 `SENTRY_AUTH_TOKEN` build input이 없다. Approval은 이미 검증된 artifact의 production mutation만 gate한다.

## Runtime public config

Web BFF의 `/runtime-config.json`은 pod의 allowlist된 환경값에서 생성되는 same-origin `no-store` JSON이다. Helm Web Rollout은 `EXPO_PUBLIC_SENTRY_DSN`과 `ENVIRONMENT`를 runtime Secret에서 받고, production approval 뒤 `runtimeConfig.openPanelClientId`를 Argo parameter로 주입한다. 값이 없으면 OpenPanel은 disabled 상태이며 image artifact에는 client ID가 들어가지 않는다. Hashed JavaScript·HTML·gzip 파일을 container startup에서 치환하지 않는다.

## Migration과 rollback

Migration은 현재 PostgreSQL Cluster의 generated `<cluster>-app` Secret으로 owner `kosmo`에 직접 연결하고 active API·Web·Worker·Fedify workload는 `kosmo_runtime`을 사용한다. `migration.enabled=true`가 없거나 production `imageDigest`가 유효하지 않으면 Helm render가 실패한다. Migration 성공 전 workload를 별도 활성화하지 않는다.

Rollback은 database state나 migration history를 되돌리지 않는다.

1. 장애 원인과 현재 schema compatibility를 확인한다.
2. 가장 일반적인 경로는 DB-compatible revert를 `main`에 merge해 새 canonical artifact를 만들고 dev 검증 후 `prod` 승격하는 것이다.
3. 긴급하면 이미 보존된 호환 full SHA와 canonical manifest를 manual release로 선택한다. Artifact가 없으면 임의 tag나 환경별 재build로 우회하지 않는다.
4. Destructive migration 또는 schema 비호환이면 [Production PostgreSQL backup과 복구](./postgres-backup.md)의 forward migration·restore 판단을 따른다.

## 완료·실패 판단

Release는 다음 evidence tier를 각각 기록해야 한다.

- PR/CI: workflow syntax, canonical artifact 소비, Helm render와 repository checks
- Dev runtime: canonical build run, target SHA, Argo dev digest/revision, migration/workload health
- Production: reviewer approval, exact canonical digest, prod runtime config, migration result, Argo revision/health, Sentry/OpenPanel smoke

Build 성공, approval, Argo sync와 live browser telemetry는 서로 대체할 수 없다. Production mutation 또는 migration이 실패하면 기존 workload를 유지하고 원인을 수정한 새 forward release를 만든다. 직접 Argo sync, tag release, branch dispatch와 DB rollback으로 우회하지 않는다.
