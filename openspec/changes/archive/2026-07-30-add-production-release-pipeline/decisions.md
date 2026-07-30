## Context

이 결정 기록은 PROD-563의 `production-release` 계약과 현재 Docker Build, Helm, Argo CD 경계를 구체화한다. PROD-562·564·565의 소유 범위를 현재 요구사항의 근거로 확장하지 않고, PROD-563이 승인한 release identity·승인·activation·rollback 동작 안에서만 구현 수단을 선택한다.

## Decision Records

### SemVer tag와 digest를 함께 검증해 full image reference를 확정한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-563
- Status: Superseded
- Context / Problem: SemVer tag만 다시 해석하면 registry tag 이동이나 잘못된 입력으로 최초 승인과 다른 image가 배포될 수 있고, 짧게 보존되는 workflow artifact만으로 장기 재실행을 보장할 수 없다.
- Decision Outcome: Production workflow는 정상 SemVer tag와 `sha256:` digest를 함께 선택하고 registry에서 둘의 현재 대응을 검증한 뒤 `repository@digest`를 release identity로 확정한다. 같은 tag의 재실행에서도 입력 digest가 달라지면 실패한다.
- Alternatives Considered: tag만 사용하면 mutable identity가 되고, workflow artifact run ID만 사용하면 artifact retention 뒤 재실행할 수 없다. 배포 시 rebuild는 정식 artifact 재사용 계약을 깨므로 선택하지 않는다.
- Consequences: 운영자는 tag와 digest를 함께 제공해야 하고 pipeline은 registry metadata read 권한이 필요하다. Audit record에는 사람이 읽는 SemVer와 실제 실행 identity인 digest가 모두 남는다.
- Confirmation / Follow-up: 정상 tag/digest, 형식 오류, mapping 불일치와 같은 identity 재실행을 workflow test에서 검증한다.

### Immutable GitHub Release tag에서 attested image identity를 해석한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: 운영자가 tag와 digest를 함께 복사하면 입력 오류가 생기고, Git tag immutability만으로는 별도 GHCR container tag가 같은 digest에 고정됐다고 보장할 수 없다. 현재 7일 workflow artifact도 장기 재실행 identity로 충분하지 않다.
- Decision Outcome: Repository immutable releases를 활성화한다. 정식 SemVer image build가 성공하면 full GHCR digest reference 하나를 `docker-image-ref.txt`로 만들어 draft Release에 첨부한 뒤 Release를 발행한다. Production workflow는 immutable Release tag 하나만 받고 Release와 asset attestation을 검증해 `repository@digest`를 해석한다. Raw Git tag, draft/mutable Release와 GHCR tag는 deployment identity source로 사용하지 않는다.
- Alternatives Considered: Tag와 digest 수동 입력은 안전하지만 운영자 UX와 검증 입력이 중복된다. Immutable Git tag만 믿고 GHCR tag를 직접 배포하는 방식은 서로 다른 객체의 immutability를 혼동한다. Container artifact attestation만 사용하는 방식도 가능하지만 Release와 image identity를 연결하는 추가 predicate 검증이 필요해 현재 경로보다 복잡하다.
- Consequences: 정식 release는 image build, digest asset 첨부와 immutable GitHub Release 발행이 모두 성공해야 완성된다. 운영자는 tag 하나만 제공하고 workload는 여전히 digest로 실행된다. Immutable releases 활성화 이전 tag와 Release asset이 없거나 검증되지 않는 tag는 배포할 수 없다.
- Confirmation / Follow-up: Immutable releases 설정 read-back, draft/발행 순서, `gh release verify`, `gh release verify-asset`, asset 형식, digest 존재와 같은 tag 재실행을 검증한다.

