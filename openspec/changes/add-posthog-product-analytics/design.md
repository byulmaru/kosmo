## Context

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event metadata 수집과 Session Replay privacy는 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮기고, PROD-820은 PostHog Cloud와 build/deployment 공개 설정을 제공한다. PROD-795는 실제 수집 surface와 개인정보 처리방침·runbook을 통합하고, PROD-741은 선행 적용된 Replay의 실제 품질을, PROD-575는 production acceptance와 archive를 소유한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유하고, `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 담당한다. PROD-795·PROD-741·PROD-575가 소유한 개인정보·운영 통합, Replay acceptance, production acceptance와 archive는 이 change가 대신 완료하거나 archive하지 않는다.

현재 metadata 수집 결정의 근거는 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)이다. 사용자 정혜주(HJSmiley)는 기존 마스킹 정책을 철회하고 Search `q`, 기본 click ID와 referrer·session에서 파생되는 검색·캠페인 metadata를 표준 metadata로 수집하기로 결정했다. 2026-08-31 마스킹 승인은 Superseded 상태로 이력을 보존하며, 새 결정도 GitHub reviewer signoff나 production acceptance를 대신하지 않는다.

## Goals / Non-Goals

**Goals:**

- PostHog 공식 권장 defaults와 표준 자동 이벤트·metadata·persistence·remote config를 그대로 사용한다.
- 앱 소유 경계를 typed custom event, 공개 SDK identity property 기반 identify/reset과 fail-open adapter로 제한한다.
- standard event payload의 Search `q`와 click metadata를 SDK 표준 URL·referrer·session metadata로 유지하고, Replay 수집량과 사용자 Post Content 보호는 별도의 Cloud 설정과 PostHog 표준 masking marker로 통제한다.
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
- Search query `q`와 기본 광고 click ID는 `mask_personal_data_properties: false`를 명시해 standard event payload의 current/referrer/session URL에서 원문으로 유지한다. referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`도 표준 metadata로 보존한다.
- `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook은 두지 않는다. 앱 소유 custom event에는 검색어 원문을 별도 property로 추가하지 않는다.
- Cloud project는 remote config, autocapture, performance, heatmap, console과 Replay 설정을 이미 제공한다. 앱이 이를 `advanced_disable_flags`, 전면 denylist 또는 disable option으로 막으면 Cloud 계약이 작동하지 않는다.
- Replay Cloud의 Normal privacy mode는 input을 mask한다. canonical Post Content는 PostHog recorder의 표준 `ph-mask ph-no-capture` class로 Replay masking과 autocapture 제외를 함께 지정한다.
- `ph-mask ph-no-capture` marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 이번 metadata 수집 결정으로 변경하지 않는다.

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

## PROD-795 개인정보·운영 통합 설계

### 현재 기준과 관측값

이 절에서는 [Linear `PROD-795`](https://linear.app/byulmaru/issue/PROD-795)의 `2026-08-31 명세 구체화 범위 확인`을 구체적으로 다룬다. PR #685의 shared spec과 PR #653의 runtime을 바탕으로 하며 SDK·Cloud·build 계약은 새로 결정하지 않는다. 명세 작성 당시 원격 기준은 PROD-820 `0cdf6eb9`, PROD-819 `73f2dfc7`이었고 두 PR은 아직 병합되지 않았다. 구현을 시작할 때 source와 상태를 다시 확인한다.

- 현재 공개 개인정보 화면과 운영 문서는 OpenPanel을 설명한다. PostHog로 전환하면서 바꿀 내용은 제공자·처리 위치, 자동 수집·브라우저 저장, 보호 범위, 보존·권리 행사와 운영 절차다. UI 배치와 `/privacy` 진입은 바꾸지 않는다.
- 2026-08-31 읽기 전용 Cloud 조회로 `Kosmo Production`, `Asia/Seoul`, Replay `session_recording_sample_rate=0.10`, `session_recording_retention_period=30d`와 canonical origin URL trigger를 확인했다. 이는 설정 조회 증거이며 실제 녹화 품질을 인수한 증거는 아니다.
- 일반 이벤트는 `event_retention_months=12`, `events_retention_enforced=false`를 함께 반환했다. PostHog 모델 소스는 전자를 billing entitlement에서 동기화되는 값이라고 설명한다. 이를 이벤트의 물리적 삭제 시점이나 12개월 자동 삭제 보장으로 해석하지 않는다.
- `session_recording_masking_config=null`과 `recording_domains=null`만으로 입력 masking이 없거나 모든 origin을 허용한다고 단정하지 않는다. URL trigger, 사용 중인 SDK 버전의 기본값·원격 응답과 실제 동작을 함께 대조한다. rrweb 자체 기본값을 PostHog SDK의 최종 설정으로 대신 삼지 않는다.
- 같은 날 인증된 관리 화면에서 Replay privacy는 `Normal (mask inputs but not text/images)`로 표시됐고, network request 수집은 켜져 있었으며 header·body 수집은 꺼져 있었다. Privacy 화면의 `Discard client IP data`도 꺼져 있었다. 이 설정만으로 개별 요청·녹화의 실제 내용이나 IP 저장 결과를 확정하지 않는다.
- 조직의 Legal documents 화면에는 생성된 문서가 없었다. 이는 관리 화면에서 확인한 범위에 한정된 결과이며, 별도로 체결한 계약이 없다는 뜻은 아니다. 계약을 생성하거나 서명하지 않았다.
- 위 값은 특정 시점의 관측값이며 durable 수집 정책을 뜻하지 않는다. 실제 key·host 값과 사용자 식별자·콘텐츠, credential은 문서에 복제하지 않는다.

### 권장 작업 순서

1. 선행 runtime·build commit과 PROD-839 cleanup이 적용되는 release·rebuild·rollback 범위를 식별한다. 선행 PR이 아직 병합되지 않았어도 문서 작성과 검증 준비는 할 수 있지만 cleanup·통합 완료를 선언하지 않는다.
2. 수집 표면별 관측 결과를 먼저 정리한 다음 개인정보 화면을 수정한다. 기존 `apps/app/src/app/privacy.tsx`의 분석·위탁·국외 이전·권리 행사 절을 대상으로 하며, 시행일과 일반 이벤트 보존·삭제 및 국외 처리 조건은 아래 미확정 항목을 해결한 뒤 공개 문구로 확정한다.
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
| 설정·장애·배포                     | key/host 완전·부분·누락, 초기화·전송 실패 시 인증·탐색·게시, rebuild·rollback                                                              | fake endpoint나 로컬 no-op이 통과한 결과를 실제 production 수집 인수로 표시하지 않는다.                                                             |

운영 기록에는 관측일, source commit/build artifact, 환경, 설정 또는 요청 표면, 합성 데이터 사용 여부, 결과, 미검증 범위와 후속 owner를 담으면 충분하다. 새 저장소나 범용 검증 프레임워크는 만들지 않는다. raw payload와 사용자 정보는 공유 문서에 첨부하지 않는다.

### 보존·삭제·국외 처리 문구의 근거

- PostHog [DPA](https://posthog.com/dpa)는 고객 end-user 데이터에 대해 Company와 PostHog의 역할을 각각 Controller와 Processor로 구분한다. PostHog 자체 계정·웹사이트의 [Privacy Policy](https://posthog.com/privacy)를 Kosmo 분석 데이터의 처리 근거로 그대로 옮기지 않는다. 공개 DPA 설명과 실제 조직 계약·선택 리전도 구분한다.
- [Data storage](https://posthog.com/docs/privacy/data-storage)의 person·event 삭제와 [persons 문서](https://github.com/PostHog/posthog.com/blob/master/contents/docs/data/persons.mdx)에 있는 이벤트·녹화 삭제 옵션을 현재 제공자 절차와 대조한다. 비동기 삭제 요청 접수와 삭제 완료는 다르다. 이 Spec 단계에서 실제 사용자 데이터를 삭제하지 않는다.
- [Replay retention](https://github.com/PostHog/posthog.com/blob/master/contents/docs/session-replay/recording-retention.mdx)은 새 보존 설정이 이후 수집분에 적용된다고 설명한다. 플랜 상한, 실제 프로젝트 설정, 과거 녹화에 적용되는 기간과 삭제 완료 시점을 구분한다.
- [JS persistence](https://posthog.com/docs/libraries/js/persistence)는 기본 cookie·localStorage 저장을 설명한다. 실제 Kosmo SDK 설정과 대조해 고지하고, 브라우저 cookie 수명을 서버 분석 데이터 보존기간으로 쓰지 않는다.
- 설정 필드의 의미는 [공식 Team model](https://github.com/PostHog/posthog/blob/master/posthog/models/team/team.py)을 참고하되, 조회 시점의 API·플랜·실제 처리 증거를 우선한다. 이 자료는 기술적 사실의 근거이며 한국 개인정보 처리·국외 이전의 법적 근거를 대신 결정하지 않는다.
- 국외 이전 고지는 [개인정보보호위원회 안내](https://www.pipc.go.kr/np/default/page.do?mCode=D060040010)를 대조해 적용 가능한 근거와 필요한 고지·보호 조치를 확인한다. PostHog를 사용한다는 사실만으로 특정 예외에 해당한다고 판단하지 않는다.

## Migration Plan

1. PROD-820에서 Cloud 보호 설정과 공개 build/deployment 주입을 production 배포 전에 준비한다.
2. PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환한다.
3. PROD-839가 지원 release·rebuild·rollback의 OpenPanel 의존과 외부 설정을 정리한 증거를 확인하고, PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다. 그 전에는 문서·검증 준비와 완료 판정을 구분한다.
4. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
5. PROD-575가 production acceptance 후 old OpenPanel change를 `--skip-specs`로 archive하고 이 change를 정상 archive한다.

긴급 비활성화는 production build의 공개 key 또는 host를 제거하고 rebuild·승인된 배포로 adapter를 no-op으로 만든다. 이미 배포한 정적 bundle은 변수 삭제만으로 바뀌지 않는다. OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

- 공개 개인정보 처리방침의 개정 시행일과 사전 고지 일정은 미확정이다. 과거 시행일을 그대로 둔 채 새 PostHog 처리가 그때부터 적용된 것처럼 쓰지 않는다.
- 일반 이벤트의 보존·삭제 운영 기준과 실제 제공자 적용 조건을 확인해야 한다. `event_retention_months=12`만으로 자동 삭제를 약속하지 않으며, 새로운 고정 보존기간을 이 명세에서 선택하지 않는다.
- 미국 처리의 실제 계약·이전 항목·시점·방법·보유 조건과 적용할 법적 근거를 개인정보 고지 책임자와 확인해야 한다. 제공자 공개 문서만으로 국내법상 근거를 확정하지 않는다.
- 위 공개 고지 조건은 PROD-795가 확인·결정 기록을 소유한다. 확정된 부분의 문서·검증 준비와 별개로, 미확정 조건을 사용한 공개 문구 확정 및 6.1 완료는 보류한다. PROD-795 Spec Gate 최종 승인도 미확정 항목과 처리 방침을 검토한 뒤 받는다.
