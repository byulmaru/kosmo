## MODIFIED Requirements

### Requirement: Main push는 canonical artifact를 한 번 build해 dev에 배포한다

**Authority / Provenance:** `PROD-833`, `PROD-783`, `PROD-831`, `PROD-791` — 시스템은 `main` push의 immutable full SHA에서 환경 중립 canonical runtime image artifact set을 한 번 build해 GHCR에 게시하고 dev 자동 배포에 전달해야 한다 (MUST). Main push는 production release나 `prod` Environment approval을 자동으로 시작해서는 안 된다 (MUST NOT). 이후 수동 production release가 같은 target을 선택하면 dev와 prod는 source SHA뿐 아니라 runtime별 image digest도 공유해야 한다 (MUST).

Git tag, `production` 브랜치 push와 일반 branch push는 canonical build 또는 production release 경로를 시작해서는 안 된다 (MUST NOT).

#### Scenario: Main push canonical build

- **WHEN** commit이 `main`에 push된다
- **THEN** 시스템은 그 full SHA의 환경 중립 runtime image artifact set을 한 번 build해 dev에 배포하고 production approval은 시작하지 않는다

#### Scenario: Main 외 ref push

- **WHEN** Git tag, `production` 또는 일반 branch ref가 push된다
- **THEN** 시스템은 production release 또는 canonical release build를 시작하지 않는다

#### Scenario: Canonical build 실패

- **WHEN** main SHA의 canonical build가 실패하거나 완전한 runtime digest set을 만들지 못한다
- **THEN** dev 배포는 실행되지 않고 build는 실패로 기록되며 해당 SHA는 canonical production target으로 사용할 수 없다

### Requirement: 수동 production release는 승인된 canonical artifact set을 재build 없이 배포한다

**Authority / Provenance:** `PROD-833`, `PROD-783`, `PROD-564`, `PROD-831`, `PROD-791` — 시스템은 main production release가 `prod` Environment 승인을 받으면 main canonical build가 게시한 target full SHA의 exact runtime image digest set을 재사용해야 하며 (MUST), environment별 Expo bundle 또는 prod image를 다시 build해서는 안 된다 (MUST NOT). Migration Job과 모든 활성화 production workload는 같은 canonical build run과 source SHA에 속하는 각자의 runtime digest를 사용해야 한다 (MUST). GitHub Release, Release asset, mutable container tag 또는 승인 시점의 최신 main ref를 artifact identity source로 사용해서는 안 된다 (MUST NOT).

#### Scenario: 승인 대기 중인 workflow_dispatch release

- **WHEN** workflow_dispatch production release가 `prod` Environment 승인을 기다린다
- **THEN** canonical artifact set은 GHCR에 존재할 수 있지만 시스템은 production runtime secret을 읽거나 Argo CD production credential을 얻거나 production 상태를 변경하지 않는다

#### Scenario: 승인된 workflow_dispatch release

- **WHEN** workflow_dispatch production release가 `prod` Environment 승인을 받는다
- **THEN** gated deploy job은 preflight가 고정한 full SHA와 canonical build의 exact digest set을 검증하고 새 image build 없이 migration과 모든 production workload를 sync한다

#### Scenario: Main이 승인 대기 중 이동함

- **WHEN** release approval이 대기 중인 동안 더 새로운 commit이 main에 merge된다
- **THEN** 기존 release의 source와 artifact identity는 승인 시점의 최신 main이 아니라 preflight가 고정한 full SHA와 그 canonical build의 digest set으로 유지된다

### Requirement: Production credential은 deploy-time exact prod Environment identity만 사용한다

**Authority / Provenance:** `PROD-833`, `PROD-783`, `PROD-791` — 환경 중립 canonical build는 production Vault 설정이나 prod runtime secret을 요청해서는 안 된다 (MUST NOT). Workflow_dispatch production deploy는 `prod` Environment 승인 뒤 exact `repo:byulmaru/kosmo:environment:prod` OIDC subject로 deploy-time production credential만 얻어야 하며 (MUST), main ref·production branch·Git tag·일반 branch identity가 production credential을 얻도록 허용해서는 안 된다 (MUST NOT).

