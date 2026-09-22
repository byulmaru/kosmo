## Session Context

[PROD-557](https://linear.app/byulmaru/issue/PROD-557)의 2026-09-03 승인 댓글 `ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`과 복원한 canonical policy를 구현 계획의 근거로 삼는다. 이 파일은 영구 결정이나 별도 승인 기록이 아니다.

## Choice Notes

### 승인된 계산 계약 유지

- Date: 2026-09-22
- Upstream context: `docs/domain/policies/search-conversion-analytics.md`, PROD-557 승인 댓글.
- Choice: 같은 검색·대상별 journey, 30분 포함 경계, 실제 Profile 표시·Follow Relationship 성공, 종료·개인정보 조건을 그대로 적용한다.
- Reason: 계산 계약은 이미 승인됐으므로 다시 결정할 필요가 없다.
- Alternatives: 승인 대기 요청을 성공에 포함하거나 사람 수로 집계하는 방식은 현재 계약과 맞지 않는다.
- Consequences: 종료 전 기록은 유지하고 종료 뒤 늦은 성공은 제외한다. 조회·Follow를 별도로 집계하되 전체 분자는 한 번만 센다.

### 탭 메모리와 최소 custom event

- Date: 2026-09-22
- Upstream context: 위 정책의 탭 수명과 불투명 귀속값 조건, PROD-819의 fail-open·Native no-op.
- Choice: 메모리의 대상별 journey와 시작·조회·Follow 이벤트 세 개를 제안한다.
- Reason: 대상 ID를 전송하지 않고 재선택 중복과 비동기 완료를 판정할 수 있다.
- Alternatives: SDK 표준 pageview만으로는 실제 Profile 표시를 알 수 없다. persistence나 서버 저장은 현재 범위를 넓힌다.
- Consequences: 기존 navigation·mutation 소유 경계에 좁은 연결이 필요하다. 이름·파일 배치·자료구조는 구현 시 더 간단하게 바꿀 수 있다.

### journey 단위 기준 집계

- Date: 2026-09-22
- Upstream context: 승인된 분모·분자·시작일·잠정치 조건.
- Choice: `journey_id`별 기준 집계와 조회·Follow funnel을 같은 fixture로 대조한다.
- Reason: 같은 Account의 여러 journey와 기간을 넘는 성공을 정확히 세어야 한다.
- Alternatives: person 단위 기본 funnel이나 성공 날짜만으로 집계하면 요구한 비율과 달라질 수 있다.
- Consequences: 최종 PostHog 설정과 query를 실제 환경에서 확인하고 URL·기대값·관측 결과를 남긴다.

### 현재 저장소의 세션 하네스 정책 적용

- Date: 2026-09-22
- Upstream context: `AGENTS.md`, `memory/issue-openspec-workflow.md`.
- Choice: 이전 handoff의 별도 OpenSpec 승인·Review Packet·delta sync·archive 완료 gate는 이어받지 않는다.
- Reason: 현재 저장소는 OpenSpec을 선택적 세션 하네스로 규정한다. 계산 계약과 실제 검증 책임은 그대로 유지한다.
- Alternatives: 과거 gate를 구현 prerequisite로 복원하면 현재 저장소 지침과 충돌한다.
- Consequences: 구현은 새 세션에서 수행한다. 사용한 하네스는 가능하면 구현 PR 안에서 `--skip-specs`로 정리하며, 이 작업을 제품 완료 조건으로 추가하지 않는다.

## Unresolved Questions

- 없음.
