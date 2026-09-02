## MODIFIED Requirements

### Requirement: Main production release는 Environment 승인 뒤 같은 SHA와 digest로 build·배포한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update), `PROD-564`, `PROD-831` — 시스템은 main push의 production release가 `prod` Environment 승인 전에는 main SHA를 production job에서 checkout하거나 Vault/Sentry credential을 요청하거나 production runtime image를 build하거나 Argo CD production 상태를 변경하지 않도록 해야 한다 (MUST). 승인 뒤 하나의 gated build run이 event의 immutable main full SHA를 checkout하고 Web, API, Temporal Worker, Fedify Consumer와 migration의 다섯 runtime image를 모두 build해야 하며 (MUST), 그 build run의 완전한 runtime digest release set과 source full SHA를 같은 gated release에서 migration Job과 대응하는 모든 활성화 production workload에 직접 전달해야 한다 (MUST). Runtime digest release set은 `web`, `api`, `worker`, `fedify-consumer`, `migration` 각 항목의 `repository@sha256:<digest>` reference를 정확히 하나씩 포함해야 하며 (MUST), 서로 다른 source SHA·build run의 digest를 섞거나 mutable tag를 중간 identity source로 사용해서는 안 된다 (MUST NOT). GitHub Release, Release asset 또는 승인 시점의 최신 main ref를 identity source로 사용해서는 안 된다 (MUST NOT).

#### Scenario: 승인 대기 중인 main release

- **WHEN** main production release가 `prod` Environment 승인을 기다린다
- **THEN** 시스템은 production source checkout, Vault/Sentry credential 접근, 다섯 runtime image build, Argo CD production credential 획득과 production 상태 변경을 실행하지 않는다

#### Scenario: 승인된 main release

- **WHEN** main production release가 `prod` Environment 승인을 받는다
- **THEN** 하나의 gated build run이 main event의 full SHA를 checkout해 다섯 runtime image를 build하고, 같은 source full SHA와 build run에 귀속된 `web`, `api`, `worker`, `fedify-consumer`, `migration` digest set으로 migration과 각 production workload를 sync한다

#### Scenario: Main이 승인 대기 중 이동함

- **WHEN** release approval이 대기 중인 동안 더 새로운 commit이 main에 merge된다
- **THEN** 기존 release의 source와 runtime digest release set identity는 승인 시점의 최신 main이 아니라 event의 기존 full SHA와 승인 뒤 생성된 해당 build run의 완전한 digest set으로 유지된다

#### Scenario: Runtime digest release set이 불완전함

- **WHEN** 승인된 build run이 다섯 runtime 중 하나라도 digest를 만들지 못하거나 다른 source SHA·build run의 digest를 포함한다
- **THEN** 시스템은 완전한 release set을 만들지 못한 release의 Argo CD production 상태 변경과 workload 배포를 실행하지 않고 release를 실패로 기록한다

### Requirement: 임의 repository commit을 수동 production release로 선택할 수 있다

**Authority / Provenance:** `PROD-783`, `PROD-831` — 운영자는 main에 저장된 workflow를 수동 실행해 repository에 존재하는 정확한 40자리 commit SHA를 production release target으로 선택할 수 있어야 한다 (MUST). 시스템은 workflow 실행 ref가 `main`인지, 입력이 full SHA 형식인지와 해당 commit이 repository에 존재하는지를 승인 전에 검증해야 한다 (MUST).

입력 target의 code checkout, prod secret·credential 접근, production runtime image build와 Argo CD 상태 변경은 `prod` Environment 승인 뒤에만 실행해야 한다 (MUST). Target commit에 포함된 workflow 정의를 실행해서는 안 된다 (MUST NOT). 승인 뒤 하나의 gated build run이 target SHA에서 Web, API, Temporal Worker, Fedify Consumer와 migration의 다섯 runtime image를 모두 build하고, 그 build run에 귀속된 완전한 runtime digest release set과 target SHA를 같은 gated release에서 migration과 모든 production workload에 전달해야 한다 (MUST). Release set은 `web`, `api`, `worker`, `fedify-consumer`, `migration`의 digest-pinned reference를 모두 포함해야 하며 (MUST), 다른 SHA·build run의 digest나 mutable tag를 사용해서는 안 된다 (MUST NOT).

#### Scenario: 유효한 수동 target

- **WHEN** 운영자가 main workflow에서 repository에 존재하는 40자리 commit SHA를 입력한다
- **THEN** 시스템은 target commit 링크와 SHA를 승인 정보에 표시하고 승인 전에는 target code를 실행하지 않는다

#### Scenario: 승인된 수동 target

- **WHEN** 유효한 manual target이 `prod` Environment 승인을 받는다
- **THEN** 시스템은 target SHA를 checkout해 다섯 runtime image를 하나의 gated build run에서 build하고, 그 build run의 완전한 digest release set과 같은 target SHA로 production migration·workload를 배포한다

#### Scenario: 신뢰할 수 없는 dispatch ref

- **WHEN** manual workflow가 main 이외의 workflow ref에서 시작되거나 입력 SHA가 유효하지 않거나 repository에 존재하지 않는다
- **THEN** 시스템은 target code checkout, prod secret 접근, build와 production 배포 전에 실행을 거부한다

