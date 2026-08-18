## Context

현재 `.github/workflows/docker-build.yml`은 `main`과 `production` push를 한 workflow에서 처리하고 ref에 따라 dev/prod build input을 선택한다. `production` build 뒤 같은 workflow의 deploy job이 추가 Environment 승인 없이 Argo CD source와 image digest를 설정한다. Dev는 별도 `Deploy Dev` workflow가 main Docker Build 전체 완료를 기다린 뒤 sync한다.

`PROD-783`은 main merge를 기본 production source로 만들면서 dev 자동 배포를 유지하고, main이 아닌 정확한 commit SHA도 예외적으로 승인해 배포할 수 있게 한다. Main source라도 production checkout·Vault/ECR/Sentry credential 접근·prod build는 `prod` Environment 승인 뒤로 미루며, automatic과 manual 모두 승인 뒤 하나의 gated job에서 build와 deploy를 연속 실행한다.

## Goals / Non-Goals

**Goals:**

- Main push의 dev build·배포를 지연시키지 않고 production release 승인 대기만 별도로 만든다.
- Automatic main release는 Environment 승인 뒤 같은 gated job에서 main SHA를 checkout하고 prod image를 build한 뒤 같은 SHA와 digest로 배포한다.
- Manual release는 main의 workflow 정의와 정확한 target SHA를 분리하고 승인 전에 target code를 실행하지 않는다.
- Migration wave barrier, controller activation, immutable source/digest와 실행 중 release 보존을 유지한다.
- Production branch와 Git tag를 release source·승인·rollback 경계에서 제거한다.

**Non-Goals:**

- Dev/prod image를 하나로 합치거나 Expo Web 공개 설정을 runtime config로 전환하는 작업
- Dev 자동 배포 제거 또는 server runtime secret 통합
- Branch 이름, Git tag나 mutable image tag를 manual target으로 허용하는 작업
- Database down migration, 자동 schema rollback과 Native store·OTA release 변경

## Implementation Guidance

### Current Constraints

- Docker image는 `EXPO_PUBLIC_ENVIRONMENT`, 환경별 Sentry DSN과 OpenPanel client ID를 build 때 Web bundle에 포함한다. 같은 SHA라도 dev/prod build를 분리해야 현재 observability·analytics 경계를 유지할 수 있다.
- 기존 Docker Build workflow에 production approval job을 그대로 추가하면 `workflow_run`을 사용하는 Deploy Dev와 Trivy가 전체 workflow 완료, 즉 Environment 승인까지 기다리게 된다.
- Dev와 prod build가 같은 SHA metadata tag를 동시에 push하면 서로 다른 image가 같은 mutable `sha-*` tag를 덮어쓸 수 있다.
- Production build가 승인 뒤로 이동하므로 승인 대기 중 prod image와 `stable` 보존 표식은 존재하지 않는다. 승인된 release가 성공한 뒤에만 build digest를 `stable`로 보존한다.
- Environment를 참조하는 job의 GitHub OIDC subject는 branch ref가 아니라 `environment:prod`가 된다. Automatic과 manual production build는 모두 이 exact subject를 공유한다.
- `kosmo-prod`의 Terraform bootstrap source는 `production`이지만 release workflow는 full SHA와 Helm parameter를 imperative overlay로 소유한다. 좁은 `ignore_changes`는 유지하면서 bootstrap ref만 바꿔야 한다.
- Active `adopt-production-release-branch` change가 같은 capability의 obsolete production branch delta와 미완료 live task를 가진다. 새 delta를 적용한 뒤 과거 delta가 다시 sync되지 않도록 superseded 생명주기를 명시해야 한다.

### Recommended Approach

