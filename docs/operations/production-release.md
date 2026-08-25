# Production release 운영

이 문서는 `main`에 저장된 production release workflow의 운영 절차를 정의한다. `main`에 merge된 각 commit은 dev image를 먼저 준비하고 dev에 자동 배포한다. Production release는 merge·push event에서 시작하지 않고 `main` ref의 `workflow_dispatch`로만 요청한다. `prod` GitHub Environment의 required reviewer가 한 번 승인한 뒤에 production source checkout·credential 접근·prod image build·production 상태 변경을 수행한다. `target_sha`를 생략해 최신 `main`을 target으로 선택한 경우에는 dev와 prod image가 같은 source SHA를 사용할 수 있지만, 명시적 target SHA dispatch에서는 서로 다른 source를 사용할 수 있다. 환경별 build 설정이 다르므로 두 image가 같은 digest일 필요는 없다.

Production build는 Environment 승인 뒤에만 시작한다. 승인 전에는 production source를 checkout하지 않고 prod Vault/Sentry credential에 접근하거나 prod image를 build하지 않는다. 승인 뒤 gated job이 release full SHA를 checkout하고 prod 설정을 읽어 GHCR image를 build한 뒤, build output digest와 같은 full SHA를 migration과 모든 production workload에 전달한다.

별도 production branch나 Git tag는 production source, approval, rollback selector가 아니다. Main에 저장된 production release workflow를 `main` ref에서 `workflow_dispatch`로 실행하면 `target_sha`를 선택적으로 입력할 수 있다. 입력하면 repository에 존재하는 정확한 40자리 commit SHA를 사용하고, 비워 두면 preflight가 실행 시점의 최신 `main` commit을 조회해 immutable target SHA로 고정한다. Dispatch 경로는 승인 전에 target의 존재와 identity만 검증하고, `prod` 승인 뒤에 target을 checkout하고 prod image를 build·배포한다. Workflow definition ref(`main`)와 release target SHA를 항상 구분해 기록한다.

`prod` Environment 승인은 해당 release를 시작하도록 허가하는 유일한 production 상태 변경 승인이다. 별도의 migration approval, dispatch 승인 또는 직접 Argo sync로 우회하지 않는다. `Prune=confirm` 리소스의 삭제 대상 확인은 이 release 승인을 대체하거나 새로운 release 권한을 부여하는 두 번째 승인이 아니라, 이미 승인된 release 안에서 보호 리소스의 정확한 삭제 범위를 확인하는 scoped confirmation이다. GitHub Environment, OIDC trust와 branch 폐기는 저장소 문서나 green CI가 아니라 live GitHub/Vault/API 결과로 확인한다.

## 첫 전환 준비

1. 현재 `main`, 기존 `production` 계보, 마지막 성공 production Argo source·digest와 migration 상태를 read-only로 대조한다. production에만 존재하는 hotfix가 있으면 먼저 `main`에 수렴시킨다.
2. Main에 workflow, Terraform, OpenSpec과 운영 문서 변경을 PR로 전달하고 repository checks를 통과시킨다.
3. Vault OIDC trust에 exact `repo:byulmaru/kosmo:environment:prod` identity만 적용한다. `production` branch와 tag identity는 유효한 release 경로가 준비된 뒤 제거한다.
4. `prod` Environment에 required reviewer와 main workflow의 deployment policy를 설정한다. `target_sha` 입력이 없는 dispatch와 명시적 SHA dispatch가 같은 production concurrency 경계를 사용하도록 확인한다.
5. 첫 dispatch release에서 dev build/deploy와 production approval을 분리하고, 승인 전 prod checkout·credential·build 부재와 승인 후 source SHA·digest·migration barrier를 확인한다.
6. 첫 production release와 rollback path가 검증된 뒤, production branch ruleset/branch 폐기는 별도 명시적 운영 승인을 받아 수행한다. branch 삭제와 OpenSpec archive를 CI 통과만으로 완료 처리하지 않는다.

설정 뒤 GitHub Environment protection rules·deployment policy, OIDC subject, Vault login과 Argo Application 상태를 실제 API/workflow 출력으로 기록한다. live 전환 evidence는 저장소 문서나 local validation으로 대신 증명하지 않는다.

## Release 계약

