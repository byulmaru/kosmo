## 1. PROD-783 Main automatic dev·production 후보 경로

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Main push가 기존 dev build·자동 배포를 유지하면서 같은 full SHA의 prod production candidate를 별도로 build하고 Environment 승인 뒤 그 candidate를 production에 배포한다.

**Guardrails**

- Dev와 prod는 환경별 build-time 공개 설정을 유지하며 image tag와 digest 전달이 충돌하지 않는다.
- Main production candidate는 승인 전에 build할 수 있지만 승인 전에는 Argo CD production credential이나 상태를 변경하지 않는다.
- Production migration과 모든 활성화 workload는 candidate build output의 같은 digest를 사용하고 Argo source는 같은 main full SHA를 사용한다.
- 실행 중 production release는 후속 candidate 때문에 취소되지 않는다.
- 미승인 또는 sync 실패 candidate는 현재 production digest의 `stable` 보존 표식을 이동시키지 않는다.

**Verification**

- Main, tag, production branch와 일반 branch trigger matrix를 정적으로 검증한다.
- Dev/prod build args, image metadata, artifact output과 source SHA가 분리되는지 검증한다.
- Environment 승인 전후 권한·mutation 경계, 같은 SHA·digest, migration wave와 Argo revision 확인 절차를 검증한다.
- 연속 candidate에서 실행 중 release 보존과 pending replacement 기록을 검증한다.

- [x] 1.1 Main Docker Build를 dev 전용 trigger·build·artifact 경계로 정리하고 production branch 조건과 dev/prod image metadata 충돌을 제거한다.
- [x] 1.2 Main full SHA의 prod candidate를 승인 전에 build하고 digest를 승인 job에 전달하는 automatic production release 경로를 구현한다.
- [x] 1.3 Environment 승인 뒤 candidate SHA·digest로 migration-gated Argo sync와 revision 검증을 실행하고 성공 release만 `stable` 보존 표식을 갱신한다.
- [x] 1.4 Dev workflow와 Trivy가 production 승인 대기와 독립적으로 기존 main build 결과를 소비하는지 확인하고 필요한 정합성 수정을 적용한다.
- [x] 1.5 Automatic trigger, build input, approval, concurrency, stable 갱신과 same-SHA/digest에 대한 정적·workflow 검증을 추가하고 관련 check를 통과시킨다.

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
- [x] 2.2 Environment 승인 뒤 target checkout, prod image build, digest-pinned migration·workload sync와 stable 갱신을 하나의 manual release 경계로 구현한다.
- [x] 2.3 Automatic/manual release가 공용 production concurrency와 동일한 Argo revision·digest·audit 계약을 사용하는지 검증한다.
- [x] 2.4 Manual valid/invalid event matrix와 승인 전후 credential·execution boundary를 검증하고 관련 check를 통과시킨다.

## 3. PROD-783 Production source·credential ownership 전환

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Argo CD, ECR, Vault와 GitHub Environment가 main automatic candidate와 approved manual release identity만 허용하고 production branch source·credential trust를 더 이상 사용하지 않는다.

**Guardrails**

- Terraform은 release-time full source revision과 Helm parameter만 보존하고 나머지 Application drift를 계속 관리한다.
- Automatic pre-build는 exact main ref identity, manual gated build는 exact `prod` Environment identity만 사용한다.
- Workflow merge, ECR/Vault trust와 Environment policy 적용 순서는 유효한 배포 경로를 끊거나 폐기된 identity를 장기 병행하지 않게 조정한다.
- GitHub/Vault live 설정과 production branch 폐기는 repository CI만으로 완료 증명하지 않는다.

**Verification**

- Terraform fmt/validate와 reviewed plan으로 Argo bootstrap source, lifecycle ignore와 ECR OIDC trust diff를 확인한다.
- Main automatic·approved manual login 성공과 production/tag/general branch identity 거부를 민감값 없이 확인한다.
- GitHub `prod` Environment reviewer·deployment policy를 live API로 확인한다.

- [x] 3.1 Production Argo bootstrap source를 main으로 전환하고 release overlay ownership 경계를 유지한다.
- [x] 3.2 ECR OIDC trust를 exact main ref와 prod Environment identity로 제한하고 production branch identity를 제거한다.
- [ ] 3.3 Vault prod build role owner 변경을 같은 이슈에 연결해 main ref·prod Environment identity 허용과 production branch identity 제거를 구현·검증한다.
- [ ] 3.4 GitHub `prod` Environment required reviewer와 automatic/manual deployment policy를 설정하고 live 상태를 검증한다.
- [ ] 3.5 Terraform validation·plan과 OIDC event matrix를 통과시키고 repository 변경과 외부 apply evidence를 분리해 기록한다.

