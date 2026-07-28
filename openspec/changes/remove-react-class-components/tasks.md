## 1. PROD-513 함수형 오류 경계와 class component 재발 방지

**Authority / Provenance**

- `memory/frontend-react-native.md`
- `PROD-513`

**Deliverable**

Android·iOS·Web 공용 앱의 production 오류 경계가 class component 없이 기존 fallback·복구 계약을 유지하고, CI lint가 새 React class component를 차단한다.

**Guardrails**

- 오류 경계는 저장소 내부 class wrapper가 아니라 `react-error-boundary`를 사용한다.
- 사용자-visible fallback 문구와 retry/reset, session reset key, route Suspense 동작을 바꾸지 않는다.
- production caller가 없는 reporter/context는 선행 도입하지 않고 PROD-477/#375에서 실제 Web Sentry wiring과 함께 추가한다.
- non-React domain error class는 금지하지 않는다.
- PROD-513을 main 기반 선행 PR로 만들고 PROD-477/#375를 그 위에 쌓는다.

**Verification**

- production 오류 경계의 정상, 오류 fallback, 사용자 retry와 session reset key를 browser integration test로 검증한다.
- 실제 루트 ESLint config로 class component fixture 실패와 domain error fixture 통과를 검증한다.
- 앱 TypeScript, Storybook, ESLint, Prettier, strict OpenSpec validation과 `git diff --check`를 통과시킨다.
- PROD-513 PR이 main을 base로 삼는지 확인하고, 후속 PROD-477/#375에 stack 방향을 명시한다.

- [x] 1.1 필요한 runtime·lint 의존성을 pnpm CLI로 추가한다.
- [x] 1.2 GraphQL, route와 session fail-open 경계를 함수형 조합으로 전환한다.
- [x] 1.3 production wiring의 fallback, retry/reset과 reset key 동작을 검증하는 integration test를 추가한다.
- [x] 1.4 루트 ESLint config에서 React class component 금지 규칙을 error로 적용한다.
- [x] 1.5 class component와 non-React domain class fixture를 사용하는 ESLint 회귀 검증을 추가한다.
- [x] 1.6 전체 검증을 통과시키고 main 기반 PR을 만든 뒤, PROD-477/#375가 이 PR 위로 재배치될 후속 관계를 기록한다.
