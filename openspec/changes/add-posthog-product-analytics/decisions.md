## Context

이 기록은 최신 Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-575`가 기존 PROD-469 OpenPanel 구현을 PostHog 계약으로 교체한 결과와, `docs/design/breakpoints.md`의 Web/Native 경계를 반영한다. 현재 artifact는 shared change 중 PROD-819 task slice만 구체화하며 다른 이슈의 구현 task를 대신하지 않는다.

## Decision Records

### shared change의 slice·검증·archive 책임을 분리한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-575`
- Status: Active
- Context / Problem: Web runtime, Cloud/build 구성, 개인정보·운영 통합과 production acceptance는 변경·검증 방식과 완료 시점이 다르다.
- Decision Outcome: `add-posthog-product-analytics`에서 PROD-820은 작업 그룹 1·5, PROD-819는 그룹 2·3·4, PROD-795는 그룹 6과 cross-slice 그룹 7을 소유한다. PROD-575는 실제 production acceptance와 최종 archive를 소유한다. 이번 artifact는 PROD-819 그룹 2·3·4만 tasks로 작성한다.
- Alternatives Considered: 모든 작업을 PROD-795 하나에 다시 결합하거나 부모·마지막 PR이라는 이유로 통합·archive 책임을 추론하는 방법은 최신 Linear 책임 경계와 맞지 않아 제외했다.
- Consequences: PROD-819 구현과 검증은 sibling Cloud 설정이나 production acceptance 없이 독립 완료할 수 있지만, 전체 change 완료와 archive를 의미하지 않는다.
- Confirmation / Follow-up: tasks heading과 다음 phase handoff가 PROD-819만 소유하고 archive owner를 PROD-575로 명시하는지 확인한다.

### OpenPanel dual-write 없이 PostHog로 교체한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`, `PROD-819`, `PROD-795`, `PROD-575`
- Status: Active
- Context / Problem: PROD-469가 전달한 OpenPanel runtime과 아직 archive되지 않은 change가 남아 있지만 최신 운영 provider는 PostHog Cloud US다. 두 provider를 함께 유지하면 payload·고지·장애 대응 계약이 중복된다.
- Decision Outcome: PROD-819는 Web runtime과 test에서 OpenPanel dependency와 전송을 제거하고 PostHog만 사용한다. PROD-575는 최종 gate에서 `add-web-openpanel-product-analytics`를 `--skip-specs` archive한 뒤 새 PostHog change를 정상 archive한다.
- Alternatives Considered: OpenPanel change rename, 일정 기간 dual-write, old change를 active spec에 먼저 동기화하는 방법은 명시된 migration/archive 순서와 최소 수집 경계에 어긋나 제외했다.
- Consequences: rollout 전환 중 analytics 공백은 설정 누락 no-op으로 허용하지만 동일 사용자 행동을 두 provider에 복제하지 않는다.
- Confirmation / Follow-up: dependency/runtime/browser request에서 OpenPanel 참조가 없음을 PROD-819에서 검증하고 archive 순서는 PROD-575가 확인한다.

### 공개 key와 ingestion host가 모두 있을 때만 Web 분석을 활성화한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`
- Status: Active
- Context / Problem: local·development 기본 비활성화와 production 공개 설정 주입을 하나의 조건으로 맞추지 않으면 부분 설정이 unintended 전송을 만들 수 있다.
- Decision Outcome: 공개 PostHog project key와 Cloud US ingestion host가 모두 존재할 때만 Web client를 초기화한다. exact environment variable 이름과 주입 구현은 두 slice가 shared change에서 정렬하되 실제 key 값은 repository·artifact에 기록하지 않는다.
- Alternatives Considered: environment 이름만 검사, key만으로 SDK default host 사용, 별도 enabled flag 추가는 부분 설정과 이중 상태를 만들어 제외했다.
- Consequences: PROD-819은 fake 공개 설정으로 독립 검증할 수 있고, PROD-820 설정이 배포되기 전 실제 환경은 안전한 no-op이다.
- Confirmation / Follow-up: key-only, host-only, 둘 다 없음과 둘 다 존재하는 경우를 unit·browser 검증한다.

### 자동 수집 대신 app-owned 최소 수집만 사용한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-575`
- Status: Active
- Context / Problem: PostHog SDK의 broad autocapture, raw URL, replay와 성능 telemetry는 현재 승인된 pageview·명시 이벤트보다 넓은 사용자·환경 데이터를 만들 수 있다.
- Decision Outcome: automatic pageview·pageleave, element autocapture, session replay, console, Web Vitals, performance와 heatmap 수집을 비활성화한다. 현재 Web runtime은 정규화된 route pageview와 승인된 명시 event만 capture한다.
- Alternatives Considered: SDK history-change pageview, broad autocapture 후 blacklist, 기존 OpenPanel 10% replay 유지는 최소 수집과 후속 replay 책임 분리에 맞지 않아 제외했다.
- Consequences: 더 넓은 분석 신호는 수집하지 않으며 새 event·replay가 필요하면 별도 Linear 계약과 shared spec 변경이 필요하다.
- Confirmation / Follow-up: SDK config test와 intercepted browser payload에서 자동 event가 없음을 확인한다.

