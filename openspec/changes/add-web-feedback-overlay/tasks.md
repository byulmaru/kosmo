## 1. PROD-594 Form 상태 경계

**Deliverable:** page와 overlay가 같은 `FeedbackForm` 제출 흐름을 사용하고 overlay는 draft와 제출 상태만 관찰한다.

- [x] 1.1 Feedback Storybook에 `{dirty, submitting}` 상태 전이 assertion을 추가한다.
- [x] 1.2 `FeedbackForm`이 presentation-neutral 상태 signal을 보고하도록 구현한다.
- [x] 1.3 idle·validation·pending·success·failure와 실패 후 draft 유지 검증을 통과시킨다.

## 2. PROD-594 Responsive Web overlay

**Deliverable:** Web 사용자가 현재 shell 위에서 accessible bottom sheet/dialog를 열고 기존 form으로 제출한다.

- [x] 2.1 390px sheet와 900px·1400px dialog geometry assertion을 추가한다.
- [x] 2.2 기존 breakpoint token으로 Web 전용 surface와 form body 내부 scroll을 구현한다.
- [x] 2.3 제목·닫기 control, focus 진입/trap/restore, background 차단과 document scroll lock을 구현한다.
- [x] 2.4 explicit close의 clean·dirty·submitting 정책과 success 유지·failure retry를 연결한다.

## 3. PROD-594 Shell state lifecycle

**Deliverable:** 모든 인증된 Web shell 진입점이 URL/history를 바꾸지 않고 현재 route 위 단일 overlay를 연다.

**Guardrails:** Android/iOS와 `/feedback` direct route를 유지하고 guest에는 진입점/form을 숨긴다. Browser
navigation/reload draft 보호와 URL 기반 overlay 복원은 구현하지 않는다.

- [x] 3.1 Web 진입을 authenticated button callback으로, Android/iOS와 `/feedback` 현재 상태를 route link로
      연결한다.
- [x] 3.2 `UniversalShellContent`가 local open state를 소유하고 shell root 다음에 overlay를 한 번 조립한다.
- [x] 3.3 mobile drawer를 먼저 닫고 모든 Web breakpoint가 같은 callback을 사용하도록 연결한다.
- [x] 3.4 query/history helper, `popstate` guard와 router mock 확장을 제거한다.
- [x] 3.5 `feedback=open` 직접 query는 overlay를 열지 않고 `/feedback` page에는 중복 overlay가 없도록 한다.

## 4. PROD-594 직접 동작 검증

**Deliverable:** shell state, 상태 보존과 접근성 lifecycle을 자동화와 실제 Web 관찰로 구분해 입증한다.

- [x] 4.1 Web E2E에 URL 불변 open/close, direct query 무시, `/feedback` fallback과 guest 비노출을 추가한다.
- [x] 4.2 dirty 취소·폐기, submitting explicit close 차단, success 연속 제출을 검증한다.
- [x] 4.3 focus/scroll 복원, keyboard trap, `Escape`, backdrop와 background 차단을 검증한다.
- [x] 4.4 390px·900px·1400px geometry와 내부 scroll을 실제 Web runtime에서 확인한다.

## 5. PROD-594 통합과 전달

**Guardrails:** OpenSpec archive와 PR readiness는 별도 판단이며 Android/iOS, API, Slack payload와 dependency를
변경하지 않는다.

- [x] 5.1 canonical 문서, Linear와 OpenSpec을 shell-state 계약으로 동기화한다.
- [x] 5.2 app unit/typecheck, Storybook, Web E2E와 `git diff --check`를 실행한다.
- [x] 5.3 독립 구현 리뷰 findings를 해결하고 PR 검증 증거를 동기화한다.
