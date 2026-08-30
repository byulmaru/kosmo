## Context

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event payload privacy와 Session Replay privacy는 같은 문제로 뭉뚱그리지 않고 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮기고, PROD-820은 PostHog Cloud와 build/deployment 공개 설정을 제공한다. PROD-795는 실제 수집 surface와 개인정보 처리방침·runbook을 통합하고, PROD-741은 선행 적용된 Replay의 실제 품질을, PROD-575는 production acceptance와 archive를 소유한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유하고, `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 담당한다. PROD-795·PROD-741·PROD-575가 소유한 개인정보·운영 통합, Replay acceptance, production acceptance와 archive는 이 change가 대신 완료하거나 archive하지 않는다.

마스킹 승인 근거는 [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인` 기록이다. 사용자 정혜주(HJSmiley)는 “URL·referrer의 검색어 `q`와 광고 click ID는 가리고, `utm_*`는 보존하는 현재 정책을 유지·승인하시겠어요?”에 “마스킹 정책 승인”으로 답했다. 이 승인은 제품·사용자 승인이고, `2026-08-30` 구현 기록이나 GitHub reviewer signoff 또는 production acceptance를 소급해 승인하는 기록이 아니다.

## Goals / Non-Goals

**Goals:**

- PostHog 공식 권장 defaults와 표준 자동 이벤트·metadata·persistence·remote config를 그대로 사용한다.
- 앱 소유 경계를 typed custom event, 공개 SDK identity property 기반 identify/reset과 fail-open adapter로 제한한다.
- standard event payload의 Search query를 SDK 설정과 좁은 referrer 보완으로 보호하고, Replay 수집량과 개인정보 보호는 별도의 Cloud 설정과 PostHog 표준 masking marker로 통제한다.
- 공개 key·host가 완전한 Web build에서만 초기화하고 Docker·workflow 주입 경계를 일치시킨다.
- PostHog Web SDK가 Android·iOS graph에 유입되지 않음을 확인한다.

**Non-Goals:**

- PostHog 표준 pageview·autocapture·metadata·remote config를 앱 코드로 재구현하는 것
- 기능별 새 제품 event·dashboard, opt-out UI와 Account 분석 데이터 삭제
- Native PostHog SDK
- 이번 PR만으로 개인정보 처리방침·운영 통합, replay acceptance, production acceptance 또는 OpenSpec archive를 완료하는 것

## Implementation Guidance

### Current Constraints

- 공개 key와 host 중 하나라도 없으면 SDK를 초기화하지 않아야 한다.
- `posthog-js` value import는 `.web` platform 경계에만 있어야 한다.
- installed SDK가 지원하는 최신 권장 baseline은 `defaults: '2026-05-30'`이다.
- PostHog의 기본 identity는 localStorage와 cookie에 지속되므로 module-local Account cache는 reload 뒤 authority가 될 수 없다.
- Search query `q`는 `mask_personal_data_properties: true`와 `custom_personal_data_properties: ['q']`로 standard event payload의 current/session URL에서 마스킹한다. 이 설정은 SDK가 기본으로 마스킹하는 광고 click ID를 함께 적용하며 `utm_*`는 보존한다.
- Native masking이 놓치는 referrer URL의 `q`·기본 click ID와 검색엔진 referrer에서 파생된 `ph_keyword`·`$initial_ph_keyword`·`$session_entry_ph_keyword`는 공개 `before_send` hook에서 정확한 URL parameter와 property key만 좁게 보완한다. 이 hook은 이벤트를 버리거나 표준 metadata를 범용적으로 정제하는 sanitizer가 아니다.
- Cloud project는 remote config, autocapture, performance, heatmap, console과 Replay 설정을 이미 제공한다. 앱이 이를 `advanced_disable_flags`, 전면 denylist 또는 disable option으로 막으면 Cloud 계약이 작동하지 않는다.
- Replay Cloud의 Normal privacy mode는 input을 mask한다. canonical Post Content는 PostHog recorder의 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다.
- `ph-mask ph-no-capture` marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 이번 masking 승인으로 변경하지 않는다.

### Recommended Approach

1. Web adapter는 `posthog.init(key, { api_host, defaults: '2026-05-30', mask_personal_data_properties: true, custom_personal_data_properties: ['q'], before_send })`를 중심으로 초기화한다. test automation 전용 option이나 환경 변수 분기를 포함해 표준 기능 disable, persistence override, property denylist와 범용 sanitizer를 두지 않는다. `before_send`는 native masking이 놓치는 referrer URL의 `q`·기본 click ID와 파생 `ph_keyword` 계열만 보완한다.
2. PostHog SDK가 browser history와 DOM에서 만드는 pageview·pageleave·autocapture 및 `$current_url`, `$pathname`, referrer/session-entry와 protocol metadata를 유지한다. URL 필드 전체를 제거하지 않고 `q`와 SDK 기본 personal campaign click ID만 마스킹하며 `utm_*`는 유지한다. `$pageview`는 app-owned typed event taxonomy에서 제거한다.
3. 공용 custom event API는 event별 property 타입을 유지하고 typed properties를 `capture`에 그대로 전달한다. runtime projection, unknown-event registry나 generic property sanitizer를 추가하지 않는다.
4. identity 전환은 공개 SDK property를 조회한다. 현재 Account는 `get_property('$user_id')`로, persisted distinct identity는 `get_distinct_id()`로 확인한다. 같은 identified Account는 reset하지 않고 SDK에 identify를 맡기고, 다른 identified Account는 reset 후 identify한다. guest 전환은 공개 property에 identified Account가 남아 있을 때 reset한다.
5. canonical Post Content root에는 Web recorder가 인식하는 `ph-mask ph-no-capture` class를 제공한다. `ph-mask`는 Replay masking, `ph-no-capture`는 autocapture 제외이며 둘 다 PostHog 표준 privacy control이다.
6. PostHog Cloud는 Replay 10% sampling, production `kos.moe` origin 조건, Normal input masking과 30일 retention을 배포 전에 적용한다. 실제 project token이나 credential은 저장소·문서·로그에 복제하지 않는다.
7. 초기화·capture·identify·reset의 synchronous failure와 endpoint failure는 제품 렌더링, 인증, navigation과 mutation에서 격리한다.
8. unit test는 minimal config, q/click ID masking과 UTM 보존 설정, typed passthrough, 공개 identity transition과 Post Content marker를 검증한다. Playwright fixture는 PostHog bot filter를 우회하는 production option 대신 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 context에 설정한다. browser test는 표준 `/e/` event payload에서 current/referrer/session URL의 q 비노출, current/referrer의 click ID masking, 검색엔진 referrer의 파생 `ph_keyword` 비노출과 UTM 보존을 확인하고 remote config 요청은 별도로 확인한다. 실제 reload를 포함한 identity 순서, `ph-no-capture` outbound marker와 설정 누락 no-op 및 endpoint failure의 fail-open도 검증한다.

