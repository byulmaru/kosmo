## Current Constraints

이 문서는 이번 세션의 조사와 구현 후보를 기록한 working note다. 제품 요구사항의 근거는 PROD-1103이며, 아래 후보는 구현 승인이나 영구 결정이 아니다.

- 조사 기준: main `960f3eb6d61b450f88985eff60804e2d649ccd24`, `expo-router` 56.2.13, Expo SDK 56.
- `apps/app/src/app/(tabs)/_layout.tsx`의 Web `Slot`은 `UniversalShell` 안에 있다. `UniversalShellContent`는 `UniversalShellQuery`를 읽은 뒤 자식을 렌더링한다.
- Profile의 `[profileHandle]/_layout.tsx`에도 `ProfileLayoutQuery`를 읽은 뒤 `Slot`을 렌더링하는 경계가 있다. Shell 수정만으로 중첩 Profile route까지 해결된다고 단정할 수 없다.
- 설치된 Web `useLinking`은 focused state를 URL로 직렬화하고 history에 쓴다. 자식 state가 없는 그룹은 `getPathFromState`의 첫 screen fallback으로 잘못된 게시물 경로가 될 수 있다.
- Linear에 기록된 runtime 조사 기준은 `e0be74da9445b618c1f1aec336f061b7ab5730dd`다. 기존 JSON을 현재 세션에서 읽어 이력을 확인했으나 runtime 재실행은 하지 않았다. 최신 main의 관련 경계 코드와 비교했으며, 이전 run을 최신 main의 재현 결과로 표시하지 않는다.

### 이전 수정의 범위

| 기록              | 확인된 내용                                                                                             | 이번 작업에서의 의미                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| PR #632           | `initialRouteName` 설정 추가, merged=true                                                               | 현재 남은 직렬화 경계를 별도로 다뤄야 한다                                  |
| PR #688           | 작성자 `robin-maki`, 그룹 상태를 건너뛰는 Web patch와 `/`·`/home` cold-load 테스트, closed·merged=false | 과거 후보와 제한을 참고한다. 사용자 작업 또는 현재 승인으로 취급하지 않는다 |
| PR #688 중단 댓글 | 작성자가 dependency patch 유지 비용 대비 영향도가 작다고 판단했다                                       | 과거 판단이며 PROD-1103의 새 범위·우선순위를 대신 결정하지 않는다           |

### 정식 dependency 상태

2026-10-08 npm 배포본 `56.2.21`과 `57.0.25`의 `build/fork/useLinking.js`를 직접 읽었다. 두 버전의 해당 state-change 경계는 focused route 직후 path를 계산하며 위 그룹 guard가 없다. 호환 업데이트만으로 해결된다는 근거는 찾지 못했다. 이 버전들에서 Kosmo runtime을 실행한 것은 아니다.

Expo upstream `main`은 58.0.16이며 linking 구조가 이미 다르다. 이를 SDK 56의 수정 여부 또는 바로 도입할 수 있는 호환 업데이트로 간주하지 않는다. upstream issue #48346은 closed지만, 그 상태만으로 현재 배포본의 수정 완료를 증명하지 못한다.

## Practical Approach

먼저 정상 응답과 지연 응답에서 직접 접근·새로고침의 전체 history를 확인하는 회귀 테스트를 만든다. `undefined` 문자열의 부재만 확인하지 않고, 시작 URL과 기존 정책이 허용한 의도된 이동을 기대값으로 삼는다.

현재 선택되지 않은 구현 후보는 두 가지다.

| 후보                                      | 적용 경계                                                           | 기대 효과                                                              | 비용과 아직 필요한 증거                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A. 앱의 navigator와 데이터 로딩 경계 분리 | `UniversalShell`, 필요하면 Profile layout의 query·presentation 경계 | navigation을 데이터 준비와 분리해 불완전한 route state의 발생을 줄인다 | 단일 navigator의 위치·identity를 유지하고 기존 loading·error·인가·actor 전환·focus·scroll을 보존할 수 있는지 실제 검증이 필요하다 |
| B. Web linking dependency patch           | 설치 버전에 묶인 `useLinking`의 URL 기록 경계                       | 불완전한 state가 browser history에 기록되는 지점을 직접 제어한다       | 최초 history sync와 이후 state event, 그룹 외 중첩 경로·쿼리 사례도 검증해야 한다. 버전 갱신 시 재검증·patch 제거 책임이 생긴다   |

A는 query를 읽는 데이터 소비자를 navigator와 분리하는 제한된 변경으로 검토한다. fallback과 정상 화면에 서로 다른 `Slot`을 두거나 navigator를 조건부로 교체하는 방식은 remount·effect 중복 위험이 있다. 인증 여부를 확인하기 전에 보호 화면을 노출하면 기존 계약을 벗어난다.

