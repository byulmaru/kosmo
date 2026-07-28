## Context

이 기록은 PROD-513의 class component 제거·재발 방지 계약, `memory/frontend-react-native.md`의 universal/platform 경계와 사용자가 정정한 PR stack 순서를 구현 가능한 durable choice로 정리한다.

## Decision Records

### 오류 경계는 react-error-boundary로 구현한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `memory/frontend-react-native.md`, `PROD-513`
- Status: Active
- Context / Problem: React에는 함수형 오류 경계 API가 없지만 앱 소스에서 class component를 제거해야 한다.
- Decision Outcome: 저장소 내부 class wrapper를 새로 만들지 않고 검증된 `react-error-boundary` API를 함수형 컴포넌트에서 조합한다.
- Alternatives Considered: 기존 class 유지, 공용 wrapper 아래 private class를 숨기는 방식, 오류 경계 기능 제거. 모두 class 제거 또는 기존 오류 복구 계약을 만족하지 못한다.
- Consequences: 오류 포착 lifecycle은 외부 라이브러리에 의존하며 fallback/reset 계약을 integration test로 고정해야 한다.
- Confirmation / Follow-up: production 오류 경계 test와 전체 앱 TypeScript/Storybook 검증을 통과시킨다.

### Reporter 계약은 실제 production 조합과 함께 도입한다

- Decision Date: 2026-07-28
- Decision Class: User-confirmed Choice
- Authority / Provenance: 사용자 결정, `PROD-513`, `PROD-477`
- Status: Active
- Context / Problem: PROD-513에서 reporter prop/context를 먼저 제공하면 production caller가 없고 Storybook 주입 경로만 계약을 사용한다.
- Decision Outcome: PROD-513은 함수형 경계와 복구 동작만 제공한다. reporter/context, error와 component stack 전달 계약은 실제 Web Sentry production caller가 생기는 PROD-477/#375에서 함께 도입한다.
- Alternatives Considered: 선택적 reporter를 선행 base에 미리 제공. 사용되지 않는 공개 계약과 test-only wiring을 만든다.
- Consequences: PROD-513에는 Sentry 관측 추상화가 없으며 PR #375가 Web/Native 분리와 production reporter wiring을 온전히 소유한다.
- Confirmation / Follow-up: PROD-513에서는 fallback/reset을 검증하고, reporter 인자와 Web production 조합은 PR #375에서 검증한다.

### ESLint가 React class component를 error로 차단한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-513`
- Status: Active
- Context / Problem: 현재 class를 제거해도 새 class component의 재도입을 CI가 막지 못한다.
- Decision Outcome: `@eslint-react/eslint-plugin`의 `@eslint-react/no-class-component`를 루트 flat config에서 error로 적용한다.
- Alternatives Considered: 코드 검색만 수행, 리뷰 관례만 기록, 모든 class를 금지. 전자는 AST 계약을 정확히 검증하지 못하고, 리뷰 관례는 자동 차단이 아니며, 전체 class 금지는 domain error까지 범위를 확장한다.
- Consequences: 새 React class component는 root lint를 실패시키고 non-React class는 계속 허용된다.
- Confirmation / Follow-up: 실제 config로 class component fixture가 해당 rule id를 보고하고 domain error fixture는 통과하는지 테스트한다.

### PROD-513을 PR #375의 선행 base로 둔다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-513`, `PROD-477`
- Status: Active
- Context / Problem: PR #375가 미병합 상태에서 같은 오류 경계에 Sentry wiring을 추가하고 있다.
- Decision Outcome: PROD-513은 최신 main에서 독립 구현하고, PROD-477/#375를 PROD-513 위로 rebase해 `main → PROD-513 → PROD-477` 순서로 리뷰한다.
- Alternatives Considered: PROD-513을 #375 위에 stack, 두 변경을 #375에 합치기. 전자는 독립적인 기반 변경의 병합을 Sentry rollout에 묶고, 후자는 이슈·OpenSpec·rollback 경계를 혼합한다.
- Consequences: #375는 함수형 경계 위에 reporter/context와 Web Sentry 조합을 추가해야 하며 PROD-513 merge 뒤 base를 main으로 전환한다.
- Confirmation / Follow-up: 양쪽 Git ancestry와 GitHub base ref를 갱신하고 PR 본문에 stack을 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 초기 Linear 초안의 `main → PROD-477 → PROD-513` stack은 사용자의 방향 정정으로 폐기되었고, `main → PROD-513 → PROD-477` 결정이 대체한다.
