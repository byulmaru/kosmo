## Context

이 기록은 기존 Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575` 결정과 2026-09-02 `PROD-819`·`PROD-820`의 검색·캠페인 metadata 비마스킹 결정을 반영하며, `docs/design/breakpoints.md`의 Web/Native 경계를 따른다. PROD-820/PR #685와 PROD-819/PR #653는 각각 merge commit `47fb36f52`와 `2176b7e38`로 `main`에 반영됐다. 2026-08-31 마스킹 승인은 Superseded 상태로 보존한다. 제품 동작의 authority는 Linear 결정이며, PR과 리뷰 의견은 구현·병합 증거와 구현 보완의 계기일 뿐 제품 계약의 근거가 아니다.

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
- Confirmation / Follow-up: PROD-820/PR #685와 PROD-819/PR #653는 각각 merge commit `47fb36f52`와 `2176b7e38`로 `main`에 반영됐다. tasks와 PR 본문은 PROD-795·741·575의 남은 gate와 owner를 계속 구분한다.

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
- Authority / Provenance: Linear `PROD-819`, `PROD-820`; PostHog JS config documentation; 아래 `2026-09-02 검색·캠페인 metadata 비마스킹 결정`
- Status: Active
- Context / Problem: 자동 기능을 끄고 route pageview·metadata filter를 앱에서 다시 구현하면 SDK와 Cloud 계약이 중복되고 표준 metadata가 손실된다.
- Decision Outcome: `defaults: '2026-05-30'`과 `mask_personal_data_properties: false`를 사용하며 pageview·pageleave·autocapture, standard URL/referrer/session metadata, persistence, performance·heatmap·console, feature flag와 Replay remote config를 유지한다. Search `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존하고 `custom_personal_data_properties`나 선택적 metadata `before_send` 보완은 두지 않는다. 앱 소유 manual pageview, route normalizer와 runtime event allowlist를 제거한다.
- Alternatives Considered: 모든 기능 비활성화 후 app-owned capture, manual route bridge, URL allowlist와 선택적 query·click metadata masking은 표준 동작 또는 2026-09-02 제품 결정과 맞지 않아 제외했다.
- Consequences: 실제 수집 surface에 자유 형식 Search `q`와 click identifier가 포함될 수 있으므로 PROD-795 개인정보 고지와 PROD-575 production acceptance가 이를 검증해야 한다. Standard event metadata와 Session Replay privacy는 서로 다른 경계로 운영한다.
- Confirmation / Follow-up: init config와 intercepted standard `/e/` event payload에서 표준 이벤트·metadata와 current/referrer/session URL의 `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`가 원문으로 유지되는지 확인한다. SDK가 사용하는 개별 derived property 이름은 현재 dependency의 관측값으로만 기록하고 계약의 authority로 삼지 않는다. Remote config 요청은 별도 outbound 증거로 확인한다.

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

### standard event metadata와 Session Replay privacy를 분리한다

