## Context

이 기록은 `PROD-783`의 main 기반 automatic production release, Environment 승인과 임의 full-SHA manual release 계약을 반영한다. 기존 `PROD-764`의 production branch source·PR merge 승인 모델과 2026-08-17의 automatic 사전 build 결정은 현재 repository에 일부 구현되어 있지만 live 전환과 OpenSpec archive가 완료되지 않은 상태에서 새 계약으로 대체된다.

## Decision Records

### Main push가 기본 production release source다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: Production branch에 main 변경을 다시 전달하는 절차 때문에 merge된 code와 실제 release source가 분리되고 별도 lineage를 유지해야 한다.
- Decision Outcome: Main push의 immutable full SHA를 automatic production release source로 사용하고, Git tag와 production branch push는 automatic production release를 시작하지 않는다. Main push는 dev build·배포와 production approval 대기를 만들지만, production build는 승인 뒤에만 시작한다.
- Alternatives Considered: Production branch 계보 유지는 `PROD-783`이 제거하려는 중복 전달 경계를 남긴다. Tag trigger는 source 선택과 version metadata를 다시 결합하므로 채택하지 않았다.
- Consequences: Main의 모든 merge는 production release 요청을 만들지만 production checkout·credential·build·상태 변경은 별도 Environment 승인 뒤에 남는다.
- Confirmation / Follow-up: Push trigger matrix와 workflow summary에서 main만 automatic release approval을 만들고 tag·production·일반 branch push는 만들지 않는지 확인한다.

### Dev와 prod는 같은 main SHA에서 환경별 image를 별도로 build한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: 현재 Expo Web bundle은 environment, Sentry DSN과 OpenPanel client ID를 build-time public input으로 사용한다.
- Decision Outcome: Main push는 같은 source SHA에서 dev image를 자동 build하고, `prod` 승인 뒤 prod image를 별도로 build한다. 두 image는 source SHA를 공유하지만 동일 digest를 요구하지 않는다.
- Alternatives Considered: 하나의 image를 두 environment에 재사용하려면 browser runtime config 계약과 Sentry/OpenPanel 주입 경계를 함께 바꿔야 하며 사용자가 이번 범위에서 제외했다.
- Consequences: Main merge마다 build 비용이 두 번 발생하지만 기존 observability·analytics 환경 분리를 유지한다.
- Confirmation / Follow-up: Dev/prod build args, tags, output digest와 배포 대상을 각각 검증한다.

### [Superseded] Main candidate는 사전 build하고 Environment가 production mutation을 승인한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783`
- Status: Superseded on 2026-08-18
- Context / Problem: 승인 후 build하면 승인에서 실제 배포까지 지연되지만 main은 review와 merge를 거친 신뢰된 source다.
- Decision Outcome: Main SHA의 prod image를 승인 전에 build하고 `prod` Environment reviewer가 build output digest를 사용하는 Argo CD credential·migration·workload 변경을 승인한다는 결정은 폐기한다.
- Alternatives Considered: Build까지 Environment 뒤로 미루는 방식은 승인에서 배포까지 지연되지만 prod Vault/Sentry credential과 target checkout을 모두 승인 뒤로 보호한다. 2026-08-18 상위 계약 변경으로 이 대안을 채택한다.
- Consequences: 이 기록의 사전 build·사전 credential 접근을 전제로 하는 task, runbook과 workflow는 새 gated contract에 맞게 재검증해야 한다.
- Confirmation / Follow-up: `Automatic main production release는 Environment 승인 뒤 하나의 gated job에서 시작한다` 결정을 적용하고, 승인 전 checkout·credential·build·Argo mutation이 없음을 검증한다.