#### Scenario: 수동 runtime digest release set 생성 실패

- **WHEN** 승인된 manual target의 gated build run이 다섯 runtime 중 하나의 digest를 만들지 못하거나 release set의 source SHA·build run이 일치하지 않는다
- **THEN** 시스템은 migration과 production workload를 배포하지 않고 해당 manual release를 실패로 기록한다

### Requirement: Production 배포는 하나의 승인과 직렬화된 실행 경계를 사용한다

**Authority / Provenance:** `PROD-783` (2026-08-18 contract update), `PROD-831` — 시스템은 automatic main과 manual SHA release마다 GitHub `prod` Environment reviewer의 한 번의 명시적 승인을 요구해야 한다 (MUST). 같은 승인은 해당 release의 production checkout, build credential, 다섯 runtime image build, 완전한 runtime digest release set 생성, migration과 모든 활성화 workload 변경 전체에 적용되어야 하며 (MUST), 별도 build·verification·migration approval을 추가해서는 안 된다 (MUST NOT).

실행 중인 production 배포는 새 automatic 또는 manual release request 때문에 취소되어서는 안 된다 (MUST NOT). 이미 실행 중인 release 뒤에 승인된 release request가 여러 개 대기하면 시스템은 최신 pending request만 다음 실행으로 유지할 수 있으며 (MAY), 대체된 request는 Actions 취소 기록으로 식별하고 필요하면 같은 automatic 또는 manual full-SHA 승인 경로를 다시 실행할 수 있어야 한다 (MUST).

#### Scenario: 승인 전

- **WHEN** automatic 또는 manual production release가 `prod` 승인을 기다린다
- **THEN** 시스템은 production checkout, build credential, 다섯 runtime image build와 production 상태 변경을 실행하지 않는다

#### Scenario: 실행 중 새 release request 승인

- **WHEN** production 배포가 실행 중인 동안 다른 release request가 승인된다
- **THEN** 실행 중인 배포는 계속되고 새 release request는 같은 production 실행 경계에서 대기한다

#### Scenario: Pending release request 대체

- **WHEN** 하나의 release가 실행 중이고 pending request가 있는 상태에서 더 최신 release request가 같은 대기열에 도달한다
- **THEN** 시스템은 실행 중인 release와 그 완전한 runtime digest release set을 유지하고 이전 pending request를 취소 기록으로 남긴 뒤 최신 request를 다음 실행으로 유지할 수 있다

### Requirement: Production 배포 결과를 immutable identity로 감사할 수 있다

**Authority / Provenance:** `PROD-783`, `PROD-831` — 시스템은 실제 production release를 시작한 각 실행의 trigger 종류, 요청자, workflow definition ref, target full SHA, 승인된 build run identity, `web`·`api`·`worker`·`fedify-consumer`·`migration` 다섯 runtime digest와 Argo CD source revision 및 최종 결과를 감사 가능한 기록에 남겨야 한다 (MUST). Automatic main release에서는 dev build·배포 결과와 승인 뒤 prod build·승인·배포 결과를 구분해야 한다 (MUST). Credential, database 내용과 사용자 콘텐츠를 기록해서는 안 된다 (MUST NOT).

#### Scenario: Automatic main release 종료

- **WHEN** main production release가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 automatic trigger, main target SHA, `prod` 승인 뒤 실행한 build run, 다섯 runtime digest, Argo source revision, dev/prod 경계와 결과를 workflow 기록에 남긴다

#### Scenario: Manual SHA release 종료

- **WHEN** manual SHA production 배포가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 manual trigger, main workflow ref, 입력 target SHA, 승인된 build run, 다섯 runtime digest, Argo source revision과 결과를 workflow 기록에 남긴다

### Requirement: Migration 뒤 controller 기본 activation을 사용한다

**Authority / Provenance:** `PROD-783`, `PROD-564`, `PROD-831` — Argo CD는 기반 리소스를 적용한 뒤 선택한 runtime digest release set의 `migration` image로 production migration Job을 Sync wave 1에서 성공시키고, 같은 release set의 `api`, `web`, `worker`, `fedify-consumer` image를 대응하는 API·Web Rollout·HPA 및 background Deployment에 wave 2에서 적용해야 한다 (MUST). Release set의 다섯 digest는 같은 source full SHA와 승인된 build run에 귀속되어야 하며 (MUST). Release pipeline은 두 Rollout의 preview를 교차 대기하거나 직접 승격해서는 안 되며 (MUST NOT), 이전 ReplicaSet을 찾아 자동 복구해서도 안 된다 (MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 같은 source full SHA와 build run의 `migration` digest를 사용하는 Sync wave 1 migration이 성공한다
- **THEN** Argo CD는 그 release set의 `api`·`web` Rollout·HPA와 `worker`·`fedify-consumer` background Deployment를 wave 2에서 적용하고 각 controller가 기본 activation을 수행한다

#### Scenario: Migration 또는 sync 실패

- **WHEN** runtime digest release set 검증, migration 또는 Argo CD sync가 실패한다
- **THEN** 실행은 실패로 기록되고 wave 2 workload는 활성화되지 않으며 pipeline은 Rollout·ReplicaSet을 직접 복구하지 않는다