- `main` push의 immutable full SHA는 dev 자동 build·배포의 source다. Production release는 `main` ref의 `workflow_dispatch`로만 요청하며, `target_sha`를 생략하면 preflight가 실행 시점의 최신 `main` commit을 target으로 고정한다.
- Production workflow_dispatch는 승인 전에는 production source checkout, prod Vault/Sentry credential 접근과 prod image build를 하지 않는다. 승인 뒤 gated job이 preflight에서 확정한 target SHA를 checkout하고 GHCR에 prod image를 build한 digest를 migration·workload에 직접 전달한다. 승인 시점에 mutable tag나 다른 최신 `main`을 다시 해석하지 않는다.
- Dispatch release는 `main`에 저장된 workflow를 `main` ref에서 실행해야 한다. `target_sha`를 입력하면 repository에 존재하는 정확한 40자리 SHA를 사용하고, 비워 두면 최신 `main`의 full SHA를 사용한다. 승인 전에는 target code checkout·실행, prod secret/credential 접근과 build를 하지 않으며 `prod` 승인 뒤에만 target SHA checkout, prod build와 배포를 수행한다.
- Production migration Job과 모든 활성화 workload는 해당 release의 하나의 immutable prod digest를 사용하고, Argo CD Helm source는 같은 release target full SHA를 사용한다. Dev digest는 prod digest와 달라도 된다.
- Dev와 production image는 모두 GHCR에만 push한다. Production release는 build output의 immutable GHCR digest를 Argo CD에 직접 전달한다.
- Production 배포는 `prod` Environment의 한 번의 required reviewer 승인으로 보호한다. 같은 승인 이후 migration 성공 때만 API·Web Rollout·HPA와 background Deployment를 활성화한다. 상세 경계는 [Production migration 실행 경계](./production-migrations.md)를 따른다.
- Migration은 현재 PostgreSQL Cluster의 generated `<cluster>-app` Secret으로 owner `kosmo`에 직접 로그인하고, active API·Web·Worker·Fedify workload는 `kosmo_runtime`를 사용한다. `kosmo_migration` role, migration Vault/VSO source, `DATABASE_MIGRATION_ROLE`과 `SET ROLE` 경계는 production release에 포함하지 않는다.
- Production migration preflight·postflight는 backup/WAL, active principal, CNPG/catalog와 workload readiness를 확인하는 별도 evidence gate다. 둘 중 어느 것도 `prod` Environment required reviewer의 별도 승인을 대체하지 않는다.
- Git tag push, `production` branch push와 일반 branch push는 production release·승인·배포를 시작하지 않는다. Git tag나 mutable image tag를 source selector 또는 workload identity로 사용하지 않는다.
- Workflow_dispatch production release는 공용 concurrency group을 사용한다. 실행 중인 release는 취소하지 않으며, 여러 pending release는 최신 pending release로 대체할 수 있다. 대체된 SHA·trigger는 Actions 취소 기록으로 식별하고 필요한 경우 다시 승인한다.

## Main dev build and workflow_dispatch production release

1. `main` merge 후 Docker workflow가 full SHA의 dev image를 build해 GHCR에 push하고 기존 `Deploy Dev` 경로로 전달한다. 이 경로는 production approval이나 production 배포를 시작하지 않는다. Production release는 `main`에 저장된 release workflow를 `main` ref에서 `workflow_dispatch`로 실행할 때만 시작한다.
2. Dev 배포의 tag·digest·환경별 build arg가 올바른지 확인한다. Production dispatch를 실행하기 전에도 production source checkout, prod Vault/Sentry credential 접근과 prod image build가 없어야 한다.
3. `target_sha`를 입력하면 preflight가 정확한 40자리 repository commit인지 확인한다. 입력을 비워 두면 preflight가 실행 시점의 최신 `main` commit을 조회한다. 두 경우 모두 target full SHA와 commit URL을 approval summary와 Environment 화면에 표시하고, dispatch의 `github.sha`나 mutable image tag를 source selector로 사용하지 않는다.
4. Reviewer는 workflow summary와 Environment 화면에서 workflow definition ref, preflight가 확정한 release full SHA·chart diff·migration compatibility를 확인한 뒤 한 번 승인한다. 승인 전 preflight failure이면 target build·deploy를 시작하지 않는다.
5. 승인 job은 preflight가 확정한 target SHA를 checkout하고 prod credential·source map secret으로 prod image를 build해 GHCR에 push한다. Build digest와 SHA를 audit summary에 기록하며 승인 시점의 최신 `main`이나 mutable tag를 다시 해석하지 않는다.
6. 승인 job은 build digest를 Argo source revision 및 migration-gated sync에 고정한다. Migration 성공 뒤 controller가 API·Web Rollout·HPA와 background Deployment를 기본 activation한다.
7. Argo source revision, GHCR prod digest, migration Job과 모든 활성화 workload가 일치하고 Healthy인지 확인한다.
8. [Production migration 실행 경계](./production-migrations.md)의 migration postflight와 [OpenPanel 제품 분석 운영](./openpanel.md), [Sentry 오류 수집 운영](./sentry.md)의 배포 후 검증과 public smoke를 실행한다.

