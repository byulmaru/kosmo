## ADDED Requirements

### Requirement: Main push는 dev와 production release 승인을 준비한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update), `PROD-791` — 시스템은 `main` push의 immutable full SHA에서 dev 설정 image를 build하고 기존 dev 자동 배포 경로로 전달해야 한다 (MUST). Production 경로는 `prod` Environment approval 대기를 준비해야 하지만 (MUST), production source checkout, Vault/Sentry credential 접근과 prod image build는 승인 뒤에만 실행해야 한다 (MUST). Dev와 prod image는 source SHA를 공유하지만 환경별 공개 build 설정을 유지하며 동일 digest일 필요가 없다. 두 image는 실제 workload source인 GHCR에만 push해야 한다 (MUST).

Git tag, `production` 브랜치 push와 일반 branch push는 이 automatic production release 경로를 시작해서는 안 된다 (MUST NOT).

#### Scenario: Main push build

- **WHEN** commit이 `main`에 push된다
- **THEN** 시스템은 그 full SHA의 dev image를 build해 dev 배포에 전달하고, production 경로에는 그 full SHA를 사용하는 `prod` Environment approval 대기를 만든다. 승인 전에는 production source checkout·credential·prod build·Argo CD 상태 변경을 실행하지 않는다

#### Scenario: Main 외 ref push

- **WHEN** Git tag, `production` 또는 일반 branch ref가 push된다
- **THEN** 시스템은 automatic production release approval이나 production build를 시작하지 않는다

#### Scenario: 승인 뒤 production build 실패

- **WHEN** `prod` Environment 승인 뒤 main SHA의 prod build가 실패하거나 digest를 만들지 못한다
- **THEN** 해당 SHA의 Argo CD production 상태 변경과 workload 배포는 실행되지 않고 release는 실패로 기록된다

### Requirement: Main production release는 Environment 승인 뒤 같은 SHA와 digest로 build·배포한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update), `PROD-564`, `PROD-791` — 시스템은 main push의 production release가 `prod` Environment 승인 전에는 main SHA를 production job에서 checkout하거나 Vault/Sentry credential을 요청하거나 prod image를 build하거나 Argo CD production 상태를 변경하지 않도록 해야 한다 (MUST). 승인 뒤 하나의 gated job이 event의 immutable main full SHA를 checkout하고 prod image를 GHCR에 build한 뒤, 그 build output digest와 같은 SHA를 migration Job과 모든 활성화 production workload에 전달해야 한다 (MUST). GitHub Release, Release asset, mutable container tag 또는 승인 시점의 최신 main ref를 중간 identity source로 사용해서는 안 된다 (MUST NOT).

#### Scenario: 승인 대기 중인 main release

- **WHEN** main production release가 `prod` Environment 승인을 기다린다
- **THEN** 시스템은 production source checkout, Vault/Sentry credential 접근, prod image build, Argo CD production credential 획득과 production 상태 변경을 실행하지 않는다

#### Scenario: 승인된 main release

- **WHEN** main production release가 `prod` Environment 승인을 받는다
- **THEN** 하나의 gated job이 main event의 full SHA를 checkout하고 prod image를 build한 뒤, 같은 SHA와 build digest로 migration과 모든 production workload를 sync한다

#### Scenario: Main이 승인 대기 중 이동함

- **WHEN** release approval이 대기 중인 동안 더 새로운 commit이 main에 merge된다
- **THEN** 기존 release의 source와 image identity는 승인 시점의 최신 main이 아니라 event의 기존 full SHA와 승인 뒤 생성된 해당 release digest로 유지된다

### Requirement: Production build secret credential은 exact prod Environment identity만 사용한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update), `PROD-791` — Automatic main과 manual full-SHA production build는 모두 `prod` Environment 승인 뒤 실행되므로 Vault production build trust는 exact `repo:byulmaru/kosmo:environment:prod` OIDC subject만 허용해야 한다 (MUST). `ref:refs/heads/main`, `ref:refs/heads/production`, Git tag와 일반 branch subject는 production build secret credential을 얻을 수 없어야 한다 (MUST NOT). Production image push는 GitHub Packages permission으로 GHCR만 사용하고 AWS/ECR credential을 요청해서는 안 된다 (MUST NOT).

#### Scenario: 승인된 automatic 또는 manual build

- **WHEN** automatic main 또는 manual full-SHA release가 `prod` Environment 승인을 받고 gated build job을 실행한다
- **THEN** Vault는 exact `repo:byulmaru/kosmo:environment:prod` subject로만 production build secret credential을 발급하고 image는 GHCR에만 push된다

#### Scenario: branch 또는 tag identity

