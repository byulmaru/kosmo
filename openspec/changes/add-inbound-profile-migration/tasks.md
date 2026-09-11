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

- [ ] 2.1 inbound Move의 canonical actor/object·target Actor·exact alias validation과 source Remote Profile materialization을 구현한다.
- [ ] 2.2 remote-to-local·remote-to-remote target resolution과 target Follow Approval Policy admission을 연결한다.
- [ ] 2.3 기존 Local established follower를 target Follow/Request 선저장 후 source Follow 제거로 이전하고 target 실패·중단·재시작 경계를 구현한다.
- [ ] 2.4 유효·무효 identity, 두 target origin, follower 선별, policy 결과, target-first 실패와 기존 target state 재시도 검증을 통과시킨다.

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

- [ ] 3.1 Settings Profile detail에 확인된 feature flag 조건부 source 준비 control과 기존 Owner 권한 연결을 구현한다.
- [ ] 3.2 source 입력·저장 성공·실패·재시도와 입력 보존, ON/OFF/unknown/loading 및 접근성 상태 검증을 추가한다.
- [ ] 3.3 준비 관계·alias·inbound Move·Follow 이전의 cross-slice 통합 검증과 환경별 실제 검증/미실행 기록을 남긴다.
- [ ] 3.4 PROD-743의 전체 구현·검증 증거와 canonical·Linear 정합성을 확인하고 delta spec을 동기화한 뒤, 선언된 범위와 모든 task가 완료된 경우에만 archive한다.

## Verification ledger (bottom active evidence — 2026-09-08)

이 ledger는 bottom layer가 보유한 pre-split 실행 증거만 기록한다. 그룹 1의 `[x]`는 이 증거를 기준으로 유지하고, 그룹 2·3의 `[ ]`는 아직 bottom layer가 소유하지 않음을 뜻한다. 이 기록은 분리 후 새 head의 재검증 결과가 아니다.

### Bottom-scope evidence (pre-split history)

- Core 준비 관계 통합 검증(`packages/core/services/profile-migration.integration.test.ts`)은 6/6 pass였다. Owner·`Account.Active`, Local·Open·Active target, Remote source materialization, same-pair no-op, 양쪽 conflict와 concurrent 동일 요청을 실행 확인했다.
- API `tsc --noEmit` 검사는 pass였다.

### Earlier retained evidence (2026-09-07; not current)

- 재배치 전 전용 DB API integration 3/3과 Local Actor alias projection 4/4를 별도 시점에 통과했다. 이 evidence는 현재 bottom head 결과가 아니다.

이 bottom ledger는 Settings UI, inbound Move, Worker/Temporal fullflow의 통과를 주장하지 않는다.

### Post-split revalidation (pending — 2026-09-08)

- 분리된 layer의 exact head/base와 소유 범위 focused 검증을 새로 확인해야 한다. 새 layer 검증 결과가 생기기 전까지 이 ledger의 pre-split evidence를 현재 Stack 결과로 해석하지 않는다.
- Native Android/iOS runtime, 실제 screen reader, 원격 HTTP 수신/receipt, 실제 운영 계정 migration·flag 변경·배포는 실행하지 않았다. 서버 간 receipt 순서와 동시 Follow/Unfollow race에 대한 추가 보장은 제공하거나 검증하지 않는다.
