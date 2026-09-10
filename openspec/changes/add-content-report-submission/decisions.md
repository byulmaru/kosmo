## Context

2026-09-10 승인된 Domain·Design·Issue 결과를 신고 제출 change에 연결한다. 아래 기록은 제품 결정을 새로 만들지 않는다. 구현 전에 각 canonical 문서와 최신 Linear를 독립적으로 확인한다.

## Decision Records

### D1. 활성 Account와 선택적 viewer

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 활성 Account·Profile 미필수는 2026-09-08 결정, viewer 범위는 2026-09-10 확정.
- Status: Active
- Context / Problem: 신고 제출 주체와 대상 조회에 사용하는 Profile은 다른 역할이다.
- Decision Outcome: 인증된 활성 Account만 제출하며 실제 선택된 유효 Profile을 viewer로 사용한다. 미선택이면 공개 조회 범위다.
- Alternatives Considered: Selected Profile 강제나 다른 소유 Profile의 권한 사용은 승인된 계약과 맞지 않는다.
- Consequences: 로그인·Account 상태와 optional viewer 검증을 구분한다. 신고자 식별정보를 Slack으로 전달할 근거가 되지 않는다.
- Confirmation / Follow-up: 미선택 공개 조회와 selected viewer 전환·권한 실패를 실행 검증한다.

### D2. 저장된 대상과 공통 직접 조회 결과

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), [PROD-822](https://linear.app/byulmaru/issue/PROD-822).
- Status: Active
- Context / Problem: 조회 가능성과 검색 후보·상호작용 자격은 같지 않다. 현재 저장된 Block을 빠뜨린 기존 predicate도 존재한다.
- Decision Outcome: 제출 시점의 저장된 local/remote 대상에 공통 직접 조회 authorization을 적용한다. 필요한 방향별 Block 결과는 통합·회귀·완료 전에 준비한다.
- Alternatives Considered: local 전용 또는 임의 URL 제보 대신 승인된 local/remote 저장 대상을 유지한다. 신고 전용 predicate와 불완전한 공통 결과를 그대로 소비하는 방식으로는 완료 조건을 충족하지 못한다.
- Consequences: 전체 신고 구현 시작이나 Spec 승인을 막지 않는다. 특정 branch·PROD-822 전체·Block UI와 결합하지 않는다. 미래 Domain Block·Mention·DIRECT recipient를 새로 구현하지 않는다.
- Confirmation / Follow-up: PROD-915가 실제 공통 결과로 방향별 Block·잔존 Follow·대상 소멸 회귀를 검증한다. Linear blockedBy와 두 기능 간 Git Stack은 추가하지 않는다.

### D3. 사유와 Privacy 최소화

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).
- Status: Active
- Context / Problem: Slack에서 대상과 신고 이유를 파악하되 불필요한 신고자 정보가 전달되지 않아야 한다.
- Decision Outcome: 승인된 5개 사유, 선택적 최대 2,000자 설명과 `기타`의 공백 아닌 설명을 사용한다. 대상 종류·서버 확인 ID·Kosmo 링크·remote 원본 URI·사유·설명만 전달한다.
- Alternatives Considered: 자유 설명만 받거나 모든 설명을 필수로 받는 방식, 신고자 식별정보·대상 원문 자동 복사는 확정 범위에 포함하지 않는다.
- Consequences: credential·본문의 불필요한 log/telemetry와 preview 노출을 막는다. 직접 입력한 개인정보까지 제거한다고 주장하지 않는다.
- Confirmation / Follow-up: payload·오류 출력과 길이 경계를 실행 검증한다.

### D4. ACK와 전달 확인 불가·수동 재시도

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).
- Status: Active
- Context / Problem: timeout이나 응답 유실 후에는 실제 Slack 수신 여부를 알 수 없다.
- Decision Outcome: HTTP 200과 `ok`만 정상 성공이다. 확인된 실패와 확인 불가를 구분하고 자동 재전송 없이 입력을 유지하며 중복 가능성을 안내한 뒤 수동 재시도한다.
- Alternatives Considered: 모든 오류를 미전달로 처리하거나 자동 재전송하는 방식은 불확실성을 숨기므로 채택하지 않는다. durable 복구와 exactly-once는 제외 범위다.
- Consequences: 재시도는 새 발송이며 중복될 수 있다. 성공은 운영자 처리 완료가 아니다. API 결과 유실도 client에서 확인 불가로 처리한다.
- Confirmation / Follow-up: ACK 지연·거절·timeout·reset·응답 유실과 수동 재시도를 제어된 transport로 검증한다.

