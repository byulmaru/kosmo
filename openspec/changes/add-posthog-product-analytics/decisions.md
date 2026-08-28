## Context

이 기록은 최신 Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`와 `docs/design/breakpoints.md`의 Web/Native 경계를 반영한다. 2026-08-28 PR #653/#685 리뷰와 사용자 결정으로 기존 app-owned 최소 수집 계약을 PostHog 표준 동작 계약으로 정정했다.

## Decision Records

### shared change의 slice·검증·archive 책임을 분리한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`
- Status: Active
- Context / Problem: Web runtime, Cloud/build, 개인정보·운영, replay 품질과 production acceptance는 변경·검증 방식이 다르다.
- Decision Outcome: PROD-819는 Web runtime, PROD-820은 Cloud·build/deployment, PROD-795는 개인정보·운영 통합, PROD-741은 replay acceptance, PROD-575는 production acceptance와 archive를 소유한다.
- Alternatives Considered: 부모 이슈나 마지막 PR에 모든 책임을 결합하는 방식은 독립 배포·검증 경계와 맞지 않아 제외했다.
- Consequences: 각 PR은 자체 범위를 Ready로 만들 수 있지만 개별 완료를 shared change archive로 해석하지 않는다.
- Confirmation / Follow-up: tasks와 PR 본문이 각 owner와 남은 gate를 명시한다.

### OpenPanel dual-write 없이 PostHog로 교체한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-469`, `PROD-819`, `PROD-575`
- Status: Active
- Context / Problem: 두 provider를 함께 유지하면 payload·고지·장애 대응 계약이 중복된다.
- Decision Outcome: Web runtime과 test에서 OpenPanel dependency와 전송을 제거하고 PostHog만 사용한다. PROD-575는 old change를 `--skip-specs` archive한 뒤 이 change를 정상 archive한다.
- Alternatives Considered: dual-write와 OpenPanel fallback은 승인된 전환·개인정보 경계에 맞지 않아 제외했다.
- Consequences: 공개 PostHog 설정이 없는 환경의 analytics 공백은 안전한 no-op으로 허용한다.
- Confirmation / Follow-up: dependency와 browser request에서 OpenPanel 부재를 검증한다.

### 공개 key와 ingestion host가 모두 있을 때만 Web 분석을 활성화한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`
- Status: Active
- Context / Problem: 부분 설정은 의도하지 않은 host 또는 project로 전송할 수 있다.
- Decision Outcome: 공개 PostHog project key와 ingestion host가 모두 존재할 때만 Web SDK를 초기화한다.
- Alternatives Considered: key-only default host와 별도 enabled flag는 부분 설정과 이중 상태를 만들어 제외했다.
- Consequences: local·development와 misconfigured build는 no-op이다.
- Confirmation / Follow-up: key/host 네 조합과 production-equivalent build를 검증한다.

### 권장 defaults와 PostHog 표준 Web 동작을 사용한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`; PR #653/#685 review; PostHog JS config documentation
- Status: Active
- Context / Problem: 자동 기능을 끄고 route pageview·metadata filter를 앱에서 다시 구현하면 SDK와 Cloud 계약이 중복되고 표준 metadata가 손실된다.
- Decision Outcome: `defaults: '2026-05-30'`을 사용하며 pageview·pageleave·autocapture, standard URL/referrer/session metadata, persistence, performance·heatmap·console, feature flag와 Replay remote config를 명시적으로 차단하지 않는다. 앱 소유 manual pageview, route normalizer, runtime event allowlist와 sanitizer를 제거한다.
- Alternatives Considered: 모든 기능 비활성화 후 app-owned capture, manual route bridge와 URL allowlist는 PostHog 표준 동작과 reviewer 의도에 맞지 않아 제외했다.
- Consequences: 실제 수집 surface가 넓어지며 PROD-795 개인정보 고지와 PROD-575 production acceptance가 이를 검증해야 한다.
- Confirmation / Follow-up: init config와 intercepted outbound payload에서 표준 이벤트·metadata·remote config가 유지되는지 확인한다.

