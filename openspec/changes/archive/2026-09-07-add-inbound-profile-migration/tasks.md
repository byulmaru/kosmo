## Stack responsibility mapping (2026-09-08)

| Layer                              | 소유 범위                                                                      | 연결 task |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------- |
| `PROD-743` / 기존 PR #787 (bottom) | 준비 관계 DB·Core/API·Local Actor alias                                        | 1.1–1.4   |
| `PROD-743-move` (middle)           | Core Move·Fedify inbound Move·Temporal Workflow 및 자체 검증                   | 2.1–2.4   |
| `PROD-743-settings` (top)          | Settings UI·Web 및 실제 PostgreSQL/Temporal cross-slice 검증·spec sync·archive | 3.1–3.4   |

세 layer는 동일 `PROD-743`의 구현 단위다.

## 1. PROD-743 Profile Migration 준비와 Local Actor 표현 — bottom

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0027-profile-migration-inbound-move.md`
- `PROD-743`

**Deliverable**

사용자가 권한 있는 현재 선택된 Profile에 Remote source를 준비하면 source Profile과 1:1 준비 관계가 저장되고, Local target인 경우 해당 Local Actor가 검증된 source canonical URI를 migration alias로 제공한다.

**Guardrails**

- GraphQL API는 기존 `withAuth({ profileRole: OWNER })`로 `Account.Active`와 selected Profile의 `Profile.Owner`를 확인하고, Core는 `ctx.session.profile.id`에서 파생된 target Profile ID와 source Profile ID만 받아 source/pair 조건을 검증한다. Core는 Account·membership authorization과 별도 target eligibility를 다시 수행하지 않으며 `InstanceState.UNRESPONSIVE`를 새 거부 조건으로 추가하지 않는다.
- source는 Remote Profile로 materialize하며 target 하나와 source 하나의 cardinality를 지킨다.
- 같은 pair는 no-op으로, 다른 pair와의 충돌은 거부하며 기존 관계를 바꾸지 않는다.
- `alsoKnownAs`는 준비 관계의 검증된 canonical Actor URI에서만 파생하고 raw 입력·stale client 값을 사용하지 않는다.
- 운영자 CLI나 flag 관리 UI/CLI를 추가하지 않는다.

**Verification**

- 준비 성공, 권한·상태·origin·policy 거부, source/target 양쪽 충돌과 same-pair no-op을 실행 결과로 검증한다.
- source materialization 실패와 concurrent 동일 pair의 중복 방지를 확인한다.
- 준비 관계가 있는 Actor의 exact alias와 관계가 없는 Actor의 alias 부재를 검증한다.

- [x] 1.1 Profile Migration 준비 관계의 저장·selected-context 권한·1:1 cardinality와 same-pair/conflict 결과를 구현한다.
- [x] 1.2 기존 Fedify remote actor materialization 경계를 사용해 source qualified handle을 검증하고 Remote Profile identity를 준비 관계에 연결한다.
- [x] 1.3 Local Actor 표현에 준비 관계의 canonical source URI만 `alsoKnownAs`로 투영한다.
- [x] 1.4 준비 성공·거부·충돌·반복·alias projection의 Core/API/Actor 검증을 통과시킨다.

## 2. PROD-743 inbound ActivityPub Move와 Follow 이전 — middle

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `docs/domain/decisions/0027-profile-migration-inbound-move.md`
- `PROD-743`

**Deliverable**

검증된 inbound ActivityPub `Move`가 remote-to-local·remote-to-remote target에 대해 범위 내 Local follower를 target Follow 또는 Follow Request로 이전하고 source 관계를 안전하게 정리한다.

**Guardrails**

- 인증된 actor와 object의 canonical source URI가 같고 target canonical Actor에 exact source alias가 있을 때만 처리한다.
- source가 Remote Profile이어야 하며 기존 지원 Actor 종류를 유지한다. remote-to-remote는 Local 준비 관계를 요구하지 않고, remote-to-local은 준비된 Local target을 사용한다.
- source Followee의 established Follow 중 Local Follower만 대상이며 target policy에 따라 Follow 또는 Request를 먼저 저장한다.
- target 저장이 확정되기 전 source 관계를 제거하지 않는다. 기존 target row/request가 있는 재시도는 중복 없이 source cleanup을 재개한다.
- Remote target의 Open policy는 기존 Local-to-Remote Follow effect, Approval Required는 기존 Request lifecycle을 사용하고, source removal은 기존 Unfollow·Undo lifecycle을 따른다. HTTP receipt은 별도 완료 조건이 아니다.
- 기존 Profile·Follow eligibility와 Temporal lifecycle을 우회하지 않으며, outgoing Move·전체 데이터 이전을 구현하지 않는다.

**Verification**

- actor/object mismatch, missing exact alias, source/target identity 불일치와 검증되지 않은 actor의 no-change 결과를 확인한다.
- unknown source materialization, 준비된 Local target, Remote target의 기존 policy, 지원 Actor 종류를 검증한다.
- Local established follower만 선택하고 remote/non-established/pending 관계를 제외하는지 확인한다.
- Open Follow·Approval Required Request의 target-first 순서, target 실패 시 source 보존을 실행 검증한다.
- Remote target의 Open/Approval Required effect·Request lifecycle과 source removal/Undo 경계를 기존 계약대로 검증한다. HTTP receipt 도착을 source removal 조건으로 삼지 않는지 확인한다.
- 반복 Move, target 저장 뒤 중단·재시작, 기존 target Follow/Request에서 source cleanup 재개를 검증한다. command sequence를 바꿀 때만 Workflow history replay와 배포 호환성을 추가 확인한다.

- [x] 2.1 inbound Move의 canonical actor/object·target Actor·exact alias validation과 source Remote Profile materialization을 구현한다.
- [x] 2.2 remote-to-local·remote-to-remote target resolution과 target Follow Approval Policy admission을 연결한다.
- [x] 2.3 기존 Local established follower를 target Follow/Request 선저장 후 source Follow 제거로 이전하고 target 실패·중단·재시작 경계를 구현한다.
- [x] 2.4 유효·무효 identity, 두 target origin, follower 선별, policy 결과, target-first 실패와 기존 target state 재시도 검증을 통과시킨다.

## 3. PROD-743 Settings source 준비 UI와 통합 검증 — top

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0027-profile-migration-inbound-move.md`
- `PROD-743`