1. 기존 Docker Build와 Deploy Dev는 main의 dev build·배포 전용으로 남기고 `production` trigger와 prod 조건을 제거한다. Dev artifact tag는 production release metadata와 충돌하지 않는 suffix를 사용하고 Trivy용 digest artifact는 유지한다.
2. 별도 Production Release workflow가 `push: main`과 `workflow_dispatch`를 처리한다. Production job에만 `prod` Environment를 걸어 Dev workflow 완료와 보안 scan을 막지 않으면서 production 전체 경계를 승인 뒤로 이동한다.
3. Main push 경로는 event full SHA와 release metadata만 승인 job에 전달하고 production source를 checkout하거나 Vault/ECR/Sentry credential을 요청하지 않는다. `prod` Environment 승인 뒤 하나의 gated job이 main full SHA를 checkout하고 prod Vault role·ECR login·Sentry upload secret을 얻어 image를 build한다.
4. Automatic gated job은 build output digest를 같은 job의 migration-gated Argo sync에 전달하고, Argo source를 main full SHA로 고정해 revision을 검증한다. Sync와 post-deploy 검증이 성공한 뒤에만 같은 digest에 `stable` 보존 tag를 이동한다.
5. Manual dispatch는 workflow ref가 main인지와 입력이 40자리 SHA인지 먼저 확인하고 GitHub commit API로 repository object를 해석한다. Preflight output을 Environment URL과 job 이름에 사용해 reviewer가 실제 target commit을 확인할 수 있게 한다.
6. Manual gated job은 승인 뒤 target SHA를 checkout하고 prod image를 build한 뒤 같은 job에서 digest-pinned Argo sync·revision 검증과 성공한 digest의 `stable` 이동을 수행한다. `SENTRY_RELEASE`, checkout, Helm version과 Argo revision은 dispatch workflow의 `github.sha`가 아니라 resolved target SHA를 사용한다.
7. Automatic과 manual deploy는 하나의 production concurrency group을 공유하고 실행 중 job을 취소하지 않는다. Native queue가 이전 pending job을 최신 pending job으로 대체하면 취소 기록을 남기고 필요 시 해당 SHA release를 다시 실행한다.
8. ECR OIDC trust와 외부 Vault prod build role은 automatic과 manual gated build가 사용하는 exact `repo:byulmaru/kosmo:environment:prod` identity만 허용한다. main ref, `refs/heads/production`, tag와 일반 branch identity는 허용하지 않는다.
9. Terraform의 `kosmo-prod` bootstrap revision을 main으로 바꾸되 release-time full SHA와 Helm parameter ignore 경계는 유지한다. GitHub `prod` Environment에는 required reviewer를 설정하고 main workflow에서 시작되는 automatic/manual gated job을 허용한다.
10. Runbook과 audit summary는 automatic main과 manual target을 구분하고 target SHA, build digest, Argo revision, migration/workload와 smoke 결과를 기록한다.

### Allowed Alternatives

- Production Release를 automatic과 manual 두 workflow로 나눌 수 있다. 두 workflow가 main에 저장된 정의, 동일한 immutable identity·approval·migration·concurrency·audit 계약을 공유하고 drift 검증을 제공하면 허용한다.
- 승인된 digest의 ECR `stable` 이동은 Argo sync 직후 별도 step 또는 별도 승인 후속 job에서 수행할 수 있다. Production sync 실패 때 기존 production 보존 표식을 유지하고 mutable tag를 deploy input으로 사용하지 않아야 한다.

### Known Traps

- 기존 Docker Build 전체에 `environment: prod`를 붙여 dev build·Deploy Dev까지 승인 대기시키지 않는다.
- Main dev image를 production에 배포하거나 prod image를 dev의 mutable `main` tag로 발행하지 않는다.
- Manual dispatch의 `github.sha`를 target SHA로 오인하지 않는다.
- Automatic main을 포함한 모든 production target을 승인 전에 checkout하거나 target Dockerfile에 Sentry upload token·Vault output·registry credential을 제공하지 않는다.
- Environment approval 화면에는 workflow ref main만 보이게 두지 말고 resolved target commit URL과 SHA를 함께 노출한다.
- 승인 전에는 production image를 build하거나 `stable`을 이동하지 않으며, Argo가 mutable `main`, `stable` 또는 `production` ref를 다시 해석하게 하지 않는다.
- Workflow trigger만 바꾸고 ECR/Vault의 production branch trust, Terraform bootstrap revision과 GitHub Environment policy를 남기지 않는다.
- Obsolete `adopt-production-release-branch` delta를 새 active spec 위에 나중에 archive해 production branch 계약을 복원하지 않는다.

