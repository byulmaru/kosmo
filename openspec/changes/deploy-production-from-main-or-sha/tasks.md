## 1. PROD-783 Main automatic dev·production release 경로

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Main push가 기존 dev build·자동 배포를 유지하면서 production approval 대기를 만들고, `prod` 승인 뒤 하나의 gated job에서 같은 full SHA를 checkout·prod build·배포한다.

**Guardrails**

- Dev와 prod는 환경별 build-time 공개 설정을 유지하며 image tag와 digest 전달이 충돌하지 않는다.
- Main automatic production 경로는 승인 전에 production source를 checkout하거나 Vault/Sentry credential을 요청하거나 prod image를 build하거나 Argo CD production 상태를 변경하지 않는다.
- 승인 뒤 하나의 gated job이 main event의 full SHA를 checkout하고 prod image를 build한 뒤, production migration과 모든 활성화 workload에 그 build output의 같은 digest와 같은 main full SHA를 사용한다.
- 실행 중 production release는 후속 approval request 때문에 취소되지 않는다.
- Dev와 production image는 GHCR에만 push하고 Argo CD에는 해당 build output의 immutable digest를 전달한다.

**Verification**

- Main, tag, production branch와 일반 branch trigger matrix를 정적으로 검증하고, automatic main 승인 전 production checkout·credential·build·Argo 접근이 없음을 검증한다.
- Dev/prod build args, image metadata, artifact output과 source SHA가 분리되는지 검증한다.
- Environment 승인 뒤 하나의 gated job에서 checkout→prod credential→build→migration-gated sync가 순서대로 실행되고 같은 SHA·digest를 사용하는지 검증한다.
- 연속 approval request에서 실행 중 release 보존과 pending replacement 기록을 검증한다.

- [x] 1.1 Main Docker Build를 dev 전용 trigger·build·artifact 경계로 정리하고 production branch 조건과 dev/prod image metadata 충돌을 제거한다.
- [x] 1.2 Main automatic production release가 `prod` Environment 승인 전에는 production checkout·Vault/Sentry credential·prod build를 실행하지 않고, 승인 뒤 main full SHA를 checkout해 build하도록 구현·검증한다.
- [x] 1.3 같은 gated job에서 승인 뒤 GHCR prod build digest를 생성하고 같은 main SHA·digest로 migration-gated Argo sync·revision 검증·workload 배포를 실행하도록 구현·검증한다.
- [x] 1.4 Dev workflow와 Trivy가 production 승인 대기와 독립적으로 기존 main build 결과를 소비하는지 확인하고 필요한 정합성 수정을 적용한다.
- [x] 1.5 Automatic trigger, approval 전후 credential·execution boundary, concurrency와 same-SHA/digest를 actionlint와 workflow review로 검증하고 관련 check를 통과시킨다.

## 2. PROD-783 Manual immutable-SHA production release

**Authority / Provenance**

- `PROD-783`

**Deliverable**

운영자가 main의 신뢰된 workflow에서 repository의 정확한 commit SHA를 선택하고, Environment 승인 뒤 그 SHA를 prod 설정으로 build해 production에 배포할 수 있다.

**Guardrails**

- Manual target은 40자리 full SHA이고 repository에 존재해야 하며 workflow definition ref는 main이어야 한다.
- 승인 전에는 target code를 checkout·실행하거나 prod build secret·credential에 접근하지 않는다.
- Reviewer가 workflow ref main과 실제 target commit을 구분해 확인할 수 있어야 한다.
- Checkout, Sentry release, image version, Argo source와 감사 기록은 resolved target SHA를 사용한다.
- Manual release도 automatic release와 같은 production concurrency와 migration barrier를 사용한다.

**Verification**