**Deliverable**

Profile Migration feature flag가 확인된 ON일 때만 Settings Profile detail에서 source 준비 control과 입력·저장·실패 재시도를 제공하고, 전체 준비·Actor·inbound Move 결과를 하나의 이슈 완료 증거로 연결한다.

**Guardrails**

- flag OFF·미확인·로딩에서는 control을 렌더링하지 않는다.
- flag는 UI 노출 조건일 뿐 Profile Owner 권한, 준비 관계, alias 또는 inbound Move 처리의 runtime gate가 아니다.
- action은 기존 `Account.Active`·`Profile.Owner` 권한과 Profile detail의 loading/error/empty 경계를 사용한다.
- source 저장 실패 시 입력·안전한 오류·재시도를 유지하며 기존 관계와 alias를 실패 결과로 바꾸지 않는다.
- 실제 검증한 플랫폼과 미실행 환경을 구분 보고하고, 로컬/CI 결과를 운영 계정의 실제 이전 성공으로 일반화하지 않는다.

**Verification**

- flag ON·OFF·unknown·loading에서 source control 노출을 실행 검증한다.
- owner·non-owner, selected Profile 없음, source 준비 성공·실패·재시도와 입력 보존을 확인한다.
- flag OFF 뒤에도 이미 준비된 관계·alias와 inbound Move 처리의 수렴을 확인한다.
- 지원된 Web/Native 환경의 접근성·reflow 및 Profile/Move/Follow cross-slice 결과를 검증하고, 검증하지 않은 플랫폼은 명시한다.
- 모든 task가 완료되고 canonical·Linear·delta spec 정합성, strict validation과 archive 전 확인이 준비됐는지 점검한다.

