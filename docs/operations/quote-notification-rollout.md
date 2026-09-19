# Quote Notification 활성화와 rollback

PROD-926의 승인된 D4/D7과 [배포 설계](../../openspec/changes/add-quote-notification-server/design.md)를 실행하는 절차다. PR #921은 storage와 호환 Local reader/writer를 준비하며, merge나 migration 성공만으로 생성을 활성화하지 않는다. 실제 Remote 승인·철회, Mention 교차 Type, 공통 정책 통합과 배포 검증은 아직 완료되지 않았다.

## 최초 활성화 전

1. 대상 환경, DB migration revision, API·Worker image revision과 검증 결과를 기록한다. 실제 upstream 통합을 포함한 OpenSpec task 5.3·6의 증거가 없으면 여기서 중단한다.
2. migration 이후 `notification_rollout`에 `QUOTE_NOTIFICATION` row가 없고 생성이 꺼져 있는지 확인한다. 기존 row가 있으면 T0와 판단을 보존하고 신규 활성화로 취급하지 않는다.
3. Quote-aware API·Worker와 해당 Quote를 처리하는 모든 Reply/Quote/Mention writer를 준비한다. Post Create Workflow의 patch marker를 유지한다. patch는 구 history를 새 Worker로 재생하는 호환성이며, 새 history를 구 Worker로 재생하는 보장은 아니다.
4. 이전 writer와 관련 입력을 중지하고 진행 중 source transaction·Post Create Workflow·Notification effect를 drain한다. 새 Worker가 실행한 history를 구 Worker가 가져가지 않도록 전환한다. active/preview/rollback workload의 revision과 drain을 확인할 수 없으면 활성화하지 않는다.
5. 입력이 중지된 상태에서 DB 시각으로 최초 T0를 저장한다. 아래 SQL은 명시적인 운영 승인 뒤 대상 환경에서 실행한다. migration이나 자동 배포 hook에 넣지 않는다.

```sql
INSERT INTO notification_rollout (key, activated_at, enabled)
VALUES ('QUOTE_NOTIFICATION', clock_timestamp(), true)
ON CONFLICT (key) DO UPDATE SET enabled = true
RETURNING key, activated_at, enabled;
```

충돌 시에는 `enabled`만 바뀌므로 재시도·재개가 T0를 이동시키지 않는다. 기록한 T0를 확인한 뒤 호환 writer로 입력을 재개한다. T0 이전 Quote backfill은 실행하지 않는다.

## 생성 중지와 재개

입력을 중지하고 다음 SQL로 신규 Quote 알림 생성을 끈 뒤 진행 중 effect를 drain한다. 조회·읽음·cleanup과 Reply/Mention 대표 보존 writer는 유지한다.

```sql
UPDATE notification_rollout SET enabled = false
WHERE key = 'QUOTE_NOTIFICATION'
RETURNING key, activated_at, enabled;
```

reader/writer 호환·drain 및 오류 원인을 확인한 뒤 위 최초 활성화 SQL을 재실행한다. `activated_at`, 판단 기록, enum과 기존 Notification을 삭제하거나 재작성하지 않는다. 이미 처리된 Quote를 전체 scan해 새 알림을 만드는 작업도 하지 않는다. 미확정 accepted effect의 기존 retry와 신규 backfill을 구분한다.

pre-Quote 바이너리로 전체 downgrade하지 않는다. 각 단계에서 환경·revision·T0·enabled·drain 결과와 실패 시 중지한 위치를 남긴다. 이 문서와 로컬 DB/Workflow 테스트는 실제 운영 rollout을 수행했다는 증거가 아니다.
