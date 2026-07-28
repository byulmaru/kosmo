## Context

현재 main의 `GraphQLErrorBoundary`, `RouteBoundary`, `SessionFailOpenBoundary`는 각각 React `Component`를 직접 상속한다. PR #375는 Web Sentry를 연결하면서 같은 오류 경계를 확장하므로, 이 선행 변경은 class 제거와 기존 복구 동작만 독립적으로 소유하고 production caller가 없는 reporter 계약은 후속 PR에 둔다.

React 자체에는 함수형 오류 경계 API가 없다. 앱은 Android·iOS·Web 공용 코드와 platform file resolution을 사용하며 Native Sentry는 후속 범위다. ESLint는 루트 flat config 하나를 모든 workspace에 적용하고 root `test`는 workspace test를 순차 실행한다.

## Goals / Non-Goals

**Goals:**

- 세 production 오류 경계를 `react-error-boundary` 기반 함수형 컴포넌트로 전환한다.
- 기존 fallback, retry/reset, reset key와 Suspense 동작을 검증한다.
- 실제 루트 ESLint config가 class component fixture를 거부하는 회귀 테스트를 둔다.

**Non-Goals:**

- 오류 UI나 문구 변경
- Sentry SDK, event 정책, 배포 설정 또는 Native 수집 구현
- React component가 아닌 domain error class 제거

## Implementation Guidance

### Current Constraints

- GraphQL/route retry는 경계 내부 오류 상태를 먼저 지운 뒤 소유자의 query retry callback을 호출해야 같은 render tree가 다시 시도된다.
- session fail-open은 사용자 action이 없고 `resetKey` 변화만으로 복구한다.
- route 경계는 오류 포착과 함께 정상 경로의 Suspense loading fallback을 계속 소유한다.
- PR #375의 reporter/context와 Web Sentry production wiring은 이 선행 변경에 미리 추가하지 않는다.
- class fixture를 일반 `.tsx`로 두면 정상 lint가 항상 실패하므로 회귀 테스트가 명시적으로 source를 읽어 ESLint API에 전달해야 한다.

### Recommended Approach

세 경계가 `react-error-boundary`의 `ErrorBoundary`를 직접 조합하고 함수형 fallback renderer에서 `resetErrorBoundary`를 사용한다. GraphQL/route는 `onReset`에서 기존 callback을 실행하고, session은 `resetKeys`로 기존 reset key 계약을 표현한다.

오류 경계 동작은 production component를 직접 렌더링하는 Storybook browser story로 검증한다. ESLint 회귀는 루트 config를 로드하는 `ESLint.lintText` 테스트에서 class component fixture의 rule id와 non-React error class 통과를 함께 확인한다.

### Allowed Alternatives

- Storybook browser test와 동등하게 production component, 실제 React error lifecycle과 사용자 retry를 검증하는 renderer 기반 integration test를 사용할 수 있다.

### Known Traps

- 함수형 wrapper 안에 자체 class error boundary를 다시 숨기지 않는다.
- error 여부를 truthiness로 판정하지 않는다. `react-error-boundary`가 포착 상태를 소유하게 한다.
- retry callback만 호출하고 `resetErrorBoundary`를 생략하지 않는다.
- production caller가 없는 reporter prop/context를 테스트만을 위해 선행 도입하지 않는다.

## Risks / Trade-offs

- [라이브러리 reset 순서가 기존 수동 setState와 달라질 수 있음] → 사용자 retry와 callback 호출 순서를 production wiring test로 고정한다.
- [Storybook의 Web 검증만으로 Native bundle 분리를 놓칠 수 있음] → TypeScript/Expo export와 source import 검사를 함께 수행하고 공용 파일에는 platform SDK import를 두지 않는다.
- [ESLint plugin이 일반 class까지 오탐할 수 있음] → non-React `Error` class fixture의 통과를 같은 테스트에서 검증한다.

## Migration Plan

1. PROD-513을 최신 main 기반 선행 PR로 구현하고 검증한다.
2. PR #375의 PROD-477 브랜치를 PROD-513 위로 rebase한다.
3. #375에서 함수형 경계에 reporter/context와 Web Sentry production wiring을 함께 추가하고 수집 테스트를 검증한다.
4. PROD-513 merge 후 #375의 base를 main으로 전환한다.

롤백 시 PROD-513 PR 하나를 되돌리면 기존 class 경계와 lint 구성으로 복원된다. #375가 이미 그 위에 있으면 #375의 reporter wiring도 함께 재조정해야 한다.

## Open Questions

없음.