### 앱 소유 custom event는 compile-time typed contract로 제한한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-469`
- Status: Active
- Context / Problem: custom event caller가 자유 형식 event/property를 전송하면 제품 taxonomy가 흔들린다.
- Decision Outcome: 기존 custom event는 event별 TypeScript contract로 제한하고 typed properties를 `capture`에 그대로 전달한다. `$pageview`는 SDK 소유이므로 app event map에서 제거한다.
- Alternatives Considered: generic public capture와 runtime projection/allowlist는 compile-time contract와 SDK 표준 event를 중복 제어하므로 제외했다.
- Consequences: 새 custom event는 담당 Linear/OpenSpec과 type contract를 함께 변경해야 한다.
- Confirmation / Follow-up: positive capture와 `@ts-expect-error` contract test를 유지한다.

### SDK persisted identity를 전환 authority로 사용한다

- Decision Date: 2026-08-28
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-819`
- Status: Active
- Context / Problem: PostHog 기본 persistence와 module-local Account cache가 reload 뒤 어긋날 수 있다.
- Decision Outcome: SDK의 persisted distinct identity와 identified state를 조회해 same Account, Account 전환과 guest reset을 판정한다. 기본 persistence를 유지한다.
- Alternatives Considered: `persistence: 'memory'`와 module cache는 표준 persistence를 무력화하고 reload identity를 잃으므로 제외했다.
- Consequences: logout/reset은 page reload 이후에도 이전 identified Account를 끊을 수 있다.
- Confirmation / Follow-up: persisted identified A에서 A, B, guest 전환을 unit test로 검증한다.

### Session Replay 보호는 Cloud와 표준 masking marker가 소유한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-820`, `PROD-741`, `PROD-795`, `PROD-575`; PostHog Session Replay privacy documentation
- Status: Active
- Context / Problem: Replay 보호를 후속 활성화 이슈로 미루면 표준 SDK 배포와 개인정보 보호 사이에 공백이 생긴다.
- Decision Outcome: production 배포 전에 Cloud에서 10% sampling, `kos.moe` URL 조건, Normal input masking과 30일 retention을 적용한다. canonical Post Content는 PostHog 표준 `ph-mask` class를 사용한다. PROD-741은 activation이 아니라 실제 replay acceptance를 소유한다.
- Alternatives Considered: Replay 비활성화, 앱 자체 recorder, 모든 text mask는 표준 기능 사용 또는 진단 가치와 맞지 않아 제외했다.
- Consequences: Cloud 설정과 client marker를 함께 운영해야 하며 실제 사용자 콘텐츠 노출 여부를 PROD-741에서 확인한다.
- Confirmation / Follow-up: Cloud 설정 증거, marker unit test와 production-equivalent replay acceptance를 남긴다.

### 분석 장애를 제품 흐름에서 격리한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-795`
- Status: Active
- Context / Problem: 외부 SDK·endpoint 오류가 제품 가용성 의존성이 되어서는 안 된다.
- Decision Outcome: 초기화·capture·identify·reset 실패를 adapter에서 흡수하고 caller는 analytics 결과를 제품 제어 흐름에 사용하지 않는다.
- Alternatives Considered: caller별 error propagation은 일관된 장애 격리와 맞지 않아 제외했다.
- Consequences: 일부 event 누락은 허용하고 운영 관측은 후속 acceptance가 소유한다.
- Confirmation / Follow-up: SDK method와 endpoint 실패에도 인증·navigation·mutation이 계속되는지 검증한다.

### PostHog SDK는 Web platform 경계에만 둔다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, Linear `PROD-819`, `PROD-537`
- Status: Active
- Context / Problem: Web dependency가 공용 import를 통해 Native bundle에 유입될 수 있다.
- Decision Outcome: PostHog value import와 runtime은 Web platform implementation에만 두고 Android·iOS 공용 API는 no-op을 유지한다.
- Alternatives Considered: Native SDK 동시 도입과 공통 value import는 현재 범위를 넘는다.
- Consequences: Native analytics는 계속 비활성이고 PROD-537가 별도로 소유한다.
- Confirmation / Follow-up: Native export/dependency graph에서 PostHog runtime 부재를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-25의 automatic telemetry 비활성화, app-owned route `$pageview`, URL/referrer filter, `persistence: 'memory'` 결정은 2026-08-28 최신 Linear와 PR #653/#685 리뷰를 반영한 표준 SDK 동작 결정으로 대체한다.
- PROD-469의 OpenPanel provider·replay 계약은 최신 PostHog 전환 계약으로 대체하며 old artifact는 PROD-575의 archive 순서로 보존한다.
