# Production release 운영

이 문서는 `production` branch를 production 배포의 단일 계보와 source로 사용하는 운영 절차를 정의한다. Production 대상 PR의 필수 review와 checks를 통과한 merge가 유일한 사람의 배포 승인이고, merge로 발생한 `production` push가 자동 build·migration·deploy를 시작한다.

`prod` GitHub Environment는 production credential, OIDC 범위와 deployment 감사 기록을 제공할 수 있지만 사람의 추가 승인 gate가 아니다. 별도 `workflow_dispatch`, tag push 승인 또는 Environment reviewer 승인을 사용하지 않는다.

Production branch ruleset과 `prod` Environment 설정은 `apps/terraform/scripts/ensure-github.sh`가 소유하지 않는다. 이 값은 첫 전환 때 GitHub에서 직접 설정하고 아래 live 조회로 검증한다. 저장소 bootstrap 스크립트에 reviewer나 branch policy를 복제하지 않는다.

## 첫 전환 준비

1. 마지막 성공 production deployment의 commit, image digest와 live Argo/Kubernetes 상태를 대조한다. 현재 예상 기준은 `0.2.0`의 `337956aa1f55802bc2ebc06a6483d54c2614a962`지만 branch 생성 직전에 다시 확인한다.
2. 확인한 commit에서 원격 `production` branch를 만든다. 현재 `main` tip에서 만들지 않는다.
3. GitHub에서 `production` 전용 ruleset을 적용해 pull request, required checks와 reviewer를 요구하고 direct push, deletion과 history rewrite를 금지한다.
4. `prod` Environment의 required reviewer를 제거하고 deployment branch policy를 `production`만 허용하도록 설정한다.
5. Vault의 `kosmo-build-prod` role이 `production` branch OIDC subject만 허용하고 tag subject는 허용하지 않는지 확인한다.
6. 이 PR이 main에 merge된 뒤 release-control 변경만 초기 production branch 대상 PR로 전달한다. 그 PR merge가 첫 자동 production 배포를 시작한다.

설정 뒤 GitHub ruleset, Environment protection rules·deployment branch policy와 Vault login 결과를 실제 API/workflow 출력으로 확인한다. 이 live 상태는 저장소 문서나 green CI로 대신 증명하지 않는다.

## Release 계약

- 장기 `production` branch는 직접 push와 history rewrite를 금지하고 PR로만 갱신한다.
- Production PR에는 필요한 review, CI checks와 migration 호환성 검토가 있어야 한다. PR merge가 production 배포 의도를 확정한다.
- Workflow는 merge 후 push event의 immutable full SHA를 checkout·image source·Argo CD source로 사용한다. Mutable branch 이름이나 Git tag를 workload identity로 사용하지 않는다.
- Migration Job, API와 Web은 workflow가 생성한 하나의 digest-pinned image를 사용한다. Migration이 성공한 뒤에만 API와 Web을 활성화한다. 상세 경계는 [Production migration 실행 경계](./production-migrations.md)를 따른다.
- Git tag push는 build·source 선택·배포·승인을 시작하지 않는다. 기존 Web의 `버전: <tag>` 표시는 표시 tag 공급 방식을 정할 때까지 비활성화되어 있으며, 이번 release에는 version label 입력을 만들지 않는다.
- Production 배포는 실행 중인 run을 취소하지 않는다. 여러 production push가 대기하면 GitHub Actions는 기존 `PROD-563` 계약처럼 최신 pending SHA만 다음 release로 유지할 수 있다. 최신 SHA는 앞선 production history를 포함하며, 대체된 pending run은 Actions 취소 기록으로 식별한다.

## 정상 release

