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
- 2026-09-14 사용자 정정(2026-09-10의 직접 조회·Block 연동 결정을 대체): 신고는 현재 Post/Profile 화면의 신고 진입점에서 시작하며, 신고 eligibility를 일반 canonical direct-read authorization과 동일시하지 않는다. Profile Block의 방향별 Post authorization은 신고 조건이 아니고, 차단으로 UI에서 접근할 수 없는 대상을 과거 ID로 신고하는 흐름의 지원·방어는 PROD-915의 요구사항이 아니다. 이는 client를 신뢰한다는 일반 원칙이 아니며 서버 인증·입력·대상 존재/유효성·payload·credential 검증은 유지한다.
- 신고의 기존 비-Block visibility는 유지한다. 실제 선택된 유효 Profile만 viewer로 사용하며 미선택이면 PUBLIC/UNLISTED 범위다. FOLLOWERS는 작성자 또는 저장된 Follow 관계를 가진 viewer, 현재 DIRECT는 작성자만 허용한다(SELF_ONLY enum과 DIRECT recipient 권한은 현재 없다). Post는 Active이고 Current Content가 있어야 하며 작성자·대상 Profile은 Active, Instance는 Suspended가 아니어야 한다. Quote·Reply는 자체 조건을 적용하고 본문 없는 Repost는 기존과 같이 신고 대상이 아니다. 제출·재시도 시 서버가 이 조건을 다시 확인한다.
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

- 신고는 기존 공통 visibility 구성 요소로 위의 비-Block 조건을 검증한다. 일반 direct-read helper가 향후 포함하는 Profile Block 정책을 신고에 자동 적용하지 않는다. 아직 제공하지 않는 Domain Block·Mention·DIRECT recipient capability를 추가하지 않는다.
- 2026-09-14 정정에 따라 PROD-822의 방향별 authorization 결과는 신고 구현·통합·회귀·완료의 선행 조건이 아니다. 신고 전용 Block predicate도 만들지 않는다. PROD-822의 특정 branch·전체 구현·Block UI·cleanup·관리 API를 가져오지 않고 `main → PROD-915 (#857)`로 독립 전달한다.
- Profile 검색·일반 조회·상호작용의 권한은 각 기능이 소유하며 이번 정정으로 변경하지 않는다. 신고 제출 자격만 이 ADR의 명시된 조건을 적용한다.
- 2026-09-10 Domain·Design·Issue Gate 전환 승인에 따라 OpenSpec을 작성한다. Linear blockedBy 추가나 두 기능 사이 Git Stack 구성은 이 승인의 범위가 아니다.

## 후속 책임

Server-side distributed abuse/rate limiting은 별도 후속 이슈가 정책·공유 상태 경계·구현·검증을 소유한다. 제한 단위·수치·시간 구간·장애 시 행동과 저장소는 그 이슈에서 결정한다. 후속 이슈는 아직 생성하지 않았으며 생성·완료를 PROD-915의 blocker로 두지 않는다. 장기 탐지와 신고 이력 저장을 후속 분산 제한의 필수 범위로 자동 포함하지도 않는다.

## 이전 결정과의 관계

기존 [ADR 0002](./0002-pr-review-domain-adjustments.md)와 [ADR 0008](./0008-relationship-report-state-exclusions.md)의
신고 제외는 당시 범위 결정이다. 이 결정은 신고 제출 제외만 부분 대체하고, 신고 묶음·처리 단계·durable 객체의
제외는 유지한다. 신고 제출은 인증된 Account의 행동이며 기본 소셜 행동의 Profile 주체 원칙을 변경하지 않는다.
