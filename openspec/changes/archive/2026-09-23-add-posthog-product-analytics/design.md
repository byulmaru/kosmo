## Context

### PROD-741 current session (2026-09-22)

이 절은 `docs/operations/posthog-replay.md`와 Linear PROD-741의 계약을 실행하기 위한 working note다. 아래 선행 slice는 이력이며 과거 전체 수집 중단·acceptance-only 전제나 PROD-795의 미완료 checklist를 PROD-741의 새 의무로 가져오지 않는다.

**확인한 상태와 Gate**

- 조사 기준 main·HEAD는 `8650253d7cfaea3cab94f35d318d381c838af6c9`였고 당시 `apps/app/src/analytics/client.web.ts`는 `disable_session_recording: true`를 사용했다. Implement checkpoint는 이 명시적 차단을 제거했으며 production 배포·Cloud 실제 값·Replay 재활성화는 여전히 B의 pending 범위다.
- `PostContentPrivacyBoundary.web.tsx`의 `ph-mask ph-no-capture`와 analytics adapter의 기존 unit test는 앱 소유 경계를 검증하는 기반이다. marker 존재나 unit test 성공은 실제 recorder masking·Cloud 재생 증거가 아니다.
- 2026-09-22 사용자가 현재 main의 개인정보처리방침을 PROD-741의 완료된 privacy baseline으로 수용했다. 과거 동일 결정의 존재는 blocker가 아니다. 이는 법적 완결성의 새 판단이 아닌 범위 결정이며 PROD-795의 정책·고지 책임을 재감사하거나 수정하지 않는다.
- Spec Gate는 baseline 수용·Viewer 확인의 현재 결정 반영과 문서 검증을 기준으로 PASS로 판정한다. Replay Rollout Gate는 Cloud 실제 값과 코드·배포 준비 미확인으로 pending이다. Replay Rollout Gate는 production Replay를 실제 재활성화해도 되는지 판단하는 checkpoint다. privacy baseline, 네 Cloud 실제 값, 사전 보호·장애 검증과 코드·배포·rollback 준비가 입력이다. Spec Gate PASS만으로 Replay를 켜지 않는다.
- PROD-540은 Backlog이고 PR #984는 조사 시 열려 있었다. 구현 재개 시 배포·main과 fixture 상태를 다시 확인한다.

**완료된 Human-required: Viewer 시각 확인**

`PostMediaViewer.tsx`는 production modal·상태 consumer이며 `PostMediaViewerSurface.tsx`를 렌더한다. 기존 story는 두 종류다. Codex는 아래 경로의 main story source와 `.storybook/main.ts` 등록을 확인했다. 2026-09-22 사용자는 아래 compact·wide story를 직접 열어 PROD-741의 Viewer가 맞음을 확인했다. Codex가 Storybook 서버·브라우저를 실행한 것은 아니다.

| 용도                                    | Storybook 경로·export                                                                                                                                      | source                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 실제 Gallery→Host→Viewer의 compact 확인 | `KOSMO/Patterns/Post/Catalog` → `Post Media Viewer Compact` (`PostMediaViewerCompact`)                                                                     | `apps/app/src/stories/patterns/Posts.stories.tsx`           |
| 실제 Gallery→Host→Viewer의 wide 확인    | `KOSMO/Patterns/Post/Catalog` → `Post Media Viewer Wide` (`PostMediaViewerWide`)                                                                           | 같은 파일                                                   |
| Surface 외형·상태 비교                  | `KOSMO/Patterns/Post Media Viewer` → `Default`, `First Of Four`, `Middle Of Four`, `Last Of Four`, `Loading`, `Error`, `Unavailable`, `Dark`, `Playground` | `apps/app/src/stories/patterns/PostMediaViewer.stories.tsx` |

저장소 루트에서 `pnpm --filter @kosmo/app storybook:dev`로 실행한 뒤 아래 주소를 연다. 의존성이 설치돼 있어야 하며, 설치 상태가 맞지 않으면 먼저 환경을 확인한다. 이번 Spec 요청으로 dependency나 새 story를 수정하지 않는다.

- Compact: `http://localhost:6006/?path=/story/kosmo-patterns-post-catalog--post-media-viewer-compact`
- Wide: `http://localhost:6006/?path=/story/kosmo-patterns-post-catalog--post-media-viewer-wide`
- Surface: `http://localhost:6006/?path=/story/kosmo-patterns-post-media-viewer--default`, `http://localhost:6006/?path=/story/kosmo-patterns-post-media-viewer--middle-of-four`

Compact·Wide story의 `play`는 Viewer를 조작한 뒤 닫거나 Reply dialog로 이동한다. 자동 실행이 끝난 뒤 필요하면 Reply dialog를 닫고 Gallery의 `2번째 첨부 이미지 크게 보기`(compact) 또는 `1번째 순서 이미지 크게 보기`(wide)를 눌러 다시 연다. 사용자의 검증 대상 확인은 완료됐으므로 구현 전에 다시 요청하지 않는다. Surface story는 실제 공용 컴포넌트를 사용하지만 주요 callback은 mock이며 Controls로 상태를 바꾼다. Host·route·실제 Replay acceptance를 대신하지 않는다. `PostMediaViewer.tests.stories.tsx`의 Tests story는 상호작용 검증용이고 시각 확인을 위해 새 story를 추가하지 않는다.

