## ADDED Requirements

### Requirement: 함수형 오류 경계 조합

**Authority / Provenance:** `memory/frontend-react-native.md`, `PROD-513`. 앱은 React 오류 경계를 저장소가 소유한 class component가 아니라 `react-error-boundary`를 사용하는 함수형 컴포넌트 조합으로 제공해야 한다(MUST). GraphQL, route와 session fail-open production wiring에는 React class component가 없어야 한다(MUST).

#### Scenario: 정상 렌더링

- **WHEN** 오류 경계의 자식이 오류 없이 렌더링된다
- **THEN** 경계는 기존 자식과 Suspense loading 동작을 그대로 렌더링한다

#### Scenario: 렌더링 오류

- **WHEN** GraphQL, route 또는 session 경계 아래에서 렌더링 오류가 발생한다
- **THEN** 해당 경계는 class component를 애플리케이션 코드에 추가하지 않고 대응하는 fallback을 렌더링한다

### Requirement: 기존 fallback과 reset 동작 보존

**Authority / Provenance:** `memory/frontend-react-native.md`, `PROD-513`. GraphQL 경계와 route 경계는 기존 한국어 오류 상태와 사용자 retry 동작을 보존해야 하고(MUST), retry는 경계 오류 상태를 reset한 뒤 소유자의 재조회 callback을 호출해야 한다(MUST). Session fail-open 경계는 오류 시 지정된 fallback을 표시하고 reset key가 바뀌면 자식 렌더링을 다시 시도해야 한다(MUST).

#### Scenario: GraphQL 또는 route 재시도

- **WHEN** 오류 fallback에서 사용자가 다시 시도 action을 실행한다
- **THEN** 경계는 포착한 오류를 reset하고 제공된 retry callback을 정확히 한 번 호출한다

#### Scenario: Session reset key 변경

- **WHEN** session 자식의 오류로 fail-open fallback이 표시된 뒤 reset key가 변경된다
- **THEN** 경계는 오류 상태를 reset하고 session 자식 렌더링을 다시 시도한다

### Requirement: 새 React class component 차단

**Authority / Provenance:** `PROD-513`. 저장소 ESLint 구성은 `@eslint-react/no-class-component`를 error로 적용해 새 React class component가 CI lint를 통과하지 못하게 해야 한다(MUST). non-React domain error class는 이 규칙의 대상이 아니어야 한다(MUST NOT).

#### Scenario: 의도적인 class component fixture

- **WHEN** lint 회귀 검증이 React class component fixture를 검사한다
- **THEN** ESLint는 `@eslint-react/no-class-component` 오류를 보고한다

#### Scenario: Domain error class

- **WHEN** ESLint가 `Error`를 상속하는 non-React domain class를 검사한다
- **THEN** class component 규칙은 해당 class를 오류로 보고하지 않는다