### Automatic main production release는 Environment 승인 뒤 하나의 gated job에서 시작한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783` (2026-08-18 contract update)
- Status: Active
- Context / Problem: Main이 보호된 branch에서 온 code라도 prod build는 Vault/Sentry credential과 target Dockerfile을 실행하므로 Environment 승인 전에 실행하면 승인 경계가 build credential까지 보호하지 못한다.
- Decision Outcome: Main push는 dev 경로와 별도로 production approval 대기만 만든다. `prod` Environment 승인 전에는 main SHA를 production job에서 checkout하거나 Vault/Sentry credential을 요청하거나 prod image를 build하거나 Argo CD production 상태를 변경하지 않는다. 승인 뒤 하나의 gated job이 event의 immutable main full SHA를 checkout하고 GHCR prod build를 실행한 다음, 같은 job에서 그 SHA와 build digest로 migration-gated Argo sync와 모든 production workload 배포를 수행한다.
- Alternatives Considered: Main prod candidate를 승인 전에 build하고 digest만 승인 뒤 사용하는 방식은 build credential과 Dockerfile 실행을 승인 밖에 두므로 폐기했다. Build와 deploy를 별도 승인 job으로 나누는 방식은 하나의 production approval 경계를 깨므로 채택하지 않았다.
- Consequences: 승인 뒤 build 시간이 production release latency에 포함되며, build 실패 시 해당 release는 digest와 production mutation 없이 실패한다. Automatic과 manual production build는 같은 approval·concurrency·migration·audit 계약을 공유한다.
- Confirmation / Follow-up: 승인 전후 job step, OIDC subject, Vault/Sentry credential 접근, checkout SHA, GHCR build digest와 Argo revision을 workflow와 live evidence로 확인한다.

### Manual release는 main workflow와 정확한 target SHA를 분리한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: Main이 아닌 code를 배포할 수 있어야 하지만 branch 이름과 target commit의 workflow는 mutable하거나 신뢰되지 않을 수 있다.
- Decision Outcome: Main에 저장된 workflow에서 repository에 존재하는 정확한 40자리 commit SHA만 입력받는다. 승인 전에는 target 존재만 검증하고, target checkout·prod secret 접근·build·deploy는 Environment 승인 뒤에 실행한다.
- Alternatives Considered: Branch/ref 입력은 승인과 실행 사이 이동할 수 있어 제외했다. Target SHA의 workflow를 직접 dispatch하면 승인 전에 변경된 workflow가 실행될 수 있어 제외했다. Manual target을 main candidate처럼 사전 build하면 악성 Dockerfile이 build secret에 접근할 수 있어 제외했다.
- Consequences: Reviewer는 workflow ref main과 실제 target SHA를 별도로 확인해야 하며, manual release는 승인 뒤 build 시간만큼 배포가 늦어진다.
- Confirmation / Follow-up: Invalid SHA와 non-main dispatch ref 거부, 승인 UI의 commit link, 승인 전 checkout·secret 부재와 승인 후 same-SHA/digest를 검증한다.

### Production release는 dev Docker Build와 분리된 workflow가 소유한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: 기존 Docker Build workflow 안에 production Environment 대기 job을 추가하면 workflow 전체 완료를 기다리는 Deploy Dev와 Trivy가 production 승인까지 지연된다.
- Decision Outcome: 기존 Docker Build와 Deploy Dev는 main dev 경계를 유지하고, 별도 Production Release workflow가 main release approval·gated prod build·deploy와 manual SHA release를 소유한다.
- Alternatives Considered: Deploy Dev와 Trivy를 같은 workflow의 sibling job으로 옮기는 방식도 가능하지만 기존 dev trigger와 scan 경계를 불필요하게 크게 바꾼다. 한 workflow의 완료를 승인 전에 강제로 성공 처리할 수는 없어 채택하지 않았다.
- Consequences: Dev와 prod build step 일부가 두 workflow에 존재하므로 action pin, source-map upload와 registry 설정의 drift를 정적 검증해야 한다.
- Confirmation / Follow-up: Main push에서 Dev가 Environment 승인과 독립적으로 완료되고 production release workflow가 별도로 대기하는지 확인한다.