- **WHEN** main ref, `production` branch, Git tag 또는 일반 branch identity로 production build credential을 요청한다
- **THEN** Vault는 production build secret credential 발급을 거부한다

### Requirement: 임의 repository commit을 수동 production release로 선택할 수 있다

**Authority / Provenance:** `PROD-783` — 운영자는 main에 저장된 workflow를 수동 실행해 repository에 존재하는 정확한 40자리 commit SHA를 production release target으로 선택할 수 있어야 한다 (MUST). 시스템은 workflow 실행 ref가 `main`인지, 입력이 full SHA 형식인지와 해당 commit이 repository에 존재하는지를 승인 전에 검증해야 한다 (MUST).

입력 target의 code checkout, prod secret·credential 접근, production image build와 Argo CD 상태 변경은 `prod` Environment 승인 뒤에만 실행해야 한다 (MUST). Target commit에 포함된 workflow 정의를 실행해서는 안 된다 (MUST NOT). 승인 뒤 시스템은 target SHA에서 prod 설정 image를 한 번 build하고 그 output digest와 target SHA를 같은 gated release에서 migration과 모든 production workload에 전달해야 한다 (MUST).

#### Scenario: 유효한 수동 target

- **WHEN** 운영자가 main workflow에서 repository에 존재하는 40자리 commit SHA를 입력한다
- **THEN** 시스템은 target commit 링크와 SHA를 승인 정보에 표시하고 승인 전에는 target code를 실행하지 않는다

#### Scenario: 승인된 수동 target

- **WHEN** 유효한 manual target이 `prod` Environment 승인을 받는다
- **THEN** 시스템은 target SHA를 checkout해 prod image를 build하고 그 digest와 같은 target SHA로 production을 배포한다

#### Scenario: 신뢰할 수 없는 dispatch ref

- **WHEN** manual workflow가 main 이외의 workflow ref에서 시작되거나 입력 SHA가 유효하지 않거나 repository에 존재하지 않는다
- **THEN** 시스템은 target code checkout, prod secret 접근, build와 production 배포 전에 실행을 거부한다

### Requirement: Production 배포는 하나의 승인과 직렬화된 실행 경계를 사용한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update) — 시스템은 automatic main과 manual SHA release마다 GitHub `prod` Environment reviewer의 한 번의 명시적 승인을 요구해야 한다 (MUST). 같은 승인은 해당 release의 production checkout, build credential, prod image build, migration과 모든 활성화 workload 변경 전체에 적용되어야 하며 (MUST), 별도 build·verification·migration approval을 추가해서는 안 된다 (MUST NOT).

실행 중인 production 배포는 새 automatic 또는 manual release request 때문에 취소되어서는 안 된다 (MUST NOT). 이미 실행 중인 release 뒤에 승인된 release request가 여러 개 대기하면 시스템은 최신 pending request만 다음 실행으로 유지할 수 있으며 (MAY), 대체된 request는 Actions 취소 기록으로 식별하고 필요하면 다시 승인 경로를 실행할 수 있어야 한다 (MUST).

#### Scenario: 승인 전

- **WHEN** automatic 또는 manual production release가 `prod` 승인을 기다린다
- **THEN** 시스템은 production checkout, build credential, prod image build와 production 상태 변경을 실행하지 않는다

#### Scenario: 실행 중 새 release request 승인

- **WHEN** production 배포가 실행 중인 동안 다른 release request가 승인된다
- **THEN** 실행 중인 배포는 계속되고 새 release request는 같은 production 실행 경계에서 대기한다

#### Scenario: Pending release request 대체

- **WHEN** 하나의 release가 실행 중이고 pending request가 있는 상태에서 더 최신 release request가 같은 대기열에 도달한다
- **THEN** 시스템은 실행 중인 release를 유지하고 이전 pending request를 취소 기록으로 남긴 뒤 최신 request를 다음 실행으로 유지할 수 있다

### Requirement: Production 배포 결과를 immutable identity로 감사할 수 있다

**Authority / Provenance:** `PROD-783` — 시스템은 실제 production release를 시작한 각 실행의 trigger 종류, 요청자, workflow definition ref, target full SHA, image digest, Argo CD source revision과 최종 결과를 감사 가능한 기록에 남겨야 한다 (MUST). Automatic main release에서는 dev build·배포 결과와 승인 뒤 prod build·승인·배포 결과를 구분해야 한다 (MUST). Credential, database 내용과 사용자 콘텐츠를 기록해서는 안 된다 (MUST NOT).

#### Scenario: Automatic main release 종료

- **WHEN** main production release가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 automatic trigger, main target SHA, `prod` 승인 뒤 생성된 digest, Argo source revision, dev/prod 경계와 결과를 workflow 기록에 남긴다