### Migration, API와 Web은 하나의 공통 digest reference를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: PROD-563
- Status: Active
- Context / Problem: 세 manifest가 repository/tag 문자열을 따로 조합하면 일부 workload만 다른 release를 사용하는 drift가 생길 수 있다.
- Decision Outcome: 선택한 하나의 full digest image reference를 production migration Job, API Rollout과 Web Rollout에 동일하게 렌더한다. SemVer는 label과 audit metadata이며 container pull identity로 사용하지 않는다.
- Alternatives Considered: workload별 digest 입력은 같은 release 불변식을 약화하고, SemVer 또는 `stable` tag는 immutable하지 않아 선택하지 않는다.
- Consequences: Helm image rendering 변경은 dev의 기존 repository/tag 동작을 보존하면서 production digest를 표현해야 한다.
- Confirmation / Follow-up: dev/prod render test에서 dev는 기존 tag를 유지하고 production 세 container image는 byte-for-byte 같은 digest reference인지 확인한다.

### Production 승인은 GitHub Environment가 강제한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-563
- Status: Active
- Context / Problem: Workflow 내부 확인 input이나 수동 dispatch 권한만으로는 실행과 production 배포 승인을 분리하거나 자격 증명 접근을 gate하지 못한다.
- Decision Outcome: `production` GitHub Environment는 `robin-maki`를 required reviewer로 두고 main branch deployment만 허용하며 admin bypass를 끈다. 현재 단일 운영자 workflow가 교착되지 않도록 self-review는 허용한다. 이 승인 한 번이 선택한 image의 migration과 API·Web 전체에 적용되고, 승인된 job만 OIDC로 Argo CD token을 얻는다. Contract migration도 같은 PreSync migration Job 경계를 사용하며 contract 전용 Environment, 수동 approval input이나 approval hash를 요구하지 않는다.
- Alternatives Considered: 확인 문자열 input은 독립적인 GitHub approval 기록과 secret/OIDC gate가 없고, environment reviewer 없이 branch policy만 두는 방식은 명시적 production 승인을 강제하지 못해 선택하지 않는다. Contract migration 전용 두 번째 Environment는 하나의 release를 중복 승인하게 하고 사용자가 확정한 승인 단위를 깨므로 선택하지 않는다.
- Consequences: 같은 운영자가 dispatch와 승인을 수행할 수 있지만 GitHub에 별도의 명시적 승인 행위와 시각이 남는다. 더 강한 separation of duties가 필요해지면 reviewer team과 self-review 정책을 별도 상위 결정으로 바꿔야 한다.
- Confirmation / Follow-up: Environment API read-back과 workflow 구조 검증에서 reviewer, main policy, bypass, approval-before-OIDC 순서와 contract 전용 approval 경로 부재를 확인한다.

### Release 해석과 배포는 하나의 승인 job에서 수행한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: 잘못된 Release tag를 production 승인 전에 거절하기 위한 별도 verification job이 output 전달, job dependency, GHCR login·availability 검사와 중복 audit을 만들었다.
- Decision Outcome: Production workflow는 `production` Environment가 적용된 job 하나만 사용한다. 승인 뒤 immutable Release asset을 검증해 digest를 해석하고, 그 다음 Argo CD OIDC token을 받아 같은 job에서 sync한다. 별도 verification job과 GHCR availability preflight는 두지 않는다.
- Alternatives Considered: 승인 전 별도 job에서 Release와 registry availability를 검사하면 잘못된 tag의 승인 요청을 줄일 수 있지만, production 상태 안전성에 필수인 경계는 아니며 workflow topology와 audit을 늘린다.
- Consequences: 잘못된 tag도 production 승인 뒤 Release 해석 단계에서 실패한다. 하지만 Argo CD token 취득과 production 상태 변경 전이므로 승인 없는 배포와 잘못된 identity 적용은 여전히 발생하지 않는다.
- Confirmation / Follow-up: Workflow에 `production` Environment job이 하나만 있고 Release 해석이 token 취득과 Argo CD 변경보다 앞서며 별도 verification job·registry preflight가 없는지 검증한다.

