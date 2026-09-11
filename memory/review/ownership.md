# Review Style: Ownership

## Explicit Domain Inputs

- 함수 동작을 transaction 존재 여부, 호출 package 또는 현재 entry point 같은 간접 정보에서 추론하지 않는다.
- `tx`는 caller transaction 참여 여부만 뜻한다. provenance, 실행 origin 또는 side effect 필요 여부를 뜻하지 않는다.
- 도메인에서 `LOCAL | ACTIVITYPUB` 같은 구분이 필요하면 명시적 input으로 표현하고 transaction composition과 독립적으로 다룬다. `LOCAL + tx`와 `ACTIVITYPUB + tx`처럼 의미상 유효한 조합을 막지 않는다.
- optional callback의 존재, generic execution mode 또는 타입 이름 뒤에 실제 분기를 숨기지 않는다. 호출자가 이름과 input/result만 보고 의무와 실행 시점을 알 수 있어야 한다.

## Shared Domain Entry Points

- 같은 도메인 행위는 GraphQL, ActivityPub, background task 등 caller가 달라도 하나의 public core action을 사용한다.
- caller별 action, transaction helper 또는 직접 DB mutation으로 validation, idempotency, exact-row guard와 result shape를 복제하지 않는다.
- protocol caller가 추가 identity 검증을 소유할 수는 있지만, 검증된 identity를 공통 action에 전달하고 실제 domain mutation을 우회하지 않는다.

## Layer Ownership

- API는 인증·session/profile context, transport input 해석, 접근 가능한 target 확인, core action 호출과 response mapping을 소유한다. protocol-specific command나 vocabulary projection을 조립하지 않는다.
- Core는 domain state transition, transaction 참여, idempotency, exact-row 보호, origin에 따른 lifecycle과 committed result에서의 failure isolation을 소유한다.
- Fedify 같은 transport boundary는 저장 projection 조회, ActivityPub vocabulary 직렬화, actor/activity/key identity, recipient endpoint 선택, signature와 실제 delivery를 소유한다.
- package cycle 때문에 dynamic import가 필요하더라도 이 임시 module 경계를 API 책임으로 올리지 않는다.
