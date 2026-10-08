# Quote Notification 생성과 기존 cutoff

PROD-926에서 도입한 `NotificationRollouts`는 Quote Notification 생성 스위치로 사용하지 않는다. flagd의 Boolean `quote` 값은 새 클라이언트 Quote 진입점만 제어하며 서버의 알림 생성은 이 값에 의존하지 않는다. 기존 `notification_rollout` 행이 있으면 `activated_at`은 기존 판정 cutoff로 유지하고 `enabled` 값은 무시한다. 행이 없으면 cutoff 없이 현재 자격 조건에 따라 알림을 생성한다.

기존 cutoff 이전에 생성된 Quote는 여전히 알림 대상에서 제외한다. 기존 Quote 전체를 검색하거나 알림을 backfill하지 않는다. `post-create-effects-quote-notification-v1` Temporal patch marker는 기존 Workflow history의 replay 호환성을 위해 유지한다. 이 marker는 새 Worker의 기존 history replay만 보호하므로 새 history를 Quote 도입 전 Worker로 보내지 않는다. Quote 승인·조회 권한, Mute·Block, Reply → Quote → Mention 우선순위와 첫 판단 이후의 deduplication은 기존 정책을 따른다.

`notification_rollout` 테이블과 기존 행은 이 변경에서 삭제하지 않는다. 행의 `enabled` 값을 바꿔도 신규 생성은 중지되지 않으므로 이 테이블을 운영 중지 스위치로 사용하지 않는다. 현재 notification writer는 Local-to-Local Quote만 처리하며 Remote Quote의 승인 adapter는 별도 구현 범위다.
