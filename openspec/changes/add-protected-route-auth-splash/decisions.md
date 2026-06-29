## Context

`add-protected-route-auth-splash`의 proposal과 web-app-shell delta spec에 기록된 보호 라우트 인증 검증 구간 표시 정책을 ADR 형식으로 정리한다.

## Decision Records

### 캐시 없는 보호 라우트 검증 구간에는 풀스크린 스플래시를 표시한다

- Status: Accepted
- Context / Problem: 보호 라우트 콜드 로드에서 세션이 확정되기 전 fail-open 렌더가 게스트에게 `(tabs)` 셸과 홈 스켈레톤을 잠깐 노출한다.
- Decision Outcome: 재사용할 캐시된 세션이 없는 검증 구간에는 자식, 셸, 홈 스켈레톤 대신 보호 영역 전체를 덮는 스플래시를 표시한다.
- Alternatives Considered: 기존 fail-open 렌더를 유지할 수 있지만 게스트 플래시가 남고, 즉시 redirect는 유효 세션의 콜드 검증을 오판할 수 있다.
- Consequences: 세션 조회의 캐시 유무, null 확정, 오류 상태를 구분해야 한다.
- Confirmation / Follow-up: 콜드 게스트, 캐시된 유효 세션, 세션 오류 상태를 E2E 또는 컴포넌트 검증으로 확인한다.

### 세션 조회 오류에서는 기존 fail-open 동작을 유지한다

- Status: Accepted
- Context / Problem: 네트워크나 서버 오류를 인증 실패로 취급하면 유효 사용자가 보호 화면에서 불필요하게 차단될 수 있다.
- Decision Outcome: `currentSession` 조회가 오류로 실패한 동안에는 스플래시 대신 콘텐츠 렌더를 유지한다.
- Alternatives Considered: 오류 시에도 스플래시를 유지할 수 있지만 사용자가 회복 불가능한 빈 화면에 머물 수 있다.
- Consequences: 오류 상태는 게스트 리다이렉트 상태와 분리해 처리해야 한다.
- Confirmation / Follow-up: 기존 fail-open 정책을 회귀시키지 않는지 보호 layout 분기 테스트로 확인한다.

## Remaining Decisions

- 정식 로고와 브랜드 자산 도입은 후속 디자인 결정으로 남긴다.

## Superseded Decisions

- 없음.
