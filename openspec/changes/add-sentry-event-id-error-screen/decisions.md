## Context

이 기록은 PROD-480의 universal 오류 화면 계약, 구현 자식 PROD-485·PROD-486의 platform 책임, PROD-477·483·493의 Sentry 수집 경계와 canonical 디자인 제약을 현재 Expo Router·Relay·`react-error-boundary` 조합에 적용한 선택을 정리한다.

## Decision Records

### 안전한 이동 reset과 copy feedback은 오류 발생 건 단위로 분리한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-480 review repair, `react-error-boundary` reset contract, ErrorBoundaries Storybook verification
- Status: Active
- Context / Problem: 전용 화면의 안전한 이동이 일반 retry callback을 호출하면 소유자 재조회가 불필요하게 실행되고, copy 결과를 화면의 별도 live region과 Toast에 함께 표시하면 중복 announcement가 생긴다. reset·즉시 재실패 뒤에는 이전 Toast와 진행 중 clipboard 결과가 다음 오류 발생 건에 남을 수 있다.
- Decision Outcome: ClientErrorBoundary는 안전한 이동만을 위한 private reset marker로 occurrence/report 상태를 비우고 owner retry callback은 건너뛴다. Boundary owner가 전달한 public safe callback은 한 번만 실행하고, 일반 retry는 기존 owner callback을 한 번 실행한다. UnexpectedErrorScreen은 occurrence key와 ToastProvider의 좁은 dismiss API를 사용해 reset·unmount·새 오류 발생 건에서 pending clipboard와 이전 Toast를 취소하고, copy 결과는 기존 assertive Toast 하나로만 알린다.
- Alternatives Considered: 안전한 이동에서 일반 reset callback을 재사용하면 실패한 route의 재조회가 다시 시작된다. 화면 안에 polite copy status를 추가하면 기존 Toast와 중복되며, 전역 이전 Toast를 그대로 두면 새 occurrence에 잘못된 feedback이 남는다. 별도 오류 feedback 시스템은 현재 Toast 소유권과 범위를 불필요하게 늘린다.
- Consequences: fallback render props에 occurrence key와 안전한 reset callback이 추가되고 Toast context에 dismiss API가 추가된다. Clipboard promise가 늦게 완료되어도 reset된 화면에 feedback을 재표시하지 않는다. 기존 public ClientErrorBoundary props와 owner retry 동작은 유지한다.
- Confirmation / Follow-up: ErrorBoundaries Storybook에서 reporter return ID·throw/no-ID, safe navigation callback 1회·owner retry 0회, retry 후 새 ID와 이전 Toast 제거를 검증하고 기본 clipboard adapter 단위 테스트에서 ID 전달을 확인한다.

### 예상 오류와 화면을 사용할 수 없는 예상하지 못한 오류를 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, PROD-477, PROD-480
- Status: Active
- Context / Problem: 현재 GraphQL·route 경계는 예상된 GraphQL·network 오류와 local render 오류를 같은 fallback과 Web reporter로 전달할 수 있다. 모든 오류를 추적 ID가 있는 전용 화면으로 바꾸면 PROD-480의 inline 예상 오류 보존과 PROD-477의 expected 오류 수집 제외를 위반한다.
- Decision Outcome: validation·권한·의도된 GraphQL/domain 오류와 현재 화면에서 재시도 가능한 network·transport 오류는 가장 가까운 기존 inline 또는 route-local 상태에 남긴다. 현재 화면을 계속 렌더링할 수 없게 만드는 local unexpected render/runtime 오류만 전용 오류 화면과 client Sentry report 대상이다. Server GraphQL response는 server capture 여부와 무관하게 별도 client render event로 중복 보고하지 않는다.
- Alternatives Considered: boundary에 도달한 모든 오류를 전용 화면과 client Sentry에 보내는 방식은 예상 오류·server 오류를 중복 수집한다. 모든 query 오류를 무조건 inline으로 간주하는 방식은 실제 local render 결함을 누락할 수 있다.
- Consequences: 기존 mutation inline UX는 유지한다. Query·transport 경계는 origin을 보존해야 하며 분류 회귀 테스트가 필요하다.
- Confirmation / Follow-up: expected mutation·GraphQL response·network fixture는 전용 화면과 client reporter를 사용하지 않고, unexpected render fixture만 reporter 한 번과 전용 화면으로 이어지는지 검증한다.