- [x] 3.1 Settings Profile detail에 확인된 feature flag 조건부 source 준비 control과 기존 Owner 권한 연결을 구현한다.
- [x] 3.2 source 입력·저장 성공·실패·재시도와 입력 보존, ON/OFF/unknown/loading 및 접근성 상태 검증을 추가한다.
- [x] 3.3 준비 관계·alias·inbound Move·Follow 이전의 cross-slice 통합 검증과 환경별 실제 검증/미실행 기록을 남긴다.
- [x] 3.4 PROD-743의 전체 구현·검증 증거와 canonical·Linear 정합성을 확인하고 delta spec을 동기화한 뒤, 선언된 범위와 모든 task가 완료된 경우에만 archive한다.

## Verification ledger (archive history — 2026-09-07)

이 절은 archive 당시 확인한 실행 증거와 보장 경계를 기록한다. 12개 checkbox는 archive 당시 모두 완료 상태이며, 2026-09-08 Stack 분리 후 재검증은 아래 `Post-split verification ledger`에 별도로 기록한다. 이전 증거와 현재 Stack 결과를 섞지 않는다.

### Confirmed execution evidence (archive history)

- Core의 준비 관계 통합 검증(`packages/core/services/profile-migration.integration.test.ts`)은 6/6 pass였다. Owner·`Account.Active`, Local·Open·Active target, Remote source materialization, same-pair no-op, 양쪽 conflict와 concurrent 동일 요청을 실행 확인했다.
- Core Move coordinator 검증(`packages/core/services/profile-migration-move.test.ts`)은 8/8 pass였고 Worker의 재시도 workflow 검증은 1/1 pass, `@kosmo/worker` build도 pass였다. Local·Remote target의 Open/Approval Required admission, target-first 저장, 실패 시 source 보존, 기존 target state 재개와 follower 선별을 포함한다.
- 재배치 후 Settings focused unit은 12/12 pass, Storybook Chromium 검증은 5/5 pass였고 App/API TypeScript 검사와 Relay compiler가 pass했다. 재배치 전 전용 DB API integration 3/3, alias projection 4/4와 관련 회귀 60 pass도 별도 시점의 증거로 보존한다.
- inbound `Move` protocol suite는 전용 disposable PostgreSQL에서 9/9 pass였다. actor/object mismatch, prepared remote-to-local, canonical target alias를 확인한 remote-to-remote, unknown source materialization, non-Person Actor, target identity mismatch, Local target rejection, Temporal start failure 전파와 embedded target alias 위조 거부를 포함한다. 실제 Worker cross-slice test도 전용 disposable PostgreSQL에서 1/1 pass였고 bundle/start 및 follower state DB assertion을 통과했다.
- 빈 DB migration chain은 44개 migration 적용과 `20260907095823_prod_743_profile_migration` 최신 migration, Profile Migration PK/FK·source/target unique·not-null 제약을 확인했다.
- 검증 명령은 각 package의 focused test runner와 `tsc --noEmit`, Worker `build`, App `relay`/TypeScript, Storybook Chromium runner를 사용했다. 모든 실행은 로컬 disposable 환경에서 수행한 archive 당시 증거다.

### Scope and verification boundaries

- Core 전체 TypeScript 검사는 실패했다. 이를 baseline 기존 오류라고 확정하지 않으며 성공 증거로 사용하지 않는다.
- Native Android/iOS runtime, 실제 screen reader, 원격 HTTP 수신/receipt, 실제 운영 계정 migration·flag 변경·배포는 실행하지 않았다. 로컬/CI 결과를 운영 성공으로 일반화하지 않는다.
- cross-slice 실행 중 기존 source removal `sendProfileUnfollowActivity`가 key pair 부재로 attempt 1/2 warning을 남겼지만 Workflow result와 scoped DB assertions는 pass했다. HTTP receipt은 본 change의 완료 조건이 아니다.
- 서버 간 receipt 순서와 동시 Follow/Unfollow race에 대한 추가 보장은 제공하거나 검증하지 않는다.

