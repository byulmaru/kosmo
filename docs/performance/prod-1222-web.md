# PROD-1222 Web 누적 행 렌더 측정 — 2026-10-27

## 결과와 적용 범위

`PostListItem`에 기본 `React.memo`를 적용했다. 실제 Relay pagination 회귀 테스트에서 기존 행의 불필요한 렌더가 사라지고 추가 행이 표시되는 것을 확인했다. 본문 파싱·검증, fragment 구독, 목록의 mount 범위는 변경하지 않았다.

Web 개발용 Storybook의 고정 fixture에서 누적 응답 반영 비용을 비교했다. **네트워크 pagination, 실제 route 왕복, production 빌드 또는 Native 성능 측정 결과가 아니다. PROD-1222 전체 완료 근거로 사용하지 않는다.**

## 측정 코드 보관

일회성 `WebBaselineMeasurement` story와 전역 collector는 상시 Storybook에서 제거했다. 당시 코드는 [측정 커밋의 Posts.stories.tsx](https://github.com/byulmaru/kosmo/blob/cfcb3275400a6a26851dec98369861fcbed2a5f7/apps/app/src/stories/patterns/Posts.stories.tsx)에 보관되어 있다. 아래 조건은 당시 측정 기록이며 현재 story 실행 안내가 아니다. 실제 Relay pagination의 기존 행 렌더 보존, 비활성 목록 자동 조회 중단, 클릭·드래그 취소 회귀 테스트는 유지한다.

## 재현 조건

- 기준 revision: `3ef05382958ff766ac736b4e55277659ed5c3fbe`; 후보는 이 revision에 PostListItem 기본 memo만 추가한 제품 코드다.
- 공통 measurement story SHA-256: `e207098c9f447b5691d7836437c0538a6c95f23105df9d5c427e823299f96553` (상태 표시 문구 보정 전).
- Apple M5 Pro, arm64, macOS 26.6.2. Playwright 1.60.0의 번들 headless Chromium 148.0.7778.96. 시스템 Chrome은 사용하지 않았다.
- Storybook 10.6.2 개발 서버, React 19.2.3 개발 모드, React Native Web 0.21.2, Relay 21.0.1. viewport 1280×900, deviceScaleFactor 1, CPU/network throttling 없음.
- Story: `kosmo-patterns-post-catalog--web-baseline-measurement`. 전체 너비에 같은 두 문단 본문·고정 일시·작성자·미디어 1개·반응/재게시/답글 수가 있는 게시글을 렌더한다. 미디어는 기존 로컬 fixture를 재사용한다. 실제 피드 분포나 중앙 column 폭을 대표하는 표본은 아니다.
- 페이지마다 새 Relay environment를 만들고 처음 20개 record를 게시한다. append는 동일 query에 현재 누적 N+20개 응답을 게시한다. 따라서 실제 `loadNext`의 20개 응답 정규화 비용과 다르다. 20개씩 200개까지 누적한다.
- 동일 값 refresh는 새로운 객체로 같은 값의 응답을 다시 게시한다. 한 행 update는 첫 번째 본문/document만 바꾼다. detail-return은 목록을 unmount한 뒤 다시 mount하는 시뮬레이션이며 router를 사용하지 않는다.
- 각 측정 동작 전에 canonical payload를 다시 게시하고 안정화하여 직전 한 행 수정의 복원 비용을 제외했다. 측정 UI를 자동 갱신하지 않으며 collector API를 직접 reset/read했다.
- 각 버전에서 전체 시나리오 warm-up 1회 뒤 5회 반복. 동작 후 300ms 대기. 기준과 후보는 같은 script·fixture·순서다. CPU 샘플링은 별도 마지막 append에서만 실행해 타이밍 표본에 섞지 않았다.
- 메모리는 CDP 강제 GC 후 `Runtime.getHeapUsage().usedSize`의 MiB이며 React/Storybook/fixture를 포함한다. 프로세스 RSS나 GPU/image memory는 측정하지 않았다. DOM 행 수를 실제 selector로 assert했고 두 버전 모두 browser runtime error는 0건이다.

## 20행 추가 결과

값은 5회 중앙값, 화살표는 기준 → 후보다. React 시간은 Profiler callback의 `actualDuration` 합이며 DOM commit 시간이나 사용자가 느끼는 응답 시간이 아니다. long task는 수집 구간에 관찰된 50ms 이상 main-thread task의 duration 합이며 FPS 또는 총 JS 실행 시간이 아니다.

| 누적 행 변화 | React 렌더 합(ms) | 감소율 | long task 합(ms) | GC 후 JS heap(MiB) | commit 수 중앙값 |
| ------------ | ----------------: | -----: | ---------------: | -----------------: | ---------------: |
| 20 → 40      |     181.3 → 156.2 |  13.8% |    178.0 → 173.0 |      106.6 → 106.6 |        5.0 → 5.0 |
| 100 → 120    |      286.7 → 77.8 |  72.9% |     390.0 → 66.0 |      154.3 → 148.9 |        5.0 → 6.0 |
| 180 → 200    |     367.6 → 135.0 |  63.3% |    556.0 → 152.0 |      206.9 → 201.0 |        5.0 → 5.0 |

commit 개수가 같거나 증가해도 기존 행의 render work는 감소할 수 있다. 이미지·내부 effect의 후속 commit과 개발 계측을 포함하므로 commit 수만으로 개선을 판정하지 않는다. mounted row는 개선 전후 동일하며 가상화 효과나 메모리 절감을 주장하지 않는다.

## 갱신과 재마운트

| 시나리오                 | 누적 행 | React 렌더 합(ms) | long task 합(ms) | GC 후 JS heap(MiB) |
| ------------------------ | ------: | ----------------: | ---------------: | -----------------: |
| 동일 값 재게시           |      20 |         0.0 → 0.0 |        0.0 → 0.0 |        85.0 → 85.0 |
| 동일 값 재게시           |     100 |         0.0 → 0.0 |        0.0 → 0.0 |      143.4 → 143.7 |
| 동일 값 재게시           |     200 |         0.0 → 0.0 |        0.0 → 0.0 |      207.0 → 201.1 |
| 첫 행 본문 변경          |      20 |         1.0 → 1.0 |        0.0 → 0.0 |        85.2 → 85.2 |
| 첫 행 본문 변경          |     100 |         0.8 → 0.9 |        0.0 → 0.0 |      143.4 → 143.8 |
| 첫 행 본문 변경          |     200 |         1.0 → 1.1 |        0.0 → 0.0 |      207.1 → 201.2 |
| 목록 재마운트 시뮬레이션 |      20 |     156.1 → 151.3 |    167.0 → 161.0 |        91.0 → 91.0 |
| 목록 재마운트 시뮬레이션 |     100 |     359.8 → 401.0 |    420.0 → 467.0 |      135.9 → 139.9 |
| 목록 재마운트 시뮬레이션 |     200 |     619.5 → 666.7 |    887.0 → 903.0 |      196.1 → 196.5 |

동일 값 재게시에서는 모든 표본에서 commit이 0개였다. 한 행 update는 모든 표본에서 commit 3개였고, 누적 행 수에 비례해 비용이 늘지 않았다. 초기 20행 mount의 React 렌더 합은 104.9 → 103.3ms, commit 9개였다.

재마운트의 100·200행 중앙값은 후보에서 오히려 높았다. 이 변경이 재마운트를 개선했다고 주장하지 않는다. 이미지를 포함한 개발 모드 scheduling 편차와 새 트리 생성 비용을 포함하며, memo는 새 mount를 생략하지 못한다. 전체 데이터/DOM 규모의 비용은 남아 있다.

별도 기준 CPU 표본에서 React element/JSX 생성과 React Native Web DOM props 처리 등이 크게 관찰되었고 본문 renderer 함수 자체는 주된 비용으로 나타나지 않았다. 실제 Relay 회귀 테스트에서 기존 행이 다시 렌더되는 현상을 재현한 뒤 가장 작은 기존 memo 패턴을 선택했다. 기본 비교만 사용하고 custom comparator나 파싱 cache는 추가하지 않았다. Jev evaluate 도구가 없어 별도 보조 판단 호출은 하지 않았다.

## 기능 검증

- 회귀 테스트 red/green: memo 적용 전 retained row render count가 2→3으로 늘어 실패; 적용 후 기존 행 count 유지와 새 행 표시를 함께 검증하여 통과.
- `InfiniteList.test.ts`, `TimelineRefresh.relay.test.ts`, `PostContentRenderer.test.ts`, `PostList.profileBlock.relay.test.ts`, `PostListItem.native.test.ts`: 합계 48개 통과.
- 관련 기존 Posts Storybook 테스트 10개 통과, 나머지 107개는 선택 범위 밖으로 skip. pagination 자동 추가·실패/retry·loading 행 보존, bookmark/reaction, 본문과 상세 이동 분리, content warning 공유, 미디어 revision, reply success lifecycle을 선택했다.
- TypeScript noEmit, 해당 파일 ESLint/Prettier, Storybook build, diff whitespace 검사가 통과했다. 빌드 후 계측 상태 표시 문구만 `last snapshot mounted rows`로 보정했고 타입·lint·format 검사를 다시 통과했다.
- 내장 Browser: 실제 행 20→40, 첫 행 본문 변경과 이후 canonical 응답 반영, Enter로 미디어 열기, Escape로 닫은 뒤 원래 미디어 버튼 focus 복귀를 확인했다. 내장 Browser는 Chromium 156이며 수치 측정용 Chromium 148과 구분한다.
- 기존 Relay fixture missing-field/connection 및 React deprecated/native touch 경고가 발생했다. 위 테스트 실패는 없었다.
- 독립 리뷰에서 최종 제품 diff의 차단할 정확성 문제는 발견되지 않았다.

## 남은 검증

이후 수행한 실제 production Web 게스트 목록의 스크롤·상세 왕복 결과는 [별도 보고서](./prod-1222-web-production.md)에 기록했다. 아래 항목은 최초 Storybook 측정 시점의 검증 경계다.

실제 Web route의 pagination/refresh 네트워크와 뒤로가기 scroll restoration, 다양한 동적 이미지 높이·본문/미디어 분포, production 빌드 성능, Web screen reader는 미검증이다. 실패/retry·빈 상태·중첩 액션의 기능 테스트 통과를 이 runtime 증거로 대체하지 않는다.

iOS는 별도 시뮬레이터, Android는 실기기로 후속 측정하기로 했고 이번 작업에서는 실행하지 않았다. Native 단위 렌더 테스트는 Native 기기 성능/접근성/스크롤 검증이 아니다. 실제 조건에서 남은 mount/DOM 비용이 문제라면 동적 높이·스크롤 복원·키보드·접근성 계약과 함께 다음 변경 범위를 결정한다.

## 로컬 산출물과 실행

비추적 `test-results/prod-1222/`에 `baseline.json`, `candidate.json` (raw 표본과 CPU profile), `benchmark.mjs`, `web-qa.png`를 보관했다. 초기 계측 UI 간섭이 있던 예비 실행은 표에서 제외했다.

```sh
pnpm --filter @kosmo/app exec storybook dev -p 6122 --ci --disable-telemetry
node test-results/prod-1222/benchmark.mjs test-results/prod-1222/recheck.json
```

macOS에서 benchmark Chromium은 해당 환경 승인 정책에 따라 sandbox 밖에서 실행한다. 버전이 맞는 Playwright bundled Chromium을 사용하며, 코드 변경 전에 기준 결과를 따로 저장한다. 결과 수집에는 시간·heap 오버헤드가 있으므로 이 개발용 수치를 production latency로 환산하지 않는다.
