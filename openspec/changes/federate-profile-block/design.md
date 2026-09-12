## Context

이 설계는 `proposal.md`와 `specs/activitypub-profile-block/spec.md`를 구체화한다. 상위 권위는
`docs/domain/objects/profile-block.md`, `docs/domain/decisions/0029-profile-block-federation.md`와
PROD-818의 2026-09-08 발신·수신 및 기존 차단 rollout 결정과 2026-09-10 구두 결정 기록이다.

최신 원격 main `32c281349444208aaddbe5aafe0d038a6e1fdaf4`과 현재 기준 `3906f2251e70a8b9bd39721c897493efbe83ff4a`를 대조했다. 적용되는 domain·Temporal·Fedify·기존 spec 경계에는 차이가 없다. Profile Block row는 존재하지만
공통 Block 서비스와 ActivityPub Block handler는 아직 통합되지 않았다. Linear 상태는 PROD-821·PROD-813 Done,
PROD-822·PROD-823 In Review다. 이슈 상태와 실제 병합·통합 검증 증거를 구분하며, 구체 core action과 cleanup signature는
검증된 선행 구현 revision에서 다시 확인한다.

최신 canonical에서 차단 Owner A와 Target B의 기본 Profile 정보는 기존 조회 정책을 따른다. A→B Post·Media 직접
조회는 기존 콘텐츠 권한으로 허용하고 B→A 콘텐츠 API는 제한한다. mutual Block이면 양쪽 콘텐츠 API를 제한한다.
타임라인·콘텐츠검색과 상호작용 제한은 양방향으로 적용한다. Remote Owner의 관계도 이 방향을 그대로 따른다.

## Goals / Non-Goals

**Goals:**

- Mastodon 호환 Block/Undo를 정확한 Target에게 발신하고 verified inbound를 기존 Profile Block에 반영한다.
- 원본 identity와 처리 origin을 보존해 중복·순서 역전·Worker restart에도 다른 차단을 손상시키지 않는다.
- canonical required cleanup, Fedify queue 수락과 원격 delivery를 구분하고 각 실패를 관찰한다.
- 기존 차단의 비소급 발신과 구버전 호환 rollout을 지킨다.

**Non-Goals:**

- 로컬 차단 저장·정책·GraphQL·UI 재구현, Mute 연합, Domain Block·moderation, 범용 ledger, exactly-once framework.
- PROD-813의 local change archive, 새 Notification source 억제 정책, 과거 차단의 일괄 발신.
- 상대 서버의 표시·알림·정책 적용과 Block → Undo의 remote-visible ordering 보장.

## Implementation Guidance

이 절은 비규범적 구현 안내다. 파일 후보와 자료구조를 고정하지 않으며, 동일한 spec과 Active decision을 만족하는
다른 구현을 허용한다.

### Current Constraints

- `packages/fedify/src/federation.ts`는 personal/shared inbox의 typed listener를 등록한다. `inbound-follow.ts`에
  actor·원본 검증과 ActivityPub-origin 선례가 있으나 Block listener는 없다. 다른 Undo 분기를 보존해야 한다.
- `inbound-local-recipient.ts`는 personal recipient와 Local actor mapping을 대조한다. 현재 구현은 configured
  Local Instance 전체 경계를 보장하는 완성 근거가 아니므로 실제 배포 origin까지 확인한다.
- `outbound-recipient-dispatch.ts`는 현재 direct target 외에도 followers를 항상 확장하고 orderingKey를 받지
  않는다. directProfileIds에 Target 하나만 넣어도 Block audience가 제한되지 않는다. direct-only와 ordering
  전달 옵션을 명시적으로 다루고 기존 Post·Reaction 호출의 target 의미를 보존해야 한다.
- `profile-follow-delivery.ts`는 directed pair orderingKey와 원본을 포함한 Undo의 선례다. 이 함수는 전용
  recipient 조회를 쓰므로 그대로 복제해 공통 dispatcher를 우회하지 않는다.
