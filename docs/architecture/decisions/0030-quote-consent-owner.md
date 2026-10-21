# PROD-924: Quote consent의 단일 owner와 Source 삭제 경계

상태: 로컬 구현 및 검증. 원격 반영·배포 전환은 보류.

## 결정과 책임

Quote consent 명령은 `post-quote:<Quote Post ID>` Workflow의 FIFO queue를 통과한다.
Update handler는 enqueue와 결과 대기만 수행하며, DB 변경 Activity를 직접 실행하지 않는다.
Source 삭제는 Source owner의 제한된 다중 자원 transaction이다. Source 삭제와 연결된 여러 Quote의
철회를 하나의 commit으로 유지한다. 전체 Quote를 하나의 Workflow에 모으지 않는다.

원격 Note/QuoteAuthorization의 승인 증거 조회는 읽기 전용 Activity다. Source materialize는 별도
Activity이며 consent를 변경하지 않는다. 검증된 proof와 기존 status·approval URI·Source/author/object
identity snapshot을 History에 받은 뒤 write Activity를 실행한다. 새 consent 상태·CAS 컬럼·generation
컬럼은 추가하지 않는다. 저장 모델은 공통 consent 두 컬럼과 기존 `repostSourceId`다.

공통 applier의 공개 service export를 제거한다. Worker의 Query fence를 통과한 write Activity만 consent
변경을 호출한다. 초기 Quote INSERT와 Source 삭제 bulk 철회는 각각 지정된 Worker 경계의 예외다.
동일 DB role로 임의 SQL을 실행할 수 있는 코드를 기술적으로 금지하는 ACL은 아니다. 새 caller를 추가할
때 이 경계를 우회하지 않는 코드 검토가 필요하다.

## 실행 순서

1. Quote owner가 command를 FIFO로 dequeue한다. 처리 중 command ID도 중복 admission에서 제외한다.
2. 필요하면 Source를 materialize하고 원격 승인 증거를 읽는다. 네트워크 조회 중 DB transaction을 유지하지 않는다.
3. Write Activity는 Source `FOR SHARE` → Quote `FOR UPDATE` 순서로 잠근다.
4. 열린 owner의 현재 Run ID·작업 token·WRITE phase를 deadline이 있는 Query로 확인한다. 실패하면 rollback한다.
5. 같은 transaction에서 기존 CAS와 Source 현재 상태·결속을 다시 검사한 뒤 commit한다.
6. Workflow가 token을 폐기하고 drain Activity로 미완료 transaction을 기다린 후 다음 명령으로 진행한다.
7. commit 결과는 Update caller에게 반환한다. 외부 effect는 Workflow에서 별도로 재시도한다.

Source owner는 Source `FOR UPDATE` → Source 삭제 UPDATE → 연결 Quote들을 ID 순서로 `FOR UPDATE` → bulk
철회 → commit 순서다. 승인 writer가 먼저 Source 공유 잠금을 잡으면 삭제가 기다린 뒤 새 승인을
bulk snapshot에 포함한다. 삭제가 먼저 commit하면 뒤따르는 승인은 현재 Source 상태 검사로 거부된다.
교차 인용에서는 두 행이 서로의 Source일 수 있으므로 deadlock을 완전히 제거하지는 못한다.
PostgreSQL이 한 transaction을 SQLSTATE `40P01`로 중단하면 Temporal Activity 재시도로 수렴한다.

최초 Quote INSERT가 미commit이면 다른 transaction에서 Quote 행을 볼 수 없다. INITIALIZE는 Source ID를
Workflow input에 포함하고, 정상 drain과 새 Run bootstrap도 그 Source의 배타 잠금을 먼저 기다린다.
Source ID 없는 INITIALIZE admission은 거부한다. 이후부터는 Quote 행 잠금이 이전 writer의 barrier다.

## 재시도와 lifecycle

Activity timeout은 외부 DB rollback을 뜻하지 않는다. 이전 Activity가 Query를 통과했다면 정상 owner는
다음 명령 전에 drain으로 그 transaction의 commit/rollback을 기다린다. 잠금 전에 늦어진 Activity는
새 token을 확인하지 못해 rollback한다. Query에는 700ms deadline, transaction에는 lock/idle timeout을
둔다. Query와 DB commit이 하나의 원자적 연산이라고 주장하지 않는다.

