## Session Context

PROD-1103의 이번 작업은 공통 Web routing 문제를 조사하고 구현 세션에 넘길 spec 초안을 작성하는 것이다. 이 파일은 working note이며 ADR이나 승인 기록이 아니다.

## Choice Notes

### 검증 대상은 최종 URL과 전체 이력

- Date: 2026-10-09
- Authority / Provenance: PROD-1103 완료 조건과 기존 runtime history JSON
- Decision Date: 2026-10-09
- Decision Class: Existing Issue Requirement
- Status: Confirmed
- Upstream context: https://linear.app/byulmaru/issue/PROD-1103
- Choice: 정적·동적·중첩 route의 직접 접근과 reload에서 document·pushState·replaceState 전체 이력을 검증한다.
- Reason: 이전 조사에서 최종 URL이 정상이어도 중간 경로와 query는 변했다.
- Alternatives: 최종 `/home` 또는 `/undefined/undefined` 문자열만 확인하는 검사는 이번 범위를 증명하지 못한다.
- Consequences: 각 route의 기대 URL과 의도된 redirect를 구분하고 PostHog pageview도 별도 확인한다.

### 이전 PR과 이번 작업의 권위 분리

- Date: 2026-10-09
- Authority / Provenance: 현재 사용자 설명, PR #688 REST metadata·diff·중단 댓글
- Decision Date: 2026-10-09
- Decision Class: Evidence Classification
- Status: Confirmed
- Upstream context: https://github.com/byulmaru/kosmo/pull/688
- Choice: #688의 작성자는 `robin-maki`이며, 사용자는 그 PR을 작업하지 않았다고 밝혔다. 이전 patch와 중단 의견은 참고 이력으로 다룬다.
- Reason: 과거 작업자의 비용 판단은 이번 issue의 수정 방향 승인이나 사용자 선호를 대신하지 않는다.
- Alternatives: 과거 PR의 선택·CI·중단 이유를 이번 요구사항 또는 검증 결과로 자동 상속하지 않는다.
- Consequences: PROD-1103의 현재 범위에 맞춰 후보를 비교하고 실제 효과를 새로 검증한다.

### 수정 방향

- Date: 2026-10-09
- Authority / Provenance: 현재 코드·정식 npm source·과거 PR 이력
- Decision Date: 2026-10-09
- Decision Class: Implementation Option
- Status: Pending
- Upstream context: PROD-1103은 수정 방식을 확정하지 않는다.
- Choice: 미정. A는 navigator와 데이터 로딩 경계 분리, B는 Web linking dependency patch다.
- Reason: A의 상태·인가 보존과 B의 그룹 외 중첩 경로 대응 모두 이번 범위의 runtime 증거가 없다.
- Alternatives: SDK 56의 호환 버전 업데이트만으로 해결됐다는 근거는 없으며 SDK 전체 업그레이드는 이번 후보로 선택하지 않는다.
- Consequences: spec 초안은 비교·검증 계획까지 준비하되, 구현 후보가 선택된 것처럼 기록하지 않는다.

## Unresolved Questions

- A 또는 B의 수정 방향. 새 제품 정책이나 인증·권한 변경 요구는 현재 없다.