### [Superseded] 승인된 production digest만 stable 보존 표식을 이동한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-783`
- Status: Superseded by `PROD-791` on 2026-08-18
- Context / Problem: 승인 전에 `stable`을 이동하면 아직 승인되지 않은 image가 현재 production digest의 ECR lifecycle 보호를 빼앗는다.
- Decision Outcome: `prod` 승인 뒤 gated job이 build한 SHA 기반 prod image만 사용한다. 성공한 Argo sync와 post-deploy 검증 뒤 해당 digest에 `stable`을 이동하고, deploy identity는 계속 build output digest를 사용한다.
- Alternatives Considered: Argo sync 전에 `stable`을 이동하면 deploy 실패 때도 기존 production 보존 표식이 사라진다. 승인 전 build·stable 이동은 승인 경계를 무시하므로 제외했다.
- Consequences: 승인 뒤 build 실패는 production 상태를 변경하지 않고 종료한다. Stable 갱신 실패는 production이 이미 성공한 partial failure로 명확히 기록해야 한다.
- Confirmation / Follow-up: 승인 전 stable 변경이 없고 성공 release digest만 stable을 갖는지 ECR API로 확인한다.

### Production image는 GHCR에만 push한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-791`
- Status: Active
- Context / Problem: Helm, Argo CD와 production workload는 `ghcr.io/byulmaru/kosmo@<digest>`만 사용하지만 workflow가 같은 image를 ECR에도 중복 push하고 ECR `stable` 후처리 실패를 전체 release 실패로 기록했다.
- Decision Outcome: Dev와 production image는 실제 workload source인 GHCR에만 push한다. Release identity와 Argo CD 입력은 GHCR build output의 immutable digest를 사용한다. ECR repository, lifecycle policy, push role과 `stable` promotion을 제거한다.
- Alternatives Considered: AWS CLI를 runner에 설치하거나 ECR promotion을 Docker 명령으로 바꾸는 방식은 사용하지 않는 registry 복사본을 계속 유지하므로 제외한다. ECR을 fallback registry로 유지하는 방식도 workload와 runbook에 fallback 계약이 없어 제외한다.
- Consequences: ECR copy와 `stable` 보존 표식은 사라진다. GHCR availability와 retention이 유일한 image registry 경계가 되며, 별도 retention 변경은 독립 운영 결정으로 다룬다.
- Confirmation / Follow-up: Workflow가 GHCR tag 하나만 push하고 Argo CD와 live Pod가 같은 GHCR digest를 사용하는지 확인한다. ECR repository와 전용 IAM resource 제거는 repository PR과 live CLI/Terraform evidence를 분리해 기록한다.

### Automatic과 manual release는 공용 production concurrency를 사용한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: 서로 다른 workflow run이 같은 Argo Application과 database migration을 동시에 변경하면 source·digest와 migration 실행이 경쟁할 수 있다.
- Decision Outcome: Automatic deploy와 manual gated release는 실행 중 job을 취소하지 않는 하나의 production concurrency group을 공유한다. Native queue가 하나의 pending job만 보존하므로 더 최신 approved release request가 이전 pending request를 대체할 수 있고, 대체된 실행은 취소 기록과 재실행 경로를 가진다.
- Alternatives Considered: Trigger별 concurrency group은 automatic/manual 동시 실행을 허용하므로 제외했다. 모든 release request를 무한 보존하는 외부 queue는 현재 운영 요구보다 큰 새 system이라 도입하지 않는다.
- Consequences: 승인된 중간 release request가 실행 전에 대체될 수 있다. 반드시 배포해야 하는 SHA는 현재 실행이 끝난 뒤 manual 경로로 다시 승인한다.
- Confirmation / Follow-up: 연속 automatic/manual 승인에서 실행 중 release가 유지되고 pending replacement와 재실행 identity가 기록되는지 확인한다.