### 두 Rollout은 migration과 preview 검증 뒤 수동 승격한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-563
- Status: Superseded
- Context / Problem: 현재 dev의 자동 승격을 production에 사용하면 migration 또는 다른 workload의 preview 상태를 확인하기 전에 API나 Web 하나가 active가 될 수 있다.
- Decision Outcome: Production에서는 같은-digest Argo CD PreSync migration Job을 실행한다. General release workflow는 migration context·phase·schema authority·credential을 입력받거나 generic gate를 호출하지 않고 `argocd app sync` 성공을 Job 성공 신호로 사용한다. Sync 성공 뒤 API와 Web preview를 만들고, 둘이 모두 준비된 다음 pipeline이 두 Rollout을 승격한다. PreSync Job이나 preview가 실패하면 승격하지 않고, 승격 또는 active identity 확인 실패 시 직전 active identity로 둘을 복구한다.
- Alternatives Considered: 두 Rollout의 독립 자동 승격은 cross-workload gate를 제공하지 않는다. Migration 뒤 API와 Web을 순차 완전 배포하는 방식은 중간에 서로 다른 release가 active가 되는 시간을 정상 경로로 만들므로 선택하지 않는다.
- Consequences: Pipeline은 Argo CD sync와 두 Rollout의 preview/active 상태를 관찰하고 promotion/abort 권한을 가져야 한다. Migration credential과 Job render는 PROD-564와 production Application에 남는다. Kubernetes 차원에서 완전한 원자 승격은 아니므로 실패 복구와 최종 identity 검증이 필요하다.
- Confirmation / Follow-up: workflow에 수동 migration context가 없는지, rendered PreSync Job의 digest, sync 실패, 각 preview 실패, 정상 동시 준비, promotion 실패와 최종 identity mismatch 경로를 자동 검증한다.

### PreSync 성공 뒤 controller 기본 activation을 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: API와 Web을 원자적으로 함께 승격하고 pipeline 내부에서 ReplicaSet을 복구하려 하면서 배포 script와 모의 test가 실제 필요한 release 계약보다 훨씬 복잡해졌다.
- Decision Outcome: Production workflow는 승인된 immutable Release의 tag와 digest를 Application parameter에 설정하고 `argocd app sync`를 실행한다. 같은 digest의 PreSync migration이 성공하면 Argo CD가 API·Web Rollout을 적용하고 각 Rollout controller의 기본 activation 동작을 사용한다. Pipeline은 cross-Rollout preview 대기·직접 promotion·stable ReplicaSet 탐색·자동 application recovery를 수행하지 않는다. Sync 또는 Rollout 실패는 실패로 기록하고, application rollback은 운영자가 현재 DB와 호환되는 이전 immutable Release tag를 같은 workflow로 다시 승인한다.
- Alternatives Considered: API·Web preview를 모두 대기한 뒤 수동 동시 승격하고 실패 시 selective sync로 복구하는 방식은 원자성을 완전히 보장하지 못하면서 pipeline에 Kubernetes controller orchestration을 중복 구현한다. 별도 rollback 함수도 정상 release 경로와 다른 권한·검증 경계를 만들기 때문에 선택하지 않는다.
- Consequences: API와 Web activation은 Kubernetes 차원의 원자적 transaction이 아니다. 대신 배포 경로는 release identity 검증, 한 번의 production 승인, 동일 digest, PreSync migration barrier, controller 기본 상태 관리로 단순해진다. 실패 복구에는 이전 Release를 재선택하는 별도 승인 실행이 필요하다.
- Confirmation / Follow-up: Workflow가 release parameter 설정과 Argo CD sync만 조정하는지, production Rollout이 기본 activation을 사용하는지, custom preview/promotion/ReplicaSet recovery 코드가 제거됐는지 검증한다.

### Contract context producer와 release metadata source는 upstream 결정이 필요하다

