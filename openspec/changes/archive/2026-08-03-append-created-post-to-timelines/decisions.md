## Context

이 기록은 `createPost` 성공 직후 현재 actor의 이미 로드된 Home Relay connection만 보완하는
PROD-641 계약과, 이를 Relay의 선언형 connection directive로 구현한 선택을 반영한다. 새 제품 결정은
추가하지 않는다.

## Decision Records

### caller-local 갱신 범위는 현재 actor의 Home connection으로 한정한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641
- Status: Active
- Context / Problem: 작성에 성공한 Post가 이미 열린 Home 목록에 보이지 않지만, 다른 producer와 다른 actor
  Store까지 전달하는 장기 동기화는 현재 이슈의 책임이 아니다.
- Decision Outcome: `createPost`가 반환한 canonical Post를 요청 actor Environment의 이미 로드된 Home
  connection 앞에 한 번 반영한다. Original, Quote, Reply 모두 Home만 갱신하며 Profile posts, 다른 actor
  Store와 다른 producer의 결과는 포함하지 않는다.
- Alternatives Considered: 작성자 Profile posts까지 동시에 갱신하거나 모든 Store를 refetch하는 방식은
  PROD-641의 Home-only 범위를 넓히고 Post List 정책을 client에 중복하므로 제외한다.
- Consequences: 로드되지 않은 Home과 Profile posts는 재조회 전까지 기존 결과를 유지한다. 다른 producer의
  장기 전달은 PROD-644가 소유한다.
- Confirmation / Follow-up: Home connection의 성공·실패·중복·actor 전환 시나리오와 PROD-641 완료 조건으로
  확인한다.

### Relay 기본 prepend handler를 사용한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/post-list.md`, PROD-641
- Status: Active
- Context / Problem: caller-local Home membership을 갱신하면서 Relay Store 내부 동작과 cursor·후보 정책을
  직접 재구현하지 않아야 한다.
- Decision Outcome: 기존 `CreatePostPayload.post`에 `@prependNode`를 선언하고 Home managed connection ID를
  전달한다. connection 조회, edge 생성, 중복 제거와 앞쪽 삽입은 Relay 기본 handler에 위임한다.
- Alternatives Considered: 수동 updater와 별도 server edge field는 각각 Relay 동작을 중복 구현하거나 공개
  GraphQL 계약을 불필요하게 확장하므로 선택하지 않는다.
- Consequences: 별도 client cache abstraction이나 server projection이 필요 없고, 대상 connection이 없으면
  새 record를 합성하지 않는다.
- Confirmation / Follow-up: Relay compiler와 Home/Composer 회귀 검증으로 directive 변수, prepend 결과와
  실패 경계를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
