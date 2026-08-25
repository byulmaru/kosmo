## Context

현재 `apps/app`의 analytics 경계는 `client.web.ts`가 `@openpanel/web`을 생성하고, 공용 `client.ts`가 Native no-op을 제공하는 platform file 구조다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 clear한다. Profile 생성·선택, Post 생성, Follow와 검색 caller는 이미 공용 `trackAnalytics`를 사용한다.

PROD-819는 이 호출부를 새 기능 이벤트로 확장하지 않고 PostHog Web runtime으로 옮긴다. 공개 project host/key와 Session Replay retention 지속 계약은 PROD-820, 개인정보 처리방침·runbook과 cross-slice 검증은 PROD-795가 소유하며 PROD-795가 PROD-741을 block한다. PROD-795 이후의 production replay 활성화·마스킹·초기 30일 검증은 PROD-741, production acceptance와 두 OpenSpec change의 archive 순서는 PROD-575가 소유한다. 초기 기반은 설정이 없으면 실제로 비활성화되어야 하므로 PROD-819와 PROD-820을 먼저 개발·검증하고, PROD-741은 PROD-795 activation gate 이후에만 replay를 켠다.

## Goals / Non-Goals

**Goals:**

- 기존 공용 analytics API와 성공 event caller를 유지하면서 provider를 PostHog로 교체한다.
- 자동 수집이 아니라 중앙 adapter의 event별 허용 목록으로 device를 떠나는 app data를 통제한다.
- Expo Router의 실제 URL 값이 아닌 안정적인 route template으로 pageview를 중복 없이 수집한다.
- Account identity 전환을 작은 상태 기계로 관리하고 모든 SDK 실패를 제품 흐름에서 격리한다.
- Web-only SDK가 Android·iOS bundle에 유입되지 않음을 자동화로 확인한다.
- 초기 replay-off 기반과 후속 production canonical origin 10% replay activation, masking·retention 검증의 경계를 명시한다.

**PROD-819 implementation slice Non-Goals:**

- PostHog Cloud project 생성, 실제 key·host 확정, Docker·GitHub Actions 주입
- 개인정보 처리방침·운영 runbook 갱신과 production-equivalent cross-slice 검증
- production event acceptance, OpenSpec archive와 OpenPanel 운영 데이터 migration
- 새 제품 event, opt-out UI, Account 분석 데이터 자동 삭제와 Native SDK
- PROD-819 implementation에서 Session Replay를 활성화하거나 masking·retention을 운영 설정하는 것. 후속 replay activation·masking·초기 30일 검증은 PROD-741, Cloud·retention 지속 계약과 설정 증거는 PROD-820이 소유한다.

## Implementation Guidance

### Current Constraints

- `client.web.ts`는 module singleton과 마지막 Account ID를 보존한다. 단순 provider import 교체만 하면 Account A→B 전환에서 이전 PostHog identity가 연결되거나 같은 Session render마다 identify될 수 있다.
- 현재 `trackAnalytics(name, Record<string, unknown>)`는 임의 event와 property를 허용한다. PostHog SDK에 값을 넘긴 뒤 blacklist로 지우는 방식은 승인되지 않은 key가 새 caller에서 조용히 유출될 수 있다.
- PostHog Web SDK는 autocapture와 session recording을 포함한 여러 자동 기능을 제공하고 기본값은 SDK release에 따라 달라질 수 있다. 필요한 비활성화 option을 명시하고 constructor/config test로 고정해야 한다.
- `usePathname()`은 동적 segment의 실제 값을 포함할 수 있고 search parameter는 별도 변화한다. Profile handle, Post ID, 검색어 또는 fragment를 pageview identity로 사용하면 최소 수집과 낮은 cardinality를 만족하지 못한다.
- `posthog-js`는 Web package지만 workspace dependency에는 공통으로 선언된다. `.web` platform 경계 밖에서 value import하면 Metro가 Native graph에 포함할 수 있다.
- PROD-820이 공개 host/key의 build-time contract를 소유한다. 이번 slice는 실제 값이나 secret을 저장하지 않고, 두 값이 완전할 때만 초기화되는 소비자 경계만 구현한다.

