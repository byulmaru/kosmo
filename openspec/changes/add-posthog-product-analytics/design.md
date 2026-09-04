## Context

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event metadata 수집과 Session Replay privacy는 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮기고, PROD-820은 PostHog Cloud와 build/deployment 공개 설정을 제공한다. PROD-795는 실제 수집 surface와 개인정보 처리방침·runbook을 통합하고, PROD-741은 선행 적용된 Replay의 실제 품질을, PROD-575는 production acceptance와 archive를 소유한다.

PROD-839는 두 선행 변경이 같은 지원 release line에 반영된 뒤에도 남아 있는 OpenPanel build·deployment 주입과 외부 설정을 정리한다. 지원 build·수동 SHA rebuild·rollback 대상의 OpenPanel 소비 여부와 활성 설정 범위를 먼저 확인하고, 근거가 충분할 때만 저장소와 GitHub 설정을 제거한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유하고, `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 담당한다. PROD-795·PROD-741·PROD-575가 소유한 개인정보·운영 통합, Replay acceptance, production acceptance와 archive는 이 change가 대신 완료하거나 archive하지 않는다.

현재 metadata 수집 결정의 근거는 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)이다. 사용자 정혜주(HJSmiley)는 기존 마스킹 정책을 철회하고 Search `q`, 기본 click ID와 referrer·session에서 파생되는 검색·캠페인 metadata를 표준 metadata로 수집하기로 결정했다. 2026-08-31 마스킹 승인은 Superseded 상태로 이력을 보존하며, 새 결정도 GitHub reviewer signoff나 production acceptance를 대신하지 않는다.

## Goals / Non-Goals

**Goals:**

- PostHog 공식 권장 defaults와 표준 자동 이벤트·metadata·persistence·remote config를 그대로 사용한다.
- 앱 소유 경계를 typed custom event, 공개 SDK identity property 기반 identify/reset과 fail-open adapter로 제한한다.
- standard event payload의 Search `q`와 click metadata를 SDK 표준 URL·referrer·session metadata로 유지하고, Replay 수집량과 사용자 Post Content 보호는 별도의 Cloud 설정과 PostHog 표준 masking marker로 통제한다.
- 공개 key·host가 완전한 Web build에서만 초기화하고 Docker·workflow 주입 경계를 일치시킨다.
- 지원 release·수동 SHA rebuild·rollback 경로가 OpenPanel 없이 동작하도록 전환 후 build·deployment 설정을 정리한다.
- PostHog Web SDK가 Android·iOS graph에 유입되지 않음을 확인한다.

**Non-Goals:**

- PostHog 표준 pageview·autocapture·metadata·remote config를 앱 코드로 재구현하는 것
- 기능별 새 제품 event·dashboard, opt-out UI와 Account 분석 데이터 삭제
- Native PostHog SDK
- PROD-839에서 Web runtime·패키지·테스트를 다시 제거하거나 PostHog Cloud 최초 구성을 담당하는 것
- 이번 PR만으로 개인정보 처리방침·운영 통합, replay acceptance, production acceptance 또는 OpenSpec archive를 완료하는 것

## Implementation Guidance

### Current Constraints

- 공개 key와 host 중 하나라도 없으면 SDK를 초기화하지 않아야 한다.
- `posthog-js` value import는 `.web` platform 경계에만 있어야 한다.
- installed SDK가 지원하는 최신 권장 baseline은 `defaults: '2026-05-30'`이다.
- PostHog의 기본 identity는 localStorage와 cookie에 지속되므로 module-local Account cache는 reload 뒤 authority가 될 수 없다.
- Search query `q`와 기본 광고 click ID는 `mask_personal_data_properties: false`를 명시해 standard event payload의 current/referrer/session URL에서 원문으로 유지한다. referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존한다.
- `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook은 두지 않는다. 앱 소유 custom event에는 검색어 원문을 별도 property로 추가하지 않는다.
- Cloud project는 remote config, autocapture, performance, heatmap, console과 Replay 설정을 이미 제공한다. 앱이 이를 `advanced_disable_flags`, 전면 denylist 또는 disable option으로 막으면 Cloud 계약이 작동하지 않는다.
- Replay Cloud의 Normal privacy mode는 input을 mask한다. canonical Post Content는 PostHog recorder의 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다.
- `ph-mask ph-no-capture` marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 이번 metadata 수집 결정으로 변경하지 않는다.
- PROD-819와 PROD-820이 같은 지원 release line에 병합되고 OpenPanel을 사용하는 지원 build·수동 SHA rebuild·rollback 대상이 없음을 확인하기 전에는 OpenPanel 설정을 제거하지 않는다.
- GitHub repository와 현재 배포에 사용하는 environment, 활성 runtime configuration source·운영 설정 저장소를 확인하되 조회하지 못한 범위는 설정 부재로 처리하지 않는다.
- 실제 설정값·credential·사용자 데이터는 제거 전후 기록과 handoff에 남기지 않는다. 외부 variable 삭제는 과거 image를 바꾸지 않으므로 지원 대상의 source·digest·rollback 경로를 별도로 검증한다.

