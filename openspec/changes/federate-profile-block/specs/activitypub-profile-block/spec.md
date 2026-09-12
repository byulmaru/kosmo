## ADDED Requirements

### Requirement: Remote Owner의 기존 Profile Block 적용

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 관계·행동·조회 정책, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-818`의 2026-09-06 전달 결과·선행 조건. 시스템은 검증된 Remote Owner → Local Target의 inbound Block을 기존 Profile Block으로 생성해야 한다(MUST). 같은 방향 pair에는 관계가 하나만 존재해야 하며(MUST), 별도 제품 차단 상태를 만들지 않아야 한다(MUST NOT). 생성·해제는 기존 durable cleanup과 Owner 권한을 따라야 하고(MUST), 해당 실행이 포착한 양방향 Follow Request·Follow Relationship 및 직접 원인 Notification의 필수 정리를 완료하기 전에 action 성공을 확정해서는 안 된다(MUST NOT). 기존 Reaction·Repost Post·Bookmark를 삭제하거나 해제 시 제거된 Follow를 복구해서는 안 된다(MUST NOT).

#### Scenario: Remote Owner가 Local Target을 차단한다

- **WHEN** 인증·admission을 통과한 Remote Owner의 Block이 자신과 다른 Local Target을 가리키고 해당 pair의 관계가 없다
- **THEN** 기존 Profile Block 관계와 required cleanup을 적용한다
- **AND** Profile 기본정보는 기존 조회 정책을 따르고, Post·Media 직접 조회에는 방향별 Block 정책을 적용한다
- **AND** 타임라인·콘텐츠검색·Follow 후보와 상호작용에는 기존 양방향 Block 정책을 적용한다
- **AND** Target이나 제삼자에게 Owner의 차단 관리 관계를 공개하지 않는다

#### Scenario: 차단 방향과 조회 표면에 따라 기존 정책을 적용한다

- **WHEN** Remote Owner A가 Local Target B를 차단하고 각 Profile이 상대를 조회한다
- **THEN** 기본 Profile 정보는 기존 Profile 조회 정책을 따르고 A→B Post·Media 직접 조회에는 기존 콘텐츠 권한을 적용한다
- **AND** B→A 콘텐츠 API는 제한하고 타임라인·콘텐츠검색은 양방향으로 필터링한다
- **AND** B→A Block도 존재하면 양쪽 콘텐츠 API를 제한하며 A의 Undo 뒤에도 남은 B→A 관계의 방향별 정책을 적용한다

#### Scenario: cleanup이 실패한다

- **WHEN** 관계 변경 과정의 required cleanup이 실패하거나 Worker가 중단된다
- **THEN** action을 성공으로 확정하지 않고 기존 durable orchestration에서 재시도·복구한다
- **AND** Active Block은 cleanup과 경합해 남은 Follow·Request보다 우선한다

#### Scenario: Remote Owner가 자신의 Block을 해제한다

- **WHEN** 검증된 Undo가 해당 Remote Owner의 현재 Block에 대한 마지막 미해제 원본을 정확히 가리킨다
- **THEN** 현재 남은 양방향 Follow·Request와 직접 원인 Notification의 required cleanup 후 해당 방향 관계만 제거한다
- **AND** 반대 방향 Local Owner의 Block은 유지하며 제거된 Follow는 복구하지 않는다

### Requirement: 인증된 actor와 정확한 대상 검증

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 ingress 경계·Owner 권한, `docs/domain/objects/profile.md`의 Origin, `PROD-818`의 verified inbound 검증·보안 범위. Protocol 근거: W3C ActivityPub §6.10·§7.12의 Undo actor 일치. 시스템은 기존 Fedify 인증 ingress를 거친 Activity에 대해 Remote actor, Block object인 Local Target, 수신 inbox와 canonical actor URI의 일치를 검증한 뒤 mutation해야 한다(MUST). Undo의 actor와 원본 Block의 actor가 같고 원본 identity·pair가 일치함을 확인해야 한다(MUST). 서명 또는 actor/object/recipient 검증 실패는 domain mutation과 outbound echo를 만들지 않아야 한다(MUST NOT). 차단으로 콘텐츠 조회가 제한된다는 이유만으로 검증된 Owner의 해제를 막아서는 안 된다(MUST NOT). 원본 Block은 식별 가능한 절대 Activity IRI를 가져야 한다(MUST). embedded Block과 URI로 참조한 Block 모두 같은 actor·object·identity 검증을 거쳐야 한다(MUST). 검증을 위한 원격 조회는 기존 안전한 loader와 Instance admission을 사용해야 하며(MUST), 임의 URL fetch로 그 경계를 우회해서는 안 된다(MUST NOT).

#### Scenario: 타인의 Block을 해제하려 한다

- **WHEN** 서명된 Undo의 actor가 원본 Block Owner와 다르거나 원본의 Target을 바꿔 제시한다
- **THEN** 관계와 cleanup 상태를 변경하지 않는다

#### Scenario: personal inbox와 대상이 다르다

- **WHEN** 유효한 Remote actor의 Block이 personal inbox 주인과 다른 Local Target을 가리킨다
- **THEN** Block을 적용하지 않는다

#### Scenario: shared inbox에서 수신한다

- **WHEN** shared inbox에 도착한 Block의 object가 configured Local Instance의 유효한 Local Target으로 검증된다
- **THEN** 검증된 Remote Owner와 그 Local Target의 관계만 처리한다
- **AND** 다른 Local Profile이나 Remote Target의 관계로 확장하지 않는다

#### Scenario: 차단 중에도 해제 검증을 수행한다

- **WHEN** 기존 Block으로 콘텐츠 API가 제한된 상태에서 Owner의 유효한 Undo가 도착한다
- **THEN** 공개 조회 우회 권한을 부여하지 않고 protocol identity 검증 경계에서 Owner와 원본을 확인해 해제한다

#### Scenario: 원본 식별자가 없거나 원격 조회가 허용되지 않는다

- **WHEN** 원본 Block에 유효한 Activity IRI가 없거나 Undo 원본 조회가 기존 안전·admission 경계를 통과하지 못한다
- **THEN** 입력을 검증된 입력으로 취급하지 않고 Profile Block이나 cleanup을 변경하지 않는다

#### Scenario: 저장된 원본을 URI로 참조한다

- **WHEN** 유효한 Undo가 저장된 검증 원본의 IRI를 가리키고 actor·Target·수신 경계가 일치한다
- **THEN** 해당 원본에만 해제를 적용한다
- **AND** embedded 원본을 사용했을 때와 같은 결과로 수렴한다

### Requirement: 중복과 순서 역전에서 identity 보존

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 pair uniqueness·Owner 해제, `PROD-818`의 duplicate·out-of-order·retry 및 로컬 상태 보존 범위. 시스템은 Activity identity와 방향 pair를 구분하여 중복 수신·재시도·Worker restart에도 동일한 Block을 중복 생성하거나 다른 세대의 Block을 해제하지 않아야 한다(MUST NOT). 검증된 Undo로 이미 종료된 원본 Block의 지연 재전달은 관계를 부활시키지 않아야 한다(MUST NOT). 동일 Activity ID에 다른 actor·object를 붙인 입력은 기존 identity를 덮어쓰지 않아야 한다(MUST NOT). 해석에 필요한 원본을 검증할 수 없으면 추측으로 pair 전체를 삭제하지 않아야 한다(MUST NOT). 서로 다른 유효 원본이 같은 방향 pair에 관측되면 각각의 Undo는 참조한 원본만 종료해야 한다(MUST). 다른 미해제 원본이 남아 있는 동안 그 pair의 Profile Block을 제거해서는 안 된다(MUST NOT). 이 원본별 처리 증거는 protocol metadata이며 별도 제품 차단 상태로 노출해서는 안 된다(MUST NOT).

#### Scenario: 같은 Block을 재전달한다

- **WHEN** 같은 Activity ID·actor·Target의 Block을 여러 번 수신하거나 completion loss 뒤 재처리한다
- **THEN** 하나의 방향 관계와 기존 required cleanup 결과로 수렴한다

#### Scenario: 과거 Undo가 재차단 뒤 도착한다

- **WHEN** 과거 Block B1에 대한 Undo가 별도 Block B2로 성립된 현재 관계 뒤에 도착한다
- **THEN** B1의 처리만 정산하고 B2의 관계는 제거하지 않는다

#### Scenario: 검증된 Undo가 원본보다 먼저 도착한다

- **WHEN** 원본 ID·actor·Target을 검증할 수 있는 Undo B1을 먼저 수신하고 같은 B1이 나중에 도착한다
- **THEN** B1이 종료됐다는 protocol identity를 보존해 지연 B1로 차단을 새로 만들지 않는다

#### Scenario: 원본을 검증할 수 없다

- **WHEN** Undo가 가리키는 원본을 안전하게 확인할 수 없거나 같은 ID에 담긴 내용이 충돌한다
- **THEN** 임의의 현재 Block을 해제하거나 검증되지 않은 Owner·Target 관계를 만들지 않는다

#### Scenario: 새 Block이 과거 Block보다 먼저 도착한다

- **WHEN** 같은 pair의 서로 다른 원본 B2와 B1이 순서대로 관측된 뒤 Undo B1을 수신한다
- **THEN** B1만 종료하고 미해제 원본 B2가 지지하는 한 개의 Profile Block을 유지한다
- **AND** 도착 순서나 원격 published 시각만으로 B2를 과거 원본으로 취급하지 않는다

#### Scenario: 모든 관측 원본을 해제한다

- **WHEN** 같은 pair의 B1과 B2에 대한 검증된 Undo가 모두 적용된다
- **THEN** 마지막 미해제 원본을 종료할 때 기존 required cleanup 후 해당 방향 Profile Block을 제거한다
- **AND** 이후 같은 B1·B2의 재전달이나 중복 Undo로 관계가 부활하지 않는다

### Requirement: origin 격리와 재시도 경계

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 ingress별 admission, `docs/domain/objects/instance.md`의 원격 요청 정책, `PROD-818`의 echo 방지·기존 queue 재사용·Worker restart·상태 보존 범위. 시스템은 local-origin과 ActivityPub-origin을 구분하고 inbound Block/Undo 처리로 동일 Block/Undo를 다시 발신하지 않아야 한다(MUST NOT). protocol 처리는 기존 Fedify queue와 Worker 경계를 재사용해야 하며(MUST), delivery 실패를 이유로 이미 확정된 로컬 Profile Block을 rollback해서는 안 된다(MUST NOT). 처리 실패와 재시도 소진은 성공과 구분해 관찰할 수 있어야 한다(MUST). 외부 exactly-once 전달이나 상대 서버의 정책 적용을 로컬 성공 조건으로 주장해서는 안 된다(MUST NOT).

#### Scenario: inbound 처리의 echo를 막는다

- **WHEN** verified inbound Block 또는 Undo가 기존 domain action과 cleanup을 실행한다
- **THEN** 해당 Block/Undo의 outbound echo는 발생하지 않는다
- **AND** 기존 Follow cleanup이 소유한 필수 효과는 그 계약대로 처리한다

#### Scenario: 재시도 도중 Worker가 재시작된다

- **WHEN** durable 처리 중 Worker가 중단되고 같은 history·identity로 재개한다
- **THEN** 다른 방향 관계나 새 세대 관계를 변경하지 않고 미완료 처리를 이어간다
- **AND** required cleanup 실패, protocol 검증 실패와 delivery 실패를 구분해 기록한다

### Requirement: Mastodon 호환 Block과 원본을 참조하는 Undo 발신

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 연합 행동, `docs/domain/decisions/0029-profile-block-federation.md`의 발신·수신 결정, `PROD-818`의 포함 범위와 2026-09-08 발신 방향 확정. 시스템은 발신 대상인 Local Owner → Remote Target의 새 차단에 `Block`을, 그 차단의 해제에 원본을 참조하는 `Undo(Block)`를 발신해야 한다(MUST). Block의 actor는 Local Owner, object는 Remote Target이어야 하며(MUST), Undo와 원본 Block의 actor·object·원본 ID를 보존해야 한다(MUST). 한 차단 세대의 Block·Undo ID는 재시도에도 안정적이고 서로 구분되어야 하며(MUST), 재차단은 새 원본 ID를 사용해야 한다(MUST). 전달 수신자는 해당 Remote Target으로 한정해야 하며(MUST), Public·followers·제삼자에게 확장해서는 안 된다(MUST NOT). 기존 recipient dispatcher와 Fedify queue를 재사용하고(MUST), 일반 Block 조회 제한이 필요한 protocol identity 확인을 막아서는 안 된다(MUST NOT). Local Target에 대한 차단과 ActivityPub-origin 처리에서는 이 Block/Undo를 발신해서는 안 된다(MUST NOT).

#### Scenario: 새 원격 차단을 발신한다

- **WHEN** Local Owner가 발신 대상인 Remote Target을 새로 차단하고 canonical required cleanup이 완료된다
- **THEN** 안정적인 원본 ID와 올바른 actor·object를 가진 Block을 Target에게만 전달하도록 queue에 인계한다
- **AND** 같은 차단의 재시도로 새 원본 ID나 추가 수신자를 만들지 않는다

#### Scenario: 원본 row가 제거된 뒤 Undo를 재시도한다

- **WHEN** 발신 대상 차단의 해제가 완료되고 원본 row가 없어진 상태에서 Undo 효과를 재시도한다
- **THEN** 보존한 원본 ID·actor·object로 같은 Undo를 재구성한다
- **AND** 현재 pair의 새 Block을 원본으로 대신 사용하지 않는다

#### Scenario: 차단과 해제 뒤 다시 차단한다

- **WHEN** Local Owner가 B1 생성·해제 후 B2를 생성한다
- **THEN** B1과 B2는 다른 원본 ID를 사용하며 Undo B1은 계속 B1을 가리킨다
- **AND** 재시도 때문에 Undo B1이 B2에 대한 해제로 바뀌지 않는다

#### Scenario: 로컬 대상 또는 inbound 처리다

- **WHEN** Target이 Local이거나 처리 origin이 ActivityPub이다
- **THEN** 해당 처리에서 outbound Block/Undo를 생성하지 않는다
- **AND** 기존 domain action과 필수 Follow cleanup은 유지한다

### Requirement: 발신 순서와 delivery 실패 격리

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 필수 cleanup·원격 실패 격리, `docs/domain/objects/instance.md`의 새 원격 요청 정책, `docs/domain/decisions/0029-profile-block-federation.md`, `PROD-818`의 기존 queue/dispatcher·retry·Worker restart·상태 보존 범위. 시스템은 같은 Local Owner → Remote Target의 Block·Undo·재차단 효과를 Workflow의 확정된 효과 순서에 따라 기존 Fedify queue에 인계해야 한다(MUST). 같은 방향 pair의 orderingKey를 공유하고(MUST), queue 인계 실패·응답 유실·Worker restart 후에도 원본 identity와 미완료 효과를 복구해야 한다(MUST). 앞선 효과의 queue 인계 결과를 확인·보존하기 전에는 같은 pair의 뒤 효과를 인계해서는 안 된다(MUST NOT). 응답 유실은 같은 미정산 선두 효과를 재시도해야 하며(MUST), 이미 정산된 과거 효과의 재호출은 새 queue 인계를 만들지 않아야 한다(MUST NOT). 인계 재시도가 소진되면 미정산 효과와 대기 중인 뒤 효과를 실패·대기로 관찰할 수 있어야 하며(MUST), 이를 건너뛰어 뒤 효과를 발신해서는 안 된다(MUST NOT). 새 발신의 허용 여부는 기존 Profile/Instance admission에서 판단해야 하며(MUST), 정책상 발신 제외와 전달 실패를 구분해야 한다(MUST). canonical required cleanup 실패와 원격 delivery 실패를 분리해야 한다(MUST). cleanup 성공 전에 Block action 성공을 확정해서는 안 되며(MUST NOT), queue 인계·원격 요청 실패가 확정된 Profile Block을 rollback해서는 안 된다(MUST NOT). queue 수락을 원격 정책 적용이나 exactly-once 전달 성공으로 취급해서는 안 된다(MUST NOT). 상대 서버의 알림·화면·정책 적용을 보장해서는 안 된다(MUST NOT). 시스템은 확정된 발신 계획과 각 시도의 현재 recipient admission을 구분해야 한다(MUST). 확정 뒤 unavailable로 제외된 대상의 효과는 handoff되지 않은 pending으로 유지하며 성공 정산이나 terminal skip으로 바꾸지 않아야 한다(MUST NOT). dispatcher의 정상 no-op을 성공한 queue handoff로 해석해서는 안 된다(MUST NOT). unavailable이나 retry 소진만으로 영구 전달 불가를 추론해서는 안 된다(MUST NOT). 인계 완료 정산은 실제 durable queue 수락을 근거로 해야 하며(MUST), 그 수락을 확인·보존하면 후속 Undo를 진행할 수 있어야 한다(MUST). 2026-09-10 구두 결정 기록(댓글 `273992ef-16f2-4ade-a655-fa7b1457c3b0`)에 따라 remote-visible ordering을 별도 필수 계약으로 두지 않는다. 이전 attempt의 생존이나 consumer delayed retry 가능성만으로 후속 효과를 추가 보류해서는 안 된다(MUST NOT). 정산 후 새 호출의 no-op은 이미 실행 중인 이전 attempt의 종료나 중복 enqueue 제거를 보장하지 않는다. stable Activity ID·orderingKey·Temporal retry를 원격 순서 또는 exactly-once 보장으로 주장해서는 안 된다(MUST NOT). 기존 caller의 정상 no-op·audience·오류 계약은 유지하면서 공통 dispatcher 경계에서 인계와 제외 결과를 구분할 수 있어야 한다(MUST).

#### Scenario: queue 인계 응답이 유실된다

- **WHEN** Block이 queue에 수락됐지만 호출 응답이 유실되어 같은 효과가 재시도된다
- **THEN** 동일 Activity ID·pair·orderingKey로 재시도하고 로컬 관계를 중복 생성하지 않는다
- **AND** 선두 Block의 실제 인계 결과를 확인·보존할 때까지 뒤 Undo를 진행하지 않는다
- **AND** 정산 완료 후 새로 호출한 Block 효과는 추가 인계 없이 끝나며, 이미 실행 중인 이전 attempt의 종료를 뜻하지 않는다

#### Scenario: 인계 재시도가 소진된다

- **WHEN** 같은 pair의 선두 Block 효과의 queue 인계 결과를 확인하지 못한 채 재시도가 소진된다
- **THEN** 선두 효과는 미정산 실패로, 뒤 Undo·재차단 효과는 대기로 남겨 재개할 수 있게 한다
- **AND** 앞선 효과를 건너뛰거나 로컬 차단·해제 결과를 되돌리지 않는다

#### Scenario: 상대 서버가 실패하거나 지원하지 않는다

- **WHEN** remote delivery가 실패하거나 상대 서버가 Block 확장을 적용하지 않는다
- **THEN** 로컬 차단·해제 결과를 유지한다
- **AND** 기존 delivery retry·오류 관측 경계에서 실패를 확인할 수 있다

#### Scenario: 새 원격 요청이 정책상 허용되지 않는다

- **WHEN** 발신 계획을 확정할 때 기존 Profile/Instance admission이 새 원격 요청을 허용하지 않는다
- **THEN** 대상 정책을 우회해 발신하지 않고 정책상 제외를 기록한다
- **AND** 로컬 차단·해제는 기존 domain 계약에 따라 처리한다

#### Scenario: 계획 확정 후 recipient가 unavailable이 된다

- **WHEN** B1 발신 계획이 확정된 뒤 Target 상태나 Instance 정책 또는 actor/inbox mapping 때문에 dispatcher가 recipient를 제외한다
- **THEN** queue handoff는 0건이고 B1 효과는 이유를 가진 pending으로 남는다
- **AND** dispatcher 정상 no-op을 handoff 성공이나 terminal skip으로 정산하지 않으며 후속 Undo B1은 대기한다
- **AND** 로컬 Block·Unblock 성공 결과와 원본·발신 계획은 유지한다

#### Scenario: unavailable 대상이 복구되거나 계속 제외된다

- **WHEN** pending B1을 같은 identity로 재시도한다
- **THEN** 현재 admission이 허용하면 같은 Target·Activity ID로 인계를 시도하고 여전히 제외되면 pending을 유지한다
- **AND** retry 소진·긴 경과 시간·mapping 부재만으로 영구 상태를 추론하지 않고 실패 원인과 뒤 효과 대기를 관찰할 수 있다
- **AND** B1의 실제 인계를 정산한 뒤에만 Undo B1을 진행하며 Undo도 같은 admission을 적용한다

#### Scenario: 이전 attempt가 살아 있는 동안 후속 attempt가 성공한다

- **WHEN** B1 attempt #1이 handoff 도중 timeout됐지만 살아 있고 attempt #2가 실제 queue 인계에 성공한다
- **THEN** 그 수락을 확인·보존해 B1 인계를 정산하고 후속 Undo B1을 진행할 수 있다
- **AND** #1의 종료 증명이나 late enqueue 방지를 추가 진행 조건으로 두지 않는다
- **AND** 중복 인계 가능성과 관계없이 같은 원본 identity와 로컬 차단·해제 결과를 보존한다

#### Scenario: 기존 dispatcher caller의 정상 no-op을 보존한다

- **WHEN** 기존 Post·Profile Update caller의 target 전체가 제외되거나 recipient가 비어 있다
- **THEN** 기존처럼 정상 no-op을 반환하고 queue 호출·domain rollback을 만들지 않는다
- **AND** PROD-818의 settlement 결과 구분 때문에 기존 caller에 새 오류나 recipient를 추가하지 않는다

### Requirement: 기존 차단을 소급 발신하지 않는 rollout

**Authority / Provenance:** `docs/domain/objects/profile-block.md`의 rollout, `docs/domain/decisions/0029-profile-block-federation.md`의 기존 차단 처리, `PROD-818`의 2026-09-08 기존 차단 rollout 확정. 시스템은 연합 기능 도입 전에 존재하던 차단을 로컬에 유지하고 일괄 발신하거나 소급 동기화해서는 안 된다(MUST NOT). 도입 후 새로 생성한 차단부터 발신 대상으로 삼아야 한다(MUST). 발신 대상 원본이 없는 기존 차단을 해제할 때는 원본을 임의 생성하거나 Undo를 발신해서는 안 된다(MUST NOT). 이 차단의 해제·재차단은 기존 domain 계약을 따르며 새 차단은 새로운 발신 대상이어야 한다(MUST).

#### Scenario: 기존 차단이 있는 상태로 배포한다

- **WHEN** 연합 기능 활성화 전에 만들어진 Remote 대상 차단이 존재한다
- **THEN** 로컬 조회·상호작용 제한을 유지하고 그 차단의 Block 발신을 시작하지 않는다

#### Scenario: 기존 차단을 해제하고 재차단한다

- **WHEN** 발신 원본이 없는 기존 차단을 해제한 뒤 같은 Remote Target을 다시 차단한다
- **THEN** 기존 해제에는 Undo를 발신하지 않으며 제거된 Follow를 복구하지 않는다
- **AND** 재차단에는 새 원본 ID를 부여하고 새 Block 발신 경계를 적용한다

#### Scenario: 과거 해제 cleanup과 재차단이 겹친다

- **WHEN** 기존 차단의 해제 cleanup이 재시도되는 동안 같은 pair에 새 차단이 성립한다
- **THEN** 과거 cleanup은 보존한 원본·exact row만 대상으로 삼고 새 차단을 해제하지 않는다
- **AND** 새 차단의 발신 자격을 과거 차단의 무발신 상태로 덮어쓰지 않는다
