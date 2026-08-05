## Context

`packages/fedify`는 Fedify typed inbox listener에서 Accept, Announce, Create, Delete, Follow, Like/EmojiReact, Reject, Undo, Update를 처리한다. 현재 object 해석의 `suppressError`, remote actor materialization의 예상 오류, core action의 정책 거절, projection 이후 delivery catch가 handler별로 흩어져 있고 일부는 `console.error`만 남긴다. 실제 listener는 `apps/web` BFF에서 `@kosmo/fedify`를 호출하며, API와 Web BFF의 Sentry SDK는 runtime 전역 오류만 capture한다.

## Goals / Non-Goals

**Goals:**

- 처리된 inbound 실패와 no-op을 한정된 분류값으로 구조화한다.
- 외부 원인 실패를 로그 전용으로, 내부 unexpected·내부 effect 실패를 기존 Sentry callback으로 연결한다.
- 모든 production listener와 대표 handler의 회귀·경계 테스트로 중복/누락을 검출한다.
- Activity 처리 결과와 민감정보 경계를 유지한다.

**Non-Goals:**

- ActivityPub 검증·저장·멱등성·retry/outbox/queue/DLQ 동작 변경
- 앱 내부 rate limiter/sampler, inbound history 테이블, raw payload 감사 저장
- 외부 서버별 호환성 버그 재구현 또는 Sentry SDK 자체 설정 변경

## Implementation Guidance

### Current Constraints

- Fedify listener 함수는 `(InboxContext, Activity)`를 받고 `void`를 반환하므로 공통 wrapper가 throw 경계와 activity type을 추출할 수 있다.
- `suppressError: true`는 오류 원인을 호출자에게 전달하지 않고 `null`/빈 결과로 만들 수 있으므로 각 document 경계에서 외부 실패 로그를 명시해야 한다.
- `@kosmo/fedify`가 `@sentry/node`를 직접 의존하면 package 경계와 테스트가 API/Web runtime에 결합된다. 기존 runtime Sentry callback을 주입하는 좁은 seam이 필요하다.
- URI는 조사 context로 유용하지만 Sentry grouping/tag에 사용하면 cardinality가 폭증한다.

### Recommended Approach

- `packages/fedify`에 bounded enum-like activity/phase/outcome/reason 분류와 구조화 logger/capture reporter를 소유시키고 기본 logger는 `console` 기반으로 둔다.
- handler의 처리된 catch/suppress/no-op 지점은 helper를 호출해 `rejected`, `noop`, `external_failure`, `internal_failure`를 명시하고 원래 return/rethrow를 유지한다.
- federation listener 등록부에는 마지막 방어선 wrapper와 `onError` 경계를 두어 helper를 거치지 않은 internal throw만 capture하며, remote/network/protocol 오류는 외부 분류로 로그만 남긴다.
- `apps/web`의 기존 `captureUnexpectedError`를 helper reporter에 연결한다. API runtime은 동일한 seam을 필요로 하는 직접 사용 경계에서만 연결하고 Sentry SDK를 fedify package로 옮기지 않는다.
- Sentry context에는 bounded tag/fingerprint만 추가하고 URI는 extra/context의 제한된 필드로만 전달하며 raw activity나 request/signature는 전달하지 않는다.

### Allowed Alternatives

- 동일한 package 경계와 분류·민감정보 계약을 유지한다면 callback registry 대신 listener factory에 reporter를 전달할 수 있다.

### Known Traps

- `console.error`를 helper 없이 남기거나 `catch { return; }`를 추가하면 inventory와 Sentry 정책이 다시 분리된다.
- 모든 예외를 Sentry에 보내거나 remote error를 내부 오류로 추정하지 않는다.
- activity/actor/object 전체 URI를 fingerprint/tag에 넣지 않는다.
- wrapper에서 오류를 소비해 기존 Fedify 응답/재throw 의미를 바꾸지 않는다.

## Risks / Trade-offs

- 외부 실패의 원인 객체를 Sentry에서 제외하면 remote 장애 원인 분석은 로그에 의존한다 → reason code, phase와 제한된 origin/URI context를 구조화해 검색성을 유지한다.
- package-level reporter가 전역 mutable seam이면 테스트 간 상태가 샐 수 있다 → reset 가능한 기본 reporter와 listener boundary 테스트를 사용한다.
- bounded grouping은 서로 다른 내부 결함을 한 issue로 묶을 수 있다 → 안정적인 reason code를 세분화하고 SDK grouping에 위임한다.

## Migration Plan

기존 handler의 처리 결과와 production 배포 경로를 유지한 채 helper 연결을 배포한다. rollback 시 관측 callback 연결과 helper 호출을 되돌리면 기존 오류 처리로 복귀하며 데이터 migration은 없다.

## Open Questions

없음.
