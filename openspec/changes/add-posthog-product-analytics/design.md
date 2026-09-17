## 이 문서의 사용 범위

2026-09-18 최신 main에 맞춘 working note다. 아래 권장 접근과 과거 구현 설명은 현재 canonical·Linear의 결과를 만족하는 다른 구현을 막지 않는다. 별도 Spec 승인·모든 task 수행·archive를 구현이나 PR readiness의 전제조건으로 사용하지 않는다.

## Context

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event metadata 수집과 Session Replay privacy는 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮겼고, PROD-820은 PostHog Cloud와 전환기 build/deployment 공개 설정을 제공했다. 현재 공개 설정은 PROD-891의 채널 설정표·`/channel.js`, release는 PROD-833의 SHA 이미지 승격 계약을 따른다. PROD-795는 실제 수집 surface와 개인정보 처리방침·runbook을 통합하고, PROD-741은 선행 적용된 Replay의 실제 품질을, PROD-575는 production acceptance와 archive를 소유한다.

PROD-839는 두 선행 변경이 같은 지원 release line에 반영된 뒤에도 남아 있는 OpenPanel build·deployment 주입과 외부 설정을 정리한다. 지원 build·수동 SHA release·rollback 대상의 OpenPanel 소비 여부와 활성 설정 범위를 먼저 확인하고, 근거가 충분할 때만 저장소와 GitHub 설정을 제거한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유하고, `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 담당한다. PROD-795·PROD-741·PROD-575가 소유한 개인정보·운영 통합, Replay acceptance, production acceptance와 archive는 이 change가 대신 완료하거나 archive하지 않는다.

현재 metadata 수집 결정의 근거는 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)이다. 사용자 정혜주(HJSmiley)는 기존 마스킹 정책을 철회하고 Search `q`, 기본 click ID와 referrer·session에서 파생되는 검색·캠페인 metadata를 표준 metadata로 수집하기로 결정했다. 2026-08-31 마스킹 승인은 Superseded 상태로 이력을 보존하며, 새 결정도 GitHub reviewer signoff나 production acceptance를 대신하지 않는다.

## Goals / Non-Goals

**Goals:**

- PostHog 공식 권장 defaults와 표준 자동 이벤트·metadata·persistence·remote config를 그대로 사용한다.
- 앱 소유 경계를 typed custom event, 공개 SDK identity property 기반 identify/reset과 fail-open adapter로 제한한다.
- standard event payload의 Search `q`와 click metadata를 SDK 표준 URL·referrer·session metadata로 유지하고, Replay 수집량과 사용자 Post Content 보호는 별도의 Cloud 설정과 PostHog 표준 masking marker로 통제한다.
- 선택된 채널의 공개 key·host가 모두 있을 때만 초기화한다. 현재 채널 설정·canonical build·SHA digest 승격 경계를 유지한다.
- 지원 release·수동 SHA release·rollback 경로가 OpenPanel 없이 동작하도록 전환 후 build·deployment 설정을 정리한다.
- PostHog Web SDK가 Android·iOS graph에 유입되지 않음을 확인한다.

**Non-Goals:**

- PostHog 표준 pageview·autocapture·metadata·remote config를 앱 코드로 재구현하는 것
- 기능별 새 제품 event·dashboard, opt-out UI와 Account 분석 데이터 삭제
- Native PostHog SDK
- PROD-839에서 Web runtime·패키지·테스트를 다시 제거하거나 PostHog Cloud 최초 구성을 담당하는 것
- 이번 PR만으로 개인정보 처리방침·운영 통합, replay acceptance, production acceptance 또는 OpenSpec archive를 완료하는 것

## Implementation Guidance

### Current Constraints

- 현재 설정·배포 authority는 [PROD-839의 2026-09-08 Issue Gate 정렬 승인](https://linear.app/byulmaru/issue/PROD-839), [PROD-891](https://linear.app/byulmaru/issue/PROD-891), [PROD-833](https://linear.app/byulmaru/issue/PROD-833)과 `docs/operations/production-release.md`다. 과거 browser runtime config 제안 폐기와 현재 `/channel.js`·SHA 이미지 승격 채택을 구분한다.
- 2026-09-18 source 확인 (`main@c1de28da0d2ce01a36ae4b72e670d6993b9fc0c8`): 채널 설정 전환 `af50250ef`와 수집 중단 `3592b53ac` 이후 `apps/app/src/config/public.ts`의 dev·prod PostHog key·host는 누락 상태다. `Dockerfile`과 canonical build는 analytics build-time 입력을 사용하지 않는다. 이는 source 관측이며 실제 배포·외부 설정 부재 증거가 아니다.
- PROD-839를 위 최신 main 위로 리베이스했고 기존 스펙 두 commit의 내용은 `git range-diff`로 보존을 확인했다. Web analytics adapter·현재 prod 수집 중단은 유지되며 Native 채널 선택은 기존 `getNativeDeploymentChannel` 경로를 따른다. Native 분석은 기존 no-op이다.
- 최신 `.github/workflows/production-release.yml`의 Native OTA export는 `canonical_preflight` 이후 target SHA로 실행되고, publish는 production 배포와 해당 platform export 성공을 기다린다. Web image는 기존 digest를 승격한다. OTA export의 checkout·bundle 생성은 Web image 재빌드가 아니다. OTA의 발행·실기기 검증은 PROD-335 등 기존 담당 범위이며 PROD-839에 추가하지 않는다.
- `docs/operations/production-release.md`의 source checkout·build 부재는 Web image 배포 job 경계로 읽는다. `docs/operations/expo-ota.md`의 Production export 시작 순서는 현재 workflow의 병렬 export와 아직 다르므로 운영 담당자에게 인계할 때 이 차이를 알린다. 이 문서 차이를 OpenPanel cleanup의 새 blocker나 OTA 재설계 과제로 확대하지 않는다.

- 공개 key와 host 중 하나라도 없으면 SDK를 초기화하지 않아야 한다.
- `posthog-js` value import는 `.web` platform 경계에만 있어야 한다.
- installed SDK가 지원하는 최신 권장 baseline은 `defaults: '2026-05-30'`이다.
- PostHog의 기본 identity는 localStorage와 cookie에 지속되므로 module-local Account cache는 reload 뒤 authority가 될 수 없다.
- Search query `q`와 기본 광고 click ID는 `mask_personal_data_properties: false`를 명시해 standard event payload의 current/referrer/session URL에서 원문으로 유지한다. referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존한다.
- `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook은 두지 않는다. 앱 소유 custom event에는 검색어 원문을 별도 property로 추가하지 않는다.
- Cloud project는 remote config, autocapture, performance, heatmap, console과 Replay 설정을 이미 제공한다. 앱이 이를 `advanced_disable_flags`, 전면 denylist 또는 disable option으로 막으면 Cloud 계약이 작동하지 않는다.
- Replay Cloud의 Normal privacy mode는 input을 mask한다. canonical Post Content는 PostHog recorder의 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다.
- `ph-mask ph-no-capture` marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 이번 metadata 수집 결정으로 변경하지 않는다.
- PROD-819와 PROD-820이 같은 지원 release line에 병합되고 OpenPanel을 사용하는 지원 build·수동 SHA release·rollback 대상이 없음을 확인하기 전에는 OpenPanel 설정을 제거하지 않는다.
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