- Decision Date: 2026-08-30
- Decision Class: Derived Contract
- Authority / Provenance: `2026-08-30` 구현 기록(독립 authority 아님); technical provenance는 [PR #653 review comment](https://github.com/byulmaru/kosmo/pull/653#discussion_r3887264185)의 Post Content `ph-mask ph-no-capture`, [PR #653 review comment](https://github.com/byulmaru/kosmo/pull/653#discussion_r3887264188)의 `q` URL metadata 지적, [PR #653 review comment](https://github.com/byulmaru/kosmo/pull/653#discussion_r3887264190)의 Replay·standard event payload 경계 분리 지적이다. 제품 authority는 아래 2026-09-02 결정과 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 durable 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)이다.
- Status: Active
- Context / Problem: standard event payload의 URL·referrer·session metadata와 Replay DOM에는 서로 다른 정보와 보호 수단이 적용된다.
- Decision Outcome: standard event metadata는 2026-09-02 제품 결정에 따라 Search `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`를 보존한다. Session Replay는 Cloud privacy 설정과 canonical Post Content의 `ph-mask ph-no-capture` marker로 별도 보호한다.
- Alternatives Considered: 모든 URL/referrer/session metadata를 제거하는 전면 sanitizer와 모든 DOM/text를 mask하는 방식은 표준 분석 기능 또는 Replay 진단 가치를 훼손하므로 제외했다.
- Consequences: 두 경계의 검증 증거를 별도로 남긴다. Post Content 보호를 metadata 비마스킹 결정으로 약화하지 않는다.
- Confirmation / Follow-up: standard `/e/` event payload의 metadata 보존과 Post Content `$autocapture` 비노출을 각각 검증하고 Replay acceptance는 PROD-741이 소유한다.

### 2026-08-31 마스킹 정책 승인

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: 제품 authority는 사용자 정혜주(HJSmiley)가 `01a0547d-a937-75e2-b6b9-702e25181ddb`에서 `q`·referrer·기본 광고 click ID masking과 `utm_*` 보존을 명시 승인한 기록이며, `01a054d2-ecf2-75f0-8083-88b24ac38674`는 그 승인을 #685/shared spec에 전파한 기록이다. 현재 구현을 리뷰 대응에서 설계·검증한 `01a051f9-db82-7de0-af98-6cadb87c78aa`와 PR #653의 기술적 지적은 technical provenance이지 제품 authority가 아니다. 검토한 PR 리뷰, Linear `PROD-819`·`PROD-820`, 현재 OpenSpec과 위 작업 이력 범위에서는 이 선택 이전의 별도 법무 요구, 개인정보 사고, 독립 canonical 제품 요구를 확인하지 못했다. 현재 정책은 리뷰에서 발견된 기술적 위험을 바탕으로 분석 책임자인 사용자가 선택·승인한 제품 정책이다. [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인` 기록; [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `## 2026-09-01 PR #685 리뷰 대응 — 마스킹 대안 비교와 선택 이유` 댓글(`71f20e76-e996-4cca-adfd-9b99a13c672c`)
- Status: Superseded
- Context / Problem: `2026-08-30` 구현 기록만으로는 masking 정책의 독립 authority나 사용자 승인을 증명하지 못한다.
- Decision Outcome: 사용자 정혜주(HJSmiley)는 “URL·referrer의 검색어 `q`와 광고 click ID는 가리고, `utm_*`는 보존하는 현재 정책을 유지·승인하시겠어요?”라는 질문에 “마스킹 정책 승인”으로 답했다. 이 승인으로 현재 SDK native `q`·기본 광고 click ID masking, native masking이 놓치는 좁은 referrer `q`·기본 click ID·`ph_keyword` 계열의 공개 `before_send` 보완과 `utm_*` 보존을 유지한다.
- Alternatives Considered: q-only masking은 `q`를 가리고 SDK 기본 광고 click ID와 click-level attribution을 보존하지만, 승인된 default click ID masking privacy trade-off와 충돌하므로 제외한다. standard metadata unfiltered는 표준·검색·click attribution을 극대화하지만 raw `q`와 광고 click ID가 남을 수 있어 승인된 privacy boundary를 벗어나므로 제외한다. 선택한 정책은 표준 lifecycle·metadata 필드를 보존하고 SDK native `q`·기본 click ID masking을 적용하며, native masking이 놓치는 referrer URL의 `q`·click ID와 파생 `ph_keyword` 계열만 좁은 공개 `before_send` hook으로 보완하고 `utm_*`를 보존한다. 이는 raw 검색·click identifier 최소화를 click-ID attribution보다 우선하면서 UTM campaign classification과 표준 Web analytics를 유지하고 broad app sanitizer를 피하기 위한 것으로, `gclid`, `fbclid`, `msclkid` 등 click-ID-level attribution을 수집 이벤트에서 사용할 수 없는 손실을 수용한다. blanket URL/referrer/session removal 또는 general sanitizer는 노출을 줄이지만 표준 Web·session·referrer analytics를 훼손하므로 제외한다.
- Consequences: 기본 click ID 손실이라는 privacy trade-off는 현재 정책에 대해 사용자가 승인한 것이며, 선택한 정책은 raw 검색·click identifier를 최소화하는 대신 `gclid`, `fbclid`, `msclkid` 등 click-ID-level attribution을 수집 이벤트에서 사용할 수 없는 손실을 수용한다. 표준 lifecycle·metadata와 UTM campaign classification 및 표준 Web analytics는 유지한다. `2026-08-30` 구현을 소급 승인하거나 GitHub reviewer signoff 또는 production acceptance로 대체하지 않는다. `ph-mask ph-no-capture` Replay marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 변경하지 않는다. 범용 sanitizer와 표준 metadata 전면 필터는 계속 금지한다.
- Confirmation / Follow-up: protocol·standard event payload의 URL/referrer masking과 `utm_*` 보존은 Replay의 Cloud privacy·`ph-mask ph-no-capture` marker와 별도로 검증한다. PROD-795, PROD-741, PROD-575의 통합·acceptance·archive 책임은 그대로 유지한다.

### 2026-09-02 검색·캠페인 metadata 비마스킹 결정

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 정혜주(HJSmiley)가 `01a0547d-a937-75e2-b6b9-702e25181ddb`에서 기존 마스킹 정책을 철회한 결정; [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)
- Status: Active
- Context / Problem: 현재 단계에서 `q`와 일부 click metadata만 마스킹하면 다른 표준 metadata와 정책이 일관되지 않고, Search `q`는 제품 개선에 유용한 분석 정보다. 현재 검색 결과는 공개 Profile handle로 한정돼 사용자가 민감한 정보를 검색할 가능성이 낮다고 판단한다.
- Decision Outcome: `mask_personal_data_properties: false`를 명시하고 `custom_personal_data_properties: ['q']`와 선택적 referrer `q`·기본 click ID·검색·캠페인 metadata `before_send` 보완을 제거한다. 따라서 `q`, `gclid`·`fbclid`·`msclkid` 같은 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`를 PostHog 표준 metadata로 수집할 수 있다. 앱 소유 custom event에는 검색어 원문을 별도 property로 추가하지 않는다.
- Alternatives Considered: 2026-08-31의 `q`·기본 click ID 마스킹, `q`만 마스킹하는 방식, URL·referrer·session metadata 전면 제거를 비교했다. 일부 field만 가리는 불일치와 검색·attribution 정보 손실 때문에 선택하지 않았다.
- Consequences: 검색 입력 자체는 자유 형식이므로 예상과 달리 개인정보나 민감 정보가 입력돼 수집될 가능성이 남는다. PROD-795 개인정보 처리방침과 runbook은 실제 수집 surface를 설명해야 한다. 게시물·본문·전문 검색 또는 더 넓은 검색 의미를 도입하기 전에 이 결정을 재검토한다. Post Content·Post Media Viewer의 `ph-mask ph-no-capture`와 Cloud Replay 보호는 유지한다.
- Confirmation / Follow-up: unit config에서 명시적 `false`와 masking hook 부재를 확인하고, `/e/` E2E에서 current/referrer/session URL의 `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*` 원문 보존을 확인한다. SDK가 사용하는 개별 derived property 이름은 현재 dependency의 관측값으로만 기록하고 계약의 authority로 삼지 않는다. Post Content autocapture 비노출은 별도로 계속 검증한다.

### Session Replay 보호는 Cloud와 표준 masking marker가 소유한다

- Decision Date: 2026-08-28
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-820`, `PROD-741`, `PROD-795`, `PROD-575`; PostHog Session Replay privacy documentation
- Status: Active
- Context / Problem: Replay 보호를 후속 활성화 이슈로 미루면 표준 SDK 배포와 개인정보 보호 사이에 공백이 생긴다.
- Decision Outcome: production 배포 전에 Cloud에서 10% sampling, `kos.moe` URL 조건, Normal input masking과 30일 retention을 적용한다. canonical Post Content는 PostHog 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다. standard event metadata 수집과 이 Replay 계약은 별도로 검증하며, PROD-741은 activation이 아니라 실제 replay acceptance를 소유한다.
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

### PROD-795는 수집 표면별 증거로 개인정보·운영 문서를 정렬한다

- Decision Date: 2026-08-31
- Decision Class: Derived Contract
- Authority / Provenance: [Linear `PROD-795`](https://linear.app/byulmaru/issue/PROD-795)의 포함 범위·완료 조건과 `2026-08-31 명세 구체화 범위 확인`; `docs/design/breakpoints.md`의 공개 `/privacy` 진입 계약
- Status: Active
- Context / Problem: `/e/`의 검색·캠페인 metadata 원문 수집 검증과 Replay 보호 설정만으로 모든 PostHog 수집·보존 조건을 설명하면 실제 동작보다 강한 공개 고지가 된다.
- Decision Outcome: 개인정보 화면과 운영 문서는 표준 이벤트, `/flags` 등 원격 설정, persistence와 Replay 수집·보호를 구분하고 실제 확인한 내용만 설명한다. PROD-795는 해당 통합 검증과 고지·운영 안내를 소유하며 SDK·Cloud/build 변경, 실제 Replay 품질 인수와 production acceptance/archive는 기존 owner가 맡는다.
- Alternatives Considered: 현재 `/e/` 테스트만으로 모든 요청을 보호한다고 설명하거나 범용 sanitizer를 추가하는 방식은 기존 PROD-795/819/820 계약을 벗어나므로 적용하지 않는다. 이 결정에 새로운 제품 선택을 추가하지 않는다.
- Consequences: 미확인 표면과 고지 조건은 검증 공백으로 남고, 확인 없이 완료를 선언하지 않는다. 공개 route와 기존 Account·Session 계약은 유지한다.
- Confirmation / Follow-up: 그룹 6의 고지·runbook·통합 증거와 PROD-741/575 handoff를 대조한다.

## Remaining Decisions

### PROD-795 공개 고지 조건의 미확정 항목

이 항목은 새 수집·보존 정책을 승인하는 decision이 아니다. 다음 조건은 아직 선택하거나 확정하지 않았다.

- 개정 시행일과 사전 고지 일정.
- 일반 이벤트의 실제 보존·삭제 운영 기준. Replay 30일 또는 API의 `event_retention_months=12`를 전체 이벤트의 자동 삭제 보장으로 사용하지 않는다.
- 미국 처리에 관한 실제 계약·이전 고지 조건과 적용할 법적 근거.

소유자는 PROD-795다. 기존 metadata 수집·Replay 보호 계약과 사실 확인을 넘어 새 제품·보존 정책을 선택해야 한다면 canonical·Linear에 결정과 승인을 먼저 기록한 뒤 이 명세를 갱신한다. 그 전에는 후보 정책을 Active decision이나 구현 근거로 사용하지 않는다.

## Superseded Decisions

- 2026-08-25의 automatic telemetry 비활성화, app-owned route `$pageview`, URL/referrer filter, `persistence: 'memory'` 결정은 최신 Linear의 표준 SDK 동작 결정으로 대체한다.
- 2026-08-31의 `q`·기본 click ID native masking과 referrer `q`·click ID·파생 `ph_keyword` `before_send` 보완 결정은 2026-09-02 제품 결정으로 대체한다. 표준 lifecycle·metadata와 범용 sanitizer 금지는 유지하고, `mask_personal_data_properties: false`를 명시해 해당 metadata를 원문으로 보존한다.
- 2026-08-28의 `$user_state`·`identified` 같은 SDK 내부 persistence 값을 identity 판정에 사용한 결정은 2026-08-30 Linear의 공개 `$user_id`·`get_distinct_id()` 결정으로 대체한다. 실제 browser reload persistence 검증을 추가한다.
- PROD-469의 OpenPanel provider·replay 계약은 최신 PostHog 전환 계약으로 대체하며 old artifact는 PROD-575의 archive 순서로 보존한다.