DB commit 응답이 유실되면 같은 값만 보고 과거 commit 소유권을 추론하지 않는다. Workflow가 다시 현재
proof를 조회하고 새 fenced transaction으로 검증한 현재 상태를 reconciliation한다. 외부 effect ID는
command ID·상태·approval binding에서 결정한다. 동일 상태 effect의 재시도는 같은 ID를 사용하고 다른
상태 effect는 ID를 구분한다. 원격 서버의 중복 처리까지 포함한 exactly-once delivery는 보장하지 않는다.

정상 종료와 Continue-As-New는 admission을 닫고 이미 대기 중인 Update들을 완료한 뒤 drain한다.
Continue-As-New는 Source recovery ID·Source URI binding·재사용 URI 이력·pending 재검증을 전달한다.
최신 admission command ID도 전달한다. 새로운 명령이 들어오면 이전 내부 재검증을 폐기하여 오래된 Note가
최신 승인 참조를 되돌리지 못하게 한다. 최초 접수된 명령의 FIFO 순서는 유지한다.
최근 command 결과 256개를 전달해 Run 전환 직후의 중복 admission을 줄인다. 이것은 무기한 이벤트
receipt 저장소가 아니다. 오래된 이벤트/retention 만료를 이 cache만으로 판별하지 않는다.

새 Run은 DB barrier 뒤 현재 상태를 읽는다. 이전 승인 이력을 복원할 수 없는 기존 데이터·종료 후 새
실행에서는 모호성을 보수적으로 취급하고 Delete의 issuer current-state 검증을 적용한다. 로컬 revision,
Activity ID, Workflow Run ID는 외부 approval generation identity가 아니다.

## 승인 정책과 한계

동일 URI 재승인 이후 모호한 Delete만 QuoteAuthorization의 현재 issuer 증거를 재검증한다. 명확한 유효
Delete와 Activity ID/target 없는 Delete의 기존 허용 계약은 유지한다. 신규 승인·재승인은 유효한 proof가
필요하다. 404/410/403/5xx/timeout/파싱 오류/200-invalid만으로 APPROVED를 REVOKED로 바꾸거나 Source를
숨기지 않는다. Note의 명시적 승인 참조 변경 invalidation은 기존 계약대로 별도 처리한다.

검증 가능한 Tombstone·issuer·URI·redirect/cache 경계를 포함한 410 상호운용 판정은 구현하지 않았다.
body 없는 410과 반복 current-invalid의 최종 상태 표현은 후속 결정이다. 현재는 재검증 대상으로 유지한다.

**강제 Terminate/Reset은 정상 drain을 실행하지 않는다.** Query 성공 후 Terminate된 Activity는 뒤늦게
commit할 수 있다. 새 Run의 bootstrap은 이미 열린 DB transaction을 기다리고 현재 증거로 후속 작업을
조정하지만, 늦은 commit의 일시적 노출과 이미 보낸 외부 effect를 소급 취소하지 않는다. 임의 강제 종료
전후에도 무조건 선형화된다고 보장하지 않는다. 운영 전환은 정상 finish/drain을 기본으로 하고, 강제
종료 복구는 현재 DB 상태와 issuer 증거를 확인한 뒤 재개한다. Source owner는 이미 DELETED인 Source에 대한 새 실행에서도 deterministic terminal effects를 재전송한다.
Source owner와 Quote owner 사이의 외부 delivery 순서는 DB 행 잠금만으로 보장하지 않는다.
새로운 실행을 시작한 뒤에도 이전 DB
세션이 종료됐는지 확인할 수 없는 경우 복구 완료로 기록하지 않는다.

retention 만료 후에는 remote Request URI와 최초 Source를 아직 연결하지 못한 Quote의 원래 target URI를
두 consent 컬럼에서 재구성할 수 없다. 증거/원본 이벤트의 재전달이 필요할 수 있다. 이 정보가 없는데
새로운 Source binding을 승인하는 자동 복구는 제공하지 않는다. 요청 URI를 새 DB 컬럼으로 저장하지 않는다.

## 배포 및 PR 반영

로컬 통합 기준은 #940 `6a2f1b682`, #961 `2d2d23115`, 병합된 #1094 `7248b8f27`이다.
구형 per-command/revision Workflow에서 새 owner로 바뀌므로 이전 history와의 replay 호환을 주장하지 않는다.
기존 실행은 기존 Worker 코드로 drain하고 writer admission을 전환해야 한다. **SDK Worker shutdown과
Quote owner의 finish/drain은 서로 다른 경계다.** 실제 #961 writer가 DB UPDATE 뒤 commit을 기다리는 동안
기존 Worker의 shutdown은 해당 Activity를 기다렸고, 새 owner bootstrap은 DB 잠금 뒤 기존 commit 상태를
읽었다. production entrypoint의 SIGTERM은 Workflow를 종료하지 않는다. 대체 Worker는 같은 Run의 작업을
재개하며, 쓰기 Activity가 PG 잠금 중 종료된 경우에도 Query 실패 rollback·retry 뒤 재개하는 것을 검증했다.
Continue-As-New와 정상 finish 뒤 새 Run bootstrap도 로컬 실제 Temporal·PostgreSQL에서 확인했다.