- Decision Date: 2026-07-30
- Decision Class: Upstream Change Required
- Authority / Provenance: 사용자 정정, Linear `PROD-563`, `PROD-564`; context producer와 release-static metadata source authority 없음
- Status: Superseded
- Context / Problem: PROD-564 gate는 target LSN과 exact-WAL archive evidence, phase, schema authority, compatible images와 rollback window를 요구하지만 이를 production live state와 승인된 release metadata에서 만드는 caller interface는 정의되지 않았다. 운영자 작성 JSON이나 test-only callback을 추가하면 자동 gate와 evidence 신뢰 경계를 깨뜨린다.
- Decision Outcome: 현재 구현에서는 migration image·Helm Job의 command/phase/schema-authority interface를 제거하고 동일 digest의 Argo CD PreSync Job 성공 barrier까지만 적용한다. Contract context producer나 metadata source는 추측해 구현하지 않으며 upstream 계약 승인 뒤 별도 task로 연결한다.
- Alternatives Considered: Migration image의 `recovery-target` command는 가능한 방향이지만 command 권한·archive 관측·JSON output이 아직 승인되지 않아 선택하지 않았다. Workflow JSON input과 임의 injected command는 운영자 self-assertion 또는 production caller 부재를 만들므로 제외했다.
- Consequences: 당시에는 automatic gate task가 blocked였으나, generic gate 자체를 공통 pipeline 계약에서 제거하는 아래 결정으로 대체됐다.
- Confirmation / Follow-up: 2026-07-30 사용자 최종 결정과 갱신된 Linear `PROD-563`, `PROD-564`에 따라 아래 PreSync Job 단일 barrier 결정으로 대체됐다.

### 공통 production migration barrier는 PreSync migrate Job 하나다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 최종 결정, Linear `PROD-563`, `PROD-564`
- Status: Active
- Context / Problem: 모든 release에 generic phase, schema authority, compatibility, rollback window와 recovery evidence를 요구하면 실제 schema migration별 안전 조건을 추상 metadata와 미확정 collector로 일반화하게 된다.
- Decision Outcome: PROD-563의 공통 pipeline은 production 승인 뒤 API/Web과 같은 digest, migration 전용 `DATABASE_URL`, `args=[migrate]`를 사용하는 Argo CD PreSync Job의 성공만 workload activation barrier로 사용한다. Generic gate JSON validator, target LSN/archive collector와 phase/schema metadata를 추가하지 않는다.
- Alternatives Considered: Generic JSON gate와 collector는 공통 metadata source와 production caller가 없고 schema별 destructive 조건을 충분히 표현하지 못해 제외했다. Contract 전용 승인은 같은 release 중복 승인이므로 제외했다.
- Consequences: 실제 destructive migration의 backup/restore, 구버전 workload compatibility와 rollback window는 해당 schema migration 이슈·PR·release가 직접 소유하고 검증해야 한다. 공통 pipeline은 migration 실패를 activation 실패로만 처리한다.
- Confirmation / Follow-up: Workflow 입력과 deploy script에 generic gate/context가 없고, rendered migration/API/Web의 동일 digest와 PreSync sync 실패 시 activation 차단을 검증한다.

### Application rollback은 이전 tag와 digest를 같은 pipeline에 재입력한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: PROD-563
- Status: Superseded
- Context / Problem: 별도 rollback 구현은 승인·identity 검증·감사 경계를 우회할 수 있고 DB rollback과 혼동될 수 있다.
- Decision Outcome: 운영자가 현재 DB와 호환된다고 판단한 이전 정상 SemVer tag와 digest를 동일 production workflow에 입력하고 다시 승인해 application rollback한다. Pipeline은 DB 상태나 migration history를 되돌리지 않는다.
- Alternatives Considered: Argo CD history의 임의 revision rollback은 SemVer/digest 검증과 현재 workflow approval을 우회할 수 있다. 자동 DB rollback은 명시적 제외 범위여서 선택하지 않는다.
- Consequences: Rollback도 정상 배포와 같은 승인 시간이 필요하고 운영자는 호환 가능한 이전 identity를 알아야 한다. Schema 호환성과 destructive migration 판단은 해당 schema migration 이슈·PR·release에 남는다.
- Confirmation / Follow-up: 이전 identity 재선택, 승인, 두 workload 복구와 DB 비변경을 workflow/manifest 검증으로 확인한다.

