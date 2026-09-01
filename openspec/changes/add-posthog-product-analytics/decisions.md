## Context

이 기록은 기존 Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575` 결정과 2026-08-31 `PROD-819`·`PROD-820`의 마스킹 승인을 반영하며, `docs/design/breakpoints.md`의 Web/Native 경계를 따른다. `2026-08-30` 기록은 masking 구현을 남긴 것이며 독립 authority가 아니다. 제품 동작의 authority는 Linear 결정이며, 리뷰 의견은 구현 보완의 계기일 뿐 제품 계약의 근거가 아니다.

## Decision Records

### shared change의 slice·검증·archive 책임을 분리한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`
- Status: Active
- Context / Problem: Web runtime, Cloud/build, 개인정보·운영, replay 품질과 production acceptance는 변경·검증 방식이 다르다.
- Decision Outcome: `PROD-820` / PR #685가 이 승인된 shared spec 전체와 Cloud·build/deployment slice를 소유한다. `PROD-819` / PR #653는 shared spec을 소비하는 Web runtime slice를 소유한다. PROD-795는 개인정보·운영 통합, PROD-741은 replay acceptance, PROD-575는 production acceptance와 archive를 소유한다. 이 change는 이 세 downstream 결과를 대신 완료하거나 archive하지 않는다.
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
- Authority / Provenance: Linear `PROD-819`, `PROD-820`; PostHog JS config documentation. Masking 예외는 아래 `2026-08-31 마스킹 정책 승인`으로 보완한다.
- Status: Active
- Context / Problem: 자동 기능을 끄고 route pageview·metadata filter를 앱에서 다시 구현하면 SDK와 Cloud 계약이 중복되고 표준 metadata가 손실된다.
- Decision Outcome: `defaults: '2026-05-30'`을 사용하며 pageview·pageleave·autocapture, standard URL/referrer/session metadata, persistence, performance·heatmap·console, feature flag와 Replay remote config를 유지한다. standard event payload에는 `mask_personal_data_properties: true`와 `custom_personal_data_properties: ['q']`를 적용해 Search query를 마스킹하고, SDK 기본 광고 click ID 마스킹은 수용하며 `utm_*`는 유지한다. Native masking이 놓치는 referrer URL의 `q`·기본 click ID와 검색엔진 referrer에서 파생된 `ph_keyword` 계열만 공개 `before_send` hook으로 보완하며, 범용 sanitizer나 표준 metadata 전면 필터는 두지 않는다. 앱 소유 manual pageview, route normalizer와 runtime event allowlist를 제거한다.
- Alternatives Considered: 모든 기능 비활성화 후 app-owned capture, manual route bridge와 URL allowlist, click ID까지 보존하는 q-only masking은 표준 동작·개인정보 보호 계약과 맞지 않아 제외했다.
- Consequences: 실제 수집 surface가 넓어지며 PROD-795 개인정보 고지와 PROD-575 production acceptance가 이를 검증해야 한다. Standard event payload privacy와 Session Replay privacy는 서로 다른 경계로 운영한다. `gclid`, `fbclid`, `msclkid` 등 기본 click ID의 손실은 승인된 trade-off이며 `utm_*`는 attribution을 위해 유지한다.
- Confirmation / Follow-up: init config와 intercepted standard `/e/` event payload에서 표준 이벤트·metadata가 유지되고 current/referrer/session URL의 `q`, referrer click ID와 파생 `ph_keyword` 계열이 노출되지 않는지 확인한다. Remote config 요청은 별도 outbound 증거로 확인한다.

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

### 공개 SDK identity API를 전환 authority로 사용한다