#### Scenario: 승인 전 canonical build

- **WHEN** main canonical build가 environment-neutral image와 source map artifact를 생성·게시한다
- **THEN** build는 production runtime config, production Vault secret 또는 Argo CD production credential을 요청하지 않는다

#### Scenario: 승인된 workflow_dispatch deploy

- **WHEN** workflow_dispatch release가 `prod` Environment 승인을 받고 gated deploy job을 실행한다
- **THEN** Vault와 Argo CD는 exact prod Environment identity에 필요한 deploy-time credential만 제공한다

#### Scenario: Branch 또는 tag identity

- **WHEN** main ref, `production` branch, Git tag 또는 일반 branch identity로 production credential을 요청한다
- **THEN** production credential 발급은 거부된다

### Requirement: 임의 repository commit을 수동 production release로 선택할 수 있다

**Authority / Provenance:** `PROD-833`, `PROD-783` — 운영자는 main에 저장된 workflow를 수동 실행해 repository에 존재하는 정확한 40자리 commit SHA를 production release target으로 선택하거나 입력을 비워 최신 `main` full SHA를 선택할 수 있어야 한다 (MUST). 시스템은 workflow 실행 ref가 `main`인지, 입력이 있다면 full SHA 형식인지, resolved commit이 repository에 존재하는지와 그 SHA에 검증된 canonical artifact set이 있는지를 승인 전에 검증해야 한다 (MUST).

Canonical artifact set이 있으면 target code 재실행·prod build 없이 그 exact digest set을 승인 대상으로 사용해야 한다 (MUST). Artifact set이 없거나 완전하지 않으면 mutable tag 또는 다른 SHA의 artifact를 대신 선택해서는 안 되며 (MUST NOT), production 상태를 변경하지 않고 별도의 환경 중립 artifact 생성·검증 경계가 필요하다고 실패해야 한다 (MUST). Target commit에 포함된 workflow 정의를 실행해서는 안 된다 (MUST NOT).

#### Scenario: Artifact가 있는 유효한 수동 target

- **WHEN** 운영자가 main workflow에서 repository에 존재하고 완전한 canonical artifact set이 있는 40자리 commit SHA를 입력한다
- **THEN** 시스템은 target commit 링크, SHA와 exact digest set을 승인 정보에 표시하고 승인 뒤 그 artifact set을 재build 없이 배포한다

#### Scenario: Target 입력을 생략한 수동 release

- **WHEN** 운영자가 main workflow에서 `target_sha`를 비워 production release를 실행한다
- **THEN** 시스템은 최신 main full SHA를 immutable target으로 확정하고 그 SHA의 canonical artifact set에 동일한 검증을 적용한다

#### Scenario: Artifact가 없는 수동 target

- **WHEN** 입력 SHA는 repository에 존재하지만 검증된 canonical artifact set이 없거나 일부 runtime digest가 누락됐다
- **THEN** 시스템은 다른 tag·SHA의 artifact를 사용하거나 production을 변경하지 않고 환경 중립 artifact 생성·검증이 필요하다고 실행을 실패시킨다

#### Scenario: 신뢰할 수 없는 dispatch ref

- **WHEN** manual workflow가 main 이외의 workflow ref에서 시작되거나 입력 SHA가 유효하지 않거나 repository에 존재하지 않는다
- **THEN** 시스템은 production secret 접근과 production 배포 전에 실행을 거부한다

### Requirement: Production 배포는 하나의 승인과 직렬화된 실행 경계를 사용한다

