# PROD-1222 200행 복귀 long task 원인 조사 — 2026-10-27

> 2026-10-28 후속 구현: 클릭 경계 크기를 React state에서 ref로 분리했다. 같은 200행 A/B와 역순 재측정에서 idle 대비 메인 스레드 작업량 중앙값이 111.7→90.5ms로 줄었다. 복귀 시간의 일관된 개선은 입증하지 못했다. 아래 마지막 절에 구현·검증·비교 근거를 기록한다.

## 결론과 정정

앞선 production 측정에서 남은 62ms long task를 앱의 미해결 성능 문제처럼 보고했으나, 후속 조사에서 **Playwright의 URL assertion이 생성하는 전체 페이지 ARIA snapshot 비용**으로 확인했다. 이 수치를 근거로 제품 가상화나 렌더 최적화를 추가하지 않는다. 이번 조사에서는 제품 코드와 실행 bundle을 변경하지 않았다.

설치된 Playwright 1.60.0의 `expect(page).toHaveURL(/\/$/)`는 frame의 `_expect('to.have.url')` 경로를 사용한다. injected `expect()`는 성공 여부와 무관하게 `_ariaSnapshotForExpect()`를 호출하고, page-level assertion에는 `document.body`의 ARIA tree를 생성한다. 코드 근거는 설치 패키지 `node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/lib/coreBundle.js`의 해당 함수다.

## 원인 분리

1. 기존 production bundle과 200행 fixture로 warm-up 1회 뒤 상세 복귀 CPU profile·trace를 3회 수집했다. URL 검사·행 수 검사·scroll 안정화 단계에 mark를 넣었다.
2. profiler 시작 자체가 큰 task를 만드는 첫 수집은 예비 자료로 분리했다. 최종 trace에서는 profiler 시작 뒤 observer/metrics를 초기화했고, trace 내 이중 CPU profiling도 제거했다.
3. 최장 task 44.5/48.5/49.2ms는 모두 `goBack` 완료 후 URL assertion 완료 전이었다. CPU 호출 경로는 `expect → _ariaSnapshotForExpect → _renderAriaSnapshot → generateAriaTree → visit/processElement → getCSSContent/getComputedStyle`였다. profiler가 실행 순서와 시간을 바꾸므로 이 값 자체를 이전 62ms와 동일시하지 않았다.
4. CPU profiler와 trace를 끈 A/B 대조에서 URL 확인 방식 한 줄만 바꿨다. A/B 각각 warm-up 1회 후 5쌍을 AB/BA 교차 순서로 실행했다.

| 복귀 시 URL 확인                                               | Long task 합 표본(ms) | 중앙값(ms) | Main-thread Task 합 중앙값(ms) |
| -------------------------------------------------------------- | --------------------- | ---------: | -----------------------------: |
| A: `expect(page).toHaveURL(/\/$/)`                             | 64, 58, 62, 58, 62    |         62 |                          189.7 |
| B: `expect.poll(() => new URL(page.url()).pathname).toBe('/')` | 0, 0, 0, 0, 0         |          0 |                          149.9 |

두 조건의 제품 코드·브라우저·데이터·상세 이동·행 수 검사·scroll 안정화·500ms 관찰 대기는 같다. 200 PUBLIC 게시글, 3문단 본문, 1280×900, 번들 Chromium 148.0.7778.96, throttling 없음이다. 모든 10개 측정에서 표시 가능한 목록 200행과 원래 offset을 유지했고 복귀 중 GraphQL 요청은 없었다. 따라서 B가 복귀 검증을 생략하거나 목록을 덜 표시해서 비용이 줄어든 것은 아니다.

Task 합에는 다른 자동화 작업도 포함되므로 B의 149.9ms를 순수 앱 실행 시간이나 사용자 체감 지연으로 제시하지 않는다. B에서도 rAF 최대 간격은 약 50ms로 관찰됐다. Long Task API의 50ms 이상 task가 없었다는 결과를 프레임 드롭이 전혀 없다는 뜻으로 확대하지 않는다.

## 제품 실행에서 보인 작업