**정확히 두 세션으로 실행한다**

1. A. Implement는 Luna Max (`gpt-5.6-luna`, reasoning `max`)로 runtime 구현과 앱 소유 config·identity·동기 fail-open·Post Content marker 자동 테스트, typecheck/lint/build 및 handoff만 수행한다. SDK recorder의 내부 bundle·payload·rrweb 형식과 기본 masking은 재검증하지 않는다. 코드 변경을 준비해도 실제 활성화·배포는 수행하지 않는다.
2. A가 코드·자동 검증을 마치면 결과·source 버전·남은 운영 항목을 B에 인계하고 종료한다. Cloud screenshot 판독·실제 설정 판정/변경·Replay Rollout Gate 최종 판정·실제 Replay 시각 확인을 기다리며 A를 열어 두지 않는다.
3. B. Operational Verification은 구현 외 남은 운영·실환경 검증 전부를 소유한다. 실제 재활성화 직전에 멈춰 canonical 캡처 표를 당시 UI에 맞춰 안내하고, 사용자의 screenshot을 읽어 10% sampling·production canonical origin만 허용하는 전체 조건·Normal input masking·30일 retention의 실제 값을 대조한다. 불일치·미확인은 현재 값·기대값·사람의 조치·pending Gate 입력으로 보고한다.
4. B는 필요한 조치를 정확히 요청한다. 사용자가 수행하거나 명시적으로 승인하기 전에는 해당 조치를 실행·완료 처리하지 않는다. 추가 화면 또는 저장 설정 API/관리자 내보내기 증거가 필요하면 어떤 필드가 부족한지 안내하며 승인만으로 실제 적용 증거를 대신하지 않는다.
5. B가 Cloud 실제 값과 A의 코드·자동 검증 결과, 배포/rollback 준비를 모아 Replay Rollout Gate를 판정한다. PASS와 기존 release 절차 충족 후 실제 재활성화를 진행하고, 실제 Replay의 route·SDK journey·Viewer·input/textarea·canonical Post Content 보호, 필요한 실환경 장애 격리를 확인한다. 최종 증거와 미확인 항목을 PROD-741 안에 기록한다.
6. 별도 Test·Review·추가 운영 세션을 필수로 만들지 않는다. B에서 코드 결함을 발견하면 같은 A에 보완을 돌린 뒤 B를 재개한다. PROD-575는 후속 인계·최종 acceptance·archive owner로 사용하지 않는다.

**Verification matrix**

| 항목                      | 실행·관측                                                                         | 성공 근거                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 일반 route navigation     | 합성 journey에서 일반 route를 이동하고 Viewer를 열고 이미지 전환 후 닫는다        | 하나의 실제 session replay에서 route 이동·Viewer 동작 재생, SDK의 기존 pageview·pageleave·autocapture와 같은 journey 연결 |
| Viewer 내부 이동          | compact·wide 이미지 전환                                                          | route navigation으로 취급하지 않고 별도 pageview·앱 소유 analytics emitter를 추가하지 않음                                |
| input·textarea masking    | 각각 synthetic 테스트 문자열 입력                                                 | 실제 Replay에 입력 내용이 masking되고 recorder 전송에 원문이 없음                                                         |
| canonical Post Content    | 합성 본문, compact 펼침·측정 본문, wide thread                                    | `ph-mask`의 실제 Replay 원문 비노출과 `ph-no-capture`의 실제 autocapture 제외를 각각 확인                                 |
| origin·sampling·retention | 실제 Cloud 네 값과 전체 조건, 비대상 origin outbound                              | 10%·canonical origin·Normal·30일 실제 적용 확인. 작은 표본 비율로 설정을 추정하지 않음                                    |
| 제품 장애 경계            | Replay initialization·recorder load·upload 실패와 analytics 전송 실패를 각각 유도 | 해당 실패 발생과 별개로 Viewer 열기·전환·닫기, route navigation·관련 제품 기능 성공. 차단·실패·대기로 전파되지 않음       |
| opt-out                   | PROD-540 배포 여부 확인 후 선택·재방문                                            | 배포됐다면 Replay 미전송, 미배포면 조건부 미적용 기록                                                                     |
| 인계                      | 환경·버전·시점·실제 설정·자동화·실제 재생·실패 격리·미확인 항목                   | A→B 인계 후 PROD-741 최종 증거로 정리. 실제 ID·key·사용자 콘텐츠·raw payload 제외                                         |

실제 사용자 개인정보·실제 사용자 콘텐츠는 모든 검증에서 사용하지 않는다. PostHog는 제품 기능의 성공 조건이 아니다. 보호 실패 시 acceptance를 보류하고 Replay 비활성 상태를 유지하거나 기존 release 절차로 복구한다. 설정 screenshot, DOM marker, Storybook 또는 자동화만으로 실제 Replay acceptance를 완료하지 않는다.

