## ADDED Requirements

### Requirement: 단일 production 브랜치가 실제 release source를 나타낸다

**Authority / Provenance:** `PROD-764` — 저장소는 실제 production source 계보를 나타내는 장기 `production` 브랜치 하나만 유지해야 한다(MUST). 최초 branch는 실제 최신 성공 production release commit에서 시작해야 하고(MUST), 직접 push와 history rewrite가 아니라 PR과 필수 검증으로만 갱신해야 한다(MUST). Production 대상 PR merge는 해당 변경을 production에 배포한다는 유일한 사람의 승인이어야 한다(MUST).

#### Scenario: Production 브랜치 초기화

- **WHEN** 운영자가 배포 기록으로 최신 성공 production commit을 확인한다
- **THEN** 저장소는 그 commit에서 `production`을 만들고 PR 기반 protection을 적용한다

#### Scenario: Main 변경 선택

- **WHEN** main의 일부 변경만 production에 포함한다
- **THEN** 운영자는 현재 production 위에 승인된 변경과 필요한 선행 변경만 반영한 production 대상 PR에서 dependency와 migration 호환성을 검토한다

### Requirement: Version 표시는 후속 변경까지 비활성화한다

**Authority / Provenance:** `PROD-764`, `PROD-631` — 이번 변경은 기존 Web의 `버전: <tag>` 렌더링을 주석 처리하고 production build에서 `EXPO_PUBLIC_RELEASE_TAG` 공급을 요구하지 않아야 한다(MUST). 표시 tag의 생성·공급과 UI 재활성화는 후속 변경에서 결정해야 한다(MUST). Tag는 source commit을 선택하거나 workflow를 시작하거나 배포를 승인해서는 안 되며(MUST NOT), tag push는 production credential을 얻거나 build·배포를 실행해서는 안 된다(MUST NOT).

#### Scenario: Production Web build

- **WHEN** production push SHA의 Web image를 build한다
- **THEN** build는 표시 tag 입력 없이 완료되고 UI는 `버전: <tag>`를 렌더링하지 않는다

#### Scenario: Tag push

- **WHEN** Git tag가 push된다
- **THEN** production build·승인·배포는 시작되지 않는다

### Requirement: Production-first hotfix는 main으로 수렴한다

**Authority / Provenance:** `PROD-764` — Production에서 먼저 merge한 hotfix는 main에도 PR로 반영해야 하며(MUST), main 반영이 끝날 때까지 두 계보의 차이를 추적해야 한다(MUST).

#### Scenario: 긴급 production 수정

- **WHEN** hotfix가 production에 main보다 먼저 merge된다
- **THEN** 운영자는 같은 변경을 main PR로 전달하고 완료 전까지 미반영 상태를 기록한다

## MODIFIED Requirements

### Requirement: Production push가 production 배포를 시작한다

**Authority / Provenance:** `PROD-764`, `PROD-563` — Protected `production` 브랜치의 push는 그 push SHA의 production build·배포 run을 자동으로 시작해야 한다(MUST). Production 대상 PR, review와 필수 check는 branch ruleset이 강제해야 하며(MUST), workflow는 commit과 연결된 PR을 API로 다시 조회해 별도 승인 gate로 사용해서는 안 된다(MUST NOT). 단, 실행 중인 release는 보존하면서 여러 pending run을 가장 최신 production SHA로 coalesce할 수 있다(MAY). Workflow는 mutable branch 이름이 아니라 event의 immutable full SHA를 build와 배포 source로 사용해야 한다(MUST). Main push, 일반 branch build, tag push와 수동 dispatch는 production 배포를 시작해서는 안 된다(MUST NOT).

#### Scenario: Production PR merge

- **WHEN** 필수 review와 checks를 통과한 production 대상 PR이 merge되어 production push가 발생한다
- **THEN** 시스템은 그 push SHA의 production image build와 배포를 자동으로 시작한다

#### Scenario: 연속 production push

- **WHEN** production 배포 하나가 실행 중이고 하나 이상의 다음 production PR이 merge된다
- **THEN** 시스템은 실행 중인 배포를 취소하지 않고 가장 최신 pending push SHA를 다음 배포로 유지할 수 있으며, 대체된 pending run은 GitHub Actions 취소 기록으로 식별한다

#### Scenario: Main 또는 일반 branch

