## 1. PROD-375 Local-only active profile selection 계약 정정

**Deliverable**

active profile 선택 계약이 정상 제품 경로의 local-only `AccountProfile` membership을 기술하고 synthetic remote membership의 선택·거부는 정의하지 않으며, 런타임 동작은 변경하지 않는다.

**Guardrails**

- remote profile 조회·표시와 inbound federation 관계는 변경하지 않는다.
- GraphQL resolver, integration test, DB와 session 동작을 변경하지 않는다.
- canonical profile spec과 actor-discovery proposal, design, tasks, delta spec은 같은 최종 계약을 표현한다.

**Verification**

- canonical spec과 actor-discovery delta의 active profile selection requirement를 비교한다.
- actor-discovery proposal, design, tasks에 remote profile 선택·session restore 성공을 요구하는 현재형 문구가 없는지 검색한다.
- correction change와 actor-discovery change의 OpenSpec strict validation을 통과시킨다.
- 런타임 source와 test diff가 없는지 확인한다.

- [x] 1.1 canonical profile spec과 actor-discovery 전체 산출물을 정상 제품 경로의 local-only membership 계약으로 동기화하고 spec-only 검증을 통과시킨다.
