## Context

현재 `.github/workflows/docker-build.yml`은 `main`과 `production` push를 한 workflow에서 처리하고 ref에 따라 dev/prod build input을 선택한다. `production` build 뒤 같은 workflow의 deploy job이 추가 Environment 승인 없이 Argo CD source와 image digest를 설정한다. Dev는 별도 `Deploy Dev` workflow가 main Docker Build 전체 완료를 기다린 뒤 sync한다.

`PROD-783`은 main merge를 기본 production 후보로 만들면서 dev 자동 배포를 유지하고, main이 아닌 정확한 commit SHA도 예외적으로 승인해 배포할 수 있게 한다. Main source는 보호된 workflow와 merge된 code이므로 production candidate를 승인 전에 build할 수 있지만, 임의 SHA는 Dockerfile을 포함한 code가 신뢰되지 않을 수 있어 target checkout과 build 자체를 Environment 승인 뒤로 미뤄야 한다.

## Goals / Non-Goals

**Goals:**

- Main push의 dev build·배포를 지연시키지 않고 같은 SHA의 production candidate를 별도로 준비한다.
- Automatic main candidate는 build digest를 보존한 채 Environment 승인 뒤 같은 SHA와 digest로 배포한다.
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
- 현재 prod build는 승인 전에 `stable`을 이동한다. Main의 모든 candidate가 이 동작을 하면 미승인 candidate가 현재 production image의 ECR lifecycle 보존 표식을 빼앗는다.
- Environment를 참조하는 job의 GitHub OIDC subject는 branch ref가 아니라 `environment:prod`가 된다. Automatic pre-approval build와 manual gated build는 서로 다른 OIDC subject를 사용한다.
- `kosmo-prod`의 Terraform bootstrap source는 `production`이지만 release workflow는 full SHA와 Helm parameter를 imperative overlay로 소유한다. 좁은 `ignore_changes`는 유지하면서 bootstrap ref만 바꿔야 한다.
- Active `adopt-production-release-branch` change가 같은 capability의 obsolete production branch delta와 미완료 live task를 가진다. 새 delta를 적용한 뒤 과거 delta가 다시 sync되지 않도록 superseded 생명주기를 명시해야 한다.

### Recommended Approach

1. 기존 Docker Build와 Deploy Dev는 main의 dev build·배포 전용으로 남기고 `production` trigger와 prod 조건을 제거한다. Dev artifact tag는 prod candidate와 충돌하지 않는 suffix를 사용하고 Trivy용 digest artifact는 유지한다.
2. 별도 Production Release workflow가 `push: main`과 `workflow_dispatch`를 처리한다. 분리하면 automatic production approval 대기가 Dev workflow 완료와 보안 scan을 막지 않는다.
3. Main push 경로는 full event SHA를 checkout해 prod Vault role, prod public build args와 repository Sentry upload secret으로 candidate image를 build한다. Candidate에는 SHA 기반 prod tag만 발행하고 `stable`은 발행하지 않는다. Output digest와 SHA를 Environment deploy job에 직접 전달한다.
4. Automatic deploy job은 `environment: prod`와 공용 production concurrency를 사용한다. 승인 뒤 Argo CD source를 candidate full SHA로, image parameter를 candidate digest로 설정해 migration-gated sync와 revision 검증을 수행한다. 성공 뒤 같은 ECR digest에 `stable` 보존 tag를 이동한다.
5. Manual dispatch는 workflow ref가 main인지와 입력이 40자리 SHA인지 먼저 확인하고 GitHub commit API로 repository object를 해석한다. Preflight output을 Environment URL과 job 이름에 사용해 reviewer가 실제 target commit을 확인할 수 있게 한다.
6. Manual gated job은 승인 뒤 target SHA를 checkout하고 prod image를 build한 뒤 같은 job에서 digest-pinned Argo sync·revision 검증과 성공한 digest의 `stable` 이동을 수행한다. `SENTRY_RELEASE`, checkout, Helm version과 Argo revision은 dispatch workflow의 `github.sha`가 아니라 resolved target SHA를 사용한다.
7. Automatic과 manual deploy는 하나의 production concurrency group을 공유하고 실행 중 job을 취소하지 않는다. Native queue가 이전 pending job을 최신 pending job으로 대체하면 취소 기록을 남기고 필요 시 해당 SHA release를 다시 실행한다.
8. ECR OIDC trust와 외부 Vault prod build role은 automatic main build의 `ref:refs/heads/main`과 manual gated build의 `environment:prod` identity만 허용한다. `refs/heads/production` trust는 제거한다.
9. Terraform의 `kosmo-prod` bootstrap revision을 main으로 바꾸되 release-time full SHA와 Helm parameter ignore 경계는 유지한다. GitHub `prod` Environment에는 required reviewer를 설정하고 main workflow에서 시작되는 automatic/manual deployment를 허용한다.
10. Runbook과 audit summary는 automatic main과 manual target을 구분하고 target SHA, build digest, Argo revision, migration/workload와 smoke 결과를 기록한다.

### Allowed Alternatives