source map으로 React의 `propagateParentContextChanges`, commit/passive traversal과 React Native Web 경로를 확인했다. 최종 profile 구간 전체의 style 재계산은 약 9.5~10.5ms, layout 11.1~13.3ms, paint 3.2~3.7ms, MinorGC 4.5~4.9ms였다. 이 값은 profiler 오버헤드를 포함하는 진단값이며 nested GC 이벤트를 중복 합산하지 않았다. 이런 작업은 존재하지만 이번 62ms의 원인으로 판정하지 않는다.

## 검증·산출물

- 제품 hook hash: `c27a18fa8071226c51cb216fd55401dca881a0bc10fc8d8e78fbc76e95beba57`.
- 원본 실행 bundle SHA-256: `a3b5a01aa76a4cdd20af2cdc8270f0480628e71384c6d587f85326c847c7012c`.
- 별도 source-map export의 세 JS 모두 원본 byte 전체를 동일 prefix로 포함한다. 추가 137byte는 `sourceMappingURL`과 debugId footer다. 원본 실행 bundle은 교체하지 않았고 동일 좌표의 소스맵만 분석에 사용했다.
- 임시 진단 TypeScript·Prettier 검사, profile E2E와 A/B E2E가 통과했다. 독립 검토로 CPU ancestry, 설치 라이브러리 경로와 A/B 결과 해석을 확인했다.
- 로컬 비추적 `test-results/prod-1222/production/profile/`: `profile-summary.json`, `profile-run-{1,2,3}.trace.json`, `profile-run-{1,2,3}.cpuprofile`, `analysis.json`, `url-check-comparison.json`.
- 같은 상위 경로의 `analyze-profile.cjs`, `source-mapped-dist/`, 진단 spec/config와 `profile-final-run.log`, `url-check-run.log`를 보존했다. `profile-initial/`은 profiler 준비 비용과 offset 기록을 보정하기 전 자료여서 최종 판단에 사용하지 않는다.

앞선 보고서의 행 수 유지·추가 pagination 제거·scroll 복원 검증은 유효하다. 다만 기존 TaskDuration/long-task 수치는 URL assertion의 계측 비용을 포함하므로 순수 제품 성능 지표로 사용하지 않는다. 후속 성능 측정에서는 page-level DOM snapshot을 만드는 assertion을 측정 구간 밖으로 옮기거나 Node 쪽 URL 확인을 사용한다.

실제 사용자 데이터·다른 브라우저·Native 성능은 미검증이다. 제품 수정·커밋·push·배포는 이번 조사에서 수행하지 않았다.

## assertion·DOM 검사 제외 후 복귀 비용 재측정

동일 production bundle·200 PUBLIC 게시글·1280×900·번들 Chromium 조건에서 측정 구간의 Playwright assertion, DOM 행 수/visibility 검사, polling을 모두 제거했다. 상세 진입 검증 후 500ms 대기하고, 브라우저 timer가 history.back을 호출한다. 1초 동안 Node에서 명령을 보내지 않고 rAF의 pathname·scrollY 관측과 Long Task observer만 실행한다. 행 수·표시 여부·URL·최종 offset 검증은 metrics와 observer 결과를 읽은 뒤 수행했다.

대조군은 같은 준비 과정을 거쳐 200행 목록으로 복귀하고 500ms 안정화한 뒤, back 호출 없이 동일 observer를 실행한다. 정량 실행은 trace/CPU profiler 없이 warm-up 1쌍과 측정 5쌍이다. CDP before는 timer 예약 **이전**에 읽어 전체 동작을 감싸며, 이 CDP 구간은 정확한 1초 mark보다 넓어 예약·프로토콜 비용도 포함한다. 대조군 차감은 이 기본 비용을 추정해 줄이는 방법이며 모든 관측 부하를 완전히 제거한다는 뜻은 아니다.