### Post-split verification ledger (completed — 2026-09-08)

Stack 분리·간략화 후 각 layer의 exact head와 소유 범위를 독립적으로 재검증했다. 아래 결과로 하위 active ledger에 남아 있던 당시 pending 문구와 top-layer pending 문구를 해소한다. 각 결과는 다른 layer의 결과를 대신하지 않는다.

- Bottom exact head `3e540c96f5593fb97433fada709d49d209dce62e`: Core preparation integration 6/6, API profile-migration integration 3/3, Fedify actor-alias delivery 4/4, API/Fedify TypeScript 검사를 통과했다.
- Middle exact head `bd4018757c1594fc25d3dbe1f1c64b7bfef107cb`: Core Move coordinator 8/8, inbound Move protocol 9/9, Worker retry/cursor 1/1, Worker build를 통과했다.
- Top exact head `7f1a377121bf60622b839ef887034e1febbc9889`: Settings focused unit 12/12, Relay compiler(`--noWatchman`), App TypeScript, Fedify TypeScript를 통과했다. Relay는 123 reader, 79 normalization, 137 operation text를 생성했다.
- Top cross-slice 검증은 독립 실행에서 Storybook Chromium 5/5와 실제 PostgreSQL/Temporal full-flow 1/1을 통과했다. full-flow의 Worker 결과와 DB cleanup fixture 0, seed local instance 1을 확인했다.
- Top canonical specs strict 검증(`openspec validate --specs --strict --no-interactive`)은 75/75 pass였다. 초기 active change(`openspec/changes/add-inbound-profile-migration`)는 top에서 archive(`openspec/changes/archive/2026-09-07-add-inbound-profile-migration`)로 이동했고 canonical `openspec/specs/inbound-profile-migration` 및 delta spec이 동기화되어 있다.
- 위 결과는 local disposable PostgreSQL/Temporal 및 독립 Chromium 환경의 실행 증거다. 전체 Stack의 current proof로 재사용할 수 있는 범위와 각 layer의 exact SHA를 함께 보존한다.

### Current contract validation ledger (2026-09-09)

이번 계약 정정의 현재 실행 증거는 archive history와 분리해 기록한다. 이전 ledger의 historical test evidence와 exact-head snapshot은 변경하지 않는다.

- API boundary: `registerProfileMigrationSource`는 sourceHandle만 받고 `ctx.session.profile.id`를 target으로 사용한다. `withAuth({ profileRole: OWNER })` authorization과 selected target preflight가 remote lookup보다 먼저 실행되고, selected target의 Local Instance `canonicalOrigin`을 materialization context로 사용한다. focused API integration은 5/5 pass였다.
- Core domain: `assertProfileMigrationTarget`와 `prepareProfileMigration`은 target/source Profile ID와 기존 Profile lifecycle·origin·policy·source/pair 조건만 검증하며 Account·membership authorization을 다시 수행하지 않는다. target eligibility는 InstanceState.SUSPENDED를 거부하고 UNRESPONSIVE를 별도 거부 조건으로 추가하지 않는다. focused Core integration은 6/6 pass였다.
- Contract artifacts: generated GraphQL schema에서 별도 target Profile ID input이 제거되었고, canonical docs와 active/archived delta specs가 selected-target/sourceHandle-only wording으로 동기화되었다. OpenSpec strict validation은 75/75 pass였다.

### Archive-time environment cleanup (2026-09-07)

- synthetic backend/API/protocol PostgreSQL DB와 각 runner의 정리를 완료했다. PostgreSQL 18.4 검증 cluster는 정상 종료했고 port `55432` listener와 Temporal 잔여 process가 각각 0개임을 확인했다. 복구용 cluster 파일은 보존하며, 제품 DB와 다른 test DB는 변경하지 않았다.