이 결과는 구형 writer 전체의 drain이나 history replay 호환성을 증명하지 않는다. 전환 시에는 기존
writer admission을 먼저 차단하고, 기존 실행을 기존 Worker로 완료한 뒤 미완료 Activity/history, 열린 DB
session과 구형 process가 남지 않았는지 확인해야 한다. 새 bootstrap은 이미 열린 transaction의 barrier일
뿐, 아직 시작하지 않은 구형 writer의 이후 실행을 차단하지 않는다. 이전 Worker와 새 Worker가 같은
Quote에 동시에 consent를 쓰는 배포는 허용하지 않는다. rollout inventory·실제 기존 history replay·강제
종료 후 운영 복구는 프로덕션에서 아직 실행하지 않았다.

- #1094 공통 모델: 두 consent 컬럼·identity CAS·fresh-proof 재승인 계약을 유지한다.
- #961 하위 계층: inbound NOTE/DELETE/REQUEST/ACCEPT/REJECT, owner read/write/fence/drain/bootstrap,
  Source 삭제의 공통 잠금·atomic bulk 철회와 terminal effect를 제공한다. 최신 main에 있던 Local Quote
  APPROVED insert와 Source 삭제가 owner를 우회하지 않도록 기존 create/delete service를 연결하는
  호환 bridge도 포함한다. 기존 native Source 작성 범위와 거부 계약을 유지하며 새 정책 컬럼은 조회하지 않는다.
- #940 상위 계층: Local remote-Source 작성 확장과 outgoing Request, API의 직접 admission,
  Source 삭제 local orchestration, Post quote policy·migration·Composer UX를 추가한다.
  공통 DTO/registry에 이미 존재하는 INITIALIZE/REQUEST/DECIDE를 복제하지 않고 정책 입력과 동작을 확장한다.

기존 Local writer bridge를 상위에만 미루면 하위 owner와 기존 직접 APPROVED insert가 공존한다.
따라서 이 bridge는 하위 안전 경계의 필수 의존성이다. Source owner와 Quote owner의 공유 잠금·bulk 철회도
같은 하위 계층에 제공한다. API/Composer의 정책 및 원격 Source 작성 기능은 이 공통 실행 경계를 소비한다.

#1094 Source lookup index와 consent schema를 먼저 유지한다. 하위 #961에는 `quote_policy` schema나 조회가 없다.
#940의 nullable enum/column 및 local ACTIVE Post backfill을 상위 application 시작 전에 적용해야 한다.
이 정책 migration은 consent fencing 컬럼이 아니다. 실제 production lock 시간·backfill 규모·구버전 호환은
별도 rollout Gate다.

구형 #961의 `20260917045804_young_mercury`는 현재 공통 모델에 필요하지 않으며 하위 최종 tree에 포함하지 않는다.
runner는 최신 timestamp보다 오래된 파일도 name이 미적용이면 실행하므로, 최신 main DB에 이 파일을 추가하면
폐기된 `activitypub_post_quote`·INVALID enum·revision이 다시 생긴다. 최신 main 이력 60개 → 하위 migration 및
재실행에서 이력 불변·폐기 테이블 부재·두 consent 컬럼을 실제 격리 DB로 확인했다. 기존 운영 DB에 해당 파일의
적용 이력이 있으면 제거된 name 때문에 history Gate가 실패한다. 운영 적용 이력 미확인 상태에서는 배포하지 않고,
적용 이력이 존재하면 history를 삭제하거나 hash를 바꾸지 말고 별도 forward 전환을 설계해야 한다.

로컬 fresh Run을 정상 finish한 뒤 production Workflow bundle의 `runReplayHistory`를 실행하고 DB의 consent·Source·
content identity가 변하지 않는 것을 검증했다. 실제 production history export/replay는 아직 수행하지 않았다.
기존 resolution Workflow/Activity 이름과 orchestration은 유지하지만 새 Activity 구현으로의 dispatch 전환은
이미 실행 중인 구형 DB writer를 중단시키거나 fleet drain을 증명하지 않는다. 두 writer가 같은 Quote를 변경하는
rolling overlap은 허용하지 않는다. admission freeze → 구형 Workflow/Activity 완료 → 열린 DB session·구형 process
확인 → 새 owner admission 재개 순서가 운영 전제다. SDK shutdown만으로 이 전제를 대체하지 않는다.