| 지표                                        |                        결과 |
| ------------------------------------------- | --------------------------: |
| CDP Task 합 중앙값: 대기 / 복귀             |              53.1 / 181.5ms |
| 짝별 복귀−대기 Task 증가분 중앙값           | **123.6ms** (104.6~128.4ms) |
| 짝별 Script 증가분 중앙값                   |                      91.0ms |
| 짝별 Layout 증가분 중앙값                   |                      11.9ms |
| 짝별 Style 재계산 증가분 중앙값             |                       9.5ms |
| 루트 경로·원래 scrollY ±2px 첫 관측         |  **112.6ms** (96.1~117.7ms) |
| 이후 목표 offset에서 3프레임 연속 안정 관측 | **135.0ms** (116.6~140.1ms) |
| 50ms 이상 Long Task                         |           복귀 5회 모두 0건 |
| 복귀별 최대 rAF 간격 중앙값                 |        58.3ms (41.8~59.2ms) |

Task 증가분은 1초 관찰 동안 복귀로 늘어난 브라우저 메인 스레드 작업량의 추정치다. 순수 React 렌더 시간이나 사용자 체감 지연으로 부르지 않는다. Script·Layout·Style은 Task의 구성 지표이며 Task에 다시 더하지 않는다. 경로·scrollY 첫 관측은 callback 실행 시점의 performance.now로 기록하며 paint 완료를 보장하지 않는다. 모든 10개 정량 측정에서 표시 가능한 200행, 원래 offset, GraphQL 요청 0건을 확인했다.

첫 예비 실행에서 rAF의 프레임 timestamp와 performance.now를 혼용해 음수 관측 시간이 나왔고, 시작 metrics 예약 순서도 보정했다. 수정 전 두 결과는 preliminary로 분리했으며 위 수치에는 포함하지 않았다. 최종 spec SHA-256은 `424c92e91772ea05b7125e4e89f351c7f47ba8e01adc288d363bc11b488599af`다.

### 별도 trace 교차 확인

CPU profiler 없이 trace를 켠 별도 3쌍에서는 정확한 start/end mark 사이 renderer main thread의 task 구간 합집합을 계산했다. 이 trace에는 `RunTask` 대신 `ThreadControllerImpl::RunTask`가 있으므로 한 계열만 사용하고 경계에서 잘랐다. 중첩 FunctionCall·Layout·Style·Paint를 task 합에 중복 가산하지 않았다.

- 대기 task 합 65.6~94.1ms, 복귀 198.2~213.1ms. 짝별 증가분은 104.1/147.4/121.8ms로 정량 실행의 약 124ms와 비슷한 규모다. trace 자체 부하가 있어 절대값을 일반 실행과 동일시하지 않는다.
- 복귀 최대 단일 task는 34.8/34.3/40.1ms였다.
- 복귀 Layout 12.2~13.2ms, Style 10.9~12.6ms, Paint 2.8~3.2ms. 첫 Paint는 시작 후 69.7~72.0ms, 마지막 Paint는 140.1~144.3ms였다. compositor 표시 완료 시각은 측정하지 않았다.
- 첫 trace의 FunctionCall 좌표를 기존 byte-prefix 일치 source map에 대응하면 React Native Web `UIManager`의 측정 timer callback, React DOM, scheduler 경로가 나타난다. 이를 정량 실행의 개별 함수 CPU 점유율로 환산하지 않았다. 추가 제품 최적화는 하지 않았다.

정량 E2E와 trace E2E 각각 통과했다. 독립 검토에서 raw 반복값, offset/200행/추가 요청 검증과 trace 경계·중복 제외 방식을 확인했다. 분석기의 구간 합집합 self-check도 통과했다.

로컬 비추적 `test-results/prod-1222/production/clean-back/`에 최종 `clean-back-comparison.json`, 별도 `trace-clean-back-comparison.json`, `clean-back-analysis.json`, trace 6개, 재실행용 spec/config와 `analyze.cjs`를 보관한다. 상위 경로의 `clean-back-corrected-run.log`와 `clean-back-trace-run.log`가 최종 실행 로그다. `preliminary*`는 최종 수치에서 제외한다.

이번 범위에서 확인한 것은 **고정된 200행 production Web 복귀의 브라우저 작업량과 복원 관측 시간**이다. 기기·실데이터·브라우저별 일반화, Native, compositor의 실제 표시 완료 및 새로운 최적화 효과는 검증하지 않았다.