- Invalid/missing SHA, non-main dispatch ref와 존재하지 않는 commit의 preflight 거부를 검증한다.
- 승인 UI의 target commit URL·SHA, 승인 전 target checkout/secret 부재와 승인 후 build·deploy 순서를 검증한다.
- Dispatch `github.sha`와 target SHA가 다를 때도 target SHA·digest가 일관되는지 검증한다.

- [x] 2.1 Main workflow ref와 immutable target SHA를 검증하고 실제 commit identity를 승인 정보로 전달하는 manual preflight를 구현한다.
- [x] 2.2 Environment 승인 뒤 target checkout, GHCR prod image build와 digest-pinned migration·workload sync를 하나의 manual release 경계로 구현한다.
- [x] 2.3 Automatic/manual release가 공용 production concurrency와 동일한 approval 후 build·Argo revision·digest·audit 계약을 사용하는지 검증한다.
- [x] 2.4 Manual valid/invalid event matrix와 승인 전후 credential·execution boundary를 검증하고 관련 check를 통과시킨다.

## 3. PROD-783 Production source·credential ownership 전환

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Argo CD, Vault와 GitHub Environment가 `prod` 승인 뒤 실행되는 automatic main과 approved manual release만 허용하고 production branch source·credential trust를 더 이상 사용하지 않는다. 사용하지 않는 ECR registry와 AWS build identity는 제거한다.

**Guardrails**

- Terraform은 release-time full source revision과 Helm parameter만 보존하고 나머지 Application drift를 계속 관리한다.
- Automatic과 manual production build는 exact `repo:byulmaru/kosmo:environment:prod` identity만 사용하며 main ref·production branch·tag·일반 branch identity는 사용하지 않는다.
- Workflow merge, Vault trust와 Environment policy 적용 순서는 유효한 배포 경로를 끊거나 폐기된 identity를 장기 병행하지 않게 조정한다.
- GitHub/Vault live 설정과 production branch 폐기는 repository CI만으로 완료 증명하지 않는다.

**Verification**

- Terraform fmt/validate와 reviewed plan으로 Argo bootstrap source, lifecycle ignore와 ECR/IAM 제거 diff를 확인한다.
- Main automatic·approved manual login 성공과 production/tag/general branch identity 거부를 민감값 없이 확인한다.
- GitHub `prod` Environment reviewer·deployment policy를 live API로 확인한다.

- [x] 3.1 Production Argo bootstrap source를 main으로 전환하고 release overlay ownership 경계를 유지한다.
- [x] 3.2 ECR OIDC trust를 exact `environment:prod` identity로 제한하는 작업은 `PROD-791`의 GHCR-only 전환으로 superseded됐으며, ECR repository와 전용 push identity 제거는 task 7.1~7.2가 소유한다.
- [ ] 3.3 Vault prod build role owner 변경을 같은 이슈에 연결해 exact `environment:prod` identity만 허용하고 main ref·production branch·tag identity를 제거·검증한다.
- [ ] 3.4 GitHub `prod` Environment required reviewer와 automatic/manual deployment policy를 설정하고 live 상태를 검증한다.
- [ ] 3.5 Terraform validation·plan과 Vault OIDC event matrix를 통과시키고 repository 변경과 외부 apply evidence를 분리해 기록한다.

## 4. PROD-783 계약·운영 문서와 superseded change 정합성

**Authority / Provenance**

- `PROD-783`

**Deliverable**

운영자가 automatic main과 manual full-SHA release를 같은 approval·migration·audit 원칙으로 실행할 수 있고, active spec과 과거 production branch change가 서로 충돌하지 않는다.

**Guardrails**

- Runbook은 tag, production branch, mutable image tag나 direct Argo sync를 release source로 안내하지 않는다.
- Main dev 결과, production approval 전 대기, 승인 뒤 prod checkout·build·deploy와 post-deploy smoke evidence를 구분한다.
- `adopt-production-release-branch`의 obsolete delta를 새 active spec에 나중에 적용하지 않는다.
- OpenSpec archive는 repository 구현 merge만으로 완료하지 않고 필요한 live 전환과 검증을 기다린다.