### 오류 종류는 구조화된 origin과 code로 구분한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/coding-style.md`, `memory/frontend-react-native.md`, PROD-477, PROD-480
- Status: Active
- Context / Problem: 현재 network 경계는 HTTP·GraphQL 오류를 plain `Error.message`로 평탄화하고 fallback formatter도 message를 그대로 노출한다. Message는 번역·서버 문구·네트워크 환경에 따라 달라져 정확한 분류나 보안 경계가 될 수 없다.
- Decision Outcome: Transport failure, GraphQL response와 local render error의 origin을 app-owned metadata/type으로 보존하고 Relay가 제공하는 structured error source·extensions를 함께 사용한다. Expected/unexpected 분류는 이 구조화된 정보로 수행하며 사용자-facing message 문자열이나 정규식을 분류 근거로 사용하지 않는다.
- Alternatives Considered: message prefix·한국어 문구·HTTP status 문자열 parsing은 불안정하고 오류 원문 노출을 고착시킨다. 모든 plain `Error`를 unexpected로 처리하면 network 실패를 수집하고, 모두 expected로 처리하면 render 결함을 놓친다.
- Consequences: Network와 boundary 사이의 내부 오류 표현은 바뀔 수 있지만 GraphQL schema·server payload 계약은 바뀌지 않는다. 전용 화면은 기존 raw formatter를 사용하지 않는다.
- Confirmation / Follow-up: 같은 사용자 message라도 origin/code가 다른 fixture를 구분하고, raw message가 전용 화면·accessibility output에 포함되지 않는지 검증한다.

### 전용 오류 화면은 새 route가 아니라 포착 경계 안에서 렌더링한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/frontend-react-native.md`, PROD-480, PROD-513
- Status: Active
- Context / Problem: 별도 `/error` route로 navigation하면 오류가 난 route tree를 다시 사용하고 React error occurrence·component stack·`resetErrorBoundary` 소유권을 navigation state로 옮겨야 한다.
- Decision Outcome: GraphQL·route·session을 구성하는 기존 함수형 `react-error-boundary` 조합이 공용 전용 오류 화면을 fallback으로 직접 렌더링한다. 화면은 Expo Router singleton이나 오류 route parameter에서 error를 읽지 않고 boundary가 제공한 ID 상태와 retry·safe navigation callback만 받는다.
- Alternatives Considered: 전용 route navigation은 URL 공유·refresh가 가능하지만 오류 원문/ID를 navigation state에 넣을 위험과 route 자체 실패 가능성이 있다. 새 class boundary는 PROD-513의 함수형 조합·lint 계약을 위반한다.
- Consequences: 현재 route context 안에서 화면을 표시하므로 reset과 원래 owner callback을 보존한다. 공용 화면은 route·Sentry SDK를 직접 소유하지 않는다.
- Confirmation / Follow-up: GraphQL·route·session story에서 class component 없이 fallback, reset과 재렌더가 동작하고 오류 route가 생성되지 않았는지 확인한다.

### Platform reporter는 현재 capture의 optional event ID를 반환한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-477, PROD-480, PROD-483, PROD-493
- Status: Active
- Context / Problem: 현재 Web reporter는 Sentry SDK가 반환하는 event ID를 버린다. 앱이 별도 UUID를 만들거나 전역 `lastEventId`를 읽으면 현재 오류와 다른 event를 연결할 수 있다. 반대로 client SDK는 capture 시 ID를 만들고 전송을 비동기로 처리하므로 개별 원격 수락을 화면 render 전에 증명하지 못한다.
- Decision Outcome: 공용 reporter contract는 현재 오류와 component stack을 받아 해당 capture에서 SDK가 반환한 opaque event ID 또는 `없음`을 반환한다. 화면은 이 값만 표시하고, 앱 생성 ID·이전 ID·message hash를 사용하지 않는다. Adapter 미구성·capture 예외·ID 부재는 `없음`으로 처리하며 오류 화면을 block하지 않는다. Client에 Sentry read token을 두거나 매 오류마다 원격 조회하지 않고, platform 배포 smoke에서 표시 ID와 실제 event를 대조한다.
- Alternatives Considered: App-generated UUID는 실제 Sentry event와 연결되지 않는다. `lastEventId`는 동시·이전 event를 잘못 연결할 수 있다. Capture 뒤 원격 API 확인은 public client에 read credential을 노출하고 offline fallback을 실패시킨다. 전송 queue flush는 특정 event의 원격 저장을 증명하지 못한다.
- Consequences: 표시 ID는 current SDK capture와 정확히 같은 식별자지만 transport 장애나 backend drop을 UI가 동기적으로 판별하지는 못한다. 실제 조회 가능성은 Web·native runtime gate가 검증한다.
- Confirmation / Follow-up: Reporter 단위 테스트에서 returned ID passthrough, disabled/throw/no-ID fallback과 한 occurrence 한 capture를 확인하고, PROD-485·486 smoke에서 화면 ID로 같은 Sentry event를 조회한다.

### 복사에는 Expo universal clipboard와 기존 접근성 feedback을 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/colors.md`, `memory/frontend-react-native.md`, PROD-480
- Status: Active
- Context / Problem: 현재 workspace에는 clipboard API나 dependency가 없다. Web `navigator.clipboard`만 직접 호출하면 native 구현이 갈라지고, 별도 native menu는 공용 화면 계약을 중복한다.
- Decision Outcome: `apps/app`은 pnpm으로 Expo SDK 호환 `expo-clipboard`를 dependency로 추가하고, 공용 화면은 ID string 쓰기의 성공·실패만 노출하는 작은 universal adapter를 사용한다. Copy 성공·실패는 기존 `ToastProvider`의 안전한 한국어 alert로 알리며 오류 원문은 전달하지 않는다.
- Alternatives Considered: Web DOM API와 native package를 별도로 호출하는 방식은 platform UI·test를 중복한다. ID를 선택 가능한 Text로만 제공하면 명시적인 복사 완료·실패와 native 접근성을 보장하지 못한다. 새 toast system은 기존 theme·announcement surface를 중복한다.
- Consequences: App runtime dependency 하나가 추가되고 clipboard 실패를 async UI 상태로 처리해야 한다. Toast는 copy 결과만 알리고 retry·navigation 상태는 바꾸지 않는다.
- Confirmation / Follow-up: Dependency는 구현 slice에서 `pnpm` CLI로 추가하고 Web·Android·iOS에서 정확한 ID copy, success/failure announcement와 action 유지 여부를 검증한다.