**Authority / Provenance:** `PROD-833`, `PROD-783` — 시스템은 각 workflow_dispatch SHA release마다 GitHub `prod` Environment reviewer의 한 번의 명시적 승인을 요구해야 한다 (MUST). 같은 승인은 exact canonical artifact set의 production runtime config 주입, migration과 모든 활성화 workload 변경 전체에 적용되어야 하며 (MUST), artifact를 환경별로 다시 build하거나 별도 build·verification·migration approval을 추가해서는 안 된다 (MUST NOT).

실행 중인 production 배포는 새 workflow_dispatch release request 때문에 취소되어서는 안 된다 (MUST NOT). 이미 실행 중인 release 뒤에 승인된 release request가 여러 개 대기하면 시스템은 최신 pending request만 다음 실행으로 유지할 수 있으며 (MAY), 대체된 request는 Actions 취소 기록으로 식별하고 필요하면 다시 승인 경로를 실행할 수 있어야 한다 (MUST).

#### Scenario: 승인 전

- **WHEN** workflow_dispatch production release가 `prod` 승인을 기다린다
- **THEN** 시스템은 production runtime secret 접근과 production 상태 변경을 실행하지 않으며 canonical artifact를 prod 설정으로 재build하지 않는다

#### Scenario: 실행 중 새 release request 승인

- **WHEN** production 배포가 실행 중인 동안 다른 release request가 승인된다
- **THEN** 실행 중인 배포는 계속되고 새 release request는 같은 production 실행 경계에서 대기한다

#### Scenario: Pending release request 대체

- **WHEN** 하나의 release가 실행 중이고 pending request가 있는 상태에서 더 최신 release request가 같은 대기열에 도달한다
- **THEN** 시스템은 실행 중인 release를 유지하고 이전 pending request를 취소 기록으로 남긴 뒤 최신 request를 다음 실행으로 유지할 수 있다

### Requirement: Production 배포 결과를 immutable identity로 감사할 수 있다

**Authority / Provenance:** `PROD-833`, `PROD-783`, `PROD-831` — 시스템은 실제 production release를 시작한 각 실행의 요청자, workflow definition ref, target full SHA, canonical build run, runtime별 image digest set, Argo CD source revision과 최종 결과를 감사 가능한 기록에 남겨야 한다 (MUST). Canonical build·dev 배포와 production 승인·배포 결과는 별도 evidence로 구분해야 한다 (MUST). Credential, database 내용과 사용자 콘텐츠를 기록해서는 안 된다 (MUST NOT).

#### Scenario: Workflow_dispatch SHA release 종료

- **WHEN** manual SHA production 배포가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 manual trigger, main workflow ref, resolved target SHA, 재사용한 canonical build와 digest set, Argo source revision과 결과를 workflow 기록에 남긴다

### Requirement: Rollback은 호환 가능한 SHA의 canonical artifact를 사용하는 forward release다

**Authority / Provenance:** `PROD-833`, `PROD-783`, `PROD-564` — 운영자는 DB와 호환되는 application revert를 main에 merge해 새 canonical artifact set을 만들고 workflow_dispatch release로 배포하거나, repository의 호환 가능한 immutable commit SHA와 그 검증된 canonical artifact set을 target으로 선택할 수 있어야 한다 (MUST). 어느 경로도 database state나 migration history를 자동으로 되돌리거나 destructive migration을 실행해서는 안 된다 (MUST NOT).

#### Scenario: Main revert release

- **WHEN** 운영자가 DB-compatible revert를 main에 merge한다
- **THEN** 시스템은 그 새 main SHA를 환경 중립적으로 한 번 build해 dev에 배포하고 `prod` 승인 뒤 같은 digest set을 production에 전달한다

#### Scenario: 이전 application SHA 수동 release

- **WHEN** 운영자가 현재 DB와 호환되고 검증된 canonical artifact set이 남아 있는 이전 commit SHA를 manual target으로 승인한다
- **THEN** 시스템은 그 artifact set을 재build 없이 정상 production migration·배포 경로로 실행하고 DB state와 history는 되돌리지 않는다