## Risks / Trade-offs

- [승인된 main release마다 dev와 prod image를 별도 build해 runner와 registry 비용이 증가한다] → 환경별 Web build 설정을 유지하기 위한 의도된 비용으로 기록하고, runtime config 전환은 별도 이슈 없이 이번 범위에 끼워 넣지 않는다.
- [승인 뒤 production build 또는 deploy가 실패할 수 있다] → 같은 immutable main SHA에 대해 원인을 수정하거나 재실행하고, build digest가 없는 경우에는 production 상태를 변경하지 않는다.
- [Native concurrency는 실행 중 하나와 pending 하나만 보존해 중간 approved release request를 대체할 수 있다] → 실행 중 release는 절대 취소하지 않고 취소된 SHA·trigger를 감사 기록에서 식별하며 필요한 release는 manual 경로로 다시 실행한다.
- [Manual reviewer가 workflow ref main과 실제 target SHA를 혼동할 수 있다] → 승인 UI의 environment URL, job name과 preflight summary에 resolved commit을 표시한다.
- [Production branch에서만 존재하던 hotfix가 main 전환 때 누락될 수 있다] → live cutover 전에 main/production ancestry와 diff를 확인하고 필요한 변경을 main에 먼저 수렴시킨다.
- [Vault role과 GitHub Environment는 저장소 밖 상태다] → repository PR과 별개로 owner·적용 순서·exact Environment OIDC login과 Environment API 증거를 완료 gate로 남긴다.

## Migration Plan

1. 현재 main, production, 마지막 성공 production Argo source·digest와 migration 상태를 read-only로 대조하고 production-only commit을 식별한다.
2. Main에 필요한 hotfix를 먼저 반영하고 repository workflow, Terraform, OpenSpec과 runbook 변경을 PR로 전달한다.
3. Workflow cutover에 맞춰 ECR/Vault OIDC trust를 exact `environment:prod` identity로 수렴하고 main ref·production branch·tag identity를 제거한다. 적용 전후 owner와 rollback 경계를 기록한다.
4. GitHub `prod` Environment required reviewer와 deployment policy를 설정하고 API로 live 상태를 확인한다.
5. Main merge 후 dev build·Deploy Dev와 production approval 대기 job을 확인한다. 승인 전에는 production checkout·credential·build·Argo mutation이 없음을 확인하고, reviewer가 main SHA, chart diff와 migration compatibility를 검토한다.
6. 첫 main release를 승인해 gated job의 main SHA checkout·prod build·migration-gated production sync 순서, Argo source/digest, workload health와 public smoke를 확인한다. 성공 뒤에만 `stable` 보존 tag를 확인한다.
7. 호환 가능한 비-main SHA로 manual preflight·approval·build·deploy 경로를 검증한다. 실제 production mutation이 불필요하면 별도 승인된 검증 SHA와 시점을 사용하며 CI만으로 live 증거를 대체하지 않는다.
8. Production branch workflow·OIDC 참조가 없음을 확인한 뒤 branch ruleset/branch 폐기는 별도 명시적 운영 승인을 받아 수행한다.
9. `adopt-production-release-branch`의 남은 task를 superseded로 기록하고 obsolete delta를 active spec에 적용하지 않는 방식으로 archive한 뒤, 이 change의 delta를 최종 active `production-release` spec에 동기화한다.

Rollback은 새 workflow cutover 전에는 기존 production branch 경로를 유지한다. 첫 main release 뒤에는 DB-compatible revert를 main에 merge하거나 호환 가능한 full SHA를 manual 승인해 forward release로 배포하며 database history를 되돌리지 않는다.

## Open Questions

없음.