- `packages/fedify/package.json`의 Fedify 계열은 2.3.0이며, `queue.ts`는 PostgreSQL queue를 주입한다.
  [Fedify ordered delivery](https://fedify.dev/manual/send#ensuring-ordered-delivery)는 같은 key의 queue 순서를
  recipient server별로 다룬다. 아래 조사처럼 delayed retry까지 포함한 원격 적용 순서 보장은 아니다.
- `apps/worker/src/activities.ts`는 production registry다. Workflow에는 결정론적 orchestration과 serializable
  identity만 두고 DB/network는 Activity에서 실행한다. `memory/temporal-workflows.md`의 effect settlement와
  `memory/database-design.md`의 비관적 락 제한을 따른다.

### Recommended Approach

1. **Ingress와 공통 action:** 기존 Fedify 인증을 통과한 Activity의 Remote actor, 절대 원본 IRI, Local Target과
   personal/shared inbox를 검증한다. 새 원격 조회는 기존 안전한 loader·Instance admission을 사용한다. 검증된
   identity와 ActivityPub-origin만 공통 Block action 경계에 전달하며 GraphQL session 타입을 core로 넘기지 않는다.
2. **원본별 처리 증거:** Block IRI, Owner/Target, 정확한 domain row identity, 원본 해제 여부와 미완료 효과를 작은
   Block 전용 protocol metadata로 보존한다. 같은 pair의 아직 해제되지 않은 서로 다른 원본을 구분하며, 하나의 Undo는 참조한
   원본만 종료한다. 같은 pair의 미해제 원본은 하나의 현재 exact row에 연결한다. 마지막 원본 해제와 경합한 새
   원본이 있으면 row 전체를 삭제하지 않도록 같은 원자적 경계에서 판정한다. 제품 관계는 여전히 pair당 하나이며,
   과거 cleanup은 이후 성립한 새 row를 대상으로 삼지 않는다.
3. **순서 역전:** 검증 가능한 Undo가 먼저 오면 해당 원본의 종료 증거를 남긴다. B2→B1→Undo B1처럼 도착해도 B2를
   유지한다. 도착 시각이나 원격 published로 최신 의도를 추측하지 않는다. 저장된 원본 또는 검증된 embedded 원본을
   우선 사용하고, URI-only 원본을 확인할 수 없으면 mutation 없이 관측 가능한 미검증 결과로 처리한다.
4. **원자성과 복구:** protocol admission·원본 결과와 domain transition의 원자적 경계를 PROD-813 action에 맞춘다.
   외부 orchestration 단계는 exact row와 보존한 effect plan으로 재개한다. commit 뒤 completion loss에도 현재 pair의
   다른 row를 이번 결과로 추정하지 않는다. pair uniqueness 충돌은 실제 충돌한 현재 행을 반환하는 원자적
   UPSERT로 처리하고, 그 행의 mutation 잠금을 유지한 채 closing 상태와 같은 generation의 protocol 원본을
   재확인한다. 이전 행을 기다린 UPDATE가 0건으로 끝난 뒤 잠금 없는 SELECT로 새 행을 재사용하지 않는다.
   별도 advisory lock이나 process-local map으로 무조건 직렬화하지 않는다.
5. **발신 원본:** 새 local-origin 차단의 immutable row identity에서 Block IRI와 별도 Undo IRI를 안정적으로
   파생한다. local actor URI, remote object URI와 발신 대상 여부를 해당 transition의 효과로 보존한다. required
   cleanup 이후 효과를 실행하고, 삭제 이후에도 원본 snapshot으로 Undo를 만든다. 재차단은 다른 identity를 쓴다.
6. **Audience와 queue:** 공통 dispatcher에 direct-only target과 caller의 orderingKey를 보존하는 경로를 둔다.
   Block과 Undo는 같은 directed pair key로 순서대로 queue에 인계한다. 예시는 `profile-block:<owner>:<target>`이며
   정확한 문자열은 고정하지 않는다. 발신 계획에서 기존 eligibility를 판단하고 실행 retry가 mutable 상태를 보고
   이미 확정된 효과를 임의로 추가·취소하지 않게 한다. 현재 recipient admission에 따른 보류는 계획 취소와 구분한다. 추가 개인정보를 담거나 Public/followers로 확장하지 않는다.
7. **실패 구분:** required cleanup은 domain 성공 조건이고, queue 인계 실패와 인계 후 remote 실패는 별도다.
   인계 전 실패·응답 유실은 같은 identity의 선두 효과로 재시도하고 실제 수락을 확인·보존하면 정산한다.
   그 뒤 Undo를 진행하며 remote retry는 Fedify에 맡긴다. 정산 뒤 새로 호출한 과거 효과는 추가 인계 없이 끝내지만,
   이미 실행 중인 이전 attempt의 종료를 보장하지 않는다. 그 attempt나 consumer retry 때문에 추가 보류하지 않는다.
   인계 retry 소진 시 선두 실패와 뒤 효과 대기를 보존하고 자동으로 건너뛰지 않는다. 원격 실패는 확정된 로컬 상태를 되돌리지 않는다.
8. **Origin:** inbound Block/Undo는 같은 Block/Undo 발신 효과를 만들지 않는다. 기존 Follow cleanup이 소유한
   Notification 정리와 필요한 Follow 효과는 원래 계약대로 실행한다.

### DB commit 이후 cleanup 복구

Block 전용 cleanup batch에 transition의 결과와 immutable DELETE effect plan, 정산 시점을 보존한다.
batch 예약, 제품 generation 결정, Follow/Request 삭제와 최종 plan 저장은 하나의 DB transaction이다.
동일 operation의 재시도는 먼저 commit된 batch를 반환하고 제품 관계를 다시 변경하지 않는다. cleanup이
0건이거나 기존 관계를 재사용한 결과도 저장해야 응답 유실 뒤 생성 여부·원본 generation이 바뀌지 않는다.

Block은 bootstrap이 반환한 candidate UUID를 operation identity로 사용한다. Unblock은 Workflow run UUID를
사용하므로 Activity retry는 같은 receipt를 읽고 failed-only 새 실행은 새 cleanup source를 추가로 포착할 수 있다.
제품 삭제 권한은 operation ID와 별개로 항상 expected Profile Block UUID에 한정한다. batch의 generation UUID는
제품 행 삭제에 연쇄 삭제되지 않는다.

Workflow는 현재 generation뿐 아니라 같은 방향 pair에 남은 과거 pending batch도 읽고 정산한다. 각 batch의
정확한 Follow/Request source ID와 최초 origin 기반 발신 자격을 유지하며, 모든 필수 cleanup 성공 후에만
정산 시점을 기록하고 action 성공을 반환한다. 효과 성공 뒤 정산 응답이 유실되면 같은 exact source 효과가
재실행될 수 있다. 이는 새 Follow generation을 제거하지 않으며 범용 outbox·effect framework나 새로운 원격
ordering 보장을 도입하지 않는다.

### Delivery Settlement — HITL P2 해소

이 절은 D4의 기존 효과 정산을 구체화한다. 제품 관계와 원본 generation은 바꾸지 않는다. plan의 발신 자격은
보존하지만 새 인계는 공통 dispatcher의 현재 Profile/Instance admission을 통과해야 한다. unavailable로
보류하는 것은 효과 취소나 새 발신 자격 부여가 아니다.

| 관측 결과                                        | Block 효과의 결과                                      | 후속 Undo                                |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------- |
| plan 확정 시 발신 대상 아님                      | 기존 정책상 제외, handoff 0건; 새 Block 발신 계획 없음 | 발신 원본 없는 기존 차단에는 만들지 않음 |
| 확정 뒤 recipient unavailable·mapping/URI 불완전 | `pending`, handoff 성공 아님; 동일 효과 보존           | 대기                                     |
| enqueue 호출 실패·timeout, 실제 수락 불명        | `pending`, 필요하면 retry 소진 실패로 관측             | 대기                                     |
| 실제 durable queue 수락 확인·보존                | `settled`                                              | 동일 admission과 orderingKey로 진행      |
| 수락 뒤 remote 실패                              | queue 인계 정산 유지, Fedify가 remote retry 소유       | 원격 retry 완료를 기다리지 않고 진행     |

현재 dispatcher는 `Promise<void>`이고 빈 recipient와 handoff 성공을 모두 정상 반환한다. 공통 내부 경계에
인계·제외·실패를 구분하는 결과를 제공하되 기존 entry의 정상 no-op은 유지한다. PROD-818은 그 결과를 소비해
제외를 pending으로 해석한다. 기존 Post·Profile Update caller에 새로운 예외나 audience를 추가하지 않으며, 별도
recipient 조회를 복제하지 않는다. 현재 Reaction·Repost의 전용 delivery 경로를 공통 dispatcher로 옮기는 작업은
이번 범위에 포함하지 않고 기존 결과만 회귀 검증한다.

현재 조회는 Active 상태·actor mapping·URI 유효성을 판정할 뿐 제외 사유를 일시적/영구적 delivery 불가로
분류하지 않는다. canonical의 Unreachable·Suspended·Domain Block도 미래 복구 불가능을 증명하지 않는다.
따라서 확정된 효과에는 unavailable·mapping 부재·retry 소진을 이유로 한 자동 `terminal skip`을 도입하지 않는다.
장기 제외도 실패 사유를 가진 pending으로 남기고, 복구되면 같은 identity로 재개한다. 새로운 영구 폐기 정책은
이번 P2 해소에서 만들지 않는다. 이미 수락된 효과는 뒤의 상태 변화만으로 미수락으로 되돌리지 않는다.

### 조사 결과와 remote-visible ordering의 범위

고정 버전 Fedify/Postgres 2.3.0과 Temporal TypeScript SDK 1.22.0을 대조했다. Temporal timeout·취소는
실행 중인 I/O의 종료를 보장하지 않는다. 현재 Activity 옵션은 1분 timeout·최대 10회 시도이며,
`settleEffects`와 Follow FIFO drain도 이전 attempt의 I/O를 강제로 종료하지 않는다.

`sendActivity`는 호출마다 새 message UUID를 만들고 PostgreSQL queue INSERT도 별도 row UUID를 만든다.
Activity ID unique constraint나 queue deduplication은 없다. INSERT 후 NOTIFY/응답이 유실되면 수락 여부가
모호할 수 있으며, Core transaction과 별도 queue DB의 INSERT를 원자적으로 묶는 기존 경계도 없다.

- Producer: #1 timeout 뒤 #2의 B1과 Undo가 enqueue되고 #1이 늦게 B1을 enqueue할 수 있다.
- Consumer: B1 요청 실패 후 같은 orderingKey의 delayed retry가 등록되면 ready Undo가 먼저 처리될 수 있다.
  첫 B1이 원격에 도달하지 않았다면 원격은 Undo 뒤에 B1을 처음 받을 수도 있다.
- orderingKey는 늦은 B1을 제거하거나 과거 위치로 옮기지 않는다. queue handler timeout도 실행 중인 handler를
  강제로 종료하지 않는다. stable identity, 처리 직렬화, remote-visible ordering은 서로 다른 보장이다.

2026-09-10 사용자가 전달한 @jiyu와의 구두 논의 결과를 Linear 댓글 `273992ef-16f2-4ade-a655-fa7b1457c3b0`에
기록했다. D7에 따라 이 한계를 인정하며 별도 remote-visible ordering guarantee를 PROD-818에 추가하지 않는다.
기존 구조가 두 race를 제거한다고 주장하지 않으며, 원격에서 Undo 이후 B1이 적용될 가능성도 보장 범위 밖이다.
실제 queue 수락을 확인·정산하면 후속 효과를 진행한다. 이전 attempt 종료 증명, fencing, stale-delivery drop,
generation sequencing/supersession은 필수 구현이 아니다. 조사 중 제안한 A/B 수단을 선택해야 한다는 blocker도 해제한다.

INSERT barrier는 race 재현용 테스트 기법일 뿐 production mechanism이 아니다. 이 두 race의 원격 최종 결과를
보장하는 실험은 필수 검증에서 제외한다. 기존 identity·인계 결과·재시도 복구·로컬 상태 보존과 inbound의
원본별 중복·순서 역전 처리 검증은 유지한다.

### Allowed Alternatives

- 선행 durable orchestration이 exact 원본·종료 증거와 completion-loss 복구를 충분히 보존하면 별도 테이블 대신
  그 경계를 확장할 수 있다. Workflow history나 queue dedupe 보존 기간이 끝난 뒤에도 replay 안전성을 증명해야 한다.
- 공통 action의 중립 입력 확장과 얇은 ingress adapter 모두 가능하다. action·cleanup 복제와 transport 타입 유출은
  허용하지 않는다. 구체 테이블·함수명은 선행 구현을 확인한 뒤 최소 범위로 정한다.
- dispatcher의 logical target 선택과 recipient expansion을 분리하거나 기존 입력에 명시적 direct-only 옵션을
  추가할 수 있다. 기존 caller의 audience와 eligibility를 유지하고 orderingKey를 그대로 전달하는지가 기준이다.

### Known Traps

- 현재 dispatcher를 그대로 호출하면 Target 외 followers에게 차단 사실을 전달할 수 있다.
- 현재 pair나 마지막 도착 ID 하나만 기억하면 B2 뒤 도착한 B1·Undo B1이 B2까지 지울 수 있다.
- 짧은 queue dedupe TTL, Workflow history 또는 메모리만 믿으면 종료된 원본이 replay로 부활할 수 있다.
- 콘텐츠 조회 제한이나 Instance admission을 protocol identity lookup과 혼동하면 정상 Undo 검증이 막힐 수 있다.
- 인증된 actor가 있어도 nested Block의 actor·object·identity가 검증됐다는 뜻은 아니다.
- 발신 원본이 없는 기존 차단의 해제에 임의 원본을 만들어 Undo를 보내면 비소급 rollout을 어긴다.
- 같은 orderingKey라도 producer가 잘못된 순서로 queue에 넣거나 manual redrive에서 새 ID를 만들면 의도를 보존할 수 없다.

## Risks / Trade-offs

- [선행 구현 변경] → PROD-813 완료 revision에서 action·cleanup·policy와 registry를 확인하고 구현 안내를 조정한다.
- [여러 원본과 저장 비용] → 미해제 원본이 남으면 같은 pair의 차단을 유지한다. 최소 identity·종료 증거만 보존하고,
  이번 change에서는 replay 안전성을 약화하는 자동 TTL 삭제를 도입하지 않는다.
- [지원 서버 차이] → W3C 권고와 다른 Mastodon 확장 선택을 기록한다. 상호운용 테스트에 실제 서버 버전·관측
  Activity·최종 상태를 남기고, 모든 서버의 지원으로 일반화하지 않는다.
- [부분 효과 실패] → local cleanup, queue 인계, remote retry의 결과와 원본 identity를 구분해 추적한다. 오류 로그에
  서명·credential·불필요한 원문을 남기지 않는다.

## Migration Plan

1. Spec Gate 승인과 PROD-813 완료 증거를 확인한다. 최신 canonical·Linear와 현재 branch를 재검증한 뒤 구현한다.
2. protocol metadata는 구버전 read/write를 깨뜨리지 않는 additive migration으로 도입한다. 원본 결과와 domain
   mutation의 원자성을 검사하고 기존 migration 파일은 수정하지 않는다. breaking 변경이 필요하면 이슈·release
   경계를 먼저 다시 정한다. protocol metadata가 없는 legacy Profile Block은 nullable `closing_at`을 외부에
   노출하지 않는 Unblock handoff 표식으로만 사용하며, null은 기존·미진행 상태를 뜻한다.
3. 기존 row에는 발신 원본을 backfill하지 않는다. 새 동작이 활성화된 뒤 생성된 차단에만 발신 자격을 보존한다.
   활성화 중 구버전이 만든 row는 발신 자격이 없는 기존 row와 같이 취급하고, 그 해제에는 Undo를 만들지 않는다.
4. DB 호환 변경과 production Worker의 새 Activity/Workflow 수용을 먼저 준비한 뒤 새 ingress·발신 admission을
   활성화한다. 구버전 Worker가 새 history를 처리하지 않도록 실제 배포·drain 경계를 검증한다.
5. rollback은 새 ingress·발신 admission을 중단하고 호환 Worker로 이미 승인된 history·미완료 효과를 정산한다.
   canonical Block·protocol 종료 증거는 보존한다. 이미 원격에 전달한 Activity를 로컬 rollback으로 회수할 수는 없다.
6. PROD-818이 protocol·회귀·대표 연합 E2E·Worker restart·canonical 정합성을 검증한다. 전체 task 완료 후 자기
   change의 delta sync·archive와 archive 후 validation을 수행한다. PROD-813의 별도 archive를 대신하지 않는다.

## Open Questions

- 미확정 제품 요구사항은 없다. Mastodon 호환 발신·수신과 비소급 rollout은 2026-09-08에 확정됐다.
- PROD-813 완료 revision의 core action signature, cleanup 연결과 exact-row 복구 수단은 아직 확인할 수 없다.
  이는 task 1의 구현 착수 검증이다. 계약을 바꾸는 차이가 발견되면 upstream 정렬부터 다시 수행한다.
- D7은 구두 결정 기록에 따라 Active다. 별도 원격 ordering 수단을 선택할 미결정은 없으며 Spec Gate는 승인 가능한 상태다.
- 최종 인간 승인과 PROD-813 완료 증거는 구현 착수 조건이다. 문서 검증은 승인 준비 상태를 판단하며 실제 구현 완료를 뜻하지 않는다.
