## Context

이 기록은 PROD-563의 tag build, production 승인, PreSync와 application 재배포 방식을 구체화한다.

## Decision Records

### 모든 Git tag를 production build trigger로 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: SemVer와 GitHub Release 규칙이 tag push 자체보다 별도의 release lifecycle을 만들었다.
- Decision Outcome: 이름 형식과 관계없이 모든 Git tag push가 production image를 build한다. Tag ref는 audit 식별자이며 container identity는 build digest다.
- Alternatives Considered: SemVer-only tag와 prefix-based tag는 현재 요구되지 않는 naming policy를 추가하므로 제외했다.
- Consequences: 임의 tag 문자열을 Kubernetes label로 사용할 수 없으므로 manifest version에는 commit short SHA를 사용한다.
- Confirmation / Follow-up: Workflow tag glob과 ref validation에 이름 제한이 없고 branch build에는 production deploy가 없는지 확인한다.

### Build digest를 같은 workflow의 승인 job에 직접 전달한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: GitHub Release 발행과 별도 deploy workflow는 이미 build job이 알고 있는 digest를 다시 저장하고 해석했다.
- Decision Outcome: Tag build output digest를 같은 workflow의 `prod` Environment job으로 직접 전달한다. GitHub Release, asset attestation, publish/resolve job·script와 별도 deploy workflow를 사용하지 않는다.
- Alternatives Considered: GitHub Release asset은 장기 selector를 제공하지만 추가 lifecycle과 scripts가 필요하다. Registry tag 재해석은 mutable identity가 될 수 있어 제외했다.
- Consequences: 각 tag workflow run은 자신이 build한 digest만 배포한다. 이전 application은 지원 대상인 이전 production release commit에 새 tag를 붙여 새 build로 배포한다.
- Confirmation / Follow-up: Deploy job이 build job output만 사용하며 Release API나 registry tag lookup이 없는지 검증한다.

### `stable`은 ECR lifecycle 보존 표식으로만 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-563
- Status: Active
- Context / Problem: 기존 `stable`은 배포할 image를 선택하는 source가 아니라 현재 production 후보 digest를 7일 lifecycle 삭제에서 보호하는 표식이다.
- Decision Outcome: Tag build가 `stable`을 갱신하고 ECR lifecycle은 그 image를 보호한다. Deploy job은 `stable`을 해석하지 않고 build output digest만 사용한다.
- Alternatives Considered: `stable` 제거 후 모든 tagged image를 영구 보존하면 저장소 정리 정책이 불필요하게 약해진다.
- Consequences: 현재 tag build image는 보존되며 이전 image는 기존 정책대로 정리된다. `stable`의 mutability는 배포 identity immutability와 무관하다.
- Confirmation / Follow-up: Workflow가 `stable`을 발행하지만 deploy input에는 사용하지 않고 기존 ECR lifecycle 보호·만료 규칙이 유지되는지 확인한다.

### Production 승인은 tag workflow의 단일 Environment job이 강제한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: Tag는 release intent를 나타내지만 production credential과 상태 변경에는 GitHub의 명시적 보호 경계가 필요하다.
- Decision Outcome: Tag build 성공 뒤 하나의 `prod` Environment job이 migration과 API·Web 전체를 승인하며 승인된 job만 Argo CD OIDC token을 얻는다.
- Alternatives Considered: Tag push만으로 즉시 배포하면 별도 production 보호가 없고, migration 전용 승인은 같은 release를 중복 승인한다.
- Consequences: Tag push와 Environment approval 두 행위가 필요하지만 승인 job은 하나뿐이다.
- Confirmation / Follow-up: Branch build에는 deploy job이 없고 tag deploy에는 Environment 하나와 approval-before-OIDC 순서가 있는지 확인한다.

### `prod` Environment는 사용자 승인만 담당한다

