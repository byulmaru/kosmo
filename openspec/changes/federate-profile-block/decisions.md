## Context

이 기록은 `proposal.md`, `specs/activitypub-profile-block/spec.md`, `design.md`의 결정을 정리한다.
각 결정의 권위는 canonical 문서와 최신 PROD-818 본문이며, OpenSpec 자체를 상위 계약의 근거로 삼지 않는다.
2026-09-08에 발신 방향과 기존 차단 rollout을 확정했다. 아래 Active는 현재 적용하는 결정이라는 뜻이며,
이 문서 전체의 Spec Gate 승인을 뜻하지 않는다.

## Decision Records

### D1. Remote Owner도 기존 Profile Block을 사용한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`의 관계·행동·권한·조회 정책,
  `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, PROD-818의 전달 결과·선행 조건.
- Status: Active
- Context / Problem: ingress별로 차단 상태를 분리하면 같은 pair라도 조회·해제 결과가 달라진다.
- Decision Outcome: verified inbound는 Remote Owner → Local Target의 기존 관계와 required cleanup을 사용한다.
  기본 Profile 정보는 기존 조회 정책을 따르고 콘텐츠 직접 조회에는 방향별 정책, 타임라인·콘텐츠검색에는 양방향 필터링을 적용한다.
  Owner는 자기 방향만 해제하며 반대 방향 Block과 Follow 비복구 정책을 유지한다.
- Alternatives Considered: 별도 제품 차단 상태와 cleanup 복제는 canonical의 단일 관계·행동 계약에 맞지 않는다.
- Consequences: core action은 검증된 중립 identity를 받고, 서명·actor·object·recipient 검증은 ingress가 소유한다.
  ActivityPub-origin Block/Undo echo를 막되 기존 Follow cleanup 효과는 유지한다.
- Confirmation / Follow-up: 실제 DB 관계·조회 결과·cleanup 실패와 양방향 Block 공존을 검증한다.

### D2. Mastodon 호환 발신·수신을 채택한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`의 연합 행동,
  `docs/domain/decisions/0029-profile-block-federation.md`, PROD-818의 2026-09-08 발신 방향 확정.
- Status: Active
- Context / Problem: W3C ActivityPub §6.9의 대상 비전달 권고와 Mastodon의 원격 차단 확장은 다르다.
- Decision Outcome: Local Owner → Remote Target의 Block/Undo를 Target의 원격 서버에 발신한다. audience는 Target
  하나이며 Public·followers로 확장하지 않는다. 차단 사실은 상대 서버에 알려진다.
- Alternatives Considered: 발신을 제외하는 대안은 2026-09-08 Spec 대화에서 채택하지 않았다.
- Consequences: 상대 서버의 화면·알림·정책 적용은 보장하지 않는다. 공통 dispatcher의 direct-only 경로와
  orderingKey 전달을 준비하고 기존 caller의 audience를 보존한다.
- Confirmation / Follow-up: 실제 Mastodon 버전을 기록한 상호운용과 대상 외 수신자 0건을 검증한다.

### D3. 원본별 인과 관계와 정확한 row identity를 보존한다

- Decision Date: 2026-09-08
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-block.md`의 pair uniqueness·Owner 해제,
  `docs/domain/decisions/0029-profile-block-federation.md`의 관계 재사용, PROD-818의 검증·멱등성·순서 역전·상태 보존 범위.
- Status: Active
- Context / Problem: pair 하나나 마지막 도착 ID만 기억하면 지연 Block·Undo가 재차단을 지우거나 종료된 원본을 부활시킨다.
- Decision Outcome: 원본 Block IRI와 actor·Target·정확한 domain row의 대응, 원본 종료 증거와 미완료 효과를
  Block 전용 protocol metadata로 보존한다. 같은 pair의 서로 다른 원본은 개별 Undo로 종료하며 마지막 미해제
  원본이 없어질 때 canonical 해제를 실행한다. 검증 가능한 Undo가 먼저 오면 원본 종료 증거를 먼저 남긴다.
- Alternatives Considered: 원격 published 또는 도착 시각 기반 last-write-wins는 전역 순서를 증명하지 못한다.
  현재 pair 전체 삭제와 단기 queue dedupe만으로는 지연 Undo·장기 replay에 대응할 수 없다.
- Consequences: 제품 관계는 pair당 하나로 유지한다. 필요한 최소 protocol identity만 저장하고 범용 command ledger는
  만들지 않는다. 이번 change에서는 종료 증거를 임의 TTL로 삭제하지 않으며, 테이블 이름과 세부 구조는 고정하지 않는다.
  원본·Undo 검증 실패와 동일 ID의 내용 충돌은 기존 상태를 덮어쓰지 않는다.
- Confirmation / Follow-up: B1·Undo B1·B2의 도착 순서 조합, 여러 미해제 원본, 중복, completion loss와 history 보존
  기간에 의존하지 않는 재전달을 검증한다. 여러 원본 중 일부 Undo만 온 경우 Block이 남는 결과를 상호운용에서 확인한다.

### D4. durable 효과와 Fedify delivery 경계를 분리한다

- Decision Date: 2026-09-08
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-block.md`의 required cleanup·실패 경계,
  `docs/domain/objects/instance.md`의 새 원격 요청 정책, PROD-818의 queue/dispatcher 재사용·retry·Worker restart 범위.