1. Main의 필요한 변경 또는 production-first hotfix를 현재 `production` branch를 대상으로 하는 PR로 준비한다. PR 설명에 포함 범위와 migration의 expand/transition/contract 호환성을 기록한다.
2. 필수 reviewer와 CI checks가 통과했는지 확인한다. Merge 전에는 production build·migration·deploy가 시작되지 않는다.
3. PR을 merge한다. 이 merge가 유일한 사람의 승인이고, 결과로 생성된 production push가 자동 release를 시작한다.
4. Docker build 결과의 commit SHA와 image digest를 workflow summary에서 확인한다. `prod` Environment 단계에서 별도 승인 버튼을 누르지 않는다.
5. 같은 digest의 migration Job이 성공하고 Argo CD `kosmo-prod`가 해당 production SHA를 source revision으로 사용한 뒤 API와 Web Rollout이 Healthy인지 확인한다. Migration 실패 시 API와 Web 활성화가 진행되지 않는다.
6. [Production migration 실행 경계](./production-migrations.md), [OpenPanel 제품 분석 운영](./openpanel.md), [Sentry 오류 수집 운영](./sentry.md)의 배포 후 검증과 public smoke를 실행한다.
7. Workflow summary와 Linear/incident 기록에는 merged PR, merge actor, production commit, Argo source revision, image digest, migration·Rollout·smoke 결과만 남긴다. Credential, connection string, database row와 사용자 콘텐츠는 남기지 않는다.

### Trigger matrix

| Event                           | Production build/deploy | 설명                                             |
| ------------------------------- | ----------------------- | ------------------------------------------------ |
| 보호된 `production` branch push | 실행                    | PR merge 후 push SHA를 source로 자동 release     |
| `main` branch push              | 실행하지 않음           | 기존 dev build 경계만 유지                       |
| 기타 branch build               | 실행하지 않음           | production credential·배포를 사용하지 않음       |
| Git tag push                    | 실행하지 않음           | version metadata도 현재 production source가 아님 |
| 수동 `workflow_dispatch`        | 실행하지 않음           | 별도 명시 실행 경로를 제공하지 않음              |

## Production-first hotfix

긴급한 수정이 main보다 먼저 production에 필요하면 production branch를 대상으로 hotfix PR을 만든다. 필수 review와 checks 후 merge하면 정상 release 절차가 자동으로 실행된다. Hotfix merge 뒤에는 같은 변경을 main에 반영하는 별도 PR을 만들고, main 반영이 완료될 때까지 두 계보의 차이와 후속 PR을 기록한다. Hotfix를 이유로 직접 push하거나 history를 rewrite하지 않는다.

## Rollback

Rollback은 과거 tag를 다시 배포하거나 branch history를 되돌리는 작업이 아니다.

1. 장애 원인과 현재 production migration 상태를 확인하고, application 변경이 현재 DB schema와 호환되는지 판단한다.
2. DB와 호환되는 application 변경이면 `production`을 대상으로 revert PR을 만든다. 필수 review와 checks 후 merge하는 것이 rollback release의 승인이다.
3. Revert PR merge로 발생한 새 production push가 정상 build·migration barrier·deploy 경로를 실행한다. Migration history와 이미 적용된 schema를 down migration으로 되돌리지 않는다.
4. Destructive migration 또는 schema 비호환이 관련되면 application revert를 강행하지 않는다. [Production PostgreSQL backup과 복구](./postgres-backup.md) 및 해당 schema migration runbook의 forward migration·restore 판단을 따른다.

## 완료·실패 판단

Release는 다음을 모두 확인해야 완료로 기록한다.

- Merged production PR과 merge actor가 확인된다.
- Build SHA, Argo source revision과 migration/API/Web image digest가 일치한다.
- Migration Job이 성공하고 API·Web Rollout이 Healthy다.
- Production smoke와 OpenPanel/Sentry 배포 후 검증 결과가 기록된다.
- Version label이 이 변경에서 다시 활성화되지 않았다.

Build 또는 migration이 실패하면 기존 workload를 유지하고, 원인을 수정한 production PR 또는 DB-compatible revert PR을 merge해 새 push로 재시도한다. Tag push, 수동 dispatch, 직접 Argo sync와 DB rollback으로 우회하지 않는다.