## 남은 작업의 원인 좁히기 — 2026-10-28

### 확인된 큰 경로

앞선 trace-only 3회 자료를 함수 좌표별로 묶고 원본 bundle과 byte-prefix가 일치하는 source map에 연결했다. 아래 시간은 **각 callback의 inclusive trace 시간**이다. 중첩될 수 있으므로 서로 더하거나, trace 없는 실행의 idle 차감 123.6ms에 대한 비율로 환산하지 않는다.

| 경로                                                            | 복귀 1회 호출 수 | trace 3회 시간 범위 |
| --------------------------------------------------------------- | ---------------: | ------------------: |
| RNW `UIManager.measureLayout` timer → 위치·크기 읽기 → onLayout |       매번 1,402 |         42.4~44.2ms |
| React DOM `scheduleImmediateRootScheduleTask` 내부 microtask    |          867~931 |         33.7~39.2ms |
| React scheduler `performWorkUntilDeadline`                      |              3~4 |         13.7~17.3ms |
| Layout                                                          |                2 |         12.2~13.2ms |
| Style 재계산                                                    |                3 |         10.9~12.6ms |
| Paint                                                           |                6 |           2.8~3.2ms |

대기 trace에는 위 UIManager·React callback 경로가 나타나지 않았으며, 주된 FunctionCall은 계측 rAF였다. 따라서 다음 조사 대상은 페인트보다 반복적인 위치·크기 측정과 React 갱신이다. UIManager callback 횟수를 React render나 commit 횟수로 해석하지 않는다.

### 1,400개 측정 대상의 소유자

같은 production bundle에서 warm-up 1회와 진단 3회를 추가 실행했다. profiler 시작 전 200행 목록의 DOM에서 `__reactLayoutHandler`가 붙은 요소를 조사했다. 모든 실행에서 **행당 7개 × 200행 + 화면 공통 3개 = 1,403개**였다. 이는 등록된 노드 수이며 복귀 callback 1,402회와 정의가 다르다. 어떤 화면 공통 노드가 복귀 시 측정을 생략했는지는 확정하지 않았다.

정적 호출 경로와 DOM testID·본문 위치를 대조하면, 행당 6개는 앱의 `PostDetailBackground`다.

- `PostListItemCard` 바깥 카드 1개.
- `PostListRow`의 행·content·header·body wrapper 4개.
- `PostContentPrivacyBoundary` 1개.

즉 200행에는 이 컴포넌트가 **1,200개** 있다. `PostDetailBackground.tsx:44`는 항상 onLayout을 붙이고 `setSize`를 호출한다. RNW의 공유 ResizeObserver는 각 노드의 onLayout을 호출하기 전에 `UIManager.measure`를 예약한다. 해당 timer는 노드와 부모의 offset·client·scroll 값을 읽고 크기를 전달한다. 크기가 같으면 앱은 기존 state를 반환하므로 모든 측정이 실제 재렌더로 이어진다고 단정할 수 없다.

나머지 행당 익명 div 하나는 Avatar의 RNW Image root와 구조적으로 일치하는 **후보**다. `Avatar`는 cover Image를 사용하고 외부 onLayout을 넘기지 않지만, 설치된 RNW Image는 내부 handleLayout을 항상 View에 붙인다. cover·외부 onLayout 없음 조건에서 결과를 소비하지 않아도 RNW의 측정은 선행한다. 이번 census의 짧은 ancestor 정보만으로 해당 200개 노드와 Avatar를 완전히 매칭하지 못했으므로 확정 원인으로 집계하지 않는다.

### React 경로 확인과 다음 검증 대상

추가 진단은 trace와 CPU profiler를 준비한 뒤 500ms 대기하고, 앞서와 같은 무명령 1초 복귀 구간을 사용했다. census·DOM 검사·assertion은 이 구간 밖에 있다. trace mark 안의 source-mapped CPU 스택에서 React의 `propagateParentContextChanges`, render/commit/passive traversal 및 `PostDetailBackground` 실행을 확인했다. 다만 원시 CPU profile에 비양수 timeDelta가 124/124/131개 있어 함수별 시간·점유율을 정량 결론으로 사용하지 않았다. 분석기는 이 구간을 임의 보정하지 않고 제외하며, 이를 진단 한계로 남긴다. 새로운 profiler 동시 실행 수치와 위 trace-only 표를 섞지 않는다.

