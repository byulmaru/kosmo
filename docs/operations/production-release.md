# Production release 운영

이 문서는 `main` 기반 production release의 운영 절차를 정의한다. `main`에 merge된 각 commit은 dev image를 먼저 준비하고 dev에 자동 배포한다. Production release는 `prod` GitHub Environment의 required reviewer가 한 번 승인한 뒤에 production source checkout·credential 접근·prod image build·production 상태 변경을 수행한다. Dev와 prod image는 같은 source SHA에서 만들어지지만 환경별 build 설정이 다르므로 같은 digest일 필요는 없다.

Production build는 Environment 승인 뒤에만 시작한다. 승인 전에는 production source를 checkout하지 않고 prod Vault/Sentry credential에 접근하거나 prod image를 build하지 않는다. 승인 뒤 gated job이 release full SHA를 checkout하고 prod 설정을 읽어 GHCR image를 build한 뒤, build output digest와 같은 full SHA를 migration과 모든 production workload에 전달한다.

별도 production branch나 Git tag는 production source, approval, rollback selector가 아니다. Main에 저장된 production release workflow를 `main` ref에서 수동 실행하면 repository에 존재하는 정확한 40자리 commit SHA를 선택할 수 있다. Manual 경로는 승인 전에 target의 존재와 identity만 검증하고, `prod` 승인 뒤에 target을 checkout하고 prod image를 build·배포한다. Workflow definition ref(`main`)와 release target SHA를 항상 구분해 기록한다.

`prod` Environment 승인은 해당 release의 production credential, migration과 workload 변경 전체를 보호하는 유일한 production 상태 변경 승인이다. 별도의 migration approval, dispatch 승인 또는 직접 Argo sync로 우회하지 않는다. GitHub Environment, OIDC trust와 branch 폐기는 저장소 문서나 green CI가 아니라 live GitHub/Vault/API 결과로 확인한다.

## 첫 전환 준비

1. 현재 `main`, 기존 `production` 계보, 마지막 성공 production Argo source·digest와 migration 상태를 read-only로 대조한다. production에만 존재하는 hotfix가 있으면 먼저 `main`에 수렴시킨다.
2. Main에 workflow, Terraform, OpenSpec과 운영 문서 변경을 PR로 전달하고 repository checks를 통과시킨다.
3. Vault OIDC trust에 exact `repo:byulmaru/kosmo:environment:prod` identity만 적용한다. `production` branch와 tag identity는 유효한 release 경로가 준비된 뒤 제거한다.
4. `prod` Environment에 required reviewer와 main workflow의 deployment policy를 설정한다. Automatic main과 manual SHA release가 같은 production concurrency 경계를 사용하도록 확인한다.
5. 첫 main release에서 dev build/deploy와 production approval을 분리하고, 승인 전 prod checkout·credential·build 부재와 승인 후 source SHA·digest·migration barrier를 확인한다.
6. 첫 production release와 rollback path가 검증된 뒤, production branch ruleset/branch 폐기는 별도 명시적 운영 승인을 받아 수행한다. branch 삭제와 OpenSpec archive를 CI 통과만으로 완료 처리하지 않는다.

설정 뒤 GitHub Environment protection rules·deployment policy, OIDC subject, Vault login과 Argo Application 상태를 실제 API/workflow 출력으로 기록한다. live 전환 evidence는 저장소 문서나 local validation으로 대신 증명하지 않는다.

## Release 계약

- `main` push의 immutable full SHA는 automatic release의 source다. Dev image는 먼저 build·배포하고, prod image는 `prod` Environment 승인 뒤 같은 SHA에서 별도로 build한다.
- Automatic production release는 승인 전에는 production source checkout, prod Vault/Sentry credential 접근과 prod image build를 하지 않는다. 승인 뒤 gated job이 release SHA를 checkout하고 GHCR에 prod image를 build한 digest를 migration·workload에 직접 전달하며 승인 시점의 최신 `main`이나 mutable tag를 다시 해석하지 않는다.
- Manual release는 `main`에 저장된 workflow를 `main` ref에서 실행해야 한다. 입력은 repository에 존재하는 정확한 40자리 SHA여야 하며, 승인 전에는 target code checkout·실행, prod secret/credential 접근과 build를 하지 않는다. `prod` 승인 뒤에만 target SHA checkout, prod build와 배포를 수행한다.
- Production migration Job과 모든 활성화 workload는 해당 release의 하나의 immutable prod digest를 사용하고, Argo CD Helm source는 같은 release target full SHA를 사용한다. Dev digest는 prod digest와 달라도 된다.
- Dev와 production image는 모두 GHCR에만 push한다. Production release는 build output의 immutable GHCR digest를 Argo CD에 직접 전달한다.
- Production 배포는 `prod` Environment의 한 번의 required reviewer 승인으로 보호한다. 같은 승인 이후 migration 성공 때만 API·Web Rollout·HPA와 background Deployment를 활성화한다. 상세 경계는 [Production migration 실행 경계](./production-migrations.md)를 따른다.
- Git tag push, `production` branch push와 일반 branch push는 automatic production release·승인·배포를 시작하지 않는다. Git tag나 mutable image tag를 source selector 또는 workload identity로 사용하지 않는다.
- Automatic/manual production release는 공용 concurrency group을 사용한다. 실행 중인 release는 취소하지 않으며, 여러 pending release는 최신 pending release로 대체할 수 있다. 대체된 SHA·trigger는 Actions 취소 기록으로 식별하고 필요한 경우 다시 승인한다.

## Main automatic release

