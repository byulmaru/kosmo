# Production release 운영

이 문서는 `main`에 저장된 production release workflow의 운영 절차를 정의한다. `main` push마다 canonical Docker Build가 이미지를 한 번 build·push하고, 같은 run에 보존된 immutable digest manifest artifact를 발행한다. Dev는 해당 Docker Build run의 digest를 사용해 자동 배포한다. Production release는 merge·push event에서 시작하지 않고 `main` ref의 `workflow_dispatch`로만 요청하며, preflight가 target SHA에 해당하는 성공한 canonical Docker Build와 보존된 digest manifest artifact를 검증한다. `prod` GitHub Environment의 required reviewer가 승인한 뒤에는 검증된 같은 digest를 Argo CD와 migration에 전달해 production 상태만 변경한다. Production에서 source checkout·image build·재-push·Sentry source map upload는 수행하지 않는다.

Production image는 별도 build가 아니다. `main`의 canonical Docker Build가 Sentry release/source map upload와 함께 생성한 immutable digest를 Dev와 Production이 공유한다. Preflight는 target full SHA, 성공한 main push Docker Build run과 그 run에 보존된 digest manifest artifact를 승인 전에 고정하고, 승인 뒤 gated job은 해당 digest만 Argo CD와 migration·workload에 전달한다.

별도 production branch나 Git tag는 production source, approval, rollback selector가 아니다. Main에 저장된 production release workflow를 `main` ref에서 `workflow_dispatch`로 실행하면 `target_sha`를 선택적으로 입력할 수 있다. 입력하면 repository에 존재하는 정확한 40자리 commit SHA를 사용하고, 비워 두면 preflight가 실행 시점의 최신 `main` commit을 조회해 immutable target SHA로 고정한다. Preflight는 그 SHA의 성공한 canonical main Docker Build run과 보존된 digest manifest artifact까지 확인하고, `prod` 승인 뒤에는 target을 다시 build하지 않고 고정된 digest를 배포한다. Workflow definition ref(`main`)와 release target SHA를 항상 구분해 기록한다.

`prod` Environment 승인은 해당 release를 시작하도록 허가하는 유일한 production 상태 변경 승인이다. 별도의 migration approval, dispatch 승인 또는 직접 Argo sync로 우회하지 않는다. `Prune=confirm` 리소스의 삭제 대상 확인은 이 release 승인을 대체하거나 새로운 release 권한을 부여하는 두 번째 승인이 아니라, 이미 승인된 release 안에서 보호 리소스의 정확한 삭제 범위를 확인하는 scoped confirmation이다. GitHub Environment, OIDC trust와 branch 폐기는 저장소 문서나 green CI가 아니라 live GitHub/Vault/API 결과로 확인한다.

## 첫 전환 준비

1. 현재 `main`, 기존 `production` 계보, 마지막 성공 production Argo source·digest와 migration 상태를 read-only로 대조한다. production에만 존재하는 hotfix가 있으면 먼저 `main`에 수렴시킨다.
2. Main에 workflow, Terraform, OpenSpec과 운영 문서 변경을 PR로 전달하고 repository checks를 통과시킨다.
3. Vault OIDC trust에 exact `repo:byulmaru/kosmo:environment:prod` identity만 적용한다. `production` branch와 tag identity는 유효한 release 경로가 준비된 뒤 제거한다.
4. `prod` Environment에 required reviewer와 main workflow의 deployment policy를 설정한다. `target_sha` 입력이 없는 dispatch와 명시적 SHA dispatch가 같은 production concurrency 경계를 사용하도록 확인한다.
5. 첫 dispatch release에서 canonical main build·dev digest 배포와 production approval을 분리하고, 승인 전 prod checkout·credential·build 부재와 승인 후 동일 digest·migration barrier를 확인한다.
6. 첫 production release와 rollback path가 검증된 뒤, production branch ruleset/branch 폐기는 별도 명시적 운영 승인을 받아 수행한다. branch 삭제와 OpenSpec archive를 CI 통과만으로 완료 처리하지 않는다.

설정 뒤 GitHub Environment protection rules·deployment policy, OIDC subject, Vault login과 Argo Application 상태를 실제 API/workflow 출력으로 기록한다. live 전환 evidence는 저장소 문서나 local validation으로 대신 증명하지 않는다.

## Release 계약