**Verification**

- Production release, migration, OpenPanel, Sentry와 Terraform 문서의 trigger·source·approval·rollback 설명을 교차 검토한다.
- Related active change decision과 task의 superseded 상태, delta 적용 순서와 strict validation을 확인한다.

- [x] 4.1 Production release·migration·OpenPanel·Sentry·Terraform 문서를 automatic main gated build와 manual SHA 경로로 갱신한다.
- [x] 4.2 `adopt-production-release-branch`의 production branch source·PR 승인·hotfix 결정과 이전 사전 build 결정을 superseded로 기록하고 남은 task·archive ownership을 이 change와 정렬한다.
- [x] 4.3 Delta spec, workflow, Terraform, exact Environment credential identity와 runbook 정합성을 검토하고 strict OpenSpec validation을 통과시킨다.

## 5. PROD-783 PR 전달·live cutover와 완료

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Repository 변경이 리뷰 가능한 PR로 전달되고, 승인된 순서로 main 기반 release를 live 검증한 뒤 production branch 계약과 OpenSpec 생명주기가 실제 상태에 맞게 완료된다.

**Guardrails**

- PR merge, GitHub/Vault apply, production Environment 승인·배포와 OpenSpec archive를 서로 다른 evidence boundary로 기록한다.
- Production deploy, branch/ruleset 삭제, Vault apply와 manual live release는 각각 필요한 명시적 운영 승인을 받기 전 실행하지 않는다.
- 첫 cutover 전에 현재 main/production/live production source와 migration compatibility를 대조하고, 첫 automatic release는 승인 전 production 접근이 없음을 확인한 뒤 실행한다.
- Production branch ruleset/branch 제거는 모든 workflow·OIDC·runbook 참조가 사라지고 rollback path가 준비된 뒤에만 수행한다.

**Verification**

- Branch diff, local validation, PR checks와 merge readiness를 확인한다.
- 첫 main release에서 target SHA, 승인 뒤 build digest, approval, Argo revision, migration/workload health와 smoke를 live 확인한다.
- Manual SHA 경로의 승인 전후 boundary와 same-SHA/digest를 승인된 검증 시점에 확인한다.
- 최종 Linear 완료 기록, old/new change archive와 active spec strict validation을 확인한다.

- [ ] 5.1 Current main/production/live production source·digest와 migration 상태를 대조하고 cutover diff·선행 수렴 작업을 기록한다.
- [ ] 5.2 Repository 변경을 새 automatic gated build/manual 경로와 보안 경계에 맞춰 commit·push하고 한국어 PR에 검증과 외부 live gate를 기록해 Ready for review로 전환한다.
- [ ] 5.3 Repository PR merge와 필요한 Vault/GitHub 설정 apply 뒤 첫 main release를 Environment 승인하고 gated build·배포해 SHA·digest·migration·workload·smoke 결과를 기록한다.
- [ ] 5.4 승인된 시점에 manual full-SHA release 경로를 검증하고 승인 전 target code/secret 부재와 승인 후 same-SHA/digest 결과를 기록한다.
- [ ] 5.5 모든 production branch 참조 제거와 rollback 경로를 확인한 뒤 별도 운영 승인으로 production ruleset/branch를 폐기하고 결과를 기록한다.
- [ ] 5.6 `adopt-production-release-branch`를 obsolete delta 미적용 방식으로 archive하고 이 change의 delta를 active spec에 동기화해 strict validation한 뒤 `PROD-783`을 완료한다.

## 6. PROD-790 Production deploy 중복·CNPG sync drift 제거

**Authority / Provenance**

- `PROD-790`

**Deliverable**

Automatic main과 manual full-SHA release가 하나의 Environment-gated production deploy job 구현을 공유하고, runtime DatabaseRole의 CNPG 기본값 정규화가 production sync 완료를 막지 않는다.