- Production Release를 automatic과 manual 두 workflow로 나눌 수 있다. 두 workflow가 main에 저장된 정의, 동일한 immutable identity·approval·migration·concurrency·audit 계약을 공유하고 drift 검증을 제공하면 허용한다.
- 승인된 digest의 ECR `stable` 이동은 Argo sync 직후 별도 step 또는 별도 승인 후속 job에서 수행할 수 있다. Production sync 실패 때 기존 production 보존 표식을 유지하고 mutable tag를 deploy input으로 사용하지 않아야 한다.

### Known Traps

- 기존 Docker Build 전체에 `environment: prod`를 붙여 dev build·Deploy Dev까지 승인 대기시키지 않는다.
- Main dev image를 production에 배포하거나 prod candidate image를 dev의 mutable `main` tag로 발행하지 않는다.
- Manual dispatch의 `github.sha`를 target SHA로 오인하지 않는다.
- Manual target을 승인 전에 checkout하거나 target Dockerfile에 Sentry upload token·Vault output·registry credential을 제공하지 않는다.
- Environment approval 화면에는 workflow ref main만 보이게 두지 말고 resolved target commit URL과 SHA를 함께 노출한다.
- Candidate build 때 `stable`을 이동하거나 Argo가 mutable `main`, `stable` 또는 `production` ref를 다시 해석하게 하지 않는다.
- Workflow trigger만 바꾸고 ECR/Vault의 production branch trust, Terraform bootstrap revision과 GitHub Environment policy를 남기지 않는다.
- Obsolete `adopt-production-release-branch` delta를 새 active spec 위에 나중에 archive해 production branch 계약을 복원하지 않는다.

## Risks / Trade-offs

- [Main merge마다 dev와 prod image를 별도 build해 runner와 registry 비용이 증가한다] → 환경별 Web build 설정을 유지하기 위한 의도된 비용으로 기록하고, runtime config 전환은 별도 이슈 없이 이번 범위에 끼워 넣지 않는다.
- [승인 대기 candidate가 registry lifecycle 기간을 넘길 수 있다] → 승인 시 digest가 없으면 배포하지 않고 해당 main SHA를 manual release로 다시 build·승인한다.
- [Native concurrency는 실행 중 하나와 pending 하나만 보존해 중간 approved candidate를 대체할 수 있다] → 실행 중 release는 절대 취소하지 않고 취소된 SHA·trigger를 감사 기록에서 식별하며 필요한 candidate는 manual 경로로 다시 실행한다.
- [Manual reviewer가 workflow ref main과 실제 target SHA를 혼동할 수 있다] → 승인 UI의 environment URL, job name과 preflight summary에 resolved commit을 표시한다.
- [Production branch에서만 존재하던 hotfix가 main 전환 때 누락될 수 있다] → live cutover 전에 main/production ancestry와 diff를 확인하고 필요한 변경을 main에 먼저 수렴시킨다.
- [Vault role과 GitHub Environment는 저장소 밖 상태다] → repository PR과 별개로 owner·적용 순서·live OIDC login과 Environment API 증거를 완료 gate로 남긴다.

## Migration Plan

1. 현재 main, production, 마지막 성공 production Argo source·digest와 migration 상태를 read-only로 대조하고 production-only commit을 식별한다.
2. Main에 필요한 hotfix를 먼저 반영하고 repository workflow, Terraform, OpenSpec과 runbook 변경을 PR로 전달한다.
3. ECR/Vault OIDC trust에 main automatic과 Environment-gated manual identity를 추가하되 production branch trust 제거는 새 workflow merge와 함께 순서를 맞춘다.
4. GitHub `prod` Environment required reviewer와 deployment policy를 설정하고 API로 live 상태를 확인한다.
5. Main merge 후 dev build·Deploy Dev와 prod candidate build를 확인한다. 첫 candidate를 승인하기 전에 SHA, digest, chart diff와 migration compatibility를 검토한다.
6. 첫 main candidate를 승인해 migration-gated production sync, Argo source/digest, workload health와 public smoke를 확인한다. 성공 뒤 `stable` 보존 tag를 확인한다.
7. 호환 가능한 비-main SHA로 manual preflight·approval·build·deploy 경로를 검증한다. 실제 production mutation이 불필요하면 별도 승인된 검증 SHA와 시점을 사용하며 CI만으로 live 증거를 대체하지 않는다.
8. Production branch workflow·OIDC 참조가 없음을 확인한 뒤 branch ruleset/branch 폐기는 별도 명시적 운영 승인을 받아 수행한다.
9. `adopt-production-release-branch`의 남은 task를 superseded로 기록하고 obsolete delta를 active spec에 적용하지 않는 방식으로 archive한 뒤, 이 change의 delta를 최종 active `production-release` spec에 동기화한다.

Rollback은 새 workflow cutover 전에는 기존 production branch 경로를 유지한다. 첫 main release 뒤에는 DB-compatible revert를 main에 merge하거나 호환 가능한 full SHA를 manual 승인해 forward release로 배포하며 database history를 되돌리지 않는다.

## Open Questions

없음.