- **WHEN** main이 push되거나 production이 아닌 branch build가 실행된다
- **THEN** 기존 dev build는 가능하지만 production 승인·배포는 시작되지 않는다

### Requirement: Production branch build와 배포는 같은 digest와 source revision을 사용한다

**Authority / Provenance:** `PROD-764`, `PROD-563`, `PROD-564` — 시스템은 production push SHA에서 생성한 digest-pinned image를 같은 workflow의 deploy job에 직접 전달해야 한다(MUST). Migration Job과 모든 활성화 workload는 그 하나의 digest를 사용해야 하고(MUST), Argo CD Helm source도 같은 production push SHA를 사용해야 한다(MUST). Mutable image tag나 release tag를 workload identity 또는 source selector로 사용해서는 안 된다(MUST NOT).

#### Scenario: Production build 완료

- **WHEN** production push build가 digest를 만든다
- **THEN** 시스템은 같은 production SHA의 Helm source와 그 digest를 migration과 모든 활성화 workload에 설정한다

#### Scenario: Build 실패

- **WHEN** production image build가 실패하거나 digest를 만들지 못한다
- **THEN** production deploy job은 실행되지 않는다

### Requirement: Production PR merge가 배포를 승인한다

**Authority / Provenance:** `PROD-764`, `PROD-563` — 필수 review와 checks를 통과한 production 대상 PR merge는 build, migration과 모든 활성화 workload 배포 전체에 대한 유일한 사람의 승인이어야 한다(MUST). 시스템은 merge 이후 별도 workflow dispatch, GitHub Environment reviewer 또는 migration approval을 요구해서는 안 된다(MUST NOT). GitHub `prod` Environment는 credential·OIDC 범위와 deployment 감사 기록을 위해 사용할 수 있지만(MAY), 사람의 승인 gate가 되어서는 안 된다(MUST NOT).

#### Scenario: PR merge 전

- **WHEN** production 대상 PR이 아직 merge되지 않았다
- **THEN** 시스템은 그 PR 변경으로 production build·배포를 시작하지 않는다

#### Scenario: PR merge 후

- **WHEN** production 대상 PR이 필수 review와 checks를 거쳐 merge된다
- **THEN** 시스템은 추가 사람 승인 없이 해당 push SHA와 digest로 production sync를 진행한다

### Requirement: Production 배포 결과를 감사할 수 있다

**Authority / Provenance:** `PROD-764`, `PROD-563` — GitHub PR/branch history는 merge된 production PR과 review·check 이력을 보존해야 한다(MUST). Workflow는 actor, production commit, Helm source revision, image digest와 최종 결과를 감사 가능한 기록에 남겨야 한다(MUST). Credential이나 database 내용은 기록해서는 안 된다(MUST NOT).

#### Scenario: Production 배포 종료

- **WHEN** production 배포가 성공하거나 실패하며 종료된다
- **THEN** GitHub PR/branch history에서 merged PR을 확인할 수 있고 workflow는 actor, commit, source revision, digest와 결과를 기록하되 PR 연결 관계를 다시 조회하지 않는다

### Requirement: 이전 application은 production revert로 새 release를 배포한다

**Authority / Provenance:** `PROD-764` — 운영자는 DB와 호환되는 application 변경을 production PR에서 revert하고 그 PR을 merge해 동일한 자동 build·migration-gated sync 경로로 배포해야 한다(MUST). 과거 tag commit을 직접 재배포하거나 production history를 rewrite해서는 안 되며(MUST NOT), DB 상태나 migration history를 자동으로 되돌려서도 안 된다(MUST NOT).

#### Scenario: Application rollback

- **WHEN** 운영자가 배포된 application 변경을 되돌린다
- **THEN** revert PR merge로 발생한 새 production push가 정상 production release 경로를 실행한다

#### Scenario: DB rollback 아님

- **WHEN** revert release를 배포한다
- **THEN** 시스템은 DB 상태나 migration history를 되돌리지 않는다

## RENAMED Requirements

- FROM: `모든 Git tag는 production build를 시작한다`
- TO: `Production push가 production 배포를 시작한다`
- FROM: `Tag build와 production 배포는 같은 digest를 사용한다`
- TO: `Production branch build와 배포는 같은 digest와 source revision을 사용한다`
- FROM: `이전 production release는 같은 tag 경로로 다시 배포한다`
- TO: `이전 application은 production revert로 새 release를 배포한다`
