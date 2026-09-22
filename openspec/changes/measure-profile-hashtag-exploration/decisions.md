## Session Context

[proposal](./proposal.md)의 PROD-556 작업 메모다. 제품 권위는 canonical 정책과 Linear에 있으며,
구현 접근을 여기에 기록했다는 이유로 영구 결정이나 새로운 승인으로 취급하지 않는다.

## Choice Notes

### 승인된 계산식과 session을 그대로 사용

- Date: 2026-09-22
- Authority / Provenance: PROD-556 본문, 승인 댓글 `88fa293a-616e-47d5-81fa-ede269ce3c3a`.
- Decision Date: 2026-09-03
- Decision Class: Upstream business contract
- Status: Active
- Choice: 첫 목록 성공 Account / WAA, 선택한 `has_results` session / 전체 `has_results` session을 사용한다.
- Reason: 이미 승인된 제품 결과다. 화면 진입만 세던 공식은 Superseded다.
- Alternatives: 이전 화면 진입 공식은 사용하지 않는다.
- Consequences: retry 성공·중복·주차·제외 규칙을 event와 집계 양쪽에서 검증한다.

### 현재 Replay 비활성화와 책임 유지

- Date: 2026-09-22
- Authority / Provenance: 병합된 PR #955, PROD-741의 2026-09-22 범위 결정, PROD-556의 Replay 제외 범위.
- Decision Date: 2026-09-22
- Decision Class: Upstream rollout boundary
- Status: Active
- Choice: PROD-556은 Product Analytics 계측만 추가하고 Replay 상태를 변경하지 않는다.
- Reason: 재활성화·Cloud 보호·Viewer 검증은 PROD-741 책임이다.
- Alternatives: 이전 handoff가 전제한 이미 활성화된 Replay 상태는 현재 상태로 쓰지 않는다.
- Consequences: 보호 설정의 정책과 실제 녹화 활성 여부를 구분한다. PROD-795 Done만으로 운영 인수를 닫지 않는다.

### 관측과 최종 결과를 분리하는 구현 제안

- Date: 2026-09-22
- Authority / Provenance: canonical의 재시도 성공 우선·session 이탈 경계. event 이름과 모듈 배치는 제안이다.
- Decision Date: 2026-09-22
- Decision Class: Working note
- Status: Proposed
- Choice: 불투명 session ID로 시작·요청 결과·선택·종료를 연결하고 첫 성공과 종료 근거로 최종 결과를 집계한다.
- Reason: initial failure를 곧바로 최종 오류로 세면 같은 session의 retry 성공과 충돌한다.
- Alternatives: 성공이 아직 없다는 이유만으로 오류를 확정하거나 SDK session timeout을 차용하지 않는다.
- Consequences: 브라우저 종료 시 전달 한계와 Account 전환 순서를 실제로 검증한다. 같은 계약을 만족하면 더 작은 구현으로 바꿀 수 있다.

### 현재 schema에 맞춘 작은 handoff

- Date: 2026-09-22
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `openspec/config.yaml`, 현재 사용자 spec workflow 호출.
- Decision Date: 2026-09-22
- Decision Class: Session housekeeping
- Status: Active
- Choice: canonical에는 제품 보장만, design에는 구현 제안만 남긴다. 완료 시 가능한 같은 구현 PR에서 `--skip-specs`로 정리한다.
- Reason: 이전 하네스의 delta sync·archive를 새 제품 완료 gate로 상속하지 않는다.
- Alternatives: 이전 17개 task나 34개 scenario를 개수에 맞춰 복제하지 않는다.
- Consequences: 실제 남은 구현·dashboard·검증은 계속 책임지고, 산출물 최종 승인 전에는 승인 snapshot을 만들지 않는다.

### 최종 오류의 귀속 주차

- Date: 2026-09-22
- Authority / Provenance: 현재 PROD-556 Spec 작업에서 정혜주가 “첫 오류가 발생한 주에 집계 (권장)”을 선택했다.
- Decision Date: 2026-09-22
- Decision Class: Upstream business clarification
- Status: Active
- Choice: 성공 없이 종료한 session의 최종 `error`는 첫 initial 오류 발생 주에 귀속한다.
- Reason: session 종료가 늦어져도 첫 오류가 관측된 주의 품질을 집계한다.
- Alternatives: 종료 시점이 속한 주에 집계하는 안은 선택하지 않았다.
- Consequences: 첫 실패·종료가 서로 다른 주인 합성 자료를 추가한다. retry 성공 시 성공 결과를 우선하는 기존 규칙을 유지한다.

## Unresolved Questions

- 새로 남은 제품 결정은 없다. 오류 주차는 2026-09-22 사용자 답변으로 확정했다.
- 현재 산출물의 사용자 최종 승인과 구현·운영 검증도 남아 있다.