### 오류 화면의 안전한 이동은 public root를 replace한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/frontend-react-native.md`, PROD-480
- Status: Active
- Context / Problem: PROD-480은 복구되지 않을 때 홈 등 안전한 화면으로 이동하도록 요구하지만 `/home`은 보호 route라 guest에게 다시 redirect될 수 있고, push는 back action으로 실패한 route를 즉시 다시 열 수 있다.
- Decision Outcome: 안전한 이동 action은 인증 상태와 무관하게 열리는 canonical public root `/`로 `replace`한다. 전용 화면은 navigation singleton을 직접 읽지 않고 boundary owner가 전달한 callback을 실행한다.
- Alternatives Considered: `/home` push/replace는 인증 상태에 따라 보호 route redirect와 상호작용한다. `router.back()`은 이전 entry가 없거나 같은 실패 route일 수 있다. 강제 reload는 native parity와 boundary reset 의미를 잃는다.
- Consequences: Guest는 landing에 남고 인증된 사용자는 root의 기존 session 분기에 따라 `/home`으로 전환될 수 있다. 실패 route는 현재 back stack entry에서 제거된다.
- Confirmation / Follow-up: Guest·authenticated fixture와 not-found/logout의 기존 `/` semantics를 회귀 검증하고 안전 이동 뒤 실패 화면으로 즉시 돌아가지 않는지 확인한다.

### 오류 ID는 피드백에 자동 연결하지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: PROD-479, PROD-480, PROD-487
- Status: Active
- Context / Problem: PROD-480은 사용자가 ID를 복사해 지원 요청에 전달할 수 있게 하지만, 최신 feedback 계약은 Sentry event·trace ID의 자동 연결과 Slack payload field를 명시적으로 제외한다.
- Decision Outcome: 오류 화면은 복사까지만 소유한다. 사용자는 기존 feedback 본문이나 외부 지원 채널에 수동으로 붙여 넣을 수 있지만 `/feedback` GraphQL input, URL, prefill, client state와 Slack payload에 Sentry ID field를 추가하지 않는다.
- Alternatives Considered: Feedback form 자동 prefill·구조화 field·Slack metadata는 PROD-479·487의 제외 범위를 다시 열어야 하므로 선택하지 않는다. 복사 자체를 제외하면 PROD-480 완료 조건을 충족하지 못한다.
- Consequences: 운영자는 사용자가 제공한 본문에서 ID를 수동으로 찾아야 한다. 자동 상관관계가 필요하면 feedback upstream 계약을 먼저 변경해야 한다.
- Confirmation / Follow-up: Feedback schema·form·Slack payload diff가 없고 copy 뒤 navigation해도 ID가 자동 주입되지 않는지 확인한다.

### 공용 기반과 platform 검증 책임을 세 이슈로 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: PROD-480 본문과 2026-07-27 플랫폼 구현 자식 댓글, PROD-483, PROD-485, PROD-486, PROD-493
- Status: Active
- Context / Problem: 공용 UI와 분류·reporter contract는 세 platform이 공유하지만 Web과 native의 Sentry 선행 이슈, 배포 시점과 runtime 검증은 다르다.
- Decision Outcome: PROD-480은 공용 분류·오류 화면·reporter/clipboard contract, cross-platform 정합성과 최종 integration/archive를 소유한다. PROD-486은 PROD-493 이후 Web event ID·copy·retry·safe navigation과 production smoke를 소유한다. PROD-485는 PROD-483 이후 Android·iOS adapter·clipboard·접근성·event ID runtime 검증을 소유한다. Web 완료만으로 native task나 전체 change를 완료·archive하지 않는다.
- Alternatives Considered: 한 platform 이슈가 공용·다른 platform 구현까지 소유하면 branch/PR 검증 책임이 섞인다. Platform별 OpenSpec에 공용 계약을 복제하면 분류·UI·reset 결정이 갈라진다. Parent 계층만으로 archive owner를 추론하는 대신 PROD-480 본문이 명시한 통합·archive 책임을 사용한다.
- Consequences: Web 배포 뒤에도 native blocker가 남으면 change는 active 상태를 유지한다. 각 구현 PR은 자신의 platform 증거만 소유하며 parent owner가 마지막 정합성과 archive를 수행한다.
- Confirmation / Follow-up: Tasks heading, implementation handoff와 PR 본문에 이슈별 Deliverable·Verification을 유지하고 archive 전 두 platform runtime evidence를 대조한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