**Guardrails**

- Manual preflight는 승인 전에 main workflow ref, full SHA 형식과 repository commit 존재 여부를 계속 검증한다.
- Push에서는 skipped manual preflight 때문에 production deploy가 skip되지 않고, manual dispatch에서는 성공한 preflight output만 target으로 사용한다.
- 두 trigger 모두 `prod` 승인 뒤 checkout·credential·GHCR build·Argo sync 순서와 공용 concurrency를 유지한다.
- 이번 구현은 self-hosted runner에 새 도구나 상태를 사전 설치하지 않으며 GitHub-hosted runner 전환은 별도 범위로 남긴다.
- Runtime DatabaseRole은 `login`, `inherit`, password Secret과 retain reclaim policy를 유지하고 CNPG가 생략하는 false/empty privilege 기본값만 생략한다.
- Dangerous privilege drift를 숨길 수 있는 broad Argo ignore rule을 추가하거나 기존 role 선언을 일괄 변경하지 않는다.

**Verification**

- Actionlint로 push/manual job 조건, skipped dependency와 expression 문법을 검증한다.
- Workflow diff에서 target SHA, Environment URL, Sentry release, image metadata, Argo revision과 audit trigger가 event별로 올바른지 검토한다.
- Helm render와 live read-only spec 비교로 runtime DatabaseRole의 privilege 의미와 CNPG canonical 형태가 일치하는지 확인한다.
- OpenSpec strict validation과 PR CI를 통과시킨다.

- [x] 6.1 Automatic/manual 중복 deploy job을 단일 shared gated job으로 통합하고 event별 target·audit identity와 기존 승인·배포 경계를 검증한다.
- [x] 6.2 Runtime DatabaseRole에서 CNPG가 생략하는 false/empty 기본값을 제거하고 Helm render·live spec 비교로 Argo sync drift 원인을 해소한다.

## 7. PROD-791 GHCR-only production image 경로와 ECR 제거

**Authority / Provenance**

- `PROD-791`

**Deliverable**

Production build와 workload image source를 GHCR로 단일화하고, 사용하지 않는 ECR repository·lifecycle·push identity가 release 성공 여부나 Terraform 관리면에 남지 않는다.

**Guardrails**

- Automatic과 manual release는 기존 `prod` 승인, target SHA, Vault/Sentry secret, migration barrier, Argo revision과 immutable digest 계약을 유지한다.
- Workflow는 GHCR에만 push하고 AWS credential, ECR login 또는 `stable` promotion을 실행하지 않는다.
- Live ECR 삭제와 repository PR, Terraform apply 증거를 구분한다.
- GitHub-hosted runner 전환과 GHCR retention 정책 변경은 이번 범위에 포함하지 않는다.

**Verification**

- Actionlint와 workflow diff로 GHCR tag 하나, build digest와 Argo input을 확인한다.
- Live production Pod가 GHCR digest를 사용하는지 확인한 뒤 exact AWS account·region·repository만 삭제하고 `RepositoryNotFoundException`을 확인한다.
- Terraform fmt/validate와 reviewed plan에서 ECR repository·lifecycle·push role 선언 제거 외 예상하지 않은 AWS 변경이 없는지 확인한다.
- 운영 문서와 OpenSpec의 ECR/`stable` release 계약이 제거됐는지 검색하고 strict validation을 통과시킨다.

- [x] 7.1 Production workflow를 GHCR-only build로 정리하고 live `ap-northeast-2/822638974464/kosmo` ECR repository를 명시적 CLI 승인으로 삭제해 production Pod의 GHCR digest 유지와 repository 부재를 검증한다.
- [x] 7.2 Terraform ECR repository·lifecycle·push IAM 선언과 bootstrap 권한을 제거하고 운영 문서·OpenSpec을 정렬한 뒤 validation과 reviewed plan을 통과시킨다.