### [Superseded] Production build OIDC는 main ref와 prod Environment identity만 허용한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-783`
- Status: Superseded on 2026-08-18
- Context / Problem: Automatic main candidate build에 branch subject를 허용하고 Environment gated manual build에 `environment:prod` subject를 허용하는 이중 trust는 새 automatic gated build 계약과 맞지 않는다.
- Decision Outcome: ECR과 Vault production build trust에 exact main branch subject를 허용한다는 결정은 폐기한다.
- Alternatives Considered: Automatic과 manual이 모두 Environment 뒤에 build하도록 변경했으므로 하나의 exact Environment subject로 수렴한다.
- Consequences: 기존 main ref trust 변경과 외부 Vault owner handoff는 새 workflow cutover 전에 재검증해야 한다.
- Confirmation / Follow-up: `Production build OIDC는 exact prod Environment identity만 허용한다` 결정을 적용한다.

### Production build secret OIDC는 exact prod Environment identity만 허용한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783` (2026-08-18 contract update), `PROD-791`
- Status: Active
- Context / Problem: Automatic과 manual production build가 모두 Environment 승인 뒤 실행되므로 branch ref를 별도 production build secret identity로 유지할 필요가 없다.
- Decision Outcome: Vault production build trust는 exact `repo:byulmaru/kosmo:environment:prod` subject만 허용한다. `ref:refs/heads/main`, `ref:refs/heads/production`, Git tag와 일반 branch subject는 production build secret credential에 접근할 수 없다. Image push는 GHCR의 GitHub Packages permission만 사용한다.
- Alternatives Considered: Main branch subject를 병행 허용하면 승인 전 또는 다른 job에서 credential을 사용할 수 있는 identity가 남으므로 제외한다. Broad glob은 임의 branch credential 획득을 허용할 수 있어 제외한다.
- Consequences: Automatic main과 manual full-SHA build가 동일한 Environment OIDC identity를 사용하며, workflow cutover와 external Vault apply 순서를 맞춰야 한다. ECR용 AWS OIDC identity는 제거된다.
- Confirmation / Follow-up: Main automatic·manual approved login 성공, main ref·production branch·tag·general branch login 거부를 민감값 없이 확인한다.

### Production branch change는 새 release 계약에 의해 superseded된다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-783`
- Status: Active
- Context / Problem: `adopt-production-release-branch` change와 `PROD-764`는 production branch PR merge를 유일한 승인으로 정했지만 새 계약은 main release와 Environment 승인을 사용한다.
- Decision Outcome: Production branch는 build, deploy, rollback source와 승인 경계에서 제거한다. 기존 change의 미완료 live task는 새 cutover가 소유하고 obsolete delta를 active spec에 적용하지 않는 방식으로 superseded 처리한다.
- Alternatives Considered: 두 release 경로를 병행하면 동일 production에 서로 다른 source·approval 규칙이 존재하므로 제외했다.
- Consequences: Main과 production의 현재 차이를 cutover 전에 수렴해야 하며, branch ruleset/branch 삭제는 repository workflow 변경과 별도의 명시적 운영 승인 뒤 수행한다.
- Confirmation / Follow-up: 모든 workflow, OIDC, Terraform과 runbook 참조를 제거하고 old change archive가 새 active spec을 되돌리지 않는지 strict validation으로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `PROD-764`의 “장기 production 브랜치가 실제 release source다” 결정은 `PROD-783`의 main automatic release와 manual full-SHA source 결정으로 대체된다.
- `PROD-764`의 “Production PR merge가 유일한 사람 승인이다” 결정은 `PROD-783`의 `prod` Environment reviewer 승인으로 대체된다.
- `PROD-764`의 production-first hotfix와 production revert PR 경로는 main revert 또는 호환 가능한 manual full-SHA forward release로 대체된다.
- `PROD-563`의 모든 Git tag push build·재배포 결정은 main push automatic release와 main workflow의 manual full-SHA release로 대체된다.
- 2026-08-17의 “main prod candidate는 Environment 승인 전에 build할 수 있다” 결정은 2026-08-18 `PROD-783` contract update의 “승인 뒤 하나의 gated job에서 checkout·credential·build·deploy” 결정으로 대체된다.
- 2026-08-17의 “production build OIDC는 main ref와 `environment:prod`를 함께 허용한다” 결정은 exact `environment:prod` subject만 허용하는 2026-08-18 결정으로 대체된다.
