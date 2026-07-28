## Why

앱의 공용 오류 경계가 React class component에 의존하고 있어 함수형 컴포넌트 중심의 코드 규칙과 어긋나며, 새 class component가 추가되어도 CI가 감지하지 못한다. PR #375의 Web Sentry 연결이 이 경계를 확장하기 전에 검증된 함수형 조합 지점으로 전환하고 정적 규칙으로 재발을 막는다.

## What Changes

- 앱의 GraphQL, route, session fail-open 오류 경계를 `react-error-boundary` 기반 함수형 조합으로 전환한다.
- 기존 사용자-visible fallback, retry/reset, reset key와 Suspense 동작을 보존한다.
- 오류와 React component stack을 선택적 reporter로 전달하는 공용 조합 지점을 제공해 Web Sentry와 Native 분리 계약을 유지할 수 있게 한다.
- `@eslint-react/no-class-component`를 error로 적용하고 의도적인 class component fixture가 lint에서 실패하는지 검증한다.

## Authority / Provenance

- Canonical: `memory/frontend-react-native.md` (적용 가능한 `docs/domain`·`docs/design` 문서 없음)
- Linear Contract: `PROD-513`
- Linear Implementations: 없음.

## Capabilities

### New Capabilities

- `react-error-boundary-composition`: universal 앱의 함수형 오류 경계 동작, reporter 계약과 class component 금지를 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/app`의 GraphQL, route, session 오류 경계와 관련 테스트
- 루트 ESLint flat config와 lint 회귀 검증
- `react-error-boundary`, `@eslint-react/eslint-plugin` 의존성 및 lockfile
- 후속 PR #375의 Web Sentry 오류 수집 wiring
