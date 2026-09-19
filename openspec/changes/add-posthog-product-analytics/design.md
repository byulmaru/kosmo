## Context

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event metadata 수집과 Session Replay privacy는 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮겼고, PROD-820은 PostHog Cloud와 전환기 build/deployment 공개 설정을 제공했다. 현재 공개 설정은 PROD-891의 채널 설정표·`/channel.js`, release는 PROD-833의 SHA 이미지 승격 계약을 따른다. PROD-795는 실제 수집 surface와 개인정보 처리방침·runbook을 통합하고, PROD-741은 선행 적용된 Replay의 실제 품질을, PROD-575는 production acceptance와 archive를 소유한다.

PROD-839는 두 선행 변경이 같은 지원 release line에 반영된 뒤에도 남아 있는 OpenPanel build·deployment 주입과 외부 설정을 정리한다. 지원 build·수동 SHA release·rollback 대상의 OpenPanel 소비 여부와 활성 설정 범위를 먼저 확인하고, 근거가 충분할 때만 저장소와 GitHub 설정을 제거한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유했고, `PROD-819` / PR #653은 그 계약을 소비하는 Web runtime 구현을 담당했다. 두 이슈와 PR이 완료·병합됐더라도 PROD-795·PROD-741·PROD-575가 소유한 개인정보·운영 통합, Replay acceptance, production acceptance와 archive까지 완료된 것은 아니다.

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