공식 대조 표면은 PostHog JS [`PostHogConfig`](https://posthog.com/docs/libraries/js/config)와 [Session Replay privacy](https://posthog.com/docs/session-replay/privacy)다.

### Allowed Alternatives

- Post Content는 `ph-mask ph-no-capture` class 대신 동등한 PostHog 표준 selector 조합을 사용할 수 있다. Native prop 오염이 없고 browser replay masking과 autocapture 제외가 같은 수준으로 증명되어야 한다.
- PostHog singleton을 직접 감싸거나 작은 injected client interface를 둘 수 있다. 공용 caller가 Web SDK type에 의존하지 않고 Native graph가 분리되면 동등하다.

### Known Traps

- 수동 route observer와 `capture_pageview: 'history_change'`를 함께 두면 pageview가 중복된다.
- 표준 URL/referrer/session metadata 전체를 `before_send`, property denylist나 runtime allowlist로 제거하면 Web analytics 계약이 깨진다. 허용되는 `before_send`는 native masking이 놓치는 referrer URL의 `q`·기본 click ID와 파생 `ph_keyword` 계열만 보완하는 좁은 예외다.
- `advanced_disable_flags` 또는 external dependency loading 차단은 remote config와 Replay를 막는다.
- `persistence: 'memory'`, `$user_state`·`identified` 같은 내부 persistence 값과 module-local identity cache는 reload 뒤 Account 연결과 reset 판정을 잃거나 SDK 호환성을 깨뜨린다. 공개 `$user_id`와 `get_distinct_id()`를 사용하고 실제 browser reload로 검증한다.
- E2E를 위해 production adapter에 user-agent override나 test-only 환경 변수 분기를 추가하면 제품 초기화 계약이 테스트 사정에 종속된다.
- 모든 text를 mask하면 replay 진단 가치가 급격히 낮아진다. input과 canonical Post Content를 PostHog 표준 경계로 선택하고, Post Content는 autocapture도 제외한다.
- SDK 기본 광고 click ID masking을 q-only 정책으로 되돌리지 않고 그대로 유지한다. `gclid`, `fbclid`, `msclkid` 등의 손실은 `2026-08-31 마스킹 정책 승인`에 반영된 현재 privacy trade-off이며, `utm_*`는 유지한다.
- PostHog와 OpenPanel을 dual-write하면 개인정보 고지와 장애 대응 계약이 두 개가 된다.

## Risks / Trade-offs

- [표준 metadata에 URL·referrer가 포함됨] → 실제 수집 surface를 PROD-795 개인정보 고지와 runbook에 반영하고, event payload에서는 `q`·기본 click ID를 마스킹하며 referrer URL과 파생 `ph_keyword` 계열도 정확한 key만 좁게 보완한다. 기본 click ID 손실은 `2026-08-31 마스킹 정책 승인`으로 현재 정책에 반영된 trade-off다. Replay는 별도로 Cloud origin·Replay masking으로 통제한다.
- [SDK defaults가 시간에 따라 바뀜] → 권장 date baseline을 명시하고 upgrade 시 PostHog migration notes와 outbound browser test를 함께 갱신한다.
- [Replay가 production traffic 비용을 만듦] → Cloud sampling을 10%로 고정하고 PROD-741·PROD-575에서 실제 수집량과 품질을 검증한다.
- [Web dependency가 Native graph에 유입될 수 있음] → `.web` value import와 Native export/dependency scan을 required verification으로 둔다.
- [설정/전송 실패를 숨기면 분석 누락을 즉시 알기 어려움] → 제품 흐름은 fail-open으로 유지하고 운영 관측과 production acceptance는 PROD-795·PROD-575가 소유한다.

## Migration Plan

1. PROD-820에서 Cloud 보호 설정과 공개 build/deployment 주입을 production 배포 전에 준비한다.
2. PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환한다.
3. PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다.
4. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
5. PROD-575가 production acceptance 후 old OpenPanel change를 `--skip-specs`로 archive하고 이 change를 정상 archive한다.

긴급 비활성화는 production build의 공개 key 또는 host를 제거해 adapter를 no-op으로 만든다. OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

없음.
