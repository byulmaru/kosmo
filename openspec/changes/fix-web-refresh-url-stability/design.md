# 원인과 수정 후보

## 확인한 원인

Linear에 기록된 로컬 진단은 HEAD `e0be74da9445b618c1f1aec336f061b7ab5730dd`, expo-router `56.2.13` 기준이다. 운영에서는 주소 변화, 로컬에서는 Router state와 실제 history 기록을 각각 확인했다. 최신 main의 runtime을 다시 실행한 결과는 아니다.

`apps/app/src/app/(tabs)/_layout.tsx`는 Web `Slot`을 `UniversalShell` 안에 렌더링한다. Shell은 자식 화면을 렌더링하기 전에 `UniversalShellQuery`를 읽는다. 이때 자식 state가 없는 `(tabs)`가 Web linking에 전달된다. 프로필 layout에도 `ProfileLayoutQuery`와 `Slot` 사이에 비슷한 경계가 있다.

`getPathFromState`는 자식 state와 index screen이 없으면 첫 screen인 `(post)/[profileHandle]/[postId]`를 선택한다. 누락된 동적 파라미터를 직렬화하면 `undefined`가 남고, `useLinking`은 계산된 경로를 history에 쓴다. 자식 state가 준비되면 원래 URL로 돌아온다. `initialRouteName: '(protected)'` 설정만으로 이 fallback을 막지는 못했다.

## 이전 PR의 맥락

[PR #632](https://github.com/byulmaru/kosmo/pull/632)는 `initialRouteName` 설정을 추가해 병합됐다. [PR #688](https://github.com/byulmaru/kosmo/pull/688)은 robin-maki가 작성했고 병합 없이 닫혔다. 사용자가 작업한 PR이 아니다.

#688은 불완전한 group state를 건너뛰는 6줄 Web linking guard와 `/`, `/home` cold-load 테스트를 추가했다. [작성자의 중단 설명](https://github.com/byulmaru/kosmo/pull/688#issuecomment-5435506284)은 dependency patch 유지 비용을 언급한다. 이는 당시 판단이며 이번 작업의 patch 금지나 사용자 선호를 뜻하지 않는다. 이번에 확인된 게시물 query와 중첩 경로 축약까지 그 guard로 해결되는지는 검증되지 않았다.

## 구현 단계에서 비교할 후보

| 후보                                  | 확인할 효과와 비용                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 앱의 navigation·데이터 로딩 경계 조정 | 불완전한 state가 URL 동기화에 들어가는지 확인한다. 하나의 navigator와 기존 loading·error·인가·actor 전환·focus·scroll을 보존할 수 있는지 비교한다.                |
| Web linking의 좁은 dependency patch   | 유효한 navigation state가 준비되기 전 URL 쓰기를 막을 수 있는지 확인한다. 게시물·중첩 경로, 초기 동기화·popstate bookkeeping과 버전별 patch 유지 비용을 검증한다. |

이번 구현은 공통 Web linking 경계의 좁은 Expo Router patch를 선택했다. 초기 history sync와 state 변경 처리에서 현재 route가 자식 state가 아직 준비되지 않은 실제 layout이고, 계산된 fallback 경로가 route에 보존된 요청 경로와 다를 때 history 쓰기를 건너뛴다. 자식 navigator가 준비되어 요청 경로를 직렬화할 수 있게 되면 일반 history 처리가 이어진다. 이미 같은 경로가 계산되거나 명시적인 nested screen이 전달된 흐름은 그대로 둔다. 이 방식은 Shell/Profile query 경계와 화면의 loading·인가 흐름을 바꾸지 않으면서 두 layout의 공통 Web serializer를 보호한다.

patch 적용 후 runtime behavior와 PostHog payload는 아직 검증하지 않았다. Expo Router 버전 변경 시 patch 유지 여부를 다시 확인해야 한다. A/B 사용자 승인을 일괄 선행 조건으로 두지 않았고, 이전 guard를 그대로 복원하거나 dependency upgrade만으로 해결됐다고 가정하지 않는다.

## 검증할 경계

정적 화면 6개(`/home`, `/search`, `/notifications`, `/bookmarks`, `/settings`, `/settings/theme`), Profile home/following, Post detail/reactions를 핵심 재현 경로로 삼고 `/privacy`를 비교한다. `/`는 먼저 `/home`으로 redirect된 뒤 새로고침한 과거 사례와 직접 `/` 접근을 구분한다.

실제 앱·API·격리 PostgreSQL fixture로 정상 응답과 Shell/Profile query 지연을 실행한다. 전체 history를 각 화면의 기대 URL과 비교하고 기존 query·hash와 의도된 redirect를 반영한다. URL 문자열에 `undefined`가 포함되는지만 검사하지 않는다.

PostHog는 localhost에서 초기화하지 않으므로 로컬 analytics 요청 부재만으로 검증하지 않는다. SDK가 활성화된 격리 browser에서 전송을 가로채고 positive control로 정상 pageview 수집을 확인하고 잘못된 pageview가 없는지도 확인한다. 기존 event·identity 정책과 운영 telemetry는 변경하지 않는다.
