# ADR 0030: Content Report Submission

## 상태

Accepted — 2026-09-10 사용자 “Gate 승인. Spec 작성 시작”으로 Domain·Design·Issue 결과의 Spec 단계 전환을 승인했다. 구현과 Spec Gate 승인은 포함하지 않는다.

## 날짜

2026-09-08

## 근거

- [PROD-915](https://linear.app/byulmaru/issue/PROD-915): Web·Android·iOS의 Post·Profile 신고 제출과 Slack 전달 확인.
- 2026-09-08 PROD-915 Spec 사용자 결정: 로그인한 활성 Account만 신고를 제출한다. Selected Profile 선택은 요구하지 않는다.
- 2026-09-10 PROD-915 Spec 사용자 결정: 선택형 사유와 선택적 상세 설명으로 받으며, `기타`만 설명을 필수로 한다. PROD-907의 범위는 PROD-915에 통합한다.
- 2026-09-10 후속 사용자 결정: 최소 payload·5개 사유·2,000자 상한·ACK 및 불확실 결과/수동 재시도를 확정한다. 공유 Account rate limit 제안은 채택하지 않고 분산 남용 제한을 후속 이슈 책임으로 분리한다. 후속 이슈 생성은 승인하지 않았다.

## 확정한 범위

- 신고 사유는 유해·부적절한 콘텐츠, 괴롭힘·혐오·위협, 스팸·사기, 아동 안전 우려, 기타의 5개 카테고리로 받는다. 상세 설명은 최대 2,000자이며 선택 사항이다. `기타`를 선택한 경우에만 공백이 아닌 설명을 필수로 한다.
- 신고 제출 주체는 인증된 `Account.Active`다. Selected Profile 선택은 신고 제출의 필수 조건이 아니다.
- 2026-09-10 사용자 결정: 신고 대상은 서버가 제출 시점에 canonical 직접 조회 권한을 다시 확인한, 저장된 local/remote Post·Profile이다. 실제 선택된 유효 Profile을 viewer로 사용하고 미선택이면 공개 조회 범위만 적용한다. 삭제·차단으로 현재 조회 불가한 Post는 제외한다. 기존 공통 직접 조회 정책을 적용하며, 저장된 제한 상태의 누락은 최종 통합 전에 공통 정책 소유 범위에서 해결한다.
- 신고는 Post 또는 Profile에 대한 사유를 Slack으로 전달하는 기능이다. 신고 제출이나 처리 단계를 소유하는 durable 객체를 만들지 않는다.
- Slack 최소 payload는 대상 종류, 서버가 확인한 안정적 대상 ID, Kosmo 링크, remote 대상의 원본 URI, 선택 사유와 입력한 상세 설명이다. 신고자 식별정보는 전달하지 않으며 원문·media를 자동 복사하지 않는다. 인증과 대상 권한 검증에 사용하는 서버의 Account·viewer 정보는 Slack payload와 구분한다.
- Web·Android·iOS가 같은 제출 계약을 사용한다. Slack 정상 ACK인 HTTP 200과 `ok`를 확인한 경우에만 성공으로 안내한다. 성공은 Slack 수신 확인이며 운영자 검토 완료가 아니다.
- timeout, connection reset, response loss 등은 `전달 여부를 확인할 수 없음`으로 구분한다. 미전달이나 성공으로 단정하지 않는다. 불확실 상태에서는 입력을 유지하고 중복 가능성을 안내한 뒤 수동 재시도를 허용하며 자동 재전송하지 않는다.
- 수동 재시도는 새로운 Slack 발송 시도다. PROD-915에서는 시간 구간 기반 abuse limit을 적용하지 않는다. Slack이 반환하는 Retry-After 등 목적지의 재시도 조건은 Account별 남용 제한과 별개다.
- Web·Android·iOS는 제출 중 버튼 비활성화 등 client 측 중복 제출 억제를 제공한다. 서버는 현재 요청 처리 흐름에서 합리적인 최소 동시 중복 억제를 사용할 수 있다. process-local 방어는 전역 abuse/rate limit이나 장기 중복 방지로 표현하지 않는다.
- 신고는 대상의 노출, 검색 후보성, 관계나 상태를 자동으로 바꾸지 않는다.
- 인증 정보와 신고 payload는 필요한 범위에서만 처리한다. Slack credential을 client, repository 또는 log에 노출하지 않는다.
- PROD-915가 공통 계약, 플랫폼별 구현·검증, 세 플랫폼과 Slack을 연결한 통합 증거, 필요한 OpenSpec 완료·archive를 소유한다. PROD-907의 별도 구현·검증은 통합되었다.

## 제외 범위

- 여러 API replica에 걸친 공유 rate/abuse limit과 이를 위한 Redis/Valkey 등 공유 제한 인프라 도입. Account별 `N회 / 시간 구간` 정책을 이 이슈에서 정의하지 않으며 분산 제한을 완료 조건으로 삼지 않는다.
- 장기 중복 판정, 반복 신고 탐지, 다계정 abuse 탐지와 신고 이력 기반 제한.
- 신고 전용 DB, 신고 처리 상태 조회, 관리자 화면과 별도 감사 시스템.
- 운영절차, runbook, 운영자 지정과 escalation 정책.
- 자동 moderation, CSAM 분류와 범용 콘텐츠 판별.
- Google Play 공개 심사·선언과 계획 단계의 실제 Slack 메시지 발송.

## Gate 정렬과 구현 의존성

- 신고는 현재 지원되는 저장 capability의 공통 조회 정책을 소비한다. 현재 저장 가능한 제한 상태를 누락한 predicate를 완성된 authorization으로 간주하지 않는다. 아직 제공하지 않는 Domain Block·Mention·DIRECT recipient capability의 신규 구현은 신고의 선행 제품 요구사항으로 확대하지 않는다.
- Profile Block 공통 policy는 PROD-822의 policy 구현 결과를 소비하며 신고 전용으로 중복 구현하지 않는다. 필요한 것은 방향별 Post authorization 결과이며 특정 branch, PROD-822 전체 완료나 Block UI는 아니다. Spec 작성·승인과 신고 구현 착수를 막지 않지만 authorization 통합·회귀 및 신고 완료 전에는 이 결과가 필요하다.
- 기존 Profile 검색의 staged 예외를 신고에 대한 일반 권한으로 확대하지 않는다. 이후 capability가 도입되면 구현·통합 시점의 canonical과 공통 조회 정책을 다시 대조한다.
- 2026-09-10 Domain·Design·Issue Gate 전환 승인에 따라 OpenSpec을 작성한다. Linear blockedBy 추가나 두 기능 사이 Git Stack 구성은 이 승인의 범위가 아니다.

## 후속 책임

Server-side distributed abuse/rate limiting은 별도 후속 이슈가 정책·공유 상태 경계·구현·검증을 소유한다. 제한 단위·수치·시간 구간·장애 시 행동과 저장소는 그 이슈에서 결정한다. 후속 이슈는 아직 생성하지 않았으며 생성·완료를 PROD-915의 blocker로 두지 않는다. 장기 탐지와 신고 이력 저장을 후속 분산 제한의 필수 범위로 자동 포함하지도 않는다.

## 이전 결정과의 관계

기존 [ADR 0002](./0002-pr-review-domain-adjustments.md)와 [ADR 0008](./0008-relationship-report-state-exclusions.md)의
신고 제외는 당시 범위 결정이다. 이 결정은 신고 제출 제외만 부분 대체하고, 신고 묶음·처리 단계·durable 객체의
제외는 유지한다. 신고 제출은 인증된 Account의 행동이며 기본 소셜 행동의 Profile 주체 원칙을 변경하지 않는다.