### 선행 slice의 설계 맥락

Kosmo의 공용 analytics API는 platform file로 Web 구현과 Native no-op을 나눈다. `AppProviders`가 Web client를 초기화하고 `AnalyticsSessionBridge`가 Session의 Account ID를 identify하거나 guest 상태에서 reset한다. 기존 제품 caller는 공용 `trackAnalytics`를 사용한다. Standard event metadata 수집과 Session Replay privacy는 각각의 수집 경계에서 관리한다.

PROD-819는 이 경계를 PostHog Web SDK로 옮겼고, PROD-820은 PostHog Cloud와 전환기 build/deployment 공개 설정을 제공했다. 현재 공개 설정은 PROD-891의 채널 설정표·`/channel.js`, release는 PROD-833의 SHA 이미지 승격 계약을 따른다. 과거 계획은 PROD-795 통합, PROD-741 Replay 품질, PROD-575 production acceptance·archive를 나눴다. 현재 PROD-741은 수용된 privacy baseline을 사용하고 두 세션으로 자체 최종 acceptance를 완료하며 PROD-575를 기다리지 않는다.

PROD-839는 두 선행 변경이 같은 지원 release line에 반영된 뒤에도 남아 있는 OpenPanel build·deployment 주입과 외부 설정을 정리한다. 지원 build·수동 SHA release·rollback 대상의 OpenPanel 소비 여부와 활성 설정 범위를 먼저 확인하고, 근거가 충분할 때만 저장소와 GitHub 설정을 제거한다.

승인된 shared spec 전체는 `PROD-820` / PR #685가 소유하고, `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 담당한다. 다른 이슈의 과거 task는 현재 PROD-741 완료 조건으로 가져오지 않는다. PROD-575의 미래 acceptance·archive 의존성도 적용하지 않는다.

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
- [Replay가 production traffic 비용을 만듦] → Cloud sampling을 10%로 고정하고 PROD-741 Operational Verification에서 실제 설정과 표본 품질을 검증한다.
- [Web dependency가 Native graph에 유입될 수 있음] → `.web` value import와 Native export/dependency scan을 required verification으로 둔다.
- [설정/전송 실패를 숨기면 분석 누락을 즉시 알기 어려움] → 제품 흐름은 fail-open으로 유지하고 PROD-741의 필요한 운영 관측과 최종 acceptance는 Operational Verification이 소유한다.

## Migration Plan

1. PROD-820의 Cloud 보호와 전환기 공개 설정 준비 이력을 확인한다. 현재 전달 경로는 PROD-891의 채널 설정과 PROD-833의 canonical build·SHA 이미지 승격을 따른다.
2. PROD-819에서 OpenPanel runtime, manual pageview·filter와 module identity cache를 제거하고 PostHog 표준 runtime으로 전환한다.
3. PROD-839가 같은 지원 release line과 지원 canonical build·SHA release·rollback 비의존을 확인한 뒤 남은 source·외부 설정을 정리한다. 이미 제거된 참조는 이력으로 증명한다. 삭제 전 근거가 부족하면 남은 설정을 보존한다. 삭제 후 누락된 지원 의존성이 발견되면 cleanup 완료를 철회하고 정확한 범위의 복구를 운영 담당자에게 인계한다. 수집 재활성화·production 배포·과거 image 삭제·지원 정책 변경은 이 cleanup으로 승인되지 않는다.
4. PROD-795가 production-equivalent build에서 실제 수집 surface, 개인정보 처리방침과 runbook을 통합한다.
5. PROD-741이 Post Media Viewer replay·masking·fail-open을 acceptance 한다.
6. 과거 PROD-575의 후속 production acceptance·두 change archive 계획은 현재 실행 의무에서 제외한다. PROD-741 결과는 Operational Verification에서 이슈 자체의 최종 acceptance로 기록한다.

현재 prod 채널의 key·host 누락에 따른 수집 중단을 보존한다. 공개 설정 변경이 필요하면 채널 설정표를 수정한 canonical build와 승인된 SHA release 절차를 따른다. PROD-839는 재활성화나 production 배포를 수행하지 않으며 OpenPanel과 PostHog를 동시에 활성화하지 않는다.

## Open Questions

Spec의 미확정 제품·범위 결정은 없다. 2026-09-22 사용자가 privacy baseline 수용과 Viewer 시각 확인을 확정했다. Luna Max Implement와 Operational Verification 두 세션의 책임은 확정됐다. 실제 재활성화 전 Cloud screenshot 판독과 코드·배포 준비는 B가 판정할 Replay Rollout Gate의 pending 입력으로 남는다. PROD-575의 완료 상태·완료 범위는 연결된 Linear 조회와 사용자 설명이 달라 확인되지 않았으며 이 차이는 현재 두 세션 범위의 blocker가 아니다. Spec Gate PASS를 실제 활성화 승인으로 해석하지 않는다.
