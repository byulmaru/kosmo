## Context

신고는 Account가 대상과 사유를 Slack으로 전달하는 기능이다. 기존 Feedback은 UI와 전송 코드의 참고 대상이지만 신고의 인증·payload·불확실 결과 계약을 대신하지 않는다. 기준 main은 `426ed9e7de3dcef1cb3be5d16df3c0934b981c36`이며, 구현 시작 시 canonical과 Linear를 다시 확인한다.

## Goals / Non-Goals

**Goals:**

공통 API의 자격 검증과 최소 Slack 발송, 세 플랫폼의 동일한 결과 처리와 접근성, 최종 통합 증거를 제공한다.

**Non-Goals:**

분산·시간 구간 남용 제한, 신고 저장·durable delivery, 운영자 처리 시스템, 새로운 moderation·원격 조회 capability는 포함하지 않는다. 상세 제외 범위는 proposal과 ADR 0030을 따른다.

## Implementation Guidance

아래 접근은 비규범적 구현 안내다. 함수명·파일 배치·상태 자료구조보다 specs의 관찰 가능한 결과와 독립 확인한 상위 계약을 우선한다.

### Current Constraints

- `packages/core/visibility/post.ts`의 현재 main predicate는 lifecycle·public/unlisted·작성자·Follow를 판단하지만 저장된 Profile Block을 반영하지 않는다. 단순 호출만으로 올바른 신고 authorization을 완료했다고 할 수 없다.
- `packages/core/visibility/profile.ts`는 현재 Active Profile·Instance 제한을 적용한다. 아직 저장 모델이 없는 미래 Safety/Domain Block을 보고 신고 구현 범위를 확장하지 않는다.
- 저장된 DIRECT 값과 작성자 자신의 기존 조회 경로는 존재하지만 recipient 관계 기반 접근은 아직 없다. DIRECT 전체를 없는 상태로 취급하거나 Mention 문자열에서 권한을 만들어내지 않는다.
- PROD-822가 제공할 공통 직접 조회 결과는 방향별 Post 정책을 적용한다. 양방향 타임라인·검색 후보 필터 또는 상호작용 admission을 신고에 그대로 사용하면 차단한 쪽의 직접 조회를 잘못 막는다.
- FeedbackOverlay·공용 ModalSheet·ActionMenu는 close/focus 선례를 제공한다. Native Feedback의 별도 페이지를 신고 presentation으로 재사용하지 않는다. gesture나 back callback이 있다는 사실만으로 dirty/pending 보호가 완성되지는 않는다.
- API와 Web은 현재 서버 Secret 주입 경계를 공유할 수 있다. credential의 client bundle 비노출과 API process에만 credential이 있다는 주장은 다르다. 기존 배포 경계를 조사해 필요한 서버 설정만 연결한다.

### Recommended Approach

1. 기존 GraphQL 인증 경계를 사용해 additive 신고 mutation을 제공한다. 대상 종류/ID·사유·설명만 입력으로 받고 검증된 Account와 실제 selected viewer를 사용한다. 잘못된 selected identity를 임의의 소유 Profile로 교체하지 않는다.
2. 발송 직전에 저장된 대상의 공통 직접 조회 query를 실행한다. 타임라인용 필터가 아니라 직접 Post/Profile 결과를 소비하고 서버가 대상 식별정보와 링크를 구성한다. Slack 전송 동안 DB transaction을 열어 외부 부작용과 묶지 않는다. 검증 이후 외부 세계가 바뀌지 않는다는 원자적 보장은 없다.
3. 서버 전송 경계를 테스트 가능한 외부 호출로 분리하고 정상 ACK, 확인된 실패, 확인 불가를 구별한다. 발송 timeout은 유한하게 두되 수치는 기존 runtime 제약에 맞춰 선택한다. SDK·HTTP client·Relay 경로의 숨은 자동 retry도 확인한다.
4. Slack은 명시적 필드 목록으로 직렬화하고 사용자 작성 텍스트를 안전하게 표시한다. 자동 링크 preview를 끄고 오류는 원문·credential 없는 분류 정보로 관측한다. Slack의 Retry-After를 받으면 목적지 조건으로 다루며 이를 Account rate limit으로 설명하지 않는다.
5. client는 작성·제출 중·성공·실패·확인 불가를 구분한다. 결과를 받지 못하면 확인 불가로 처리한다. 수동 재시도는 새 요청이며 대상 권한도 다시 확인한다. 서버 동시 억제가 유용하면 요청 수명 동안만 유지하되 durable 결과 cache나 분산 제한으로 확대하지 않는다.
6. 공용 form과 플랫폼별 overlay를 조합한다. 모든 지원 close 경로는 dirty 확인/pending 차단을 통과시킨다. Web은 기존 반응형 token·focus/scroll 제어를 활용하고 Native는 현재 화면 위 modal/sheet의 keyboard·back·gesture 동작을 실제 동작을 확인한다.
7. 2,000자 길이의 client/server 계산 기준은 기존 입력 컴포넌트와 validator를 조사해 일치시킨다. emoji·조합문자·공백의 경계 테스트를 함께 남긴다. form 내부 상태 배치와 문구는 승인된 결과 의미를 보존하는 범위에서 선택한다.