### Recommended Approach

1. 현재 platform adapter 구조를 유지하고 Web file만 `posthog-js`를 value-import한다. 공용 Native file은 같은 API의 no-op을 계속 제공한다. 기존 `clearAnalytics` public surface를 유지하더라도 Web 구현은 PostHog `reset()` 의미로 매핑할 수 있다.
2. Web adapter 초기화는 공개 project key와 ingestion host가 모두 있을 때만 수행한다. 초기 PostHog 기반 단계(PROD-819·PROD-795)에서는 automatic pageview·pageleave, element autocapture, session replay와 다른 자동 telemetry를 명시적으로 끄고, `person_profiles`는 identified Account에만 profile을 만드는 경계로 둔다. 후속 PROD-741 활성화 단계의 10% replay와 masking·retention은 별도 gate에서 검증한다. 실제 option 이름은 구현 시 설치된 `posthog-js` type과 공식 source에 대조한다.
3. app-owned event sanitizer를 SDK 호출 앞에 둔다. event name별 switch, discriminated union 또는 동등한 registry로 승인된 property만 새 object에 복사하고 unknown event는 drop한다. blacklist 기반 재귀 mutation은 사용하지 않는다. SDK `before_send`를 최종 방어선으로 추가할 수 있지만, project token·distinct ID·session metadata 같은 SDK-required key를 일반적인 이름 pattern으로 제거하지 않아야 한다.
4. route observer는 Expo Router의 route file pattern을 나타내는 segment 정보를 사용해 group segment를 제거하고 안정적인 template을 만든다. 마지막으로 보낸 template을 기억해 최초 route와 template 변화에만 `$pageview`를 capture한다. 실제 pathname, query와 fragment는 payload source로 사용하지 않는다.
5. identity bridge는 `anonymous | identified(accountId)` 상태만 관리한다. anonymous→A는 identify, A→A는 no-op, A→B는 reset 후 identify, A→anonymous는 reset으로 처리한다. Profile 선택은 Account identity를 바꾸지 않는다.
6. 초기화·capture·identify·reset의 synchronous throw와 SDK가 노출하는 asynchronous failure를 adapter 안에서 best-effort로 흡수한다. caller는 analytics 결과를 await하거나 사용자 오류 UI에 합치지 않는다.
7. 단위 검증은 fake PostHog client로 config, sanitizer, route dedupe, identity transition과 failure isolation을 각각 증명한다. Web 브라우저 검증은 fake 공개 설정과 interception 가능한 endpoint를 사용해 route navigation당 payload 한 건, 민감 값 부재, 설정 누락·전송 실패 시 사용자 흐름 유지와 OpenPanel request 부재를 확인한다. Native export/dependency graph 검증은 PostHog module 문자열과 runtime module이 bundle에 없는지 확인한다.