1. `main` merge 후 Docker workflow가 full SHA의 dev image를 build해 GHCR에 push하고 기존 `Deploy Dev` 경로로 전달한다. Production release는 같은 SHA를 기록한 뒤 `prod` Environment approval을 요청한다.
2. Dev 배포의 tag·digest·환경별 build arg가 올바른지 확인한다. 승인 전 production source checkout, prod Vault/Sentry credential 접근과 prod image build가 없어야 하며, 이 단계에서 문제가 생기면 production build·deploy는 실행되지 않는다.
3. Reviewer는 workflow summary와 Environment 화면에서 trigger가 automatic main인지, workflow definition ref와 release full SHA·chart diff·migration compatibility가 무엇인지 확인한 뒤 한 번 승인한다.
4. 승인 job은 release full SHA를 checkout하고 prod credential을 받아 prod image를 build해 GHCR에 push한다. Build digest와 SHA를 audit summary에 기록하고 승인 시점의 최신 `main`이나 mutable tag를 다시 해석하지 않는다.
5. 승인 job은 build digest를 Argo source revision 및 migration-gated sync에 고정한다. Migration 성공 뒤 controller가 API·Web Rollout·HPA와 background Deployment를 기본 activation한다.
6. Argo source revision, GHCR prod digest, migration Job과 모든 활성화 workload가 일치하고 Healthy인지 확인한다.
7. [Production migration 실행 경계](./production-migrations.md), [OpenPanel 제품 분석 운영](./openpanel.md), [Sentry 오류 수집 운영](./sentry.md)의 배포 후 검증과 public smoke를 실행한다.

## Manual full-SHA release

1. Main에 저장된 release workflow를 `main` ref에서 수동 실행하고 repository에 존재하는 정확한 40자리 target SHA를 입력한다. Branch 이름, tag, `github.sha` 또는 mutable image tag를 target으로 입력하지 않는다.
2. Preflight가 workflow ref, SHA 형식과 repository commit 존재 여부를 확인하고 target commit URL·SHA를 approval summary와 Environment 화면에 표시한다. 이 단계에서는 target code를 checkout·실행하거나 prod secret/credential을 읽지 않는다.
3. Reviewer는 target SHA의 code diff와 DB compatibility를 확인한 뒤 `prod` Environment를 한 번 승인한다. 승인 전 preflight failure이면 target build·deploy를 시작하지 않는다.
4. 승인 job은 target SHA를 checkout하고 prod build credential·source map secret으로 image를 build해 GHCR에 push한다. `SENTRY_RELEASE`, image metadata, Argo source와 audit record는 dispatch의 `github.sha`가 아니라 resolved target SHA를 사용한다.
5. Build digest를 같은 gated release의 migration과 모든 production workload에 전달해 sync한다. Automatic release와 동일한 concurrency, migration barrier, smoke와 감사 필드를 사용한다.

## Production-first 변경

Production branch 대상 PR을 별도 release 경로로 만들지 않는다. Main에 아직 반영되지 않은 긴급 수정은 먼저 호환 가능한 immutable commit을 manual full-SHA 경로로 승인·배포할 수 있지만, 같은 변경을 `main` PR로 수렴시키고 두 SHA와 후속 검증을 기록한다. Main merge 뒤에는 dev 자동 배포와 `prod` 승인 후 production build 경로를 사용한다. 직접 push, history rewrite, tag release와 직접 Argo sync는 허용하지 않는다.

## Rollback

Rollback은 과거 tag나 production branch를 다시 배포하거나 branch history를 되돌리는 작업이 아니다.

1. 장애 원인과 현재 production migration 상태를 확인하고, application 변경이 현재 DB schema와 호환되는지 판단한다.
2. 가장 일반적인 경로는 DB-compatible revert를 `main`에 merge하는 것이다. 새 main SHA가 dev에 자동 배포되고 `prod` Environment 승인 뒤 prod image를 build하는 경로로 production에 전달된다.
3. Main revert를 기다릴 수 없고 호환 가능한 immutable commit이 repository에 이미 존재하면 그 full SHA를 manual release target으로 선택해 `prod` 승인 뒤 새 image를 build·배포한다.
4. 어느 경로도 database state나 migration history를 down migration으로 되돌리지 않는다. Destructive migration 또는 schema 비호환이 관련되면 [Production PostgreSQL backup과 복구](./postgres-backup.md) 및 해당 schema migration runbook의 forward migration·restore 판단을 따른다.

## 완료·실패 판단

Release는 다음을 모두 확인해야 완료로 기록한다.

- Trigger 종류, 요청자, workflow definition ref와 target full SHA가 확인된다.
- Main automatic release에서는 dev build/deploy와 승인 후 prod build·approval·deploy 결과가 구분된다. Manual release에서는 입력 target SHA와 dispatch SHA가 구분된다.
- Argo source revision이 target full SHA이고, migration과 모든 활성화 production workload가 해당 release의 하나의 prod digest를 사용한다.
- Migration Job이 성공하고 API·Web Rollout·HPA와 background Deployment가 Healthy다.
- Production smoke와 OpenPanel/Sentry 배포 후 검증 결과가 기록된다.
- Git tag와 production branch가 source·approval·rollback 경계로 사용되지 않는다.

승인 후 prod build 또는 migration이 실패하면 production 상태를 변경하지 않거나 기존 workload를 유지한다. 원인을 수정한 main PR, DB-compatible revert PR 또는 승인된 manual SHA release로 새 forward release를 실행한다. Tag push, 임의 branch dispatch, 직접 Argo sync와 DB rollback으로 우회하지 않는다.
