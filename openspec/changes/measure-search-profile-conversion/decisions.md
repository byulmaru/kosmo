## Session Context

[PROD-557](https://linear.app/byulmaru/issue/PROD-557)의 2026-09-03 승인 댓글 `ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`과 복원한 canonical policy, 2026-09-22 사용자의 귀속 속성 명명·HogQL canonical 집계 지시를 구현 계획의 근거로 삼는다. 이 파일은 영구 결정이나 별도 승인 기록이 아니다.

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
- Choice: 메모리의 대상별 journey와 시작·조회·Follow 이벤트 세 개를 제안한다. 귀속 속성은 확정된 `search_profile_journey_id`를 사용하며 값은 Account·Profile·검색어에서 파생하지 않는다.
- Reason: 대상 ID를 전송하지 않고 재선택 중복과 비동기 완료를 판정할 수 있다.
- Alternatives: SDK 표준 pageview만으로는 실제 Profile 표시를 알 수 없다. persistence나 서버 저장은 현재 범위를 넓힌다.
- Consequences: 기존 navigation·mutation 소유 경계에 좁은 연결이 필요하다. 확정된 귀속 속성 이름을 유지하면서 이벤트명·파일 배치·자료구조는 구현 시 더 간단하게 바꿀 수 있다.

### HogQL canonical 집계

- Date: 2026-09-22
- Upstream context: 승인된 분모·분자·시작일·잠정치 조건과 2026-09-22 사용자 수정 지시.
- Choice: HogQL을 canonical 집계로 사용하고 distinct `search_profile_journey_id` 기준의 분모·전체·Profile 조회·Follow 분자를 계산한다. PostHog Funnel·dashboard는 필요한 경우 시각화·교차검증용 보조 수단으로 둔다.
- Reason: 같은 Account의 여러 journey와 기간을 넘는 성공을 정확히 세어야 한다.
- Rationale clarification (2026-09-23): 2026-09-03 승인에는 대상별 분모와 같은 journey·대상의 성공 귀속이 있지만 제품적 이유의 상세 기록은 부족했다. 이 지표는 각 검색 결과 선택이 **그 대상**의 조회 또는 Follow로 이어졌는지 묻는다. 서로 다른 대상 A·B·C를 선택해 A·C에서만 성공하면 `3 selections / 2 conversions`이고, A에서 실패한 뒤 B에서 조회에 성공해도 A는 성공이 아니다. 이 설명은 계산 계약을 변경하지 않는다.
- Alternatives: 기본 Funnel 우선·HogQL fallback 방식은 이번 사용자 지시로 대체됐다. person 단위 집계나 성공 날짜만의 집계는 요구한 비율과 달라질 수 있다.
- Consequences: HogQL이 fixture의 `6 / 4 / 3 / 2`를 정확히 재현해야 acceptance를 충족한다. 30분 포함·시작일·Asia/Seoul·잠정치·분모 0 조건을 유지하고 query·환경·시각·결과 URL·기대값·관측 결과를 남긴다.

### 종료 후 명시적 재선택의 새 journey

- Date: 2026-09-22
- Upstream context: 2026-09-22 사용자 결정 및 `docs/domain/policies/search-conversion-analytics.md`의 귀속 기간·종료 계약.
- Choice: Account·선택 Profile·인증 상태·PostHog session 변경은 기존 journey의 수명을 끝내지만, 변경 자체로 새 journey를 만들지 않는다. 같은 검색 결과 맥락에서 같은 대상을 다시 명시적으로 유효하게 선택할 때만 새 `search_profile_journey_id`로 새 journey를 시작한다. 재선택 중복 제거는 동일한 journey의 수명 안에서만 적용한다.
- Reason: 종료 후 실제 재선택이 있어야 새 분모가 생기며, 종료 전 중복 제거 상태가 이후 재선택을 막아서는 안 된다.
- Alternatives: 종료 시 즉시 새 journey를 생성하거나 종료 후에도 이전 중복 제거 상태를 유지하는 방식은 사용자 결정의 분모·시작 조건과 맞지 않는다.
- Consequences: 네 종료 경계 각각에 대해 `같은 대상 재선택 → 새 journey`와 `종료만 발생 → 새 journey 없음`을 검증한다. 종료 전 기록은 유지하고 종료 후 늦은 응답은 어느 journey에도 연결하지 않는다.

### 현재 저장소의 세션 하네스 정책 적용

- Date: 2026-09-22
- Upstream context: `AGENTS.md`, `memory/issue-openspec-workflow.md`.
- Choice: 이전 handoff의 별도 OpenSpec 승인·Review Packet·delta sync·archive 완료 gate는 이어받지 않는다.
- Reason: 현재 저장소는 OpenSpec을 선택적 세션 하네스로 규정한다. 계산 계약과 실제 검증 책임은 그대로 유지한다.
- Alternatives: 과거 gate를 구현 prerequisite로 복원하면 현재 저장소 지침과 충돌한다.
- Consequences: 구현은 새 세션에서 수행한다. 사용한 하네스는 가능하면 구현 PR 안에서 `--skip-specs`로 정리하며, 이 작업을 제품 완료 조건으로 추가하지 않는다.

## Unresolved Questions

- 없음.