### pageview identity는 실제 URL이 아닌 안정적인 route template이다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`
- Status: Active
- Context / Problem: 실제 Expo Router pathname과 search/hash에는 Profile handle, Post ID, 검색어 같은 고유 값이 포함될 수 있고 같은 화면을 고 cardinality URL로 분할한다.
- Decision Outcome: route group과 동적 segment 실제 값, query·fragment를 제외한 안정적인 route file template만 pageview identity로 사용한다. 최초 template과 다른 template으로 변할 때만 한 번 capture한다.
- Alternatives Considered: raw pathname, query 제거 pathname, PostHog automatic history capture는 동적 식별 값 또는 중복 event를 남길 수 있어 제외했다.
- Consequences: 같은 route template 안에서 대상 ID나 query가 바뀌어도 추가 pageview가 생기지 않는다. 대상별 행동은 현재 pageview 계약이 아니라 별도 명시 event가 소유한다.
- Confirmation / Follow-up: static·dynamic·route group fixture와 same-template query 변화 browser test로 확인한다.

### Account만 identify하고 전환 전에 reset한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`, `PROD-819`
- Status: Active
- Context / Problem: 사용자 여정을 연결하려면 stable identity가 필요하지만 Account·Profile 또는 서로 다른 로그인 사용자의 history를 잘못 결합하면 안 된다.
- Decision Outcome: opaque Account ID만 identify에 사용하고 trait는 보내지 않는다. 같은 Account identify는 dedupe하고, Account A→B는 reset 후 identify, Account→guest·로그아웃은 reset한다. Profile 선택은 Account identity 전환이 아니다.
- Alternatives Considered: Profile ID identity, email·이름·handle trait, 새 Account를 reset 없이 identify하는 방법은 Account 수명주기와 최소 수집에 맞지 않아 제외했다.
- Consequences: Profile별 분석은 허용된 event property로만 표현하며 서로 다른 Account history는 reset 경계로 분리된다.
- Confirmation / Follow-up: guest→A, A→A, A→B, A→guest와 logout ordering을 unit·browser 검증한다.

### event 허용 목록은 SDK 호출 전에 app adapter가 소유한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-819`
- Status: Active
- Context / Problem: 현재 공용 API는 자유 형식 event/property를 받고, SDK `before_send`에서 generic blacklist만 적용하면 새 key가 기본 허용되거나 PostHog-required metadata까지 제거될 수 있다.
- Decision Outcome: app adapter가 event별 허용 property를 새 payload로 구성하고 unknown event를 drop한 뒤 SDK를 호출한다. `before_send`는 필요하면 최종 방어선으로만 사용하고 SDK-required protocol/session metadata를 app property와 분리한다.
- Alternatives Considered: caller별 sanitizer, generic recursive blacklist, SDK hook만으로 filtering하는 방법은 누락과 reserved-key 손상 위험이 있어 제외했다.
- Consequences: taxonomy 변경은 중앙 allowlist와 tests를 함께 변경해야 하며, 잘못된 새 property는 전송보다 data omission으로 실패한다.
- Confirmation / Follow-up: 모든 승인 event, extra property, sensitive key와 unknown event를 unit test하고 browser request에 자유 형식 값이 없는지 확인한다.

### analytics 오류는 adapter에서 fail-open으로 격리한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-795`
- Status: Active
- Context / Problem: 외부 SDK·endpoint·차단기 오류가 제품 렌더링이나 사용자 action 결과를 바꾸면 analytics가 제품 가용성 의존성이 된다.
- Decision Outcome: 초기화·capture·identify·reset과 전송의 동기·비동기 실패를 adapter에서 흡수하고 caller는 analytics 결과를 await하거나 사용자 오류에 합치지 않는다.
- Alternatives Considered: caller별 try/catch, analytics 실패를 mutation 실패로 변환, 사용자에게 analytics 오류를 표시하는 방법은 일관된 장애 격리와 맞지 않아 제외했다.
- Consequences: 일부 event 누락은 허용하며 운영 수집 확인은 PROD-795·PROD-575 검증 surface에서 별도로 다룬다.
- Confirmation / Follow-up: constructor/method/network 실패에도 원래 route·Session·mutation 흐름이 완료되는지 검증한다.

### PostHog SDK는 Web platform 경계에만 둔다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, Linear `PROD-819`, `PROD-537`
- Status: Active
- Context / Problem: 공용 Expo app에 Web SDK dependency를 추가하면 platform import 경계가 약할 때 Native bundle로 유입될 수 있다.
- Decision Outcome: Android·iOS 공용 analytics API는 no-op을 유지하고 PostHog value import와 runtime은 Web platform implementation에만 둔다. 이는 현재 delivery/verification 경계이며 Native의 영구 비지원 결정이 아니다.
- Alternatives Considered: `posthog-react-native` 동시 도입, runtime `Platform.OS` 분기 뒤 공통 value import는 PROD-819 범위를 넘고 Native graph 격리를 보장하지 않아 제외했다.
- Consequences: Native analytics는 계속 비활성이고 지원·검증은 PROD-537가 별도로 소유한다.
- Confirmation / Follow-up: Native export/dependency graph에서 PostHog Web·Native runtime 부재를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- PROD-469의 OpenPanel provider, automatic screen/outgoing/attribute 수집과 10% session replay 계약은 최신 Linear `PROD-819`, `PROD-795`, `PROD-575`의 PostHog 교체·최소 수집 계약으로 대체됐다. 기존 OpenSpec 기록 자체를 새 OpenSpec 날짜로 덮지 않으며, PROD-575가 명시한 `--skip-specs` archive 순서로 old change를 보존한다.