### Recommended Approach

1. Web adapter는 `posthog.init(key, { api_host, defaults: '2026-05-30', mask_personal_data_properties: false })`를 중심으로 초기화한다. test automation 전용 option이나 환경 변수 분기를 포함해 표준 기능 disable, persistence override, property denylist, `custom_personal_data_properties`와 `before_send` sanitizer를 두지 않는다.
2. PostHog SDK가 browser history와 DOM에서 만드는 pageview·pageleave·autocapture 및 `$current_url`, `$pathname`, referrer/session-entry와 protocol metadata를 유지한다. Search `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존한다. `$pageview`는 app-owned typed event taxonomy에서 제거한다.
3. 공용 custom event API는 event별 property 타입을 유지하고 typed properties를 `capture`에 그대로 전달한다. runtime projection, unknown-event registry나 generic property sanitizer를 추가하지 않는다.
4. identity 전환은 공개 SDK property를 조회한다. 현재 Account는 `get_property('$user_id')`로, persisted distinct identity는 `get_distinct_id()`로 확인한다. 같은 identified Account는 reset하지 않고 SDK에 identify를 맡기고, 다른 identified Account는 reset 후 identify한다. guest 전환은 공개 property에 identified Account가 남아 있을 때 reset한다.
5. canonical Post Content root에는 Web recorder가 인식하는 `ph-mask ph-no-capture` class를 제공한다. `ph-mask`는 Replay masking, `ph-no-capture`는 autocapture 제외이며 둘 다 PostHog 표준 privacy control이다.
6. PostHog Cloud는 Replay 10% sampling, production `kos.moe` origin 조건, Normal input masking과 30일 retention을 배포 전에 적용한다. 실제 project token이나 credential은 저장소·문서·로그에 복제하지 않는다.
7. 초기화·capture·identify·reset의 synchronous failure와 endpoint failure는 제품 렌더링, 인증, navigation과 mutation에서 격리한다.
8. unit test는 minimal config, `mask_personal_data_properties: false`, typed passthrough, 공개 identity transition과 Post Content marker를 검증한다. Playwright fixture는 PostHog bot filter를 우회하는 production option 대신 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 context에 설정한다. browser test는 표준 `/e/` event payload에서 current/referrer/session URL의 `q`, current/referrer의 기본 click ID, 검색엔진 referrer의 파생 검색·캠페인 metadata와 UTM이 원문으로 유지되는지 확인하고 remote config 요청은 별도로 확인한다. 현재 lockfile `posthog-js@1.417.4`에서 E2E로 직접 확인한 `ph_keyword`와 SDK source prefix 로직으로 확인한 `$initial_ph_keyword`, `$session_entry_ph_keyword` 같은 개별 이름은 버전 종속적 검증 예시일 뿐 제품 계약이나 authority가 아니다. 실제 reload를 포함한 identity 순서, `ph-no-capture` outbound marker와 설정 누락 no-op 및 endpoint failure의 fail-open도 검증한다.

9. PROD-819·PROD-820의 최신 merge·release 반영과 지원 build·수동 SHA rebuild·rollback 대상별 OpenPanel 소비 여부를 확인한다. PR 순서나 CI 통과만으로 release 전환을 대체하지 않는다.
10. 조건이 충족되면 `Dockerfile`의 OpenPanel ARG·ENV와 development·production workflow의 OpenPanel build arg를 함께 제거하고 PostHog 공개 key·host 주입은 유지한다.
11. GitHub repository·현재 배포 environment와 활성 runtime configuration source·운영 설정 저장소의 OpenPanel 전용 항목을 이름·범위·존재 여부로 비교한다. 확인하지 못한 범위는 정리 완료로 기록하지 않는다.
12. 가짜 PostHog 공개 설정만 사용한 production-equivalent Web build·image inspection과 지원 rebuild·rollback 검증으로 OpenPanel 비의존을 확인한다. 설정 누락 no-op과 기존 analytics 회귀도 함께 확인한다.
13. 제거 전후 대상 목록·적용 환경·검증 결과와 남은 production 확인 사항을 실제 값 없이 PROD-795에 인계한다. 이 결과만으로 PROD-741 Replay acceptance나 PROD-575 production acceptance·archive를 완료 처리하지 않는다.

공식 대조 표면은 PostHog JS [`PostHogConfig`](https://posthog.com/docs/libraries/js/config)와 [Session Replay privacy](https://posthog.com/docs/session-replay/privacy)다.

### Allowed Alternatives

- Post Content는 `ph-mask ph-no-capture` class 대신 동등한 PostHog 표준 selector 조합을 사용할 수 있다. Native prop 오염이 없고 browser replay masking과 autocapture 제외가 같은 수준으로 증명되어야 한다.
- PostHog singleton을 직접 감싸거나 작은 injected client interface를 둘 수 있다. 공용 caller가 Web SDK type에 의존하지 않고 Native graph가 분리되면 동등하다.

### Known Traps

- 수동 route observer와 `capture_pageview: 'history_change'`를 함께 두면 pageview가 중복된다.
- 표준 URL/referrer/session metadata를 `before_send`, property denylist나 runtime allowlist로 제거하거나 선택적으로 바꾸면 현재 Web analytics 수집 계약이 깨진다.
- `advanced_disable_flags` 또는 external dependency loading 차단은 remote config와 Replay를 막는다.
- `persistence: 'memory'`, `$user_state`·`identified` 같은 내부 persistence 값과 module-local identity cache는 reload 뒤 Account 연결과 reset 판정을 잃거나 SDK 호환성을 깨뜨린다. 공개 `$user_id`와 `get_distinct_id()`를 사용하고 실제 browser reload로 검증한다.
- E2E를 위해 production adapter에 user-agent override나 test-only 환경 변수 분기를 추가하면 제품 초기화 계약이 테스트 사정에 종속된다.
- 모든 text를 mask하면 replay 진단 가치가 급격히 낮아진다. input과 canonical Post Content를 PostHog 표준 경계로 선택하고, Post Content는 autocapture도 제외한다.
- `mask_personal_data_properties`의 SDK 기본값에 기대지 않고 `false`를 명시한다. dependency upgrade 때 `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`가 계속 보존되는지 outbound test로 확인한다.
- PostHog와 OpenPanel을 dual-write하면 개인정보 고지와 장애 대응 계약이 두 개가 된다.

## Risks / Trade-offs

- [표준 metadata에 자유 형식 Search `q`와 click ID가 포함됨] → 현재 검색 결과는 공개 Profile handle로 한정돼 민감한 검색 가능성이 낮고 `q`는 제품 분석 가치가 있다고 판단한다. 입력 자체는 자유 형식이므로 예상하지 못한 개인정보 입력 가능성은 남는다. 실제 수집 surface를 PROD-795 개인정보 고지와 runbook에 반영하고, 게시물·본문·전문 검색 또는 더 넓은 검색 의미를 도입하기 전에 이 결정을 재검토한다. Replay는 별도로 Cloud origin·input masking과 Post Content marker로 통제한다.
- [SDK defaults가 시간에 따라 바뀜] → 권장 date baseline을 명시하고 upgrade 시 PostHog migration notes와 outbound browser test를 함께 갱신한다.
- [Replay가 production traffic 비용을 만듦] → Cloud sampling을 10%로 고정하고 PROD-741·PROD-575에서 실제 수집량과 품질을 검증한다.
- [Web dependency가 Native graph에 유입될 수 있음] → `.web` value import와 Native export/dependency scan을 required verification으로 둔다.
- [설정/전송 실패를 숨기면 분석 누락을 즉시 알기 어려움] → 제품 흐름은 fail-open으로 유지하고 운영 관측과 production acceptance는 PROD-795·PROD-575가 소유한다.

## Migration Plan

1. PROD-820에서 Cloud 보호 설정과 공개 build/deployment 주입을 production 배포 전에 준비한다.
2. PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환한다.
3. PROD-839가 지원 release·rebuild·rollback 경로와 외부 설정을 확인한 뒤 저장소 build/deployment 주입을 정리한다.
4. PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다.
5. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
6. PROD-575가 production acceptance 후 old OpenPanel change를 `--skip-specs`로 archive하고 이 change를 정상 archive한다.

긴급 비활성화는 production build의 공개 key 또는 host를 제거해 adapter를 no-op으로 만든다. OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

없음.