두 PR은 main → #961 → #940 순서의 계층이다. 기존 PR head와 최신 main 이력은 보존하며, 공유 파일은
policy·local 기능 hunk와 공통 safety hunk로 분리한다. 통합 `3122940aa`의 PASS를 계층 검증으로 재사용하지 않는다.

검증 명령과 실제 결과는 [계층 검증 기록](../../testing/prod-924-pr-split-validation.md)에 구분해 기록한다.
Temporal의 [Activity 실행 보장](https://docs.temporal.io/activity-execution),
[Terminate와 cancellation](https://docs.temporal.io/workflow-execution#cancellation-and-termination),
[Continue-As-New](https://docs.temporal.io/develop/typescript/continue-as-new)를 전제로 한다.

## 2026-10-18 작성 admission 복구

일반 Local Post와 Reply는 기존 직접 transaction 저장 뒤 effects-only Workflow를 시작한다.
Quote의 최초 INSERT만 생성 Workflow에서 Quote owner INITIALIZE로 연결한다. 일반 작성의 HTTP 응답
유실 중복과 effects 시작 전 process 종료 gap이 이 변경으로 해결됐다고 주장하지 않는다.

Quote caller는 한 작성 시도에 timestamp와 UUID로 구성한 admission identity를 보존한다. Workflow ID는
Profile별로 분리하지 않으며 Profile·Account·본문 document·Mention authored text·Visibility·Source·Media
입력 전체를 최초 입력에 결속한다. payload별 Update ID를 사용해 다른 입력이 이전 Update의 cached result를
받지 않게 한다. 진행 중에는 같은 결과를 기다리고 완료 후에는 같은 Update 결과를 회수한다.

최초 제출 시각부터 5분 안의 identity만 새 생성 실행을 시작할 수 있다. 30초보다 미래인 시각은 거절한다.
그 뒤에는 payload별 Update 결과를 조회할 뿐 새 실행을 시작하지 않는다. NotFound는 안전한 거절이며,
연결 오류나 deadline은 결과 미확정으로 전파한다. 현재 namespace retention을 늘려도 이미 사라진 과거
admission이 다시 유효해지지 않는다. 5분은 최초 시작 창이며 이미 진행 중이거나 보관된 결과의 회수 기한이 아니다.

Post ID는 admission에서, 최초 Content ID는 admission과 canonical payload 전체에서 domain을 분리한
SHA-256 bytes를 사용해 UUIDv7으로 결정한다. UUID bit layout은 기존 uuid 라이브러리에 맡긴다.
기존 Post/Content primary key와 currentContentId FK로 결속하므로 새 DB 컬럼이나 consent 상태가 필요하지 않다.
Quote owner INITIALIZE도 payload별 command ID를 쓰고, Activity는 기대 Post/Content ID를 다시 계산한다.
기존 행은 ACTIVE·Profile·Source·Visibility·Reply 없음·최초 Content ID가 모두 일치해야 회수한다.
수정·삭제된 Post 또는 payload 불일치는 안전하게 거절한다. 정상 history 보존 중에는 cached Update 결과가
기존 Post ID를 반환하며, 현재 consent status가 바뀌었다고 원래 생성을 다시 수행하지 않는다.

이력 소실 뒤에도 같은 admission은 같은 Post primary key로만 쓰므로 새 ID로 중복 생성하지 않는다.
오래된 admission의 결과를 찾지 못하면 새 Post를 만들지 않는다. 영구 receipt 저장이나 보존 기간 이후의
무조건적인 결과 회수는 보장하지 않는다. timestamp·UUID를 바꾸면 다른 명시적 작성 시도이며, caller가
결과 미확정 요청의 identity를 자동 교체하면 안 된다.

생성 결과가 미확정이면 caller는 초안·identity를 유지하고 결과 미확정으로 표시한다. 같은 ID에 다른
payload를 보내면 validation으로 거절하며, 성공 확인 또는 명시적 초안 폐기 뒤 새 시도를 만든다.
Quote effects는 공통 Notification Activity로 Reply·Quote·Mention projection과 Push dispatch를 실행한다.
DB consent writer와 protocol effect의 소유권은 유지한다. Activity delivery는 재시도 가능하며 외부 서버의
exactly-once 수신을 보장하지 않는다. 기존 생성 Workflow history의 effects trace는 patch marker로 보존한다.
