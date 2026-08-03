## ADDED Requirements

### Requirement: CreatePost caller-local connection synchronization

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641. Universal client는 `createPost` 성공 응답의 normalized `post`를 Relay의 선언형 connection directive로 요청 actor Environment의 이미 로드된 managed connection에만 반영해야 한다(MUST).

#### Scenario: Original 또는 Quote 작성 성공

- **WHEN** `createPost`가 `replyParent`가 `null`인 Post를 반환한다
- **THEN** 앱은 로드된 Home connection의 첫 edge 앞에 canonical Post Node를 한 번 삽입한다
- **AND** 로드된 작성자 Profile connection에도 같은 Node를 한 번 삽입한다

#### Scenario: Reply 작성 성공

- **WHEN** `createPost`가 `replyParent`가 있는 Post를 반환한다
- **THEN** 앱은 로드된 Home connection에만 canonical Post Node를 첫 edge 앞에 삽입한다
- **AND** 작성자 Profile connection을 변경하지 않는다

#### Scenario: Connection이 로드되지 않음

- **WHEN** 요청 actor Store에 대상 connection record가 없다
- **THEN** 앱은 connection이나 edge를 합성하지 않는다
- **AND** 광범위한 refetch 또는 client-side Post List 정책 계산을 시작하지 않는다

#### Scenario: Duplicate completion

- **WHEN** 같은 canonical Post Node에 대한 prepend handler가 같은 connection에 두 번 실행된다
- **THEN** 해당 Node를 참조하는 edge를 하나만 유지한다
- **AND** 기존 edge의 상대 순서를 변경하지 않는다

#### Scenario: Actor 전환 또는 Composer unmount

- **WHEN** 작성 요청 뒤 actor Environment가 전환되거나 Composer가 unmount된다
- **THEN** normalized payload와 connection handler는 요청을 시작한 Environment에만 적용된다
- **AND** 새 actor Store, unmounted state 또는 navigation을 늦게 변경하지 않는다

#### Scenario: Committed Post와 GraphQL 오류

- **WHEN** 응답이 `data.createPost.post`와 함께 nullable field의 GraphQL `errors[]`를 반환한다
- **THEN** 앱은 normalized Post를 로드된 대상 connection에 반영한다
- **AND** Composer는 committed Post를 성공으로 처리해 입력과 submitting 상태를 초기화한다

#### Scenario: Post가 없는 실패 결과

- **WHEN** mutation이 network 오류로 실패하거나 `data.createPost.post`를 제공하지 않는다
- **THEN** 기존 Home·Profile connection membership을 유지한다
- **AND** 낙관적 또는 client-only Post/edge를 남기지 않는다
