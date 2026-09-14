## Why

Post·Profile에서 시작한 신고를 Web·Android·iOS에서 같은 계약으로 제출하고 Slack 수신 여부를 확인할 수 있어야 한다. 전달 여부가 불확실한 요청을 성공이나 미전달로 단정하면 신고 유실과 재시도 중복을 사용자가 판단할 수 없다.

## What Changes

- 로그인한 활성 Account가 현재 Post/Profile 화면의 신고 진입점에서 저장된 local/remote 대상을 신고한다. Selected Profile은 필수가 아니며 서버는 제출 시점의 대상 유효성과 기존 비-Block visibility를 검증한다.
- 확정된 5개 사유와 최대 2,000자의 선택적 설명을 받는다. `기타`만 공백이 아닌 설명이 필요하다.
- 신고자 식별정보 없는 최소 payload를 Slack으로 보내고 정상 ACK·명시적 실패·전달 여부 확인 불가를 구분한다. 자동 재전송 없이 중복 가능성을 안내하고 수동 재시도를 허용한다.
- Web 반응형 dialog/sheet와 Android/iOS 현재 화면 위 modal/sheet, draft·닫기·제출 중 중복 억제·접근성을 제공한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`.
- 공통 권한: `docs/domain/objects/account.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`.
- UI 선례: `docs/design/feedback.md`, `docs/design/accessibility.md`, `docs/design/post-action-bar.md`.
- Linear Contract / Implementations: [PROD-915](https://linear.app/byulmaru/issue/PROD-915). 공통 서버·세 플랫폼 구현과 검증·최종 통합·이 change의 archive를 모두 소유한다. PROD-907의 별도 구현은 없다.
- 2026-09-14 사용자 정정: 신고 eligibility에는 PROD-822 방향별 Profile Block authorization을 적용하지 않는다. `main → PROD-915 (#857)`로 독립 전달하며 Block 구현·UI·cleanup·관리 API·archive는 포함하지 않는다.
- 2026-09-10 사용자 “Gate 승인. Spec 작성 시작”: Domain·Design·Issue 결과의 Spec 단계 전환 승인. 이 change의 구현 승인은 별도다.

## Capabilities

### New Capabilities

- `content-report-submission`: Post·Profile 신고의 자격·최소 payload·전달 결과·세 플랫폼 입력 lifecycle.

### Modified Capabilities

없음. 기존 공통 조회 계약과 Feedback 전달 계약을 변경하지 않는다.

## Impact

공통 API, Slack 서버 설정, Post·Profile 메뉴와 공용 form/modal을 사용하는 세 플랫폼에 영향을 준다. 기존 Post·Profile 조회 policy는 변경하지 않는다. 신고 DB나 durable delivery migration은 없다. 새 API는 additive 변경이며 기존 호출자의 계약을 바꾸지 않는다.

신고 eligibility는 일반 canonical direct-read authorization과 별개다. 기존 main의 PUBLIC/UNLISTED·FOLLOWERS·작성자 DIRECT, 대상 존재·Active 상태·Current Content·Profile/Instance 유효성 검증은 유지한다. Profile Block predicate를 사용하거나 복제하지 않고 PROD-822 결과를 구현·통합·회귀·완료의 의존성으로 두지 않는다. 서버 인증·입력·Slack 보안 경계를 유지한다.

## Non-goals

분산·시간 구간 rate/abuse limit, Account별 한도, Redis/Valkey, 장기·반복·다계정 탐지와 신고 이력은 제외한다. 분산 제한의 후속 이슈는 아직 생성하지 않았으며 이 change의 완료 조건이 아니다.

신고 DB·durable 상태·자동 복구·exactly-once·운영자 처리 보장, 관리자 화면·runbook·자동 moderation·CSAM 판별·스토어 심사 선언은 제외한다. URL 제보, 새 remote fetch, ActivityPub Flag 전송과 미래 Domain Block·Mention·DIRECT recipient capability를 추가하지 않는다. 계획 단계에서 실제 Slack 메시지를 보내지 않는다.
