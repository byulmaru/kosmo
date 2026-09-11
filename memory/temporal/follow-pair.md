# Temporal Workflow Memory: Follow Pair

## Follow Pair Update-With-Start

- Follow의 orchestration 단위는 방향성을 가진 Profile pair다. Workflow ID는
  `profile-follow-pair:{followerProfileId}:{followeeProfileId}`처럼 follower와 followee를 포함한 결정적 ID를
  사용한다. 같은 pair의 실행 중인 lifecycle에는 `USE_EXISTING`을 적용하고, terminal이 된 lifecycle의 새 Follow
  시도에는 `ALLOW_DUPLICATE`로 새 Run을 시작한다.
- `FOLLOW`는 caller 검증 뒤 항상 이 pair Workflow에 Update-with-Start한다. transaction Activity가 Open policy면
  Follow Relationship을 commit하고, Approval Required면 Follow Request를 commit한다. Open 결과는 Update handler가
  commit 결과를 즉시 반환한 뒤 FIFO effects를 drain하고 Workflow를 종료한다. Approval Required 결과는 Request가
  승인·수락·거절·취소될 때까지 Pending으로 남는다.
- `APPROVE`, remote `ACCEPT`, `REJECT`, `CANCEL`은 별도 Workflow type이나 request 전용 시작 경계를 만들지 않고
  같은 pair Workflow의 Update다. Pending 상태에서 terminal command가 commit되면 handler는 commit 결과를 먼저
  반환하고, 선언된 순서의 effects를 FIFO로 drain한 뒤 Workflow를 종료한다. terminal effect failure는 commit을
  rollback하지 않으며, drain이 끝난 뒤 Workflow 결과에 기록해 성공/실패를 관찰할 수 있게 한다.
- Initial `FOLLOW`는 실행 중인 같은 pair run의 중복 admission을 합치도록 고정 Update ID를 사용한다. PENDING을
  유지하는 terminal no-op은 participant 복구 뒤 같은 exact-row command를 다시 실행할 수 있어야 하므로 terminal
  command에는 명시적 Update ID를 주지 않고 Temporal client가 호출별 ID를 배정하게 한다. 같은 client 호출 안의
  RPC retry는 하나의 ID로 수렴하고, 이후 별도 호출은 새 ID로 handler에 다시 들어가며 DB exact-row 조건이
  중복 mutation을 막는다. 이 transport ID는 domain `operationId`가 아니다.
- Pending 동안 Request create effect가 terminal failure가 되어도 그 실패를 Workflow state에 기록하고 Pending
  command 대기를 계속한다. 이후 terminal command는 이전 effect failure에 막히지 않고 자신의 transaction과 queued
  effects를 처리하며, 마지막 drain 뒤 누적된 terminal failure를 결과에 반영한다.
- 한 pair Workflow는 동시에 서로 다른 lifecycle command를 처리하지 않는다. Update handler는 command를 시작할 때
  in-flight guard를 세우고, 한 client 호출의 RPC 재전송은 Temporal deduplication에 맡기며 다른 command는 conflict로
  거부한다. DB unique constraint와 exact-row 조건은 Workflow 밖에서 발생하는 race의 최종 방어선이다.

- Terminal Update가 DB commit 결과를 반환한 뒤에도 기존 run은 effects를 drain하는 동안 잠시 실행 중일 수 있다.
  이 창에서 같은 pair의 새 Follow attempt가 들어오면 active terminal run이 이를 재시도 가능한 충돌로 거부할 수
  있다. 새 generation을 미리 queue하거나 별도 lease/operation identity를 두지 않으며, caller가 기존 run 종료 뒤
  재시도하는 위험을 의도적으로 수용한다.
- Follow pair command에는 server-generated random `operationId`나 operation receipt를 추가하지 않는다. 신규
  Follow/Request insert는 ID를 지정하지 않고 PostgreSQL `uuidv7()` column default를 사용하며, 정상 Activity 완료 시
  DB가 반환한 row ID를 결과와 create effect source로 사용한다. transaction Activity commit 뒤 completion 응답이
  유실되면 retry는 기존 row를 중복 생성하지 않지만 이번 transition의 commit이라고 추론해 create effect를
  재구성하지도 않는다. Approve/Accept retry는 Workflow history의 exact pending Request ID가 command expected ID와
  일치하고 현재 exact-pair Request가 없으며 Follow가 존재할 때 관계 상태를 `ESTABLISHED`로 수렴시키되 누락된
  effects는 다시 만들지 않는다.
  Temporal Update ID는 RPC deduplication용 메타데이터일 뿐 domain identity나 durable receipt가 아니다.
- 새 pair run의 첫 `FOLLOW`도 mutation 전에 기존 pending request ID만 read-only Activity로 history에 남긴다.
  그래야 OPEN 정책 승격 transaction이 commit된 직후 Activity completion이 유실되어도 request cleanup effect를
  재구성할 수 있다. 장수명 PENDING run에는 execution timeout을 걸지 않되, UWS caller RPC에는 bounded deadline을 둔다.
- pair transaction/bootstrap Activity가 retry를 모두 소진하면 Update 실패를 기록하고 기존 effects를 drain한 뒤 run을
  typed failure로 닫는다. PENDING으로 무기한 대기시키지 않으며 known domain failure DTO는 lifecycle을 계속 유지한다.
- Update 응답에는 full DB row나 `Temporal.Instant`를 넣지 않고 domain row ID와 pair identity만 보존한다.
  Unfollow/removal Workflow는 mutation 전에 expected F1 ID와 directed pair의 일치를 read-only Activity로 검증해
  Workflow history에 남긴다. 검증 실패는 mutation/effect 없는 no-op이고, 검증된 F1 removal retry 시 현재 row가
  F2여도 history의 F1 identity로 F1 delete effect만 재구성하고 F2는 보존한다.
- 이 Follow 규칙이 다른 capability의 retry 계약을 제거하지는 않는다. 삭제 source identity나 effect plan을 DB 상태만으로
  복원할 수 없는 별도 Temporal capability는 최소 domain-specific receipt를 transition과 같은 transaction에 기록하고,
  해당 결과가 History에 기록된 뒤 정리할 수 있다. 이를 범용 command ledger나 lifecycle exactly-once 보장으로
  일반화하지 않는다.
- Unfollow는 이미 성립된 Follow Relationship의 별도 짧은 Workflow다. Follow pair Workflow는 Unfollow까지 살아
  있지 않고, inbound Follow의 actor/object/recipient 검증과 직접 Accept delivery 경계도 기존 Fedify handler에
  남긴다. Follow effect의 origin guard는 ActivityPub outbound echo를 계속 막는다. Removal transaction Activity가
  retry를 소진하면 Update와 Workflow 실행을 함께 실패로 닫고, 성공한 DB commit 결과만 effects 완료와 분리해
  Update 성공으로 반환한다.
