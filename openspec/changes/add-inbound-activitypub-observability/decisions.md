## Context

이 기록은 `PROD-634`의 inbound ActivityPub 관측 계약과 `docs/operations/sentry.md`의 기존 runtime 전역 Sentry 정책을 packages/fedify listener 경계에 적용한 결과다.

## Decision Records

### 외부 원인 실패는 로그 전용으로 분류한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `PROD-634`, 2026-08-03 사용자 결정
- Status: Active
- Context / Problem: Linear 본문은 action 가능한 외부 실패를 Sentry 대상으로 넓게 표현하지만, remote 서버 장애가 내부 issue 폭증을 만들 수 있다.
- Decision Outcome: remote 5xx, timeout, DNS/connection, 외부 document lookup, actor materialization, protocol incompatibility/interpretation과 외부 delivery 실패는 구조화 로그만 남기고 Sentry capture를 금지한다.
- Alternatives Considered: 모든 처리된 외부 실패를 Sentry에 보내는 방식은 외부 장애와 Kosmo 결함을 분리하지 못하므로 선택하지 않는다.
- Consequences: 외부 원인 triage는 bounded reason/phase와 제한된 context를 가진 로그를 사용한다.
- Confirmation / Follow-up: 대표 object lookup, actor materialization, protocol과 delivery 테스트에서 capture 호출이 0인지 확인한다.

### 내부 오류의 반복량 제어는 SDK 정책에 위임한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `PROD-634`, 2026-08-03 사용자 결정
- Status: Active
- Context / Problem: 동일 inbound activity 반복은 내부 오류 event를 폭증시킬 수 있으나 앱 rate limiter/sampler는 별도 운영 정책을 만든다.
- Decision Outcome: 앱 내부 rate limiter나 sampler를 추가하지 않고 activity type, handler, phase, reason code 같은 stable grouping metadata만 제공하며 Sentry SDK/ingest quota에 위임한다.
- Alternatives Considered: process-local token bucket 또는 probabilistic sampler는 다중 replica와 재시작에서 일관되지 않고 오류 event를 임의로 버리므로 선택하지 않는다.
- Consequences: SDK/ingest quota와 운영 alert 설정이 반복량 제어 책임을 갖는다.
- Confirmation / Follow-up: 반복 내부 오류 테스트에서 helper가 매번 reporter를 호출하되 stable metadata만 전달하는지 확인한다.

### Fedify package는 runtime Sentry SDK를 소유하지 않는다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-634`, `PROD-477`, `PROD-484`
- Status: Active
- Context / Problem: inbound listener는 Web BFF에서 실행되지만 package는 API resolver와 core service에서도 import된다.
- Decision Outcome: package는 구조화 관측 callback seam만 제공하고 `@sentry/node`의 초기화·DSN·release 정책은 기존 runtime 앱이 소유한다.
- Alternatives Considered: fedify가 Sentry SDK를 직접 import하거나 API 전역 Sentry를 package에 묶는 방식은 runtime 경계와 테스트를 확장하므로 선택하지 않는다.
- Consequences: Web BFF가 기존 `captureUnexpectedError`를 연결하고 package 단위 테스트는 injected reporter를 검증한다.
- Confirmation / Follow-up: package dependency에 Sentry SDK를 추가하지 않고 listener integration에서 callback 연결을 확인한다.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