### Application rollback은 이전 immutable Release tag를 같은 pipeline에 재입력한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, PROD-563
- Status: Active
- Context / Problem: Application rollback도 수동 digest 복사 없이 정상 배포와 같은 immutable identity source, 승인과 감사 경계를 사용해야 한다.
- Decision Outcome: 운영자가 현재 DB와 호환된다고 판단한 이전 정상 immutable GitHub Release tag를 동일 production workflow에 입력하고 다시 승인한다. Pipeline은 해당 Release와 `docker-image-ref.txt` attestation을 검증해 이전 digest를 해석하며 DB 상태나 migration history를 되돌리지 않는다.
- Alternatives Considered: 이전 tag와 digest를 함께 입력하는 방식은 안전하지만 새 release 선택과 다른 UX를 유지한다. Argo CD history의 임의 revision rollback은 immutable Release 검증과 현재 workflow approval을 우회할 수 있어 선택하지 않는다.
- Consequences: Rollback도 검증 가능한 immutable GitHub Release가 있어야 하고 정상 배포와 같은 승인 시간이 필요하다. Schema 호환성과 destructive migration 판단은 해당 schema migration 이슈·PR·release에 남는다.
- Confirmation / Follow-up: 이전 Release tag 재선택, Release/asset 검증, 승인, 두 workload 복구와 DB 비변경을 workflow/manifest 검증으로 확인한다.

### GitHub와 Argo CD의 기존 실행 기록을 release audit log로 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-563
- Status: Active
- Context / Problem: 재실행과 rollback의 요청·승인·identity·결과를 추적해야 하지만 별도 release database는 현재 범위를 확장한다.
- Decision Outcome: GitHub workflow/deployment record와 job summary에 요청자, 승인 environment, immutable Release tag, asset에서 해석한 digest와 결과를 남기고 Argo CD operation/history의 실제 적용 결과와 연결한다.
- Alternatives Considered: 별도 database나 release service는 새로운 runtime과 lifecycle을 만들며, workflow log만 남기는 방식은 요약된 identity와 최종 결과 확인이 어려워 선택하지 않는다.
- Consequences: Audit 조회는 GitHub와 Argo CD 보존 정책에 의존한다. 장기 규제 보존 요구가 생기면 별도 계약으로 export/storage를 추가해야 한다.
- Confirmation / Follow-up: 성공·검증 실패·rollback fixture에서 job summary와 deployment/operation metadata에 필수 필드가 남는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `SemVer tag와 digest를 함께 검증해 full image reference를 확정한다`: 사용자가 immutable GitHub Release tag 하나를 selector로 사용하기로 결정해 `Immutable GitHub Release tag에서 attested image identity를 해석한다`로 대체했다.
- `Application rollback은 이전 tag와 digest를 같은 pipeline에 재입력한다`: 같은 사용자 결정에 따라 이전 immutable Release tag만 재입력하고 검증된 asset에서 digest를 해석하는 방식으로 대체했다.
- `Contract context producer와 release metadata source는 upstream 결정이 필요하다`: generic gate와 collector를 공통 pipeline 계약에서 제거한 사용자 최종 결정으로 대체했다.
- `두 Rollout은 migration과 preview 검증 뒤 수동 승격한다`: 사용자가 custom cross-Rollout coordination과 pipeline 내부 자동 recovery를 제거하고 PreSync 뒤 controller 기본 activation을 사용하기로 결정해 `PreSync 성공 뒤 controller 기본 activation을 사용한다`로 대체했다.