9. PROD-819·PROD-820의 같은 지원 release line 반영과 지원 canonical build·수동 SHA release·rollback을 source full SHA·build run·image digest별로 확인한다. 지원되는 canonical rebuild가 있으면 포함한다. PR 순서나 CI 통과만으로 release 전환을 대신하지 않는다.
10. 현재 Dockerfile·canonical Docker Build·dev·production workflow의 OpenPanel 전용 참조를 확인한다. 이미 제거된 ARG·ENV·build arg·development empty no-op은 선행 SHA와 현재 상태를 기록하고, gate를 충족한 뒤 실제 남은 참조만 제거한다.
11. GitHub repository·사용 중인 environment와 활성 runtime configuration source·운영 설정 저장소의 전용 설정을 이름·범위·환경·존재 여부로 비교한다. 조회에 실패했거나 확인하지 못한 범위가 있으면 cleanup을 완료로 기록하지 않는다.
12. 격리된 가짜 PostHog 설정 네 조합으로 활성화·누락 no-op을 확인하고, 현재 prod 채널의 무전송 보존을 별도로 검증한다. Production-equivalent Web export·image inspection과 지원 release·rollback 근거를 함께 확인한다. Web image를 Production에서 다시 build·push하지 않는다. Native OTA export와 publish는 별도 경로로 구분한다.
13. 제거 전후 목록·환경·검증 결과, 운영 문서의 잔여 참조와 남은 production 확인 사항을 실제 값 없이 PROD-795에 인계하고 PROD-575가 사용할 근거를 식별한다. PROD-795의 Done 상태로 통합 증거를 생략하지 않는다.