- Decision Date: 2026-08-28
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-819`
- Status: Active
- Context / Problem: PostHog 기본 persistence와 module-local Account cache가 reload 뒤 어긋날 수 있고, 내부 persistence 값은 SDK 업데이트에 따라 호환성이 깨질 수 있다.
- Decision Outcome: 현재 identified Account는 공개 `get_property('$user_id')`로 확인하고 persisted distinct identity는 공개 `get_distinct_id()`로 조회한다. 같은 Account, Account 전환과 guest reset을 이 공개 API를 기준으로 판정하며 기본 persistence를 유지한다.
- Alternatives Considered: `$user_state`·`identified` 같은 내부 persistence 값과 `persistence: 'memory'` 또는 module cache는 SDK 내부 구현에 결합되거나 reload identity를 잃으므로 제외했다.
- Consequences: logout/reset은 page reload 이후에도 이전 identified Account를 끊을 수 있고 SDK 내부 저장 형식 변경에 덜 취약하다.
- Confirmation / Follow-up: 공개 property 기반 단위 검증과 실제 browser reload의 persisted A→A, A→guest, A→B 흐름을 함께 검증한다.

### standard event payload privacy와 Session Replay privacy를 분리한다

- Decision Date: 2026-08-30
- Decision Class: Derived Contract
- Authority / Provenance: `2026-08-30` 구현 기록(독립 authority 아님); [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인`
- Status: Active
- Context / Problem: Replay DOM masking만으로는 standard event payload의 URL·referrer·session metadata에 포함될 수 있는 Search query를 보호할 수 없고, event payload masking만으로는 Replay DOM 수집을 통제할 수 없다.
- Decision Outcome: standard event payload는 PostHog native personal-data masking으로 `q`와 기본 personal campaign click ID를 마스킹하고 `utm_*`는 유지한다. Native masking이 놓치는 referrer URL의 `q`·기본 click ID와 파생 `ph_keyword` 계열만 공개 `before_send` hook으로 보완한다. Session Replay는 Cloud privacy 설정과 canonical Post Content의 `ph-mask ph-no-capture` marker로 별도 보호한다.
- Alternatives Considered: 모든 URL/referrer/session metadata를 제거하는 전면 sanitizer와 모든 DOM/text를 mask하는 방식은 표준 분석 기능 또는 Replay 진단 가치를 훼손하므로 제외했다.
- Consequences: 두 경계의 검증 증거를 별도로 남겨야 하며, `gclid`, `fbclid`, `msclkid` 등 SDK 기본 click ID 마스킹은 허용된 attribution 손실이다.
- Confirmation / Follow-up: standard `/e/` event payload에서 current/referrer/session URL의 `q`, current/referrer click ID와 파생 `ph_keyword` 계열 비노출, `utm_*` 보존을 검증하고 Replay acceptance는 PROD-741이 소유한다.

### 2026-08-31 마스킹 정책 승인

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인` 기록; [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `## 2026-09-01 PR #685 리뷰 대응 — 마스킹 대안 비교와 선택 이유` 댓글(`71f20e76-e996-4cca-adfd-9b99a13c672c`)
- Status: Active
- Context / Problem: `2026-08-30` 구현 기록만으로는 masking 정책의 독립 authority나 사용자 승인을 증명하지 못한다.
- Decision Outcome: 사용자 정혜주(HJSmiley)는 “URL·referrer의 검색어 `q`와 광고 click ID는 가리고, `utm_*`는 보존하는 현재 정책을 유지·승인하시겠어요?”라는 질문에 “마스킹 정책 승인”으로 답했다. 이 승인으로 현재 SDK native `q`·기본 광고 click ID masking, native masking이 놓치는 좁은 referrer `q`·기본 click ID·`ph_keyword` 계열의 공개 `before_send` 보완과 `utm_*` 보존을 유지한다.
- Alternatives Considered: q-only masking은 `q`를 가리고 SDK 기본 광고 click ID와 click-level attribution을 보존하지만, 승인된 default click ID masking privacy trade-off와 충돌하므로 제외한다. standard metadata unfiltered는 표준·검색·click attribution을 극대화하지만 raw `q`와 광고 click ID가 남을 수 있어 승인된 privacy boundary를 벗어나므로 제외한다. 선택한 정책은 표준 lifecycle·metadata 필드를 보존하고 SDK native `q`·기본 click ID masking을 적용하며, native masking이 놓치는 referrer URL의 `q`·click ID와 파생 `ph_keyword` 계열만 좁은 공개 `before_send` hook으로 보완하고 `utm_*`를 보존한다. 이는 raw 검색·click identifier 최소화를 click-ID attribution보다 우선하면서 UTM campaign classification과 표준 Web analytics를 유지하고 broad app sanitizer를 피하기 위한 것으로, `gclid`, `fbclid`, `msclkid` 등 click-ID-level attribution을 수집 이벤트에서 사용할 수 없는 손실을 수용한다. blanket URL/referrer/session removal 또는 general sanitizer는 노출을 줄이지만 표준 Web·session·referrer analytics를 훼손하므로 제외한다.
- Consequences: 기본 click ID 손실이라는 privacy trade-off는 현재 정책에 대해 사용자가 승인한 것이며, 선택한 정책은 raw 검색·click identifier를 최소화하는 대신 `gclid`, `fbclid`, `msclkid` 등 click-ID-level attribution을 수집 이벤트에서 사용할 수 없는 손실을 수용한다. 표준 lifecycle·metadata와 UTM campaign classification 및 표준 Web analytics는 유지한다. `2026-08-30` 구현을 소급 승인하거나 GitHub reviewer signoff 또는 production acceptance로 대체하지 않는다. `ph-mask ph-no-capture` Replay marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 변경하지 않는다. 범용 sanitizer와 표준 metadata 전면 필터는 계속 금지한다.
- Confirmation / Follow-up: protocol·standard event payload의 URL/referrer masking과 `utm_*` 보존은 Replay의 Cloud privacy·`ph-mask ph-no-capture` marker와 별도로 검증한다. PROD-795, PROD-741, PROD-575의 통합·acceptance·archive 책임은 그대로 유지한다.