### D5. 최소 중복 억제와 분산 제한의 책임 분리

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), 2026-09-10 사용자의 공유 Account 남용 제한 미채택 결정.
- Status: Active
- Context / Problem: UI 중복 제출 억제와 여러 replica의 남용 정책은 보장 범위와 필요한 상태가 다르다.
- Decision Outcome: 세 플랫폼의 제출 중 중복 억제를 포함한다. 서버 요청 흐름의 합리적인 동시 억제는 사용할 수 있지만 전역 제한으로 보장하지 않는다. Account별 시간 구간 한도와 공유 제한 인프라는 도입하지 않는다.
- Alternatives Considered: 앞선 공유 Account 5회/10분 제안은 사용자가 채택하지 않았다. process-local 방어를 전역 한도로 해석하는 것도 허용되지 않는다.
- Consequences: 분산·장기·반복·다계정 제한을 완료 조건으로 두지 않는다. 별도 후속 분산 제한 이슈는 아직 생성하지 않았으며 생성·완료를 기다릴 필요가 없다.
- Confirmation / Follow-up: client 중복 조작과 선택적으로 쓰는 서버 동시 억제의 실제 범위만 검증한다.

### D6. 대상 문맥과 form lifecycle

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/content-reporting.md`, `docs/design/feedback.md`, `docs/design/accessibility.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), 2026-09-10 Native modal/sheet 선택 및 Gate 전환 승인.
- Status: Active
- Context / Problem: 신고 중 대상 문맥과 입력을 유지하면서 닫기·재시도 결과를 알 수 있어야 한다.
- Decision Outcome: Web 반응형 dialog/sheet, Native 현재 화면 위 modal/sheet를 사용한다. dirty 폐기 확인·pending 명시적 닫기 차단·실패/확인 불가 입력 유지·성공 입력 초기화와 결과 유지를 적용한다.
- Alternatives Considered: Native 별도 페이지 대신 사용자가 modal/sheet를 선택했다. 자동 draft 폐기와 durable 복원은 승인된 lifecycle과 맞지 않는다.
- Consequences: 지원 dismissal을 같은 경계로 연결한다. 폐기 후 재열기는 새 draft이며 앱/탭 종료 복원은 보장하지 않는다.
- Confirmation / Follow-up: Web keyboard/focus와 Android/iOS의 keyboard·dismissal·보조 기술을 각각 실행 검증한다.

### D7. 하나의 신고 제출 change와 완료 책임

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0030-content-report-submission.md`, `memory/issue-openspec-workflow.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).
- Status: Active
- Context / Problem: 공통 API만 또는 한 플랫폼만 완료해도 전체 신고 기능의 계약은 충족되지 않는다.
- Decision Outcome: PROD-915가 공통 API·Web·Android·iOS·최종 통합·이 change의 archive를 소유한다. PROD-907은 별도로 구현하지 않는다.
- Alternatives Considered: 플랫폼 또는 PR 수만으로 change와 archive 책임을 분리하지 않는다. 독립적으로 전달할 새 범위가 발견되면 먼저 Linear 책임을 정렬한다.
- Consequences: 부분 PR 완료는 전체 change 완료가 아니다. ADR 0002/0008의 제출 제외만 ADR 0030이 부분 대체하고 durable 처리 객체 제외는 유지한다.
- Confirmation / Follow-up: 모든 구현·검증 증거와 최신 authority를 대조한 뒤에만 전체 완료·archive를 수행한다.

### D8. Feedback Slack 연결 재사용

- Decision Date: 2026-09-10
- Decision Class: User Decision
- Authority / Provenance: 사용자 “Feedback과 동일한 슬랙봇을 사용할 거임” 및 재사용 방향 수정 승인, `docs/design/content-reporting.md`, PROD-915.
- Status: Active
- Context / Problem: 신고 전용 환경 변수는 별도 설정이 필요하며 사용자는 기존 Feedback 봇 사용을 선택했다.
- Decision Outcome: `SLACK_FEEDBACK_WEBHOOK_URL`과 공용 `env` Secret을 재사용해 같은 채널로 보낸다. 신고 전송은 API가 수행하며 `text`와 `plain_text` Block Kit을 사용하고 unfurl을 끈다.
- Alternatives Considered: 신고 전용 환경 변수와 별도 Secret은 채택하지 않는다.
- Consequences: API·Web 서버의 기존 공용 주입 경로를 유지한다. Web application·client bundle은 credential을 소비·노출하지 않으며 신고자 정보·ACK·비영속 계약은 유지한다.
- Confirmation / Follow-up: 공유 환경 변수와 Slack 메시지 형식을 테스트하고 실제 채널 수신은 최종 통합 검증에서 확인한다.

## Remaining Decisions

현재 사용자 제품 미결정과 Blocked decision은 없다. 내부 helper·파일명·timeout·문자 수 계산 등은 승인된 계약을 보존하는 구현 선택으로 위임한다. 분산 제한 후속 이슈의 정책은 이 change에서 결정하지 않는다.

## Superseded Decisions

이 change 안에서 대체된 decision은 없다. 공유 Account 제한 제안은 OpenSpec 작성 전에 미채택되었으므로 Active decision으로 기록하지 않는다. 과거 ADR의 부분 대체 근거는 ADR 0030을 따른다.