## 4. PROD-783 계약·운영 문서와 superseded change 정합성

**Authority / Provenance**

- `PROD-783`

**Deliverable**

운영자가 automatic main candidate와 manual full-SHA release를 같은 approval·migration·audit 원칙으로 실행할 수 있고, active spec과 과거 production branch change가 서로 충돌하지 않는다.

**Guardrails**

- Runbook은 tag, production branch, mutable image tag나 direct Argo sync를 release source로 안내하지 않는다.
- Main dev 결과, prod candidate build, Environment 승인, production deploy와 post-deploy smoke evidence를 구분한다.
- `adopt-production-release-branch`의 obsolete delta를 새 active spec에 나중에 적용하지 않는다.
- OpenSpec archive는 repository 구현 merge만으로 완료하지 않고 필요한 live 전환과 검증을 기다린다.

**Verification**

- Production release, migration, OpenPanel, Sentry와 Terraform 문서의 trigger·source·approval·rollback 설명을 교차 검토한다.
- Related active change decision과 task의 superseded 상태, delta 적용 순서와 strict validation을 확인한다.

- [x] 4.1 Production release·migration·OpenPanel·Sentry·Terraform 문서를 main automatic와 manual SHA 경로로 갱신한다.
- [x] 4.2 `adopt-production-release-branch`의 production branch source·PR 승인·hotfix 결정을 superseded로 기록하고 남은 task·archive ownership을 이 change와 정렬한다.
- [x] 4.3 Delta spec, workflow, Terraform, credential identity와 runbook 정합성을 검토하고 strict OpenSpec validation을 통과시킨다.

## 5. PROD-783 PR 전달·live cutover와 완료

**Authority / Provenance**

- `PROD-783`

**Deliverable**

Repository 변경이 리뷰 가능한 PR로 전달되고, 승인된 순서로 main 기반 release를 live 검증한 뒤 production branch 계약과 OpenSpec 생명주기가 실제 상태에 맞게 완료된다.

**Guardrails**

- PR merge, GitHub/Vault apply, production Environment 승인·배포와 OpenSpec archive를 서로 다른 evidence boundary로 기록한다.
- Production deploy, branch/ruleset 삭제, Vault apply와 manual live release는 각각 필요한 명시적 운영 승인을 받기 전 실행하지 않는다.
- 첫 cutover 전에 현재 main/production/live production source와 migration compatibility를 대조한다.
- Production branch ruleset/branch 제거는 모든 workflow·OIDC·runbook 참조가 사라지고 rollback path가 준비된 뒤에만 수행한다.

**Verification**

- Branch diff, local validation, PR checks와 merge readiness를 확인한다.
- 첫 main candidate에서 target SHA, build digest, approval, Argo revision, migration/workload health와 smoke를 live 확인한다.
- Manual SHA 경로의 승인 전후 boundary와 same-SHA/digest를 승인된 검증 시점에 확인한다.
- 최종 Linear 완료 기록, old/new change archive와 active spec strict validation을 확인한다.

- [ ] 5.1 Current main/production/live production source·digest와 migration 상태를 대조하고 cutover diff·선행 수렴 작업을 기록한다.
- [ ] 5.2 Repository 변경을 commit·push하고 한국어 PR에 automatic/manual 경로, 보안 경계, 검증과 외부 live gate를 기록해 Ready for review로 전환한다.
- [ ] 5.3 Repository PR merge와 필요한 ECR/Vault/GitHub 설정 apply 뒤 첫 main candidate를 Environment 승인·배포하고 SHA·digest·migration·workload·smoke 결과를 기록한다.
- [ ] 5.4 승인된 시점에 manual full-SHA release 경로를 검증하고 승인 전 target code/secret 부재와 승인 후 same-SHA/digest 결과를 기록한다.
- [ ] 5.5 모든 production branch 참조 제거와 rollback 경로를 확인한 뒤 별도 운영 승인으로 production ruleset/branch를 폐기하고 결과를 기록한다.
- [ ] 5.6 `adopt-production-release-branch`를 obsolete delta 미적용 방식으로 archive하고 이 change의 delta를 active spec에 동기화해 strict validation한 뒤 `PROD-783`을 완료한다.
