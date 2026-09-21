## Context

2026-09-18에 최신 main `8d28a08ecf7fdba8dcdfd361e37b278a5fbaffd1`을 조사했다. `apps/app/src/analytics/events.ts`, `client.web.ts`, `client.ts`, `AnalyticsSessionBridge.tsx`가 typed event, Web capture, Native no-op과 Account identify/reset을 제공한다. 이번 다섯 이벤트는 아직 없다.

PROD-795·819는 Done이지만 실제 수집은 중단된 상태다. `apps/app/src/config/public.ts`에서 dev·prod의 PostHog key와 host가 모두 `undefined`이고, `apps/web/e2e/analytics.e2e.ts`의 활성화·identity 검증도 보류돼 있다. PR #756은 병합됐고 개인정보 처리방침 PR #714는 Draft다. 상태 표기와 실제로 수집할 수 있는지는 구분한다.

현재 `PROD-539` branch의 HEAD는 `e09ff4c1c41b153297e1794a262a8b7322d6b994`이며 최신 main보다 뒤처져 있다. 이번에는 기존 미커밋 명세를 보존해 갱신했다. 아래 코드 설명은 최신 main 기준이다. 구현 세션은 변경분을 보존한 채 저장소의 공식 Stack 절차로 기반을 맞추고 경로·payload를 다시 확인한다.

## Goals / Non-Goals

**Goals:**

- Account identity에 연결되는 다섯 이벤트를 각 mutation의 서버 확정 성공 뒤 한 번 호출한다.
- 허용 명시적 속성만 전달하고 분석 장애가 제품 결과와 오류 처리에 영향을 주지 않게 한다.
- 실제 action을 실행하고 Account 귀속, 전송 payload와 운영 문서로 결과를 검증한다.

**Non-Goals:**

- mutation 연결, GraphQL·DB·Reaction catalog, 기존 UI·오류 정책 변경
- SDK 교체, identity 재구현, Cloud 설정, 수집 재개, 개인정보 처리방침·OpenPanel 정리
- 가입 이벤트, dashboard·집계식, 구체 emoji별 분석, Native SDK와 이전 이벤트 호환성

## Implementation Guidance

### Current Constraints

아래 표는 최신 코드의 구현 안내이며 새로운 공개 payload 계약이 아니다.

| 행동           | 현재 완료 경계                                                                                | 계측 시 확인할 결과                                                                             |
| -------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 재게시 생성    | `RepostAction`은 GraphQL 오류를 검사하고 payload는 사용하지 않는다                            | 오류가 없고 `repostPost.repost.id`가 존재하는 성공 결과                                         |
| 재게시 취소    | 같은 완료 callback을 사용한다                                                                 | 오류가 없고 `deletePost.postId`가 요청한 재게시 ID를 확인하는 결과                              |
| 반응 추가·삭제 | `PostReactionController`는 `addReaction` 또는 `deleteReaction` payload 존재로 성공을 판정한다 | 기존 판정을 유지한다. payload가 있는 부분 오류와 삭제 `reactionId: null`인 멱등 성공도 포함한다 |
| 북마크 추가    | `PostBookmarkAction`은 GraphQL 오류를 검사하고 payload는 사용하지 않는다                      | 오류가 없고 `createBookmark.bookmark.id`가 존재하는 성공 결과                                   |
| 북마크 삭제    | `deleteBookmark.requestedBookmarkId`와 요청 ID의 일치로 성공을 판정한다                       | 기존 일치 판정을 유지한다. 별개 필드의 오류만으로 성공을 실패로 바꾸지 않는다                   |

계측에 필요한 식별자를 로컬에서 비교하는 것은 명시적 event property로 보내는 것과 다르다. payload 부재를 계측에서 제외하기 위해 새 Toast나 제품 오류 정책을 추가하지 않는다. 이전 초안의 `applyBookmarkDeleteResponse` 안내는 현재 코드와 맞지 않는다.

### Recommended Approach

기존 event별 TypeScript 계약에 다섯 이벤트를 추가하고 세 action의 완료 경계에서 공용 `trackAnalytics`를 호출한다. 북마크의 무속성 호출도 기존 caller 타입을 보존하는 최소 변경으로 표현한다. 런타임 전역 allowlist, 범용 wrapper, 재전송 queue와 추가 dependency는 필요하지 않다.

반응은 요청 Type이 `❤️`일 때만 `default`, 나머지는 `custom`으로 분류한다. 현 catalog 외 반응 UI나 저장 기능은 만들지 않는다. 멱등 성공도 해당 요청의 성공 행동으로 기록하고 관계 순증감을 추측하지 않는다.

“정확히 한 번”은 앱이 mutation 성공 결과 하나에 capture를 한 번 호출한다는 뜻이다. 클릭·메뉴 열기·optimistic state·재렌더링에서 호출하지 않고 분석 완료를 기다리지 않는다. PostHog 수신을 보장하는 분산 exactly-once 전송 계약을 추가하지 않는다.

