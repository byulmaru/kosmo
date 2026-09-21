## Context

2026-09-18에 최신 PROD-539·795·819와 canonical Post·Reaction·Bookmark 계약을 다시 대조했다. 아래 기록은 현재 상위 계약을 요약한 세션 메모이며 새 권위나 별도 승인 gate가 아니다. 기존 이벤트 정의는 유지하고 오래된 실행 전제를 정정했다.

## Decision Records

### 기존 OpenPanel Account identity 재사용

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: 당시 `docs/operations/openpanel.md`, PROD-469·PROD-539의 OpenPanel 계약. 현재 적용 authority는 아래 PostHog 결정이다.
- Status: Superseded
- Context / Problem: 기존 분석 기반에서 행동을 Account 단위로 연결해야 했다.
- Decision Outcome: OpenPanel의 opaque Account identify를 재사용하고 ID를 이벤트 속성에 복제하지 않는다고 정했다.
- Alternatives Considered: 이벤트마다 Account ID를 넣거나 식별을 모두 없애는 방식은 당시 계약에 맞지 않았다.
- Consequences: 분석 제공자에 관한 전제는 최신 PROD-539의 PostHog 계약과 맞지 않아 폐기한다. Account 단위 분석과 명시적 ID 속성 금지는 유지한다.
- Confirmation / Follow-up: 아래 `PostHog의 Account identity를 재사용한다`가 이 결정을 대체한다.

### 재게시 생성·취소는 하나의 이벤트와 result로 구분한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의
- Status: Active
- Context / Problem: 재게시 생성과 취소를 모두 Account 행동으로 구분해야 한다.
- Decision Outcome: `repost_succeeded`에 `result: "created" | "removed"`만 명시적 속성으로 전달한다.
- Alternatives Considered: 별도 취소 이벤트를 추가하거나 취소를 수집하지 않는 방법은 현재 taxonomy와 다르다.
- Consequences: 대상 Post·Repost ID 없이 생성과 취소를 구분한다.
- Confirmation / Follow-up: 생성·취소별 이벤트명·속성·호출 횟수를 확인한다. 2026-09-18 최신 Linear와 일치함을 재확인했다.

### Reaction은 구체 Type 대신 default와 custom으로 분류한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`의 허용 Type, `docs/design/reactions.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의
- Status: Active
- Context / Problem: 기본·커스텀 반응 사용을 구분하되 구체 emoji 식별 정보는 수집하지 않는다.
- Decision Outcome: `reaction_added`·`reaction_removed`는 `reaction_type: "default" | "custom"`만 명시적 속성으로 전달한다. 현재 `❤️`만 `default`이며 나머지 다섯 Type과 향후 별도 기본 반응으로 승인되지 않은 Type·custom emoji는 `custom`이다.
- Alternatives Considered: 여섯 Unicode 원문, 별도 `reaction_value`, custom emoji ID를 보내는 방법은 현재 수집 범위를 벗어난다.
- Consequences: Account의 사용을 분류별로 분석할 수 있지만 구체 emoji별 선호는 알 수 없다. 향후 분류 규칙은 catalog 확장 자체를 승인하지 않는다.
- Confirmation / Follow-up: 현재 여섯 Type의 추가·삭제 분류와 raw 값 부재를 검증한다. 2026-09-18 최신 Linear와 일치함을 재확인했다.

### Account 가입 이벤트를 추가하지 않고 계측 gap으로 남긴다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 계측 gap·제외 범위
- Status: Active
- Context / Problem: 신뢰할 수 있는 Account 가입 완료 이벤트가 없고 `profile_created`는 추가 Profile 생성에도 발생한다.
- Decision Outcome: 가입 이벤트를 임의로 추가하거나 기존 이벤트를 가입 시점으로 재해석하지 않는다.
- Alternatives Considered: `profile_created`, 최초 identify·pageview를 사용하는 방법은 가입을 나타내지 않으므로 제외한다.
- Consequences: 이 이벤트들만으로 가입 Account 대비 adoption이나 정확한 time-to-first-reaction을 계산할 수 없다. 이는 현재 change의 제외 범위이며 Blocked 구현 작업이 아니다.
- Confirmation / Follow-up: 운영 문서에 한계를 기록한다. 2026-09-18 최신 Linear와 일치함을 재확인했다.