B를 선택해도 #688의 6줄 guard를 그대로 복원하는 것으로 완료하지 않는다. 그룹 guard만으로 Post detail의 임시 query와 reactions의 부모 경로 기록이 사라지는지는 미검증이다. 이전 state와 popstate bookkeeping, 합법적인 group navigation을 보존해야 한다.

### 실행 검증 계획

| 경로군            | 대표 fixture                                                                       | 검사                                                                |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 정적·보호 route   | `/home`, `/search`, `/notifications`, `/bookmarks`, `/settings`, `/settings/theme` | 직접 접근과 reload, 정상·지연 Shell query, 전체 URL 유지            |
| Profile route     | fixture Profile Home, `/following`                                                 | Shell·Profile query를 각각 지연, 부모 경로와 `/undefined` 기록 없음 |
| Post route        | fixture Post detail, `/reactions`                                                  | path parameter의 query 유출과 중첩 suffix 소실 없음                 |
| Shell 밖 route    | `/privacy`                                                                         | 기존 공개 접근·URL 유지                                             |
| 의도된 navigation | `/` redirect, 내부 이동, query-only 이동, back·forward                             | 기존 목적지·history·scroll·focus 동작                               |
| 실패 상태         | missing Profile/Post, guest 보호 route, query 오류·retry                           | 기존 not-found·인가·오류와 유효한 URL                               |

Playwright init script가 각 문서의 `document`, `pushState`, `replaceState`를 시작부터 기록하도록 기존 tracer를 재사용한다. reload 전후 기록을 분리해 이전 문서의 성공으로 현재 문서의 잘못된 기록을 가리지 않는다. query·hash가 있는 유효 URL은 실제 기대값과 비교한다. 모든 값에서 문자열 `undefined`를 일괄 금지하면 유효한 검색어까지 잘못 거부할 수 있다.

PostHog는 localhost에서 초기화되지 않고 기존 E2E도 `dev` 채널이다. 별도 격리 browser fixture에서 로컬 서버를 가리키는 non-loopback hostname과 테스트 설정을 사용하고, 실제 SDK의 전송만 interception해 `$pageview` payload를 검사한다. 분석이 활성화됐다는 positive control도 확인한다. 운영 수집 재개·설정 변경·실사용자 데이터 조회는 포함하지 않는다.

## Alternatives and Traps

- `initialRouteName`만 다시 설정하거나 route 순서·이름을 바꾸는 방식은 현재 확인된 state 직렬화 경계를 해결한다는 근거가 없다.
- URL에 `undefined`가 보이면 `/home`으로 보내는 화면별 guard는 사용자가 요청한 동적·중첩 경로와 not-found를 훼손할 수 있다.
- history를 앱에서 감싸 잘못된 문자열만 걸러내거나 analytics event만 버리면 navigation state의 문제와 부모 경로·쿼리 변형이 남을 수 있다.
- PR #688 본문의 대안 실험·검증 수치는 그 PR의 보고다. 현재 세션에서 재현하거나 이번 전체 경로군의 결과로 승격하지 않는다.

## Risks / Limits

- 원인 조사와 후보 효과는 구분한다. 현재 runtime JSON은 과거 조사에서 수집한 증거이고 수정 효과는 아직 없다.
- A는 query 경계를 바꾸며 Shell 상태·Profile 인가와 Relay actor reset의 회귀 면적이 커질 수 있다. 공유 코드를 변경하면 Web과 영향받는 Native 동작을 함께 검증한다.
- B는 설치 버전과 Web fork에 결합된다. Native와 serializer의 정상 fallback을 변경하지 않는 범위인지 검사하고 upstream 교체 때 같은 회귀 테스트를 사용한다.
- 두 후보 모두 schema·DB migration을 요구하지 않는다. 제품 변경 rollback은 해당 구현 변경을 되돌리는 범위이며 배포 승인을 포함하지 않는다.
- 운영 배포 SHA·수정 후 실제 사용자 pageview·다른 browser 조합은 확인하지 않았다. CI 결과와 운영 acceptance를 별도 기록한다.

## Open Questions

- 수정 방향은 Pending이다. 사용자는 선택 전에 #688의 맥락 설명을 요청했고, 현재 세션에서 작성자·diff·중단 댓글을 확인해 설명했다. 해당 요청은 A 또는 B의 선택이 아니다.
- 후보의 실제 변경 범위가 기존 loading·권한·공개 URL·호환성 보장을 바꿀 경우에는 그 차이를 사용자에게 제시한다. 일반적인 파일·함수·테스트 배치는 구현 선택으로 처리한다.