#### Scenario: Manual SHA release 종료

- **WHEN** manual SHA production 배포가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 manual trigger, main workflow ref, 입력 target SHA, build digest, Argo source revision과 결과를 workflow 기록에 남긴다

### Requirement: Rollback은 호환 가능한 SHA의 새 forward release다

**Authority / Provenance:** `PROD-783`, `PROD-564` — 운영자는 DB와 호환되는 application revert를 main에 merge해 automatic release로 배포하거나, repository의 호환 가능한 immutable commit SHA를 manual release로 선택할 수 있어야 한다 (MUST). 어느 경로도 database state나 migration history를 자동으로 되돌리거나 destructive migration을 실행해서는 안 된다 (MUST NOT).

#### Scenario: Main revert release

- **WHEN** 운영자가 DB-compatible revert를 main에 merge한다
- **THEN** 시스템은 그 새 main SHA를 dev에 자동 배포하고 `prod` 승인 뒤 gated prod build·배포 경로로 production에 전달한다

#### Scenario: 이전 application SHA 수동 release

- **WHEN** 운영자가 현재 DB와 호환되는 이전 commit SHA를 manual target으로 승인한다
- **THEN** 시스템은 그 SHA를 새로 build해 정상 production migration·배포 경로로 실행하고 DB state와 history는 되돌리지 않는다

## MODIFIED Requirements

### Requirement: Migration 뒤 controller 기본 activation을 사용한다

**Authority / Provenance:** `PROD-783`, `PROD-564` — Argo CD는 기반 리소스를 적용한 뒤 선택한 release digest의 production migration Job을 Sync wave 1로 성공시키고 API와 Web Rollout·HPA 및 background Deployment를 wave 2에서 적용해야 한다 (MUST). Release pipeline은 두 Rollout의 preview를 교차 대기하거나 직접 승격해서는 안 되며 (MUST NOT), 이전 ReplicaSet을 찾아 자동 복구해서도 안 된다 (MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 같은 release digest의 Sync wave 1 migration이 성공한다
- **THEN** Argo CD는 API·Web Rollout·HPA와 background Deployment를 wave 2에서 적용하고 각 controller가 기본 activation을 수행한다

#### Scenario: Migration 또는 sync 실패

- **WHEN** migration이나 Argo CD sync가 실패한다
- **THEN** 실행은 실패로 기록되고 pipeline은 Rollout·ReplicaSet을 직접 복구하지 않는다

## REMOVED Requirements

### Requirement: 모든 Git tag는 production build를 시작한다

**Authority / Provenance:** `PROD-563`, `PROD-783`

**Reason:** `PROD-783`은 production source를 Git tag에서 승인된 automatic main release와 manual full SHA로 변경한다.

**Migration:** Tag push trigger와 tag OIDC trust를 제거하고 main push의 `prod` approval 경로와 main workflow의 manual SHA 입력 경로를 사용한다.

### Requirement: Tag build와 production 배포는 같은 digest를 사용한다

**Authority / Provenance:** `PROD-563`, `PROD-783`

**Reason:** Production build identity가 tag build에서 승인된 main 또는 manual SHA gated build로 바뀐다.

**Migration:** Automatic main과 manual target은 각각 `prod` 승인 뒤 gated job에서 만든 output digest를 같은 release의 배포 경계에 직접 전달한다.

### Requirement: Production 배포는 한 번의 명시적 승인을 요구한다

**Authority / Provenance:** `PROD-563`, `PROD-783`

**Reason:** 한 번의 Environment 승인 원칙은 유지하지만 tag build 전용 조건과 pending tag 의미를 automatic/manual gated release 계약으로 교체한다.

**Migration:** 새로 추가한 automatic/manual 공통 승인·직렬화 요구사항을 사용한다.

### Requirement: Production 배포 결과를 감사할 수 있다

**Authority / Provenance:** `PROD-563`, `PROD-783`

**Reason:** Tag 중심 감사 필드를 full target SHA, workflow definition ref와 trigger 종류 중심으로 교체한다.

**Migration:** 새 immutable identity 감사 요구사항으로 workflow summary와 운영 기록을 갱신한다.

### Requirement: 이전 production release는 같은 tag 경로로 다시 배포한다

**Authority / Provenance:** `PROD-563`, `PROD-783`

**Reason:** 과거 application release 선택은 새 Git tag가 아니라 main revert 또는 정확한 manual commit SHA로 수행한다.

**Migration:** DB-compatible revert를 main에 merge하거나 호환 가능한 full SHA를 manual release로 승인한다.