## Production-first 변경

Production branch 대상 PR을 별도 release 경로로 만들지 않는다. Main에 아직 반영되지 않은 긴급 수정은 먼저 호환 가능한 immutable commit을 `workflow_dispatch`의 명시적 `target_sha`로 승인·배포할 수 있지만, 같은 변경을 `main` PR로 수렴시키고 두 SHA와 후속 검증을 기록한다. Main merge 뒤에는 dev 자동 배포가 진행되고, production 반영이 필요할 때 `main` ref에서 workflow_dispatch를 실행한다. 직접 push, history rewrite, tag release와 직접 Argo sync는 허용하지 않는다.

## Rollback

Rollback은 과거 tag나 production branch를 다시 배포하거나 branch history를 되돌리는 작업이 아니다.

1. 장애 원인과 현재 production migration 상태를 확인하고, application 변경이 현재 DB schema와 호환되는지 판단한다.
2. 가장 일반적인 경로는 DB-compatible revert를 `main`에 merge하는 것이다. 새 main SHA가 dev에 자동 배포되고, production 반영이 필요하면 `main` ref에서 workflow_dispatch를 실행해 `target_sha`를 비워 최신 main을 선택한 뒤 `prod` Environment 승인 후 prod image를 build·배포한다.
3. Main revert를 기다릴 수 없고 호환 가능한 immutable commit이 repository에 이미 존재하면 그 full SHA를 workflow_dispatch의 `target_sha`로 선택해 `prod` 승인 뒤 새 image를 build·배포한다.
4. 어느 경로도 database state나 migration history를 down migration으로 되돌리지 않는다. Destructive migration 또는 schema 비호환이 관련되면 [Production PostgreSQL backup과 복구](./postgres-backup.md) 및 해당 schema migration runbook의 forward migration·restore 판단을 따른다.

replicas=0인 controller-retained historical owner ReplicaSet은 수동 삭제하거나 revision history를 축소하지 않는다. 해당 revision은 지원되는 rollback 대상이 아니며, 재활성화하면 owner credential을 다시 소비할 수 있다는 잔여 위험을 기록한다.

## 완료·실패 판단

Release는 다음을 모두 확인해야 완료로 기록한다.

- Trigger 종류, 요청자, workflow definition ref와 target full SHA가 확인된다.
- Workflow_dispatch release에서는 dev build/deploy와 승인 후 prod build·approval·deploy 결과가 구분된다. Workflow summary에는 requester, workflow definition ref, trigger와 preflight가 확정한 resolved target full SHA를 기록하고, 명시적 `target_sha` 입력과 dispatch의 `github.sha` 구분은 Actions run/event metadata에서 확인한다. Build·Argo·release audit 기록에는 resolved target SHA를 사용한다.
- Argo source revision이 target full SHA이고, migration과 모든 활성화 production workload가 해당 release의 하나의 prod digest를 사용한다.
- Migration Job이 성공하고 API·Web Rollout·HPA와 background Deployment가 Healthy다.
- Migration preflight와 postflight가 각각 backup/WAL, owner 직접 연결, obsolete migration identity 부재와 active runtime principal을 확인한다.
- Production smoke와 OpenPanel/Sentry 배포 후 검증 결과가 기록된다.
- Git tag와 production branch가 source·approval·rollback 경계로 사용되지 않는다.

승인 후 prod build 또는 migration이 실패하면 production 상태를 변경하지 않거나 기존 workload를 유지한다. 원인을 수정한 main PR, DB-compatible revert PR 또는 승인된 workflow_dispatch SHA release로 새 forward release를 실행한다. Tag push, 임의 branch dispatch, 직접 Argo sync와 DB rollback으로 우회하지 않는다.