### Session Replay 보호는 Cloud와 표준 masking marker가 소유한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-820`, `PROD-741`, `PROD-795`, `PROD-575`; PostHog Session Replay privacy documentation
- Status: Active
- Context / Problem: Replay 보호를 후속 활성화 이슈로 미루면 표준 SDK 배포와 개인정보 보호 사이에 공백이 생긴다.
- Decision Outcome: production 배포 전에 Cloud에서 10% sampling, `kos.moe` URL 조건, Normal input masking과 30일 retention을 적용한다. canonical Post Content는 PostHog 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다. standard event payload privacy와 이 Replay 계약은 별도로 검증하며, PROD-741은 activation이 아니라 실제 replay acceptance를 소유한다.
- Alternatives Considered: Replay 비활성화, 앱 자체 recorder, 모든 text mask는 표준 기능 사용 또는 진단 가치와 맞지 않아 제외했다.
- Consequences: Cloud 설정과 client marker를 함께 운영해야 하며 실제 사용자 콘텐츠 노출 여부를 PROD-741에서 확인한다.
- Confirmation / Follow-up: Cloud 설정 증거, marker unit test와 autocapture outbound 증거, production-equivalent replay acceptance를 남긴다.

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

- 2026-08-25의 automatic telemetry 비활성화, app-owned route `$pageview`, URL/referrer filter, `persistence: 'memory'` 결정은 최신 Linear의 표준 SDK 동작 결정으로 대체한다.
- 2026-08-28의 표준 metadata를 무필터로 통과시키고 `before_send` sanitizer를 전면 금지한 결정은 표준 lifecycle·metadata와 범용 sanitizer 금지에 대해 유지한다. masking 예외는 [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인`으로 보완한다. `2026-08-30` 구현 기록은 독립 authority가 아니다. 표준 lifecycle과 metadata 필드는 유지하되 `q`와 SDK 기본 click ID는 native masking하고, native masking이 놓치는 referrer URL의 `q`·기본 click ID와 파생 `ph_keyword` 계열만 좁은 공개 `before_send` hook으로 보완한다. 범용 sanitizer와 전면 필터는 계속 금지한다.
- 2026-08-28의 `$user_state`·`identified` 같은 SDK 내부 persistence 값을 identity 판정에 사용한 결정은 2026-08-30 Linear의 공개 `$user_id`·`get_distinct_id()` 결정으로 대체한다. 실제 browser reload persistence 검증을 추가한다.
- PROD-469의 OpenPanel provider·replay 계약은 최신 PostHog 전환 계약으로 대체하며 old artifact는 PROD-575의 archive 순서로 보존한다.
