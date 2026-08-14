# production-release Specification

## Purpose

Git tag build가 만든 하나의 image digest를 명시적 production 승인 뒤 migration과 모든 활성화 workload에 배포하는 경계를 정의한다.

## Requirements

### Requirement: 모든 Git tag는 production build를 시작한다

**Authority / Provenance:** PROD-563 — 시스템은 이름 형식과 관계없이 모든 Git tag push에서 해당 commit의 production image를 build해야 한다(MUST). SemVer 또는 별도 prefix 같은 tag 이름 제한을 production release 조건으로 적용해서는 안 된다(MUST NOT). Branch build는 production 배포를 시작해서는 안 된다(MUST NOT).

#### Scenario: Git tag push

- **WHEN** 어떤 이름의 Git tag가 push된다
- **THEN** 시스템은 그 tag가 가리키는 commit의 production image를 build한다

#### Scenario: Branch push

- **WHEN** branch commit이 build된다
- **THEN** 시스템은 production 승인이나 배포를 시작하지 않는다

### Requirement: Tag build와 production 배포는 같은 digest를 사용한다

**Authority / Provenance:** PROD-563 — 시스템은 tag build가 생성한 digest-pinned image identity를 같은 workflow의 production 승인 job에 직접 전달해야 한다(MUST). Migration Job과 모든 활성화 workload는 그 하나의 digest를 사용해야 한다(MUST). GitHub Release, Release asset 또는 mutable container tag를 중간 identity source로 요구해서는 안 된다(MUST NOT).

#### Scenario: 승인된 tag build

- **WHEN** tag build가 image digest를 만들고 `prod` Environment 승인을 받는다
- **THEN** 시스템은 그 digest를 migration과 모든 활성화 workload에 동일하게 설정한다

#### Scenario: Build 실패

- **WHEN** tag image build가 실패하거나 digest를 만들지 못한다
- **THEN** production 승인 job은 실행되지 않는다

### Requirement: Production 배포는 한 번의 명시적 승인을 요구한다

**Authority / Provenance:** PROD-563 — 시스템은 GitHub `prod` Environment 승인을 받은 tag build만 Argo CD production credential을 얻고 배포 상태를 변경하게 해야 한다(MUST). 같은 승인은 migration과 모든 활성화 workload 전체에 적용되어야 하며(MUST), 별도 verification·migration approval job을 추가해서는 안 된다(MUST NOT).

시스템은 실행 중인 production 배포를 새 tag 때문에 취소해서는 안 된다(MUST NOT). 새 tag build가 같은 배포 대기열에 도달하면 아직 실행되지 않은 이전 pending tag build를 최신 pending tag build로 대체할 수 있다(MAY).

#### Scenario: 승인 전

- **WHEN** tag build는 성공했지만 `prod` Environment 승인이 완료되지 않았다
- **THEN** 시스템은 Argo CD credential을 얻거나 production 상태를 변경하지 않는다

#### Scenario: 승인 후

- **WHEN** tag build가 `prod` Environment 승인을 받는다
- **THEN** 시스템은 해당 build digest로 production sync를 진행한다

#### Scenario: 최신 pending tag가 이전 pending tag를 대체

- **WHEN** production 배포 하나가 실행 중이고 이전 tag build가 pending인 상태에서 더 최신 tag build가 같은 대기열에 도달한다
- **THEN** 실행 중인 배포는 계속되고 이전 pending tag build는 취소되며 최신 tag build가 다음 pending 배포가 된다

### Requirement: Production 배포 결과를 감사할 수 있다

**Authority / Provenance:** PROD-563 — 시스템은 실제 실행을 시작한 각 production 배포의 요청자, Git tag, commit, build digest와 최종 결과를 감사 가능한 기록에 남겨야 한다(MUST). 최신 pending tag에 대체되어 실행을 시작하지 않은 run은 production 배포 실행으로 보지 않으며 GitHub Actions의 취소 기록으로 식별한다. Credential이나 database 내용은 기록해서는 안 된다(MUST NOT).

#### Scenario: Production 배포 종료

- **WHEN** production 배포 실행이 성공하거나 실패하며 종료된다
- **THEN** 시스템은 요청자, tag, commit, digest와 결과를 workflow 기록에 남긴다

### Requirement: Migration 뒤 controller 기본 activation을 사용한다

**Authority / Provenance:** PROD-563 — Argo CD는 기반 리소스를 적용한 뒤 같은 digest의 production migration Job을 Sync wave 1로 성공시키고 API와 Web Rollout·HPA 및 background Deployment를 wave 2에서 적용해야 한다(MUST). Release pipeline은 두 Rollout의 preview를 교차 대기하거나 직접 승격해서는 안 되며(MUST NOT), 이전 ReplicaSet을 찾아 자동 복구해서도 안 된다(MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 같은 digest의 Sync wave 1 migration이 성공한다
- **THEN** Argo CD는 API·Web Rollout·HPA와 background Deployment를 wave 2에서 적용하고 각 controller가 기본 activation을 수행한다

#### Scenario: Migration 또는 sync 실패

- **WHEN** migration이나 Argo CD sync가 실패한다
- **THEN** 실행은 실패로 기록되고 pipeline은 Rollout·ReplicaSet을 직접 복구하지 않는다

### Requirement: 이전 production release는 같은 tag 경로로 다시 배포한다

**Authority / Provenance:** PROD-563 — 운영자는 이 pipeline 도입 이후 실제 production에 배포됐고 현재 DB와 호환되는 이전 release commit에 새 Git tag를 붙여 같은 build·production 승인·migration-gated sync 경로로 application을 다시 배포할 수 있어야 한다(MUST). Pipeline 도입 전의 임의 commit을 현재 workflow로 배포할 것을 보장하지 않으며, DB rollback이나 destructive migration을 자동 실행해서는 안 된다(MUST NOT).

#### Scenario: 이전 production release commit 재배포

- **WHEN** 운영자가 pipeline 도입 이후 production에 배포된 호환 가능한 이전 release commit에 새 tag를 push한다
- **THEN** 시스템은 그 commit을 새로 build하고 같은 production 승인·배포 경로를 실행한다

#### Scenario: DB rollback 아님

- **WHEN** 이전 application commit을 다시 배포한다
- **THEN** 시스템은 DB 상태나 migration history를 되돌리지 않는다