공식 대조 표면은 PostHog JS [`PostHogConfig`](https://posthog.com/docs/libraries/js/config)와 [Session Replay privacy](https://posthog.com/docs/session-replay/privacy)다.

### Allowed Alternatives

- PROD-839는 실제 잔여 참조가 없다면 source를 고치지 않고 선행 SHA와 현재 확인 결과로 제거 상태를 증명할 수 있다. 설정 inventory는 CLI 또는 API로 조회하되 같은 범위와 값 없는 전후 증거를 제공한다.

- Post Content는 `ph-mask ph-no-capture` class 대신 동등한 PostHog 표준 selector 조합을 사용할 수 있다. Native prop 오염이 없고 browser replay masking과 autocapture 제외가 같은 수준으로 증명되어야 한다.
- PostHog singleton을 직접 감싸거나 작은 injected client interface를 둘 수 있다. 공용 caller가 Web SDK type에 의존하지 않고 Native graph가 분리되면 동등하다.

### Known Traps

- 과거 build-time task를 현재 주입 복구 지시로 해석하지 않는다. Source 검색은 조사 근거이며 실행 검증을 대신하는 문자열 검사 테스트를 추가하지 않는다. Workflow 문법에는 표준 validator를 사용한다.
- SHA tag는 재빌드로 바뀔 수 있다. 성공한 build run과 현재 tag digest를 확인했다는 사실만으로 두 artifact의 불변 결합이나 Dev·Production digest 일치를 주장하지 않는다. 실제 배포와 미검증 범위는 따로 기록한다.

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

1. PROD-820의 Cloud 보호와 전환기 공개 설정 준비 이력을 확인한다. 현재 전달 경로는 PROD-891의 채널 설정과 PROD-833의 canonical build·SHA 이미지 승격을 따른다.
2. PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환한다.
3. PROD-839가 같은 지원 release line과 지원 canonical build·SHA release·rollback 비의존을 확인한 뒤 남은 source·외부 설정을 정리한다. 이미 제거된 참조는 이력으로 증명한다. 삭제 전 근거가 부족하면 남은 설정을 보존한다. 삭제 후 누락된 지원 의존성이 발견되면 cleanup 완료를 철회하고 정확한 범위의 복구를 운영 담당자에게 인계한다. 수집 재활성화·production 배포·과거 image 삭제·지원 정책 변경은 이 cleanup으로 승인되지 않는다.
4. PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다.
5. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
6. PROD-575가 production acceptance 후 old OpenPanel change를 `--skip-specs`로 archive하고 이 change를 정상 archive한다.

현재 prod 채널의 key·host 누락에 따른 수집 중단을 보존한다. 공개 설정 변경이 필요하면 채널 설정표를 수정한 canonical build와 승인된 SHA release 절차를 따른다. PROD-839는 재활성화나 production 배포를 수행하지 않으며 OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

없음.