- Decision Date: 2026-07-30
- Decision Class: Security Boundary
- Authority / Provenance: PROD-563
- Status: Active
- Context / Problem: Environment의 main-only 또는 tag pattern policy는 workflow의 tag 조건과 중복되고 tag 이름 규칙을 다시 만든다.
- Decision Outcome: `prod` Environment에는 ref policy를 두지 않고 reviewer 승인을 유지한다. Production deploy job은 workflow에서 tag ref에만 생성된다.
- Alternatives Considered: Environment에 별도 tag pattern을 두면 같은 조건을 두 군데서 관리해야 하므로 제외했다.
- Consequences: 현재 `prod` Environment caller의 tag-only 조건과 사용자 승인 두 단계가 배포를 제한한다.
- Confirmation / Follow-up: Branch build에는 deploy job이 없고 `prod` Environment reviewer가 유지되는지 검증한다.

### 최신 pending tag가 이전 pending tag를 대체한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: 모든 tag build를 FIFO로 배포할 필요는 없지만 실행 중인 production 변경을 새 tag가 중단해서도 안 된다.
- Decision Outcome: 고정 concurrency group에서 실행 중 배포는 보존하고 pending job은 최신 tag build 하나만 유지한다. 새 pending job이 도달하면 이전 pending job은 취소된다.
- Alternatives Considered: 모든 pending tag를 FIFO로 보존하는 `queue: max`는 배포할 이유가 없는 중간 버전까지 순서대로 실행하므로 제외했다.
- Consequences: 대체된 pending tag는 production 배포를 시작하지 않으며 별도 deploy step summary 대신 GitHub Actions 취소 기록만 남는다.
- Confirmation / Follow-up: `cancel-in-progress: false`와 기본 single pending concurrency가 유지되는지 확인한다.

### PreSync 성공 뒤 controller 기본 activation을 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: Cross-Rollout preview coordination과 ReplicaSet recovery가 controller 동작을 pipeline에 중복 구현했다.
- Decision Outcome: 같은 digest의 PreSync migration 뒤 Argo CD와 Rollout controller 기본 activation을 사용한다. Pipeline은 직접 promotion·ReplicaSet recovery를 수행하지 않는다.
- Alternatives Considered: API·Web 동시 promotion과 selective recovery는 원자성을 보장하지 못하면서 구현과 테스트를 복잡하게 한다.
- Consequences: API와 Web activation은 원자적이지 않으며 실패 복구는 새 tag를 통한 동일 경로 재배포다.
- Confirmation / Follow-up: Manifest가 기본 activation을 사용하고 workflow에 Rollout action·ReplicaSet 조회가 없는지 확인한다.

### Application rollback은 지원 대상인 이전 production release에 새 tag를 붙이는 재배포다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: 별도 rollback 함수나 immutable Release selector는 정상 배포와 다른 경로를 만든다. 반면 pipeline 도입 전 commit에는 현재 승인·배포 workflow가 존재하지 않는다.
- Decision Outcome: Pipeline 도입 이후 실제 production에 배포됐고 현재 DB와 호환되는 이전 release commit에 새 tag를 붙여 같은 build·approval·PreSync·sync 경로를 실행한다. Pipeline 도입 전 임의 commit은 지원하지 않고 DB는 되돌리지 않는다.
- Alternatives Considered: Argo CD history rollback과 이전 Release selector는 각각 승인 경로를 우회하거나 제거된 Release lifecycle을 되살린다.
- Consequences: 이전 image digest를 그대로 재사용하지 않고 지원 대상인 이전 production release source commit을 다시 build한다. 첫 production release 전에는 rollback 대상 release가 없다.
- Confirmation / Follow-up: 별도 rollback command가 없고 tag workflow가 commit·digest·결과를 기록하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Immutable GitHub Release tag와 asset을 production selector로 사용한다.
- Release 해석과 별도 production deploy workflow를 사용한다.
- API·Web preview를 함께 대기해 직접 promotion하고 ReplicaSet을 자동 복구한다.