공식 SDK/API 대조 표면은 PostHog JS의 [`PostHogConfig`/default config source](https://github.com/PostHog/posthog-js/blob/main/packages/browser/src/posthog-core.ts)와 Expo Router의 [`useSegments`·route hooks`](https://docs.expo.dev/versions/latest/sdk/router/)다.

### Allowed Alternatives

- route template은 중앙 provider component, root layout의 observer 또는 navigation state listener에서 계산할 수 있다. 실제 URL 값 배제, 최초 1회와 template별 dedupe가 동일하게 검증되면 위치는 고정하지 않는다.
- sanitizer는 event별 함수, typed map 또는 exhaustive switch로 구현할 수 있다. unknown event/property가 기본 허용되는 구조는 허용하지 않는다.
- PostHog singleton을 직접 감싸거나 작은 injected client interface를 둘 수 있다. 공용 caller가 Web SDK type에 의존하지 않고 Native graph가 분리되면 동등하다.

### Known Traps

- `capture_pageview: 'history_change'` 또는 broad autocapture에 맡기면 실제 URL·DOM 값과 중복 pageview가 전송될 수 있다.
- `usePathname()` 결과를 그대로 보내거나 query만 제거하면 동적 handle·ID가 남는다.
- 모든 property를 generic pattern으로 지우는 `before_send`는 PostHog 전송에 필요한 `token`이나 `distinct_id`까지 제거할 수 있다. app property를 capture 전에 새 object로 allowlist하고, SDK metadata를 별도 취급한다.
- Account ID가 바뀔 때 `identify(newId)`만 호출하면 서로 다른 Account history가 연결될 수 있다. reset 순서를 생략하지 않는다.
- PostHog와 OpenPanel을 dual-write하거나 rollback을 위해 OpenPanel code를 남기면 개인정보·운영 계약이 두 개가 된다.
- Web 단위 테스트 통과를 Native bundle 비포함 또는 브라우저 request payload 검증으로 일반화하지 않는다.

PostHog provider behavior note (non-normative): Session Replay recording이 retention 만료 시점에 즉시 삭제되지 않을 수 있다. 여기서 30일은 제품 retention 설정값이며, UI에서 정확히 30일에 삭제가 완료된다는 SLA로 해석하지 않는다.

## Risks / Trade-offs

- [Route template 계산이 Expo Router upgrade에서 달라질 수 있음] → 대표 static·dynamic·group route fixture와 browser navigation test로 template 결과를 고정한다.
- [명시적 allowlist가 새 event property를 조용히 버릴 수 있음] → unknown event는 drop하고 개발·test에서 exhaustive taxonomy 검증을 수행하며, 새 event는 담당 Linear/OpenSpec과 allowlist를 함께 변경한다.
- [PostHog SDK default 변화가 자동 수집을 다시 켤 수 있음] → privacy-sensitive option을 명시하고 설치된 version의 config snapshot과 outbound browser test를 유지한다.
- [Web dependency가 Native graph에 유입될 수 있음] → value import를 `.web` 경계에 한정하고 Native export/dependency scan을 required verification으로 둔다.
- [PROD-819과 PROD-820의 공개 config 이름이 달라질 수 있음] → 이번 design은 key+host 의미만 고정하고 exact environment variable 이름은 두 slice가 같은 shared change에서 정렬해 검증한다.
- [설정/전송 실패를 숨기면 analytics 누락을 즉시 알기 어려움] → 제품 흐름은 fail-open으로 유지하고 운영 관측과 production acceptance는 PROD-795·PROD-575가 별도로 소유한다.

## Migration Plan

1. PROD-819에서 PostHog adapter, sanitizer, route·identity bridge와 초기 replay-off 자동화만 구현한다. 실제 production key가 없어도 unit·browser fixture로 검증한다.
2. 같은 slice에서 `@openpanel/web` dependency, OpenPanel runtime·test 참조를 제거한다. production에 dual-write 기간을 두지 않는다.
3. PROD-820이 Cloud US project, build/deployment 공개 config와 Session Replay 초기 30일 retention 설정·증거를 제공한다. retention 변경은 지원 범위 내 운영 설정으로만 허용하고 실제 변경값·적용 시점·변경 근거·당시 적용 플랜 또는 지원 범위 근거를 기록하며, 더 긴 범위를 지원하는 plan upgrade만으로 자동 연장하지 않는다.
4. PROD-795가 production-equivalent build에서 초기 replay-off, Cloud/build/retention 증거와 개인정보·운영 문서를 cross-slice 검증하고 PROD-741 activation을 block한다.
5. PROD-741이 PROD-795 gate 이후 masking 검증을 완료한 뒤 production canonical origin에 Web Session Replay를 10% sample로 활성화하고, 초기 30일 retention과 실제 replay redaction을 검증한다. 추가 custom selector는 완료 조건이 아니다.
6. PROD-575가 actual production acceptance를 완료하고, `add-web-openpanel-product-analytics`를 `--skip-specs` archive한 뒤 이 change를 정상 archive한다.

즉시 비활성화가 필요하면 production build에서 공개 key 또는 host를 제거해 adapter를 no-op으로 만든다. 코드 rollback이 필요하면 마지막 정상 release로 되돌리되 OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

없음. 공개 environment variable의 exact 이름과 browser fixture의 구체 위치는 specs를 바꾸지 않는 implementation detail이며 PROD-820 integration과 repository 관례에 맞춰 정렬한다.
