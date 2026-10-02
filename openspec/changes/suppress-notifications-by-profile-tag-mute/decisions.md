## Session Context

PROD-1048의 확정 정책을 구현 가능한 범위로 정리한다. 이 문서는 ADR이나 스펙 승인 기록이 아니다.

## Choice Notes

### Profile Tag와 게시물 Hashtag의 책임 분리

- Decision Date: 2026-10-02
- Decision Class: Upstream product decision summary
- Status: Confirmed upstream
- Authority / Provenance: [PROD-1048](https://linear.app/byulmaru/issue/PROD-1048) 본문의 2026-10-02 사용자 결정,
  `docs/domain/objects/hashtag-mute-rule.md`, `docs/domain/objects/notification.md`.
- Choice: 생성 시점의 Related Profile Tag를 검사한다. 게시물 Hashtag가 없어도 적용하고 Exclude·Collapse 모두 억제한다.
- Reason: 현재 제공되는 Profile Tag만으로 뮤트한 주제의 태그를 단 사람에게서 오는 알림을 제어하기 위함이다.
- Alternatives: 게시물 Hashtag 구현을 기다리는 방식은 현재 Linear의 독립 전달 범위와 맞지 않는다.
- Consequences: PROD-1029 규칙 기반을 소비한다. PROD-827·PROD-1031·PROD-735는 서버 억제의 선행 Block이 아니다.

### Quote 최초 판단과 기존 알림 보존

- Decision Date: 2026-10-02
- Decision Class: Existing contract preservation
- Status: Confirmed upstream
- Authority / Provenance: PROD-1048, `docs/domain/objects/notification.md`,
  `docs/domain/decisions/0028-quote-notification-policy.md`.
- Choice: Quote Author의 태그를 검사하고, 억제 뒤 해제·만료·태그 변경에도 같은 Quote 알림을 소급 생성하지 않는다.
  기존 Notification의 존재·Read State와 중복 정책을 유지한다.
- Reason: 억제 사유를 추가해도 기존 생성·보존 계약을 유지하기 위함이다.
- Alternatives: Source Author 태그로 대체하거나 과거 알림을 다시 판정하는 방식은 현재 계약에서 허용하지 않는다.
- Consequences: 최초 판단 경로에서 검증한다. Query visibility·cleanup을 새 뮤트 소비 경로로 추가하지 않는다.

### 현재 공통 생성 정책 활용

- Decision Date: 2026-10-02
- Decision Class: Session implementation note
- Status: Suggested approach
- Authority / Provenance: `packages/core/services/notification-policy.ts`,
  `packages/core/services/quote-notification-coordination.ts`의 현재 코드. 제품 권위가 아닌 조사 근거다.
- Choice: 공통 억제 함수에서 Rule·Profile Tag 일치를 판정하는 접근을 우선 검토한다.
- Reason: 구현된 6종과 Quote·Reply 조정 경로가 이미 이 정책을 소비한다.
- Alternatives: 서비스별 중복 predicate는 누락 위험이 있어 우선안으로 삼지 않는다.
- Consequences: PROD-1029 실제 결과와 구현 시점 코드를 확인해 바꿀 수 있다. 파일·함수명을 영구 계약으로 고정하지 않는다.

## Unresolved Questions

- 제품 정책의 미결정 사항은 없음. 완성된 스펙에 대한 별도 인간 승인 기록은 아직 없다.
- PROD-1029 인수와 runtime 검증은 후속 구현 책임으로 남긴다.