- 현재 설정·배포 authority는 [PROD-891](https://linear.app/byulmaru/issue/PROD-891), [PROD-833](https://linear.app/byulmaru/issue/PROD-833)과 `docs/operations/production-release.md`다. PROD-839는 이 경계를 재설계하거나 Native OTA 검증을 소유하지 않는다.

- 공개 key와 host 중 하나라도 없으면 SDK를 초기화하지 않아야 한다.
- `posthog-js` value import는 `.web` platform 경계에만 있어야 한다.
- installed SDK가 지원하는 최신 권장 baseline은 `defaults: '2026-05-30'`이다.
- PostHog의 기본 identity는 localStorage와 cookie에 지속되므로 module-local Account cache는 reload 뒤 authority가 될 수 없다.
- Search query `q`와 기본 광고 click ID는 `mask_personal_data_properties: false`를 명시해 standard event payload의 current/referrer/session URL에서 원문으로 유지한다. referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존한다.
- `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook은 두지 않는다. 앱 소유 custom event에는 검색어 원문을 별도 property로 추가하지 않는다.
- Cloud project는 remote config, autocapture, performance, heatmap, console과 Replay 설정을 이미 제공한다. 앱이 이를 `advanced_disable_flags`, 전면 denylist 또는 disable option으로 막으면 Cloud 계약이 작동하지 않는다.
- Replay Cloud의 Normal privacy mode는 input을 mask한다. canonical Post Content는 PostHog recorder의 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다.
- `ph-mask ph-no-capture` marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 이번 metadata 수집 결정으로 변경하지 않는다.
- PROD-819와 PROD-820 결과가 같은 지원 release line에 포함되고 OpenPanel을 사용하는 지원 build·수동 SHA release·rollback 대상이 없음을 확인하기 전에는 OpenPanel 설정을 제거하지 않는다.
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

## PROD-795 개인정보·운영 통합 설계

### 현재 기준과 관측값

이 절에서는 [Linear `PROD-795`](https://linear.app/byulmaru/issue/PROD-795)의 `2026-08-31 명세 구체화 범위 확인`을 구체적으로 다룬다. PR #685의 shared spec과 PR #653의 runtime을 바탕으로 하며 SDK·Cloud·build 계약은 새로 결정하지 않는다. 2026-09-03 KST 기준으로 PROD-820과 PROD-819는 모두 Done이다. PR #685의 merge commit `47fb36f52`와 그 뒤에 병합된 PR #653의 merge commit `2176b7e38`은 `main`과 현재 PROD-795 브랜치의 ancestor다. 구현과 통합 검증에서는 두 merge commit을 모두 포함한 실제 source와 build artifact를 기록한다.

- PR #714의 공개 개인정보 화면은 PostHog 제공자·처리 위치, 자동 수집·브라우저 저장, 보호 범위, 보존·권리 행사를 반영한다. 현재 채널 설정의 key·host 누락으로 신규 수집은 중단된 상태이며, 공개 고지는 재개 시 적용할 처리 범위와 이를 구분한다. `/privacy`와 기존 정책 문서 진입은 유지한다. OpenPanel 운영 문서 전환과 통합 검증은 후속 범위다.
- 2026-09-20 동기화 기준 main에는 PROD-839의 PR #733(`b2996ba9a`)이 병합됐다. Source 주입 제거·names-only inventory와 외부 설정 삭제·지원 artifact 검증은 구분하며, 그룹 9의 남은 operational follow-up을 완료로 바꾸지 않는다.
- 2026-08-31 읽기 전용 Cloud 조회로 `Kosmo Production`, `Asia/Seoul`, Replay `session_recording_sample_rate=0.10`, `session_recording_retention_period=30d`와 canonical origin URL trigger를 확인했다. 이는 설정 조회 증거이며 실제 녹화 품질을 인수한 증거는 아니다.
- 일반 이벤트는 `event_retention_months=12`, `events_retention_enforced=false`를 함께 반환했다. PostHog 모델 소스는 전자를 billing entitlement에서 동기화되는 값이라고 설명한다. 이를 이벤트의 물리적 삭제 시점이나 12개월 자동 삭제 보장으로 해석하지 않는다.
- `session_recording_masking_config=null`과 `recording_domains=null`만으로 입력 masking이 없거나 모든 origin을 허용한다고 단정하지 않는다. URL trigger, 사용 중인 SDK 버전의 기본값·원격 응답과 실제 동작을 함께 대조한다. rrweb 자체 기본값을 PostHog SDK의 최종 설정으로 대신 삼지 않는다.
- 같은 날 인증된 관리 화면에서 Replay privacy는 `Normal (mask inputs but not text/images)`로 표시됐고, network request 수집은 켜져 있었으며 header·body 수집은 꺼져 있었다. Privacy 화면의 `Discard client IP data`도 꺼져 있었다. 이 설정만으로 개별 요청·녹화의 실제 내용이나 IP 저장 결과를 확정하지 않는다.
- 조직의 Legal documents 화면에는 생성된 문서가 없었다. 이는 관리 화면에서 확인한 범위에 한정된 결과이며, 별도로 체결한 계약이 없다는 뜻은 아니다. 계약을 생성하거나 서명하지 않았다.
- 위 값은 특정 시점의 관측값이며 durable 수집 정책을 뜻하지 않는다. 실제 key·host 값과 사용자 식별자·콘텐츠, credential은 문서에 복제하지 않는다.

### 권장 작업 순서

1. 병합된 runtime·전환기 build commit `2176b7e38`·`47fb36f52`, 현재 PROD-891 채널 설정과 PROD-833 canonical build·SHA release·rollback 경로를 식별한다. PROD-839의 PR #733 병합만으로 외부 cleanup·통합 완료를 선언하지 않는다.
2. 수집 표면별 관측 결과를 먼저 정리한 다음 개인정보 화면을 수정한다. 기존 `apps/app/src/app/privacy.tsx`의 분석·위탁·국외 이전·권리 행사 절을 대상으로 하며, 2026-09-16 결정의 국외 처리 경로와 필수 고지 항목을 반영하고 시행일과 일반 이벤트 보존·삭제는 아래 미확정 항목으로 남긴다.
3. 기존 `docs/operations/openpanel.md`의 provider 전용 안내와 `production-release.md` 링크를 PostHog 운영 안내로 전환한다. 실제 삭제·장애 대응 절차를 대조하고, PROD-839 gate 전에는 지원 중인 OpenPanel 경로 안내를 제거하지 않는다. 이전 안내는 Git 이력에서 추적할 수 있게 한다.
4. 기존 unit·browser 검증은 같은 build와 source를 기준으로 재사용한다. 이미 PROD-819에서 확인한 helper 동작을 반복하기보다는 `/flags` 등 빠진 표면과 문서·운영 설정이 맞물리는 경계를 보완한다. 테스트 편의를 위해 production adapter를 바꾸지 않는다.
5. PROD-795 자체 검증 결과를 모으고, 실제 Replay 품질은 PROD-741에, production 수집 인수와 archive는 PROD-575에 인계한다. source·artifact가 바뀌면 영향을 받는 검증을 다시 확인한다.

### 수집 표면과 검증 증거

| 표면                               | 확인할 내용                                                                                                                                | 증거의 한계                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 표준 `/e/`와 custom event          | pageview·pageleave·autocapture, URL·referrer·session metadata, `q`·click ID·파생 검색·캠페인 metadata·`utm_*` 원문 수집과 typed properties | 합성 marker를 사용한 browser outbound 결과로 확인 범위를 한정한다. 다른 endpoint가 같은 metadata를 수집한다는 증거는 아니다.                        |
| `/flags`·원격 설정                 | 실제 요청의 식별자·속성 범위, 응답 설정과 필요한 외부 모듈 로딩                                                                            | 요청 발생만 확인하는 테스트로는 body의 원문 포함 여부를 증명할 수 없다. 발견한 계약 문제는 PROD-819/820으로 돌려보내고 범용 필터를 추가하지 않는다. |
| 브라우저 저장·identity             | cookie/localStorage, reload·같은 Account·다른 Account·guest 전환과 reset                                                                   | 분석 식별자와 인증 Session credential을 구분한다. identity trait의 제한을 모든 DOM·metadata의 비식별 보장으로 확대하지 않는다.                      |
| Replay·performance·heatmap·console | Cloud 설정과 실제 수집 상태, input·Post Content 보호, origin·sampling·retention                                                            | SDK 옵션, 원격 설정, outbound와 실제 recording을 구분한다. 최종 Viewer 녹화 품질은 PROD-741에 남긴다.                                               |
| 설정·장애·배포                     | 채널별 key/host 완전·부분·누락, 초기화·전송 실패 시 인증·탐색·게시, canonical build·SHA release·rollback                                   | fake endpoint나 로컬 no-op이 통과한 결과를 실제 production 수집 인수로 표시하지 않는다.                                                             |

운영 기록에는 관측일, source commit/build artifact, 환경, 설정 또는 요청 표면, 합성 데이터 사용 여부, 결과, 미검증 범위와 후속 owner를 담으면 충분하다. 새 저장소나 범용 검증 프레임워크는 만들지 않는다. raw payload와 사용자 정보는 공유 문서에 첨부하지 않는다.

### 보존·삭제·국외 처리 문구의 근거

- PostHog [DPA](https://posthog.com/dpa)는 고객 end-user 데이터에 대해 Company와 PostHog의 역할을 각각 Controller와 Processor로 구분한다. PostHog 자체 계정·웹사이트의 [Privacy Policy](https://posthog.com/privacy)를 Kosmo 분석 데이터의 처리 근거로 그대로 옮기지 않는다. 공개 DPA 설명과 실제 조직 계약·선택 리전도 구분한다.
- [Data storage](https://posthog.com/docs/privacy/data-storage)의 person·event 삭제와 [persons 문서](https://github.com/PostHog/posthog.com/blob/master/contents/docs/data/persons.mdx)에 있는 이벤트·녹화 삭제 옵션을 현재 제공자 절차와 대조한다. 비동기 삭제 요청 접수와 삭제 완료는 다르다. 이 Spec 단계에서 실제 사용자 데이터를 삭제하지 않는다.
- [Replay retention](https://github.com/PostHog/posthog.com/blob/master/contents/docs/session-replay/recording-retention.mdx)은 새 보존 설정이 이후 수집분에 적용된다고 설명한다. 플랜 상한, 실제 프로젝트 설정, 과거 녹화에 적용되는 기간과 삭제 완료 시점을 구분한다.
- [JS persistence](https://posthog.com/docs/libraries/js/persistence)는 기본 cookie·localStorage 저장을 설명한다. 실제 Kosmo SDK 설정과 대조해 고지하고, 브라우저 cookie 수명을 서버 분석 데이터 보존기간으로 쓰지 않는다.
- 설정 필드의 의미는 [공식 Team model](https://github.com/PostHog/posthog/blob/master/posthog/models/team/team.py)을 참고하되, 조회 시점의 API·플랜·실제 처리 증거를 우선한다. 이 자료는 기술적 사실의 근거이며 한국 개인정보 처리·국외 이전의 법적 근거를 대신 결정하지 않는다.
- 국외 이전 고지는 [개인정보보호위원회 안내](https://www.pipc.go.kr/np/default/page.do?mCode=D060040010)를 대조해 필요한 고지·보호 조치를 확인한다. 2026-09-16 [Linear `PROD-795`](https://linear.app/byulmaru/issue/PROD-795)의 국외 처리 고지 방식 결정에 따라 제28조의8 제1항 제3호 가목의 계약 체결·이행에 필요한 처리위탁·보관 및 이 방침 공개 경로를 적용하되, 이 결정이 실제 계약·DPA 체결 사실을 대신 증명하지는 않는다.

## Migration Plan

1. PROD-820의 Cloud 보호와 전환기 공개 설정 준비 이력을 확인한다. 현재 전달 경로는 PROD-891의 채널 설정과 PROD-833의 canonical build·SHA 이미지 승격을 따른다.
2. 완료 — PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환해 PR #653의 merge commit `2176b7e38`로 `main`에 반영했다.
3. PROD-839가 같은 지원 release line과 지원 canonical build·SHA release·rollback 비의존을 확인한 뒤 남은 source·외부 설정을 정리한다. 이미 제거된 참조는 이력으로 증명한다. 삭제 전 근거가 부족하면 남은 설정을 보존한다. 삭제 후 누락된 지원 의존성이 발견되면 cleanup 완료를 철회하고 정확한 범위의 복구를 운영 담당자에게 인계한다. 수집 재활성화·production 배포·과거 image 삭제·지원 정책 변경은 이 cleanup으로 승인되지 않는다.
4. PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다.
5. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
6. PROD-575가 production acceptance 후 old OpenPanel change를 `--skip-specs`로 archive하고 이 change를 정상 archive한다.

현재 prod 채널의 key·host 누락에 따른 수집 중단을 보존한다. 공개 설정 변경이 필요하면 채널 설정표를 수정한 canonical build와 승인된 SHA release 절차를 따른다. PROD-839는 재활성화나 production 배포를 수행하지 않으며 OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

- 공개 개인정보 처리방침의 개정 시행일과 사전 고지 일정은 미확정이다. 과거 시행일을 그대로 둔 채 새 PostHog 처리가 그때부터 적용된 것처럼 쓰지 않는다.
- 일반 이벤트의 보존·삭제 운영 기준과 실제 제공자 적용 조건을 확인해야 한다. `event_retention_months=12`만으로 자동 삭제를 약속하지 않으며, 새로운 고정 보존기간을 이 명세에서 선택하지 않는다.
- 위 공개 고지 조건 중 시행일과 일반 이벤트 보존·삭제는 PROD-795가 확인·결정 기록을 소유한다. 국외 처리 경로는 2026-09-16 결정에 따라 반영하되 선택적 분석을 계약 이행에 필요한 처리위탁으로 보는 법적 판단의 잔여 위험은 인지된 전제다. 미확정 조건은 확정된 사실처럼 공개하지 않는다.