- Status: Active
- Context / Problem: domain commit, Activity completion과 queue 수락 사이에서 응답이 유실될 수 있다.
- Decision Outcome: 원본 identity와 효과 결과를 재구성할 수 있게 보존하고, 같은 directed pair의 Block·Undo·재차단을
  같은 orderingKey로 순서대로 인계한다. queue 인계 실패는 효과를 재시도하며 수락 이후 remote retry는 Fedify가 소유한다.
  Block·Undo의 Activity ID는 retry 중 바꾸지 않는다. producer는 앞선 효과의 인계 결과를 확인·보존할 때까지
  같은 pair의 뒤 효과를 인계하지 않는다. 응답 유실은 같은 선두 효과로 재시도하고, 이미 정산된 효과의 재호출은
  인계 없이 끝낸다. 이는 정산 후 새 호출의 처리이며 이미 실행 중인 이전 attempt의 종료를 보장하지 않는다.
  실제 queue 수락을 확인·보존하면 인계를 정산하고 뒤 효과를 진행한다. remote-visible ordering은 D7에 따라 별도 보장하지 않는다. 인계 retry 소진 시 선두 실패와 뒤 효과 대기를 보존하고, 복구하기 전에는 자동으로 건너뛰지 않는다.
- Alternatives Considered: 각 Activity마다 무작위 ID 재생성, 삭제된 row 재조회, process-local 순서 제어, 별도의 remote
  retry queue는 identity·restart 계약을 지키지 못하거나 기존 queue와 책임이 겹친다.
- Consequences: required cleanup 실패는 action 성공을 막지만 delivery 실패는 확정된 로컬 관계를 rollback하지 않는다.
  transition에서 정한 origin·eligibility·effect plan을 실행 retry가 임의로 바꾸지 않는다. 새 원격 요청 admission은
  기존 정책을 따르며 정책상 제외와 인계 실패를 구분한다. 확정 뒤 unavailable로 제외되면 계획은 보존하고 pending으로 둔다.
  dispatcher 정상 no-op은 인계 성공이 아니며, 영구 불가를 추론한 자동 terminal skip은 하지 않는다. 구체 Workflow·테이블 선택은 PROD-813 완료 후 확인한다.
- Confirmation / Follow-up: DB commit 직후, queue 수락 직후 응답 유실, effect 대기 중 Worker 중단과 Fedify consumer
  재시작을 실제 persistence 경계에서 검증한다. 이전 attempt 종료 증명이나 원격 순서 보장을 정산 조건으로 두지 않는다. 기존 dispatcher caller의 no-op 결과를 보존한다. queue 수락을 상대 정책 적용이나 exactly-once 성공으로 기록하지 않는다.

### D5. 기존 차단을 소급 발신하지 않는다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`의 rollout,
  `docs/domain/decisions/0029-profile-block-federation.md`, PROD-818의 2026-09-08 기존 차단 rollout 확정.
- Status: Active
- Context / Problem: 기능 활성화만으로 과거 차단 사실이 상대 서버에 새로 전달될 수 있다.
- Decision Outcome: 기존 차단은 로컬에 유지하고 도입 후 새로 생성한 차단부터 발신한다. 발신 원본이 없는 차단의
  해제에 임의 Block이나 Undo를 만들지 않는다. 이후 재차단은 새 발신 원본을 갖는다.