Account identity는 `AnalyticsSessionBridge`와 공용 adapter를 재사용한다. Profile 전환에 따른 Relay Environment 교체와 Account 전환은 구분한다. UI의 이전 actor callback 차단을 그대로 analytics 차단으로 복사하면 같은 Account의 완료 행동을 누락할 수 있다. 반대로 Account 전환 뒤 늦은 결과를 새 Account로 수집해서도 안 된다. 실제 세션 전환 테스트로 확인하고, 기존 계약 안에서 해결할 수 없다면 그 경계에서 사용자에게 결정이 필요한 내용을 제시한다. 임의 재식별이나 ID property 추가로 우회하지 않는다.

기존 action 단위 테스트는 주로 Relay Store를 검증하며 실제 컴포넌트의 analytics 호출까지 증명하지 않는다. 실제 컴포넌트·hook을 실행하는 테스트를 보완하고 analytics 전송 경계만 mock한다. 기존 Repost·Reaction·Bookmark Story를 활용할 수 있다. UI 성공·실패와 Relay Store가 유지되는지도 함께 관찰한다.

운영 문서는 구현 시 최신 경로를 확인한다. PostHog 문서가 계속 없다면 `docs/operations/posthog.md`에 이번 이벤트 표, 수집 중단 상태, 검증 방법과 분석 한계만 작성한다. 전체 OpenPanel runbook 이관과 shared acceptance를 이 이슈의 의무로 확대하지 않는다.

### Allowed Alternatives

- 분류는 호출부에서 표현하거나 작은 순수 함수로 분리할 수 있다. 결과는 `default | custom`만 전달한다.
- 기존 Storybook interaction 또는 컴포넌트·hook 테스트 중 실제 mutation 완료와 전송 인자를 관찰할 수 있는 가장 작은 경로를 사용한다.

### Known Traps

- 모든 action에 동일한 GraphQL 오류 조건을 적용해 Reaction·Bookmark 삭제의 성공 의미를 바꾸는 것
- Store에 성공 payload를 직접 넣은 테스트만으로 실제 action의 이벤트 호출을 검증했다고 하는 것
- 무속성 이벤트에 `Record<string, never>` 같은 타입만 붙이고 추가 property 차단이 증명됐다고 하는 것
- identity 또는 SDK metadata를 없애거나, 현재 수집 중단을 해제해 테스트를 통과시키는 것
- `profile_created`·최초 identify·pageview를 Account 가입 완료로 해석하는 것

## Risks / Trade-offs

- [Account 전환 중 늦은 결과] → 요청 주체와 현재 SDK identity를 함께 실행 검증한다. 귀속 정책의 새 결정이 필요하면 그 경계에서 멈춘다.
- [현재 실제 수집 불가] → 자동 테스트와 브라우저 outbound 검증, 실제 PostHog 수신을 별도 증거로 기록한다. 수신이 확인되지 않은 완료 조건은 pending으로 남긴다.
- [운영 문서 공백] → 이번 이벤트와 검증 범위만 문서화하고 PROD-795·839·575의 책임을 인수하지 않는다.
- [집계 기준 공백] → PROD-520은 Canceled다. WAA·제외 계정·기간·순사용과 가입 funnel을 승인된 것으로 취급하지 않는다.

## Migration Plan

1. 구현 세션에서 최신 Linear·main과 기존 변경분을 다시 확인하고 공식 Stack 절차로 오래된 기반을 맞춘다.
2. 이벤트·성공 호출부·관련 테스트·운영 문서를 함께 변경한다. DB·API migration은 없다.
3. 수집 중단 설정을 유지한 채 격리된 테스트에서 payload와 실패 격리를 검증한다. 승인된 수집 환경이 준비되면 실제 기능 이벤트와 Account 귀속을 확인한다. 수집 재개·Cloud 변경·배포는 이 명세의 승인 범위가 아니다.
4. 문제가 생기면 이번 event 추가와 호출부를 되돌린다. 기존 mutation과 공용 PostHog 기반은 유지한다.
5. 하네스가 더 이상 필요 없으면 구현 PR에서 `--skip-specs` archive를 고려한다. 하네스 승인·archive는 PR 완료 조건이 아니며 남은 수집 검증을 숨기지 않는다.

## Open Questions

- 이벤트 taxonomy·분류·개인정보 범위에서 새로 정할 제품 계약은 없다.
- 수집 재개 시점과 실제 검증 환경은 미확인이다. 현재 설정과 최신 운영 근거를 다시 확인한 뒤 실제 수집 검증을 진행한다.
- Account 전환 중 늦은 callback의 정확한 실행 결과는 구현 검증에서 확인할 항목이다. Spec 단계에서는 실행하지 않았다.