`PostDetailBackground`의 size는 스타일·배경 피드백을 그리는 데 쓰이지 않는다. `postDetailBackgroundResponder`가 이동·release 시 클릭 영역 밖으로 나갔는지 판단하는 데 사용한다. 따라서 **첫 검증 후보는 이 geometry를 React state 갱신과 분리해 복귀 시 React 작업을 줄일 수 있는지**다. 단순히 onLayout을 제거하면 경계 이탈·드래그 취소 동작이 바뀔 수 있으므로, 그 의미를 보존해야 한다. 측정 예약 자체의 감소는 별도 후보이며, 아직 어느 변경의 개선량도 A/B로 입증하지 않았다. 가상화나 라이브러리 교체는 이번 조사에 추가하지 않았다.

### 검증과 보관

- 진단 E2E 통과: warm-up 1회 + 3회 모두 표시 가능한 200행과 정확한 scroll 복귀를 유지했다.
- 임시 spec의 TypeScript·ESLint·Prettier, 분석기의 sample-window/mark 포함·집계 self-check를 통과했다. 독립 검토에서 최초 CPU 집계의 중복 가산을 발견해 zero-init으로 수정하고 전체 합 일치 self-check 후 다시 생성했다. CPU 절대시간을 정량 보고에서 제외한다는 결론은 유지한다.
- `test-results/prod-1222/production/attribution/`: `attribution-comparison.json`, 각 `.cpuprofile`·`.trace.json`·`.runtime.json`, `cpu-analysis.json`, `analyze.cjs`, 원 trace-only 통계 `clean-trace-callbacks.json`과 재실행용 spec/config를 보관한다.
- 실행 bundle은 계속 `a3b5a01aa76a4cdd20af2cdc8270f0480628e71384c6d587f85326c847c7012c`다. 제품 코드 수정·커밋·push·배포는 하지 않았다.

정확한 함수별 CPU 비중, Avatar 후보의 DOM 매칭, geometry state 변경의 효과, Native·실데이터 성능은 미검증이다.

## 크기 state 분리 및 200행 A/B — 2026-10-28

### 구현과 행동 검증

`PostDetailBackground`의 width/height를 안정적인 ref에 저장한다. 내부 responder는 현재 크기를 읽고, 크기가 바뀐 상태에서 진행 중이던 클릭은 취소하며 pressed feedback을 해제한다. 기존 드래그 허용 거리, 네 방향 경계 이탈, move 없이 release, termination, callback 대상 변경, feedback 재렌더 동작과 Native host 식별 경로를 유지한다. 외부 `onLayout` 전달과 callback이 없는 동안의 크기 저장도 유지한다. 공개 prop·의존성은 추가하지 않았다.

단위 테스트는 layout 이벤트가 React commit을 추가하지 않는지 Profiler로 관찰한다. 변경 전 실패(2 !== 1) 후 변경 후 통과했다. callback 없는 초기 layout 뒤 callback을 활성화하는 회귀도 별도 RED(0 !== 1)로 확인하고 수정했다. resize 중 클릭 취소·최신 bounds·외부 onLayout 전달을 함께 검증했다.

RNW의 DOM 측정 자체는 제거하지 않았다. 이번 변경은 측정값을 저장하기 위해 React state를 갱신하는 경로만 줄인다.

### 동일 조건 A/B 및 역순 재측정

원본 production export를 `baseline-dist`로 보관해 A에 사용하고, 수정된 소스로 새 production export B를 만들었다. 같은 200 PUBLIC 게시글·3문단 본문·1280×900·Chromium 148.0.7778.96·실제 API/격리 DB·clean-back 측정 스크립트를 사용했다. 측정 스크립트는 저장 경로만 variant별로 나눴으며 assertion·DOM 검사·polling은 계속 1초 측정 구간 밖이다. 기존의 오래된 123.6ms 결과 대신 이번에 새로 측정한 A를 비교 기준으로 삼았다.