- Alternatives Considered: 기존 차단 일괄 발신·소급 동기화는 2026-09-08 Spec 대화에서 제외했다.
- Consequences: additive metadata와 명시적 새 발신 자격을 사용하고, 구버전이 생성한 row를 소급 승격하지 않는다.
  rollback에서 기존 관계·원본 종료 증거를 삭제하지 않는다. 원격에서 과거 차단을 모르는 상태를 허용한다.
- Confirmation / Follow-up: 구버전 row가 있는 migration, 기존 차단 해제와 재차단, old/new workload 및 rollback을 검증한다.

### D6. PROD-818이 연합 change의 완료를 소유한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-profile-block-federation.md`의 책임 경계,
  PROD-818의 위치·명세·검증 소유권, PROD-813의 local 통합 검증·archive 범위.
- Status: Active
- Context / Problem: 로컬 차단과 연합은 blocker·검증·출시 생명주기가 다르다.
- Decision Outcome: Spec Gate 승인과 PROD-813 완료를 모두 확인한 뒤 별도 세션에서 구현한다. PROD-818은 연합 명세,
  구현, protocol·회귀·대표 E2E·restart·정합성 검증과 이 change의 delta sync·archive를 소유한다.
- Alternatives Considered: 로컬 출시를 연합 완료까지 묶거나 부모/PR 순서만으로 archive 책임을 추론하지 않는다.
- Consequences: PROD-813의 `add-profile-block` 책임은 유지한다. 한 PR의 Ready 상태는 이 change 전체 완료와 별개다.
  2026-09-10의 PROD-813 Done 상태만으로 미병합 선행 구현·통합 검증까지 완료됐다고 보지 않는다.
- Confirmation / Follow-up: 전체 tasks와 검증 증거를 확인한 뒤에만 이 change를 archive한다.

### D7. remote-visible delivery ordering을 별도로 보장하지 않는다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-818의 2026-09-10 구두 결정 기록(댓글 `273992ef-16f2-4ade-a655-fa7b1457c3b0`); 사용자가 전달한 @jiyu와의 구두 논의 결과와 동기화 지시. Linear에서의 직접 상세 승인으로 해석하지 않는다.
- Status: Active
- Context / Problem: producer late completion과 Fedify consumer delayed retry로 Undo 뒤에 B1이 전달될 수 있다. 기존 stable Activity ID와 orderingKey는 이를 제거하지 않는다.
- Decision Outcome: PROD-818은 remote-visible Block → Undo ordering을 새 필수 계약으로 추가하지 않는다. 조사 중 추가한 “과거 Block delivery가 후속 Undo의 결과를 뒤집지 않아야 한다”는 요구를 철회한다.
- Alternatives Considered: 모든 이전 attempt 종료 증명, fencing, stale-delivery drop과 generation sequencing/supersession은 이번 범위의 필수 구현으로 채택하지 않는다. 기존 queue가 원격 순서를 보장한다고 간주하는 선택도 하지 않는다.
- Consequences: 실제 queue 수락을 확인·정산하면 후속 Undo를 진행할 수 있다. 이전 attempt 생존 또는 consumer retry 가능성만으로 추가 보류하지 않는다. 기존 identity·로컬 상태 보존·inbound 순서 역전 처리와 ADR 0029의 제품·rollout 결정은 유지한다.
- Confirmation / Follow-up: task 4는 기존 인계·복구·실패 격리를 검증한다. 원격 최종 순서 보장이나 INSERT barrier race 실험은 필수 완료 조건이 아니다. D7은 Spec Gate blocker에서 해소됐으며 Spec 전체 승인을 뜻하지 않는다.

## Remaining Decisions

현재 미해결 제품·설계 결정은 없다. PROD-813 완료 revision의 action·cleanup·exact-row 복구 수단은 구현 착수 시 다시 확인한다.
Spec Gate 재검토 결과 승인 가능한 상태다. 최종 인간 승인과 구현 선행 조건 확인은 별도이며 approval snapshot은 아직 없다.

## Superseded Decisions

조사 중 D7에 두었던 원격 결과 보장과 그 수단을 Spec Gate 전에 확정한다는 조건은 현재 D7으로 철회했다. 이는 delivery race를 기술적으로 해결했다는 뜻이 아니다.
2026-09-06 초안의 발신 질문은 정식 decision record가 아니었으며, 2026-09-08 상위 결정에 따라 D2로 확정했다.