### PostHog의 Account identity를 재사용한다

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 identity 계약, [PROD-795](https://linear.app/byulmaru/issue/PROD-795)의 통합 경계, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 공개 identify/reset 계약
- Status: Active
- Context / Problem: 최신 PROD-539는 OpenPanel이 아닌 PostHog Account 분석을 요구한다.
- Decision Outcome: 로그인 뒤 내부 불변 Account ID로 identify된 공용 PostHog 경계를 사용한다. 이벤트별 Account 재식별이나 명시적 ID 속성은 추가하지 않는다.
- Alternatives Considered: OpenPanel 병행 계측, Profile 단위 identify, 이벤트마다 Account ID를 넣는 방법은 현재 계약과 맞지 않는다.
- Consequences: `기존 OpenPanel Account identity 재사용`을 대체한다. PostHog identity 구현과 검증 선행 결과는 PROD-819/795에 남긴다.
- Confirmation / Follow-up: 같은 Account의 반복·Profile 전환 행동과 Account 전환 시 귀속을 확인한다. PROD-795는 Done이지만 수집 중단은 유지되고 있으므로 실제 수신 완료를 별도로 확인한다.

### 각 action의 서버 성공 payload 뒤에만 한 번 호출한다

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`의 실패 처리, `docs/design/reactions.md`의 mutation과 서버 확정 상태, `docs/domain/objects/reaction.md`의 멱등 성공, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 성공 경계, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 fail-open 계약
- Status: Active
- Context / Problem: 오류 없는 callback과 실제 성공 payload는 같지 않으며 Reaction과 Bookmark 삭제는 부분 GraphQL 오류를 별도로 처리한다.
- Decision Outcome: action별 성공 판정과 필요한 payload를 확인한 뒤 이벤트를 한 번 호출한다. Reaction의 authoritative payload·멱등 성공과 Bookmark 삭제의 요청 대상 확인 판정을 유지한다. payload 부재·실패·network 오류는 수집하지 않고 PostHog 오류는 제품 결과와 사용자 오류 처리를 바꾸지 않는다.
- Alternatives Considered: 클릭 시 계측, 모든 GraphQL 오류의 일괄 실패 처리, 분석 수신을 기다려 제품 성공을 결정하는 방법은 각각 성공·Reaction·fail-open 계약을 위반한다.
- Consequences: 2026-08-10의 `각 action의 기존 서버 확정 성공 의미를 계측 경계로 사용한다` 기록을 PostHog와 명시적인 payload 부재 조건으로 갱신한다. callback이 기존에 payload를 검사하지 않아도 계측에서는 검사한다. 전송 장애에 따른 누락은 가능하다.
- Confirmation / Follow-up: 성공·payload 부재·부분 오류·멱등 성공·재렌더링·SDK 실패를 검증한다.

### 명시적 속성 제한을 SDK 전체 필터로 확대하지 않는다

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·개인정보 경계, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 typed custom event·표준 metadata·마스킹 책임
- Status: Active
- Context / Problem: 기존 문서의 “허용 property만 전송”을 전체 SDK payload 제한으로 읽으면 PostHog 표준 동작과 충돌한다.
- Decision Outcome: 앱이 전달하는 명시적 속성만 이벤트별로 제한한다. 북마크는 속성을 추가하지 않는다. SDK identity·자동 metadata는 PROD-819의 현재 계약을 유지한다. Search `q`와 click metadata는 원문 수집하며 Replay 보호는 별도로 다룬다.
- Alternatives Considered: SDK payload 전체를 다시 만드는 필터나 모든 metadata를 제거하는 방법은 PROD-819가 제외한다.
- Consequences: 명시적 속성 검증과 SDK 표준 수집·마스킹 검증을 구분한다. 대상·콘텐츠·직접 식별 정보를 custom property로 넣지 않는 제한은 그대로다.
- Confirmation / Follow-up: typed contract와 실제 capture 인자를 확인하고 SDK metadata가 유지되는지도 검증한다.

### Account 전환 중 늦은 완료 결과는 현재 Account와 비교해 귀속한다

- Decision Date: 2026-09-18
- Decision Class: Implementation Boundary
- Authority / Provenance: [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 Account 귀속·success-only 계약과 현재 SessionProvider
- Status: Resolved
- Context / Problem: mutation callback은 Account 또는 Profile 전환 뒤 늦게 완료될 수 있다.
- Decision Outcome: 요청 시작 시 Account ID를 보관하고 callback 시 현재 Account ID와 같을 때만 event를 보낸다. 같은 Account의 Profile 전환은 허용하고, 다른 Account·guest 전환 뒤의 늦은 결과는 버린다. Account ID는 event property에 넣지 않는다.
- Alternatives Considered: 모든 늦은 callback을 차단하면 같은 Account의 성공 행동을 잃고, 현재 identity를 확인하지 않으면 이전 Account를 새 Account에 귀속할 수 있다.
- Consequences: 공용 analytics adapter나 mutation 결과를 변경하지 않고 호출부에서 귀속 경계를 보장한다. SDK identity 전환 실패는 기존 fail-open 계약을 따른다.
- Confirmation / Follow-up: 실제 Repost callback Account 전환 회귀와 Reaction·Bookmark의 성공 payload 회귀를 확인했다.

## Remaining Decisions

- 현재 구현 범위에 필요한 새 제품 결정은 없다.
- PROD-795·819는 Done이고 main에 runtime이 있다. 다만 수집 중단 상태와 미완료 실제 수집 검증은 남아 있다. 이 상태를 구현 자체의 새 승인 gate로 바꾸거나 수집 완료로 간주하지 않는다.
- Canceled PROD-520의 대체 집계 owner는 확인되지 않았다. 집계식·가입 이벤트는 제외 범위이며 이 change의 규범 요구사항이나 task로 추가하지 않는다.
- Account 전환 중 늦은 완료 결과는 위 구현 경계에서 현재 Account와 비교하며, 같은 Account의 Profile 전환은 수집하고 다른 Account·guest 전환은 수집하지 않는다.

## Superseded Decisions

- 2026-08-10 OpenPanel identity 재사용 결정은 2026-08-31 PostHog identity 결정으로 대체했다.
- 2026-08-10 서버 성공 경계 기록의 provider·payload 설명은 2026-08-31의 해당 기록으로 갱신했다. 원본은 기존 커밋 `1723b033`에서 확인할 수 있다.
- 기존 문서의 전체 payload로 읽힐 수 있던 최소 property 표현은 명시적 속성과 SDK metadata를 구분하는 결정으로 정정했다.
