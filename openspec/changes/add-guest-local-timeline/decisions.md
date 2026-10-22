## Session Context

[proposal.md](proposal.md)의 조사·인계를 위한 메모다. 제품 권위나 별도 승인 기록이 아니며 구현 방법은 변경할 수 있다.

## Choice Notes

### 공개 읽기 확장과 참여 권한을 분리한다

- Date: 2026-10-22
- Upstream context: PROD-1199, `docs/domain/policies/public-content-onboarding.md`, `docs/domain/policies/post-list.md`.
- Choice: 공개 첫 화면에 필요한 Local 조회만 허용하고 기존 참여 권한·인증된 Profile 준비 흐름은 유지한다.
- Reason: 이슈에는 공개 조회가 포함되지만 참여 권한 확장은 제외되어 있다.
- Alternatives: 기존 화면만 배치하면 Profile gate 때문에 요구를 만족하지 못한다. 공통 인증 경계를 완화하면 승인된 범위를 넘는다.
- Consequences: API와 UI 양쪽의 guest 경계를 검증하고, 유효 Session/no-profile 상태를 별도로 확인한다.

### 기존 Local 데이터와 방문자 UI를 재사용한다

- Date: 2026-10-22
- Upstream context: PROD-1199의 기존 목록·공통 방문자 UI 재사용 요구와 현재 코드 조사.
- Choice: 기존 Local query·목록·공개 셸·full 로고를 조합하는 접근을 제안한다. 보호 route로 향하는 인증용 타임라인 탭은 공개 첫 화면에 그대로 복사하지 않는다.
- Reason: 후보·상태·권한·로고가 중복 구현 때문에 어긋날 위험을 줄인다.
- Alternatives: 별도 guest API·목록 또는 페이지별 로고 구현은 현재 범위에서 필요하지 않다.
- Consequences: 공용 파일의 인증·Native 소비처 회귀를 확인한다. 구체적인 컴포넌트 분리는 구현자가 정한다.

### 문서 정렬은 이번 전달 범위에 포함한다

- Date: 2026-10-22
- Upstream context: PROD-1199의 문서 반영 완료 조건, `memory/issue-openspec-workflow.md`.
- Choice: 기존 두 공개 화면·설명 문구·Web Welcome 관련 문서를 승인된 변경에 맞춰 구현과 함께 갱신한다.
- Reason: 현재 canonical의 이전 표현을 새 구현의 요구사항으로 오인하지 않도록 한다.
- Alternatives: OpenSpec만 갱신하면 장기 문서와 실제 전달 결과가 어긋난다.
- Consequences: 구현 task에 문서 갱신을 포함하고, 이 세션에서는 조사·계획·인계만 완료한다. OpenSpec archive는 별도 제품 완료 조건이 아니다.

## Unresolved Questions

- 없음.