- `main` push의 canonical Docker Build는 이미지를 한 번 push하고 같은 run에 보존된 immutable digest manifest artifact를 남긴다. Dev는 해당 build run의 digest로 자동 배포한다. Production release는 `main` ref의 `workflow_dispatch`로만 요청하며, `target_sha`를 생략하면 preflight가 실행 시점의 최신 `main` commit을 target으로 고정한다.
- Production workflow_dispatch의 preflight는 target SHA에 해당하는 성공한 main push Docker Build run과 그 run에 보존된 digest manifest artifact를 검증한다. 승인 전에는 production source checkout, prod credential 접근과 image build를 하지 않으며, 승인 뒤 gated job은 preflight가 확정한 target SHA·digest를 checkout이나 재해석 없이 Argo CD와 migration·workload에 직접 전달한다.
- Production Web build는 별도로 수행하지 않는다. Canonical Docker Build는 공개 client 설정을 Vault나 GitHub Variables에서 주입하지 않고 코드의 채널 설정표를 번들에 포함한다. Sentry organization·project, canonical build의 resolved target SHA 기반 release metadata와 upload credential도 canonical build에만 전달한다. Web runtime의 `ENVIRONMENT`는 Helm의 `dev`/`prod` 값에서 제공되고 BFF의 same-origin `/channel.js`가 이를 검증해 bundle보다 먼저 전달한다.
- Dispatch release는 `main`에 저장된 workflow를 `main` ref에서 실행해야 한다. `target_sha`를 입력하면 repository에 존재하는 정확한 40자리 SHA를 사용하고, 비워 두면 최신 `main`의 full SHA를 사용한다. Preflight는 target의 canonical build run과 그 run에 보존된 digest manifest artifact를 승인 전에 검증하고, `prod` 승인 뒤에는 target SHA와 같은 immutable digest를 재빌드 없이 배포한다.
- Production migration Job과 모든 활성화 workload는 Dev와 공유하는 하나의 canonical immutable digest를 사용하고, Argo CD Helm source는 같은 release target full SHA를 사용한다. Dev digest와 production digest가 달라지는 경로는 허용하지 않는다.
- Canonical Docker Build만 GHCR에 image와 digest manifest를 push한다. Production release는 그 build output의 immutable GHCR digest를 Argo CD에 직접 전달하며, production에서 image를 재-push하지 않는다.
- Production 배포는 `prod` Environment의 한 번의 required reviewer 승인으로 보호한다. 같은 승인 이후 migration 성공 때만 API·Web Rollout·HPA와 background Deployment를 활성화한다. 상세 경계는 [Production migration 실행 경계](./production-migrations.md)를 따른다.
- Migration은 현재 PostgreSQL Cluster의 generated `<cluster>-app` Secret으로 owner `kosmo`에 직접 로그인하고, active API·Web·Worker·Fedify workload는 `kosmo_runtime`를 사용한다. `kosmo_migration` role, migration Vault/VSO source, `DATABASE_MIGRATION_ROLE`과 `SET ROLE` 경계는 production release에 포함하지 않는다.
- Production migration preflight·postflight는 backup/WAL, active principal, CNPG/catalog와 workload readiness를 확인하는 별도 evidence gate다. 둘 중 어느 것도 `prod` Environment required reviewer의 별도 승인을 대체하지 않는다.
- Git tag push, `production` branch push와 일반 branch push는 production release·승인·배포를 시작하지 않는다. Git tag나 mutable image tag를 source selector 또는 workload identity로 사용하지 않는다.
- Workflow_dispatch production release는 공용 concurrency group을 사용한다. 실행 중인 release는 취소하지 않으며, 여러 pending release는 최신 pending release로 대체할 수 있다. 대체된 SHA·trigger는 Actions 취소 기록으로 식별하고 필요한 경우 다시 승인한다.

## Main dev build and workflow_dispatch production release

1. `main` merge 후 canonical Docker workflow가 이미지를 한 번 build해 GHCR에 push하고 같은 run에 보존된 digest manifest artifact를 발행한다. 기존 `Deploy Dev` 경로는 그 triggering run의 full SHA와 digest를 사용해 배포하며 production approval이나 production 배포를 시작하지 않는다. Production release는 `main`에 저장된 release workflow를 `main` ref에서 `workflow_dispatch`로 실행할 때만 시작한다.
2. Dev 배포가 canonical run의 digest를 사용하고, production dispatch를 실행하기 전에도 production source checkout, prod credential 접근과 production image build가 없어야 한다.
3. `target_sha`를 입력하면 preflight가 정확한 40자리 repository commit인지 확인하고, 해당 SHA의 성공한 main push Docker Build run과 그 run에 보존된 digest manifest artifact를 고정한다. 입력을 비워 두면 preflight가 실행 시점의 최신 `main` commit을 조회한 뒤 같은 검증을 수행한다. 두 경우 모두 target full SHA, build run, digest와 commit URL을 approval summary와 Environment 화면에 표시하고, dispatch의 `github.sha`나 mutable image tag를 source selector로 사용하지 않는다.
4. Reviewer는 workflow summary와 Environment 화면에서 workflow definition ref, preflight가 확정한 release full SHA·canonical build run·digest·chart diff·migration compatibility를 확인한 뒤 한 번 승인한다. 승인 전 preflight failure이면 production credential 접근·배포를 시작하지 않는다.
5. 승인 job은 target source를 checkout하거나 image를 build·push하지 않는다. Preflight가 확정한 canonical digest와 SHA를 audit summary에 기록하고 production Argo CD credential을 사용해 동일 digest를 지정한다.
6. 승인 job은 canonical digest를 Argo source revision 및 migration-gated sync에 고정한다. Migration 성공 뒤 controller가 API·Web Rollout·HPA와 background Deployment를 기본 activation한다.
7. Argo source revision, canonical GHCR digest, migration Job과 모든 활성화 workload가 일치하고 Healthy인지 확인한다.
8. [Production migration 실행 경계](./production-migrations.md)의 migration postflight와 [OpenPanel 제품 분석 운영](./openpanel.md), [Sentry 오류 수집 운영](./sentry.md)의 배포 후 검증과 public smoke를 실행한다.

