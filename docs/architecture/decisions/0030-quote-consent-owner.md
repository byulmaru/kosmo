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

- #1094 공통 모델: 두 consent 컬럼·identity CAS·fresh-proof 재승인 계약을 기반으로 유지한다.
- #961: inbound Create/Update/Delete/Accept/Reject·재검증, owner의 공통 read/write/drain/bootstrap 경계를 반영한다.
  Source 삭제의 공통 잠금·bulk 철회·owner admission 안전 경계도 이 하위 계층과 함께 제공해야 한다.
  owner 승인만 먼저 반영하고 잠금 없는 기존 Source 삭제를 남기는 조합은 안전하지 않다.
- #940: local Quote 초기화/Request/decision·Source 삭제의 local orchestration, 정책 migration과 Composer 계약을 반영한다.
  공통 Source 안전 경계의 책임은 #961과 공유한다. 기존 두 consent 컬럼 migration을 중복하지 않는다.

#1094의 Source lookup index와 공통 consent schema를 먼저 유지하고, #940의 nullable `quote_policy` enum/column
추가와 local ACTIVE Post 기본값 backfill은 해당 column을 조회하는 application 전환 전에 적용한다.
이 정책 migration은 consent fencing column 추가가 아니다. 로컬 migration suite와 smoke는 통과했지만
production의 lock 시간·backfill 규모·구버전 workload 호환 확인은 별도 rollout gate다.

두 PR은 공유 파일을 통째로 분리하여 독립 반영할 수 없다. #961 공통 안전 계층 → #940 local 정책 계층의
의존 순서를 권장한다. INITIALIZE/REQUEST/DECIDE 입력과 Activity, policy projection은 hunk 단위로 나누어야
한다. 이 순서는 반영 계획이며, latest main에 재구성한 각 layer의 build·migration·Source 경쟁 검증은 아직
실행하지 않았다. 통합본 검증 성공을 각 PR 독립 검증으로 간주하지 않는다.
특히 통합 common applier의 `Posts.quotePolicy` 조회는 #940 schema에 의존한다. #961 계층에는 이를 그대로
남기지 않고 기존 정책 판정 경계를 유지하며, #940에서 policy projection·조회와 local 명령 확장을 함께
반영해야 한다. 공유 파일 전체를 #961에 복사한 뒤 #940 migration만 나중에 적용하는 분리는 허용하지 않는다.

검증 명령과 실제 결과는 [검증 기록](../../testing/prod-924-owner-validation.md)에 구분해 기록한다.
Temporal의 [Activity 실행 보장](https://docs.temporal.io/activity-execution),
[Terminate와 cancellation](https://docs.temporal.io/workflow-execution#cancellation-and-termination),
[Continue-As-New](https://docs.temporal.io/develop/typescript/continue-as-new)를 전제로 한다.
