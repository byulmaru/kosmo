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

### Profile Tag 탐색 session과 공용 Hashtag identity

- Date: 2026-09-22
- Authority / Provenance: 현재 사용자의 Review Packet 수정 요청 1·2·3, ADR 0020과 Hashtag 객체 계약.
- Decision Date: 2026-09-22
- Decision Class: Upstream privacy and event contract change
- Status: Active
- Choice: session property는 `profile_tag_exploration_session_id`, 대상의 안정적인 opaque Hashtag identity는 `hashtag_id`로 수집한다. 값은 TagChip이 이미 받은 GraphQL `Hashtag.id`다.
- Reason: Profile Tag는 공용 Hashtag를 참조하는 관계다. session은 탐색 단위, Hashtag ID는 여러 탐색을 같은 주제로 묶는 단위이므로 구분한다. Hashtag별 distinct 탐색 Account 수·탐색 session 수·선택률·Empty/Error 비율·주간 추세를 재현할 원천 자료가 필요하다.
- Alternatives: 일반적인 session 이름, 별도 Profile Tag identity, 이름·slug·이름의 인코딩/hash, DB UUID 중복 수집은 선택하지 않는다.
- Consequences: Hashtag ID custom property 금지를 이번 목적의 opaque identity 허용으로 변경한다. ID만으로 익명성을 보장할 수 없고 Account의 관심 주제를 연결할 수 있으므로 raw 이름·Profile 정보 금지와 수집 필요성을 함께 기록한다. 계측·검증과 Hashtag별 breakdown Insight·dashboard도 후속 사용자 결정에 따라 PROD-556이 소유한다.

### SDK 식별 실패의 검증과 한계

- Date: 2026-09-22
- Authority / Provenance: Review Packet P1과 현재 사용자 수정 요청 4, 기존 Web adapter·FakePostHog 테스트.
- Decision Date: 2026-09-22
- Decision Class: Approved verification boundary
- Status: Active
- Choice: reset·identify 실패는 mock/stub/fault injection으로 재현하고 capture 당시 SDK identity를 직접 확인한다.
- Reason: session 분리만으로 SDK 귀속을 증명할 수 없으며 현재 adapter는 식별 실패 뒤에도 capture를 허용한다.
- Alternatives: production 장애 유발, fail-open 강화, 별도 identity recovery system은 추가하지 않는다.
- Consequences: 보장할 수 없는 귀속과 지표 영향을 명시한다. 기존 코드 조사와 향후 실행 검증을 구분하며 성공 결과를 미리 주장하지 않는다.

### Hashtag별 탐색 성과를 이번 이슈에 포함

- Date: 2026-09-22
- Authority / Provenance: 현재 사용자의 Hashtag별 dashboard/Insight 포함 결정과 재검증 조건부 최종 승인.
- Decision Date: 2026-09-22
- Decision Class: Upstream delivery scope clarification
- Status: Active
- Choice: `hashtag_id`별 distinct 탐색 Account 수·탐색 session 수·결과 선택률·Empty 비율·Error 비율 및 주간 추세를 PROD-556에서 전달하고 실제 Insight·dashboard로 검증한다.
- Reason: 기존 session/result/주차/제외 규칙을 같은 dimension에 적용해 수집한 자료로 탐색 성과를 재현한다. Account 수는 기존 첫 목록 성공 Account 분자, session 수는 기존 확정 결과 공통 분모를 사용한다.
- Alternatives: 별도 이슈로 분리하는 제안은 채택하지 않았다. 새 Hashtag별 도달률, TagChip impression과 노출→탐색 funnel도 포함하지 않는다.
- Consequences: ID payload 존재만으로 완료하지 않는다. 여러 Hashtag·주차의 합성 기대값과 실제 query·Insight·dashboard를 대조하고 raw text/name을 추가하지 않는다. 기존 전체 지표는 독립적으로 같은 계산식을 유지한다.

### 기존 승인 계약과의 차이

| 항목              | 이전                                                    | 이번 변경                                                                 |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Session property  | `exploration_session_id`                                | `profile_tag_exploration_session_id`                                      |
| Custom allowlist  | 무작위 session ID와 고정 분류값만 허용, Hashtag ID 금지 | 확인된 opaque `hashtag_id` 추가. raw 이름·검색어·Profile 정보는 계속 금지 |
| 수집 목적         | 전체 네 비율                                            | 전체 네 비율과 이번 Hashtag별 탐색 성과 재현·원천 자료 보존               |
| ID 계측·검증 책임 | Hashtag ID 수집 없음                                    | PROD-556이 소유                                                           |
| Account 식별 실패 | 일반 fail-open·전환 순서 검증                           | capture 당시 identity의 fault injection 검증과 한계 보고 추가             |
| 주 경계 scenario  | 최종 오류와 retry 성공을 한 scenario에 기술             | 두 독립 scenario로 분리. 첫 오류 주·성공 주 계약은 유지                   |
| Hashtag별 Insight | 승인된 전체 dashboard 외 명시 없음                      | 다섯 성과 지표·주간 추세와 실제 Insight/dashboard 검증을 PROD-556에 포함  |

기존 사용률·선택률·WAA·Empty/Error 공식, 제외·중복·주차 규칙, 표준 SDK metadata·Account identify/reset·
Replay 책임과 fail-open은 유지한다. 사용자는 이번 범위 결정의 반영·재검증에 문제가 없으면 수정 Spec을
최종 승인한다고 명시했다. 승인 결과와 exact artifact digest는 검증 뒤 local approval snapshot에 기록하며
구현·push/PR·배포·Cloud 변경 승인을 포함하지 않는다.

## Unresolved Questions

- 미결정 제품 질문은 없다. session 명명·opaque Hashtag ID 수집·오류 주차와 Hashtag별 Insight 범위는 사용자 결정으로 확정됐다.
- 조건부 최종 승인의 검증 결과는 local approval snapshot과 handoff에 기록한다. 구현·운영 검증은 별도 세션의 책임이다.