### Allowed Alternatives

동일한 API·Privacy·전달 결과를 보존하면 기존 transport utility를 안전하게 분리해 재사용하거나 신고 전송 경계를 별도로 둘 수 있다. 공용 form 하나와 platform adapter 또는 플랫폼별 form 모두 가능하지만 세 플랫폼의 입력·결과 계약과 검증 책임은 같다. process-local 동시 억제의 사용 여부와 구조는 위 범위 안에서 선택할 수 있다.

### Known Traps

- 인증된 Account라는 이유로 selected Profile을 강제하거나 Account의 모든 Block/Follow를 합치지 않는다.
- 신고 form을 열 때의 조회나 cache hit로 제출 시점 검증을 대체하지 않는다. 공통 Block 결과가 빠진 main predicate를 완료 근거로 삼지 않는다.
- HTTP 2xx 전체, 빈 응답 또는 fetch 완료를 Slack 정상 ACK로 간주하지 않는다. 명시적 거절을 입증할 수 없는 transport 오류를 미전달로 단정하지 않는다.
- client timeout·닫기·process 종료를 이미 발송한 요청의 취소로 약속하지 않는다. 수동 재시도에 기존 성공 결과를 durable하게 기억한다고 가정하지 않는다.
- Feedback의 payload·길이·인증·동시 억제·실패 분류를 조사 없이 복사하지 않는다. 운영 credential이나 실제 신고 본문을 테스트 fixture로 사용하지 않는다.

## Risks / Trade-offs

- 전달 확인 실패 뒤 실제 Slack 메시지가 존재할 수 있음 → 입력 유지·중복 가능성 안내·자동 재전송 금지로 사용자가 재시도를 판단한다. 중복 자체를 제거하는 보장은 없다.
- 공유 제한이 없어 여러 replica·다중 client에서 남용 가능 → 이번 범위를 정확히 기록하고 별도 후속 이슈에서 정책을 결정한다. 이 문서로 새 한도나 저장소를 도입하지 않는다.
- 공통 authorization 결과가 아직 main에 없음 → 독립적인 전송/UI 작업과 최종 authorization 통합 완료를 분리한다. mock 통과만으로 신고 완료를 선언하지 않는다.
- remote 객체가 원격 현재 상태와 다를 수 있음 → 저장된 Kosmo 대상과 제출 시점의 공통 조회 결과에 한정하며 새 remote fetch·실시간 원격 정합성을 보장하지 않는다.
- Native dismissal과 Web focus 선례의 차이 → 플랫폼별 실제 실행 증거를 남긴다. reload·앱 종료 뒤 draft 복원은 요구하지 않는다.

## Migration Plan

DB migration은 없다. 구현 단계에서 additive API와 안전한 서버 설정을 먼저 준비하고 client 진입점을 연결한다. 공개 전에 공통 방향별 authorization 결과와 세 플랫폼 통합 증거를 확인한다. 기존 client를 깨뜨리지 않는 순서로 배포하고, rollback은 신고 진입점을 먼저 비활성화하거나 되돌린 뒤 미사용 API·설정을 정리하는 경로를 검토한다. 이미 Slack에 전달된 메시지는 rollback으로 회수되지 않는다. 현재 단계에서 배포나 실제 Slack 발송은 수행하지 않는다.

## Open Questions

남은 사용자 제품 결정은 없다. GraphQL 구체 타입·오류 표현, timeout 값, 문자 수 계산, component 배치와 실제 Slack 설정 가용성은 구현 단계에서 위 계약에 맞춰 확인한다. 공통 Block 결과의 main 반영과 Native 실행 환경은 최종 통합·검증 시 확인할 의존성이다. 새로운 제품·보안·호환성 선택이 발견되면 canonical·Linear부터 갱신한다.

## Slack 연결 보완 · 2026-09-10

사용자 결정에 따라 Feedback과 같은 Slack 봇·채널 및 기존 `SLACK_FEEDBACK_WEBHOOK_URL`을 재사용한다. 공용 `env` Secret의 API·Web 서버 주입 경로를 유지하고 신고 전송은 API에서만 수행한다. Web application·browser·native bundle에는 credential을 노출하지 않는다. 신고 전용 환경 변수·Secret이나 DB 저장은 추가하지 않는다. 메시지는 고정 `text`와 `plain_text` Block Kit으로 구성하고 링크·media unfurl을 끈다. 기존 신고 payload 필드와 ACK·확인 불가·자동 재전송 금지 계약은 유지한다.
