# PROD-1222 실제 Web production 측정 — 2026-10-27

> 후속 정정: 200행 복귀의 62ms long task는 Playwright URL assertion의 전체 ARIA snapshot 생성 비용으로 확인했다. 아래 TaskDuration/long-task 값은 자동화 비용을 포함한 당시 기록이며 순수 앱 실행 비용이 아니다. [원인 조사와 URL 확인 방식 A/B 결과](./prod-1222-web-back-long-task.md)를 함께 참고한다. 행 수·네트워크·스크롤 복원 검증은 유효하다.

> 후속 오버헤드 분리 측정: 200행 복귀의 idle 대비 메인 스레드 작업 증가 중앙값은 123.6ms, offset 첫 관측 112.6ms, 3프레임 안정 관측 135.0ms였다. [측정 방식과 한계](./prod-1222-web-back-long-task.md#assertiondom-검사-제외-후-복귀-비용-재측정)를 함께 읽는다.

> 2026-10-28 크기 ref 변경 후 새 A/B·역순 비교에서 작업량 중앙값 111.7→90.5ms(약 19% 감소)를 확인했다. 복귀 시간 개선은 일관되지 않았다. [최신 결과](./prod-1222-web-back-long-task.md#크기-state-분리-및-200행-ab--2026-10-28).

## 수정 및 동일 조건 재측정

숨겨진 Web 목록의 자동 pagination을 중단하도록 `useAutomaticPagination`에 Expo Router의 기존 `useIsFocused`를 적용했다. 비활성 화면의 document 감시·예약된 콜백·IntersectionObserver와 container 자동 재검사를 차단하고, 복귀 시 자동 조회를 재개한다. 이미 시작한 요청의 응답과 Relay 데이터, 수동 retry 및 Native pagination 경로는 유지한다. 같은 route의 Viewer overlay는 화면 focus를 유지하므로 기존 배경 pagination 계약을 따른다. 새 의존성·public prop은 추가하지 않았다.

아래 값은 **동일한 시작 행 수에서 같은 실제 상호작용을 수행한 결과**다. 수정 전에는 상세 진입 중 숨겨진 목록이 200행까지 늘어났지만, 수정 후에는 시작 행 수를 유지한다. 따라서 순수 렌더 최적화나 동일한 종료 DOM 크기의 비교로 해석하지 않는다. Task 합은 main-thread 작업량이며 체감 지연 시간이 아니다.

| 시작 행 | 상세 중 추가 페이지 요청(전→후) | 상세 진입 Task 합(ms, 전→후) | 복귀 Task 합(ms, 전→후) | 복귀 Long task 합(ms, 전→후) |
| ------- | ------------------------------: | ---------------------------: | ----------------------: | ---------------------------: |
| 20      |                           9 → 0 |                 651.8 → 85.5 |            217.7 → 36.8 |                       62 → 0 |
| 100     |                           5 → 0 |                467.7 → 160.9 |           204.3 → 113.1 |                       64 → 0 |
| 200     |                           0 → 0 |                240.7 → 240.8 |           197.5 → 193.0 |                      63 → 62 |

- 수정 후 각 조건 5회 모두 상세 진입·복귀 후 20/100/200행을 그대로 유지했다. 상세 중 추가 페이지 요청은 0건, 위치 복원은 15/15회 정확히 일치했다.
- 별도 실제 경로 회귀에서 상세 화면의 scroll/resize 동안 추가 요청이 없고, 뒤로 온 뒤 목록 끝까지 스크롤하면 다음 페이지가 다시 표시됨을 확인했다.
- 스크롤 Task 합은 5.4→5.3 / 13.3→14.2 / 19.7→20.0ms이며, 스크롤 성능 개선을 주장하지 않는다. 수정 후 75개 스크롤 cycle에도 GraphQL 요청과 long task가 없었다.
- 당시 200행 상세 진입 비용은 변화가 없었고 복귀에 62ms long task가 기록됐다. 이 long task는 위 후속 조사에서 계측 비용으로 확인했다. 가상화·`content-visibility`·전체 목록 재표시 최적화는 이번 변경에 포함하지 않았다.

### 비교 조건과 검증

- 기준 원본: `baseline-1793095324949.json`. 후보 최종 원본: `baseline-1793096476133.json`. 요약: `comparison.json`.
- 같은 계측 script, viewport, 브라우저 버전, 200개 게시글 fixture, 600px 왕복, warm-up 1회 + 측정 5회를 사용했다. 계측 script SHA-256: `5a238b1d520e170e0113e8cb35d137ff8704357dbab063d9daf80ce0b5e77db1`.
- 후보 메인 bundle: `index-a808544cf00166f9bfdfe2b37942ec83.js`, SHA-256 `a3b5a01aa76a4cdd20af2cdc8270f0480628e71384c6d587f85326c847c7012c`. export 전후 hook 소스 hash가 일치함을 확인했다.
- 후보 예비 실행 `baseline-1793096338124.json`은 회귀 확인에 사용했다. 최종 수치는 단위·타입·lint 검증이 끝나고 다른 검증 명령을 병렬 실행하지 않은 마지막 실행만 사용했다. 실행 로그는 `candidate-final-run.log`다.
- TDD: 신규 focus 회귀 3개가 수정 전 요청 수 assertion으로 실패한 뒤 통과했다. 최종 hook 테스트 13개는 inactive mount, stale callback, blur 중 요청 완료, document/container 복귀, 기존 중복·오류·Native 경로를 포함한다.
- 전체 app 단위 테스트 **1,262/1,262 통과**, 실패·취소 0. 새 hook import 때문에 드러난 standalone 테스트의 router mock 누락도 수정했다. app/web TypeScript, 변경 TS/TSX ESLint·Prettier, diff whitespace 검사 통과.
- 기존 Posts Storybook pagination 테스트 4개 통과, 범위 밖 113개 skip. 실제 production E2E 2개 통과: 18개 측정 시나리오와 새 guest 상세 왕복·pagination 재개 회귀.
- 독립 구현 리뷰에서 차단할 문제 없음. 원시 결과·비교 수치를 별도로 확인했다. Jev 보조 판단 도구가 없어 기존 코드·SDK 근거와 독립 리뷰를 사용했다.

## 수정 전 관찰

실제 API와 production Web export로 게스트 `/` 목록의 스크롤과 상세 왕복을 측정했다. 초기 측정에서 우선 수정할 후보로 **상세로 이동한 뒤 숨겨진 목록에서 계속되는 자동 pagination**을 확인했다. 아래는 수정 전 기록이다.

- 20행에서 상세로 이동하면 다음 페이지 요청이 9회, 100행에서는 5회 발생해 숨겨진 목록이 200행까지 증가했다. 각 조건 5회 모두 재현했다.
- 요청 시작 시점의 경로는 모두 상세 URL이었다. 클릭 준비 직후에는 목표 행 수가 유지됐으며, 상세 진입 종료 때 목록 DOM 200행 중 CSS상 표시 가능한 행은 0개였다. 단순한 측정 준비 스크롤이나 복귀 시점의 요청으로 분류하지 않는다.
- 20·100·200행의 고정 거리 스크롤에서는 long task가 없었다. 이 표본만으로 `content-visibility` 또는 가상화를 우선 적용할 근거는 부족하다.
- 상세 복귀 15회 모두 저장된 스크롤 위치가 정확히 복원됐다. 단, 복귀 시점에는 모든 표본의 목록이 이미 200행이다.

## 조건과 검증

- revision `3ef05382958ff766ac736b4e55277659ed5c3fbe` + 앞서 적용한 `PostListItem` 기본 memo. 이 실행은 memo 전후 비교가 아니다.
- 현재 작업 트리에서 `SENTRY_DISABLE_AUTO_UPLOAD=true pnpm --filter @kosmo/app exec expo export --clear --platform web` 성공 후 동일 export를 재사용했다. 메인 bundle `index-8077d53bcf85e85bb9a07cc3ee1e3e24.js` SHA-256: `7df7b2120a7d91decfdb9c0eec310d7c1b1a2898f4a1862fc134ad43b5b67bbc`.
- 공식 E2E 서버 구성의 API·BFF·Temporal·worker와 격리된 `kosmo_test_*` DB를 사용했다. BFF 배포 채널은 `dev`, JavaScript는 production export다. 운영 배포나 운영 네트워크를 측정한 것은 아니다.
- 단일 작성자의 고정 3문단 PUBLIC 게시글 200개. 게시글 첨부 미디어 없음. 게스트 페이지의 실제 중앙 column과 가입 안내를 포함한다.
- Apple M5 Pro / macOS 26.6.2, Playwright 1.60.0 번들 headless Chromium **148.0.7778.96**, 1280×900. 기존 E2E user-agent override 문자열은 Chrome 140이며 실제 실행 버전과 다르다. CPU/network throttling 없음.
- 목표 행 수마다 warm-up 1회 + 측정 5회. 매 시나리오 `/`를 다시 로드하여 Relay 환경을 새로 만들고 실제 pagination으로 20/100/200행을 구성한다. 같은 browser context를 사용하므로 HTTP 자산 cache는 warm 상태다.
- 각 시나리오 중간에서 600px 아래/위 wheel 5회. 아래로 실제 offset이 이동했음을 assert했다. 측정 75개 cycle 모두 목표 행 수 유지, 스크롤 구간 GraphQL 요청 0개.
- 실제 본문 클릭으로 상세 진입, 현재 Post 표시 확인, browser history back으로 목록 복귀. 클릭 준비 후 목표 행 수를 다시 검증하고 시작 offset을 기록했다. 복귀 안정화 후 500ms 추가 관찰한다.
- CDP Performance의 Task/Script/Layout/RecalcStyle duration 차이를 사용했다. TaskDuration은 측정 구간의 main-thread 실행 합이며 한 프레임이나 사용자 체감 latency가 아니다. React Profiler, compositor/GPU paint, 실제 FPS는 측정하지 않았다. rAF 간격은 진단용이며 FPS로 환산하지 않는다.
- Long Task API는 50ms 이상 task를 수집했다. heap과 Nodes 원본도 저장했지만 GC를 강제하지 않아 live 메모리 비교에는 사용하지 않는다.
- 최종 E2E 1개 통과(18개 시나리오), 계측 TypeScript·Prettier·diff whitespace 검사 통과. 별도 리뷰로 요청 시작/완료 시점, 자동 클릭 스크롤, 실제 행 수 변화에 따른 해석을 점검했다.

## 스크롤 결과

각 25개 cycle의 중앙값. 행 수는 실제 목록 DOM 수이며 이 구간에서는 숨겨진 행이 아니다. 표시 가능은 CSS 숨김 여부이며 viewport에 동시에 보이는 행 수를 뜻하지 않는다.

| 누적 행 | Main-thread task 합(ms) | Script 합(ms) | Layout 합(ms) | Style 합(ms) | Long task 합(ms) |
| ------- | ----------------------: | ------------: | ------------: | -----------: | ---------------: |
| 20      |                     5.4 |           1.3 |          0.00 |         0.13 |                0 |
| 100     |                    13.3 |           1.4 |          0.00 |         0.15 |                0 |
| 200     |                    19.7 |           1.6 |          0.00 |         0.17 |                0 |

최대 rAF 간격의 cycle별 중앙값은 9.1/9.8/9.8ms였다. 정적인 텍스트·warm 자산·고성능 데스크톱의 제한된 구간이다. 동적 이미지, 저성능 장치, 전체 피드 분포로 일반화하지 않는다.

## 상세 진입과 복귀

각 조건 5회 중앙값. 서로 다른 양의 pagination이 섞여 있으므로 아래 진입 값을 순수 상세 렌더 비용이나 행 수별 동일 작업 비교로 읽으면 안 된다.

| 진입 전 행 | 상세 진입 중 다음 페이지 요청 | 진입 종료 숨겨진 행 | 진입 Task 합(ms) | 복귀 Task 합(ms) | 복귀 Long task 합(ms) |
| ---------- | ----------------------------: | ------------------: | ---------------: | ---------------: | --------------------: |
| 20         |                             9 |                 200 |            651.8 |            217.7 |                    62 |
| 100        |                             5 |                 200 |            467.7 |            204.3 |                    64 |
| 200        |                             0 |                 200 |            240.7 |            197.5 |                    63 |

측정된 추가 페이지 요청 70개 모두 상세 URL에서 시작했다. 상세 화면 종료 관찰 시 목록 `rows=200`, `visibleRows=0`; 복귀 시 둘 다 200이다. 복귀 중 GraphQL 요청은 없었다. 따라서 복귀 결과는 모두 200행 목록의 재표시 비용이다. 복귀 측정에는 의도적인 500ms 대기가 있으므로 raw `durationMs`를 사용자 latency로 제시하지 않는다.

시작 offset 2020/11180/22630px가 각 5회 모두 정확히 복원됐다. `PostDetailQuery` 및 next-page 요청의 완료 시간과 상태는 원본 JSON에 남겼다. 로컬 DB/API 시간은 운영 서버 지연의 대체값이 아니다.

## 초기 측정의 원인 가설

`useAutomaticPagination.ts`는 Web document의 scroll/resize와 최초 RAF에서 near-end를 검사하고, 응답 완료 뒤 다시 검사한다. 화면 활성 여부를 검사하지 않는다. `InfiniteList`의 현재 Web 경로는 반환된 `endRef`를 연결하지 않으므로 이 현상을 IntersectionObserver sentinel 탓으로 단정하지 않는다.

관찰과 코드가 가리키는 가설은 **보존된 비활성 목록이 상세 화면의 document 높이를 기준으로 near-end를 판단하고 연속으로 다음 페이지를 요청하는 것**이다. callback 당시 높이까지 trace하지 않았으므로 세부 trigger는 가설로 남긴다. 이 근거에 따라 비활성 화면의 자동 pagination을 중단하는 좁은 변경을 구현하고 위와 같이 동일 조건으로 비교했다. 동적 높이 가상화나 본문 parsing cache는 추가하지 않았다.

## 산출물과 재실행

`test-results/prod-1222/production/`의 로컬 비추적 산출물:

- 수정 전 원본 `baseline-1793095324949.json`, 실행 로그 `run-final.log`, 화면 `baseline-runtime.png`.
- 수정 후 최종 원본 `baseline-1793096476133.json`, 실행 로그 `candidate-final-run.log`, 화면 `runtime.png`, 비교 `comparison.json`.
- `prod-1222-measurement.e2e.ts`, `playwright.measurement.config.ts`, `run.mjs`.
- 이전 파일들은 locator/행 수 assert 또는 계측 보정 전의 예비 실행이다. 위 표는 최종 원본만 사용했다.

재실행 시 보관한 spec을 `apps/web/e2e/`, config를 `apps/web/`로 복사한 뒤 현재 후보의 production export를 먼저 생성하고 bundle hash를 기록한다. 다음 명령은 고유 테스트 DB를 만들고 종료 시 해당 DB를 삭제한다. `run.mjs`도 loopback `kosmo_test_*` URL만 허용한다.

```sh
KOSMO_TEST_PORT_OFFSET=2000 SENTRY_DISABLE_AUTO_UPLOAD=true node scripts/test-db.mjs run -- node test-results/prod-1222/production/run.mjs
```

macOS Playwright는 승인된 sandbox 밖 실행에서 패키지와 일치하는 번들 Chromium을 사용한다. 다른 작업의 서버·DB는 변경하지 않았다. 이 작업의 서버와 격리 DB는 실행 종료 시 정리했다.

미검증: 로그인 Home/Following 경로, 이미지가 많은 데이터, 다른 브라우저·저성능 장치, screen reader, iOS 시뮬레이터·Android 실기기. 수정은 로컬 작업 트리에 있으며 커밋·push·배포는 수행하지 않았다. PROD-1222 전체 완료를 주장하지 않는다.
