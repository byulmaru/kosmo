## Session Context

PROD-1138의 초기 로딩 중 잠금·복귀 복구를 계획한다. 이 문서는 세션 메모이며 제품 결정의 권위는
canonical·Linear와 실제 사용자 합의에 있다.

## Choice Notes

### 자동 복구를 한 번 시도한 뒤 기존 수동 복구 제공

- Date: 2026-10-22
- Upstream context: 사용자 선택, `docs/domain/decisions/0032-native-startup-recovery.md`, PROD-1138.
- Choice: 복귀 후 자동 재시도 1회, 계속 실패하면 기존 오류 안내와 수동 재시도.
- Reason: 일시적인 중단에서 이용을 이어가면서 지속 오류에서는 자동 시도를 반복하지 않기 위해서다.
- Alternatives: 연결 복원까지 자동 복구를 계속하는 선택지는 채택하지 않았다.
- Consequences: 반복 복귀와 중복 이벤트가 같은 중단 요청의 자동 시도를 늘리지 않는지 검증한다.

### 초기 조회의 실패 경계에서 최소 수정

- Date: 2026-10-22
- Upstream context: PROD-1138, ADR 0019·0032, `memory/frontend/relay-operation-env-cache.md`.
- Choice: Native 재현으로 실패 경계를 확인한 뒤, 초기 query의 transport 복구를 우선 검토한다.
- Reason: 원래 query와 actor Store를 유지하면 무관한 상태를 초기화하지 않고 복구할 수 있다.
- Alternatives: 필요한 query boundary에서 표준 재평가를 사용하는 방법. 모든 foreground에서 runtime을 reset하는 방법은 제외한다.
- Consequences: 구독 위치·초기 조회 식별·파일 구성은 구현자가 재현에 맞춰 정한다. 이 메모는 구현 방식을 고정하지 않는다.

### OpenSpec과 handoff를 함께 사용

- Date: 2026-10-22
- Upstream context: 명시적 Spec Workflow 요청, repository policy의 조율·복잡한 검증 분기.
- Choice: `SPEC_SOURCE: openspec`, `HANDOFF_REQUIRED: true`.
- Reason: token 복원·Session·shell·Home와 iOS·Android 검증 순서를 함께 인계해야 한다.
- Alternatives: 단순 기존 동작 수정의 짧은 handoff만으로 정리하는 방법.
- Consequences: OpenSpec은 줄이거나 고칠 수 있는 세션 하네스로 유지한다. 이 세션은 구현하지 않는다.

## Unresolved Questions

- 없음. 실제 원인과 수정 위치에 관한 미확인 사항은 `design.md`와 구현 작업에 남겼다.
