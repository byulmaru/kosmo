## Context

이 기록은 `PROD-764`의 갱신된 production branch 배포 계약과 `PROD-631`의 Web version label 일시 중단을 반영한다. 사용자 후속 결정에 따라 tag-triggered 배포와 과거 tag rollback 선택은 폐기했다.

## Decision Records

### 실제 production source는 장기 production 브랜치 하나다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`
- Status: Active
- Context / Problem: Main은 미출시 변경을 포함하지만 실제 release 계보와 선택 배포 base가 없다.
- Decision Outcome: 실제 최신 성공 release에서 `production` 하나를 시작하고 PR 기반으로 갱신한다.
- Alternatives Considered: 여러 release branch는 유지 비용을 늘리고 tag-only 계보는 PR base를 제공하지 못해 채택하지 않았다.
- Consequences: Main과 production은 일시적으로 갈라질 수 있으며 hotfix는 main으로 수렴해야 한다.
- Confirmation / Follow-up: 초기 SHA, branch protection과 production PR을 검증한다.

### Production PR merge가 승인이고 push가 배포 trigger다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`
- Status: Active
- Context / Problem: Tag가 trigger와 source selector를 겸하면 version metadata와 배포 제어가 결합된다.
- Decision Outcome: Production branch ruleset이 필수 review와 checks를 통과한 대상 PR merge를 유일한 사람 승인으로 강제하고, workflow는 보호된 production push SHA를 신뢰해 자동 build·배포한다. Workflow는 commit-associated PR을 API로 다시 검증하지 않는다.
- Alternatives Considered: 별도 workflow dispatch와 GitHub Environment reviewer 승인은 PR merge 뒤 중복 승인이라 채택하지 않았다. Runtime의 associated-PR 조회도 ruleset과 책임이 겹치고 merge 방식에 불필요하게 결합되므로 채택하지 않았다. Tag push 배포도 사용자가 제거하기로 결정했다.
- Consequences: Production merge는 곧 배포 의도다. 실행 중인 release는 보존하지만 여러 pending push는 기존 `PROD-563` 계약처럼 latest pending SHA로 합쳐질 수 있고, 대체된 run은 Actions 취소 기록으로 남는다.
- Confirmation / Follow-up: Production ruleset은 live GitHub 설정에서 별도로 검증하고, workflow에는 pull request 조회 권한·API step 없이 production push만 자동 배포를 만드는지 확인한다.

### Version label은 표시 tag 공급 결정까지 주석 처리한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`, `PROD-631`
- Status: Active
- Context / Problem: Main에는 `EXPO_PUBLIC_RELEASE_TAG`를 `버전: <tag>`로 표시하는 기능이 있지만 자동 production push 전에 tag 문자열을 공급하는 방식은 아직 결정하지 않았다.
- Decision Outcome: 이번 변경에서는 version label 렌더링을 주석 처리하고 사용하지 않는 관련 import/style은 제거하며 production build에서 `EXPO_PUBLIC_RELEASE_TAG`를 요구하지 않는다. Tag 공급과 UI 재활성화는 후속 범위다.
- Alternatives Considered: 이번 변경에서 tag 공급 자동화를 함께 결정하는 방식은 production branch 전환 범위를 넓히므로 미뤘다. Fallback version을 표시하는 방식도 확정되지 않은 값을 사용자에게 노출하므로 채택하지 않았다.
- Consequences: Version label은 일시적으로 보이지 않지만 production push 배포는 tag metadata 없이 진행할 수 있다.
- Confirmation / Follow-up: UI에서 version label이 보이지 않고 tag push가 production 배포를 시작하지 않는지 확인한다.

### Image와 Helm source는 확인한 production SHA로 고정한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`, `PROD-563`, `PROD-564`
- Status: Active
- Context / Problem: 연속 push 사이 mutable branch를 다시 읽거나 main chart가 사용되면 image와 manifest가 달라질 수 있다.
- Decision Outcome: Workflow가 확인한 production full SHA에서 image를 build하고 같은 SHA를 Argo source에, 하나의 digest를 migration/API/Web에 전달한다.
- Alternatives Considered: Argo source에 mutable `production` 문자열을 넘기는 방식은 승인 중 branch 이동을 재현하지 못해 채택하지 않았다.
- Consequences: 배포는 production branch를 따르되 실행 identity는 그 branch의 확인된 immutable commit이다.
- Confirmation / Follow-up: Workflow 기록과 live Argo/image를 대조한다.

### Production credential trust에서 tag ref를 제거한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-764`
- Status: Active
- Context / Problem: Workflow trigger만 제거해도 tag ref가 prod Vault/IAM trust에 남으면 tag가 production 권한 경계라는 과거 구조가 유지된다.
- Decision Outcome: ECR과 production build credential의 tag ref trust를 제거하고 승인된 production workflow identity만 허용한다.
- Alternatives Considered: 사용하지 않는 trust를 남기는 방식은 완료 조건과 최소 권한에 맞지 않아 채택하지 않았다.
- Consequences: Vault role owner가 다른 repository라면 같은 issue의 별도 PR/apply가 필요하다.
- Confirmation / Follow-up: OIDC policy와 tag-ref token 거부를 비민감하게 확인한다.

### GitHub repository 설정 bootstrap 스크립트를 두지 않는다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`
- Status: Active
- Context / Problem: Repository bootstrap 스크립트에 Environment 정책과 Actions 변수를 복제하면 실제 GitHub 설정과 쉽게 달라지고 재실행 때 폐기된 값을 복원할 수 있다.
- Decision Outcome: `apps/terraform/scripts/ensure-github.sh`를 제거한다. GitHub Environment, ruleset과 Actions 변수는 각 운영 절차에서 직접 설정하고 live API로 검증한다.
- Alternatives Considered: 범용 스크립트를 더 일반화하거나 production 설정만 제외하는 방식은 장기적으로 낡은 중복 source of truth를 유지하므로 채택하지 않았다.
- Consequences: GitHub 설정은 자동 bootstrap되지 않으며 각 기능의 최초 설정 절차와 live 검증이 필수다.
- Confirmation / Follow-up: 저장소에 bootstrap 스크립트 참조가 없는지 정적 확인하고, 전환 시 GitHub ruleset과 Environment API 결과를 기록한다.

### Rollback은 revert를 배포하는 새 release다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-764`
- Status: Active
- Context / Problem: 과거 tag 재배포는 tag를 source selector로 되돌리고 production branch와 실제 배포를 갈라놓는다.
- Decision Outcome: DB-compatible change를 production PR에서 revert하고 merge해 정상 자동 workflow로 배포한다.
- Alternatives Considered: 과거 tag 직접 재배포와 branch history rewrite는 새 production 계보 계약을 깨므로 채택하지 않았다.
- Consequences: Rollback도 forward commit이며 DB와 migration history는 되돌리지 않는다.
- Confirmation / Follow-up: Runbook과 revert release 검증으로 확인한다.

## Remaining Decisions

- 없음. 표시용 release tag 공급과 version label 재활성화는 이 change의 제외 범위로 옮겼다.

## Superseded Decisions

- `PROD-563`의 모든 Git tag push production build 결정은 `PROD-764`의 production PR 승인·push 자동 배포 결정으로 대체된다.
- Tag를 application rollback source selector로 사용하던 결정은 production revert를 새 release로 배포하는 결정으로 대체된다.
- 이 change 초안의 모든 production release를 tag commit SHA로 선택하던 결정은 폐기됐다. Source는 production push SHA이며 version 표시는 후속 범위다.