A→B, 이어 B2→A2 순서로 실행했다. 각 실행은 warm-up 1쌍과 idle/복귀 5쌍이며 CPU profiler·trace는 껐다. 테스트·빌드가 측정과 겹치지 않도록 순차 실행했다.

| 지표: 각 실행의 중앙값(ms) |      A |     B |    B2 |     A2 |
| -------------------------- | -----: | ----: | ----: | -----: |
| idle 대비 Task 증가분      | 112.35 | 89.06 | 90.75 | 111.09 |
| idle 대비 Script 증가분    |  91.05 | 85.43 | 74.18 |  93.72 |
| 원래 offset 첫 관측        |  113.1 | 118.6 | 102.4 |  119.7 |
| 3프레임 안정 관측          |  134.9 | 131.7 | 117.0 |  140.6 |
| 최대 rAF 간격              |   50.1 |  58.3 |  50.1 |   66.2 |

각 variant의 10개 측정을 합친 중앙값은 다음과 같다. Task·Script·Layout·Style은 idle 대조군을 뺀 값이며 서로 더하지 않는다.

| 지표                    |     원본 A+A2 |      ref B+B2 |
| ----------------------- | ------------: | ------------: |
| 메인 스레드 Task 증가분 |  **111.72ms** |   **90.52ms** |
| Script 증가분           |       93.49ms |       79.22ms |
| Layout 증가분           |       11.09ms |       10.87ms |
| Style 증가분            |       10.74ms |       10.62ms |
| offset 첫 관측          |      117.55ms |      114.20ms |
| 3프레임 안정 관측       |      137.95ms |      126.50ms |
| 최대 rAF 간격           |        58.8ms |        58.3ms |
| 50ms 이상 Long Task     | 모든 복귀 0건 | 모든 복귀 0건 |

**메인 스레드 작업량은 두 실행 순서에서 모두 낮아졌고, 합산 중앙값은 21.2ms(약 19%) 감소했다.** 반면 첫 offset 관측은 첫 A→B에서 늦어지고 역순 비교에서는 빨라졌다. 표본이 작고 시간 편차가 있으므로 일관된 체감 복귀 지연 개선으로 확대하지 않는다. 남은 약 90.5ms도 사용자 대기 시간이 아니라 idle 대비 누적 브라우저 작업량 추정치다.

### 최종 검증과 산출물

- 앱 단위 테스트 **1,265/1,265** 통과. 변경 파일 ESLint·TypeScript·Prettier 및 diff check 통과.
- 실제 번들 Chromium의 `Posts.tests.stories.tsx`에서 `ContentWarningProductionConsumersShareRevealState`, `ContentWarningCardPressableFeedback` 2개 통과(나머지 11개 선택 제외). drag·경계 이탈 시 navigation 취소, 다시 tap 시 navigation, pressed feedback을 확인했다. 처음 Catalog 파일을 대상으로 한 필터는 전부 skip이었고 검증으로 세지 않는다.
- production A/B E2E 4회 모두 통과. warm-up 포함 48개 시나리오에서 표시 가능한 200행, 추가 GraphQL 요청 0건, 원래 offset ±2px 복원, Long Task 0건을 확인했다.
- 독립 검토에서 행동 보존과 raw 4개 집계를 확인했다. 제품 효과와 복귀 지연의 해석을 분리했다.
- 원본 bundle SHA-256: `a3b5a01aa76a4cdd20af2cdc8270f0480628e71384c6d587f85326c847c7012c`.
- 후보 bundle SHA-256: `afd4a36b975acb3324bd5a46ebf3ad191bf89fedbe727e1f67804587b222bbfd`.
- 로컬 비추적 `test-results/prod-1222/production/geometry-ref/`에 `A`, `B`, `B2`, `A2` 원본 JSON, `comparison.json`, 원본 export, 재실행용 spec/config, 실행·빌드·검증 로그를 보관한다.

Native 실제 기기, 실데이터·다른 브라우저, compositor 표시 완료는 검증하지 않았다. 커밋·push·배포는 하지 않았다.