## Production-first 변경

Production branch 대상 PR을 별도 release 경로로 만들지 않는다. Main에 아직 반영되지 않은 긴급 수정은 이 workflow로 직접 build·배포할 수 없다. 먼저 변경을 `main`에 반영해 성공한 canonical Docker Build run과 보존된 digest manifest artifact를 확보한 뒤, 그 full SHA를 `workflow_dispatch`의 `target_sha`로 선택해 preflight·승인을 거친다. Main merge 뒤에는 dev 자동 배포가 진행되고, production 반영이 필요할 때 `main` ref에서 workflow_dispatch를 실행한다. 직접 push, history rewrite, tag release와 직접 Argo sync는 허용하지 않는다.

## Rollback

Rollback은 과거 tag나 production branch를 다시 배포하거나 branch history를 되돌리는 작업이 아니다.

1. 장애 원인과 현재 production migration 상태를 확인하고, application 변경이 현재 DB schema와 호환되는지 판단한다.
2. 가장 일반적인 경로는 DB-compatible revert를 `main`에 merge하는 것이다. 새 main SHA가 canonical build와 dev에 자동 배포되고, production 반영이 필요하면 `main` ref에서 workflow_dispatch를 실행해 `target_sha`를 비워 최신 main을 선택한 뒤 preflight가 그 build digest를 확인하고 `prod` Environment 승인 후 같은 digest를 배포한다.
3. Main revert를 기다릴 수 없는 경우에도 production release는 main 밖의 commit을 직접 build하지 않는다. 호환 가능한 immutable commit을 먼저 `main`에 push해 성공한 canonical Docker Build run과 그 run에 보존된 미만료 digest manifest artifact를 확보한 뒤, 그 full SHA를 workflow_dispatch의 `target_sha`로 선택해 preflight 검증 후 `prod` 승인 뒤 해당 digest를 재빌드 없이 배포한다.
4. 어느 경로도 database state나 migration history를 down migration으로 되돌리지 않는다. Destructive migration 또는 schema 비호환이 관련되면 [Production PostgreSQL backup과 복구](./postgres-backup.md) 및 해당 schema migration runbook의 forward migration·restore 판단을 따른다.

replicas=0인 controller-retained historical owner ReplicaSet은 수동 삭제하거나 revision history를 축소하지 않는다. 해당 revision은 지원되는 rollback 대상이 아니며, 재활성화하면 owner credential을 다시 소비할 수 있다는 잔여 위험을 기록한다.

## 완료·실패 판단

Release는 다음을 모두 확인해야 완료로 기록한다.

- Trigger 종류, 요청자, workflow definition ref와 target full SHA가 확인된다.
- Workflow_dispatch release에서는 canonical main build, triggering run의 dev digest 배포, preflight, approval과 승인 후 digest-only production deploy 결과가 구분된다. Workflow summary에는 requester, workflow definition ref, trigger, canonical build run·digest와 preflight가 확정한 resolved target full SHA를 기록하고, 명시적 `target_sha` 입력과 dispatch의 `github.sha` 구분은 Actions run/event metadata에서 확인한다. Build·Argo·release audit 기록에는 resolved target SHA와 같은 digest를 사용한다.
- Argo source revision이 target full SHA이고, migration과 모든 활성화 production workload가 Dev와 같은 canonical immutable digest를 사용한다.
- Migration Job이 성공하고 API·Web Rollout·HPA와 background Deployment가 Healthy다.
- Migration preflight와 postflight가 각각 backup/WAL, owner 직접 연결, obsolete migration identity 부재와 active runtime principal을 확인한다.
- Production smoke와 OpenPanel/Sentry 배포 후 검증 결과가 기록된다.
- Git tag와 production branch가 source·approval·rollback 경계로 사용되지 않는다.

Preflight 또는 승인 후 migration·sync가 실패하면 production 상태를 변경하지 않거나 기존 workload를 유지한다. 원인을 수정한 main PR, DB-compatible revert PR 또는 승인된 workflow_dispatch SHA release로 canonical build 뒤 새 forward release를 실행한다. Production에서 image를 재빌드·재-push하지 않으며, tag push, 임의 branch dispatch, 직접 Argo sync와 DB rollback으로 우회하지 않는다.
