## ADDED Requirements

### Requirement: Post와 PostContent에 GraphQL principal RLS를 활성화한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-713. 시스템은 MUST `public.post`와 `public.post_content`에 ROW LEVEL SECURITY를 활성화한다. FORCE ROW LEVEL SECURITY는 MUST NOT 활성화한다. 정책은 MUST `kosmo_api`에만 명시적으로 적용하고, `kosmo_worker`용 정책이나 전체 role 대상 permissive policy를 MUST NOT 만든다.

#### Scenario: GraphQL principal에 RLS가 적용됨

- **WHEN** `kosmo_api`가 Post 또는 PostContent를 조회하거나 변경한다
- **THEN** PostgreSQL은 해당 table의 `kosmo_api` policy를 적용한다

#### Scenario: owner와 Worker 경계는 우회 결과를 유지함

- **WHEN** table owner 또는 `BYPASSRLS=true`인 `kosmo_worker`가 Post/PostContent SQL을 실행한다
- **THEN** FORCE RLS가 없으므로 기존 owner/Worker 결과를 유지한다
- **AND** 이 change는 두 role의 object ACL, membership 또는 credential을 변경하지 않는다

### Requirement: selected Profile 기준 Post viewer policy를 강제한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-713. `kosmo_api` Post SELECT policy는 MUST `public.kosmo_current_profile_id()`를 viewer Profile로 사용한다. Active Post는 MUST Author Profile이 Active이고 연결된 Instance가 Suspended가 아닐 때에만 다음 viewer에게 보인다.

| Visibility           | 허용 viewer                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `PUBLIC`, `UNLISTED` | anonymous를 포함한 모든 viewer                                             |
| `FOLLOWERS`          | Author 또는 viewer가 Author를 팔로우하는 established `profile_follow` 관계 |
| `DIRECT`             | Author만 허용하는 interim contract                                         |

작성자는 MUST 자신의 Tombstone Post를 반복 삭제의 멱등 결과 확인에 필요한 범위에서 조회할 수 있고, 다른 viewer에게 Tombstone을 MUST NOT 보인다. Mentioned Profile recipient에 대한 DIRECT/FOLLOWERS 확장은 PROD-462 전에는 MUST NOT 제공한다.

#### Scenario: anonymous와 account-only viewer의 공개 조회

- **WHEN** Profile setting이 없고 Account setting만 있거나 actor setting이 모두 없다
- **THEN** Active·eligible PUBLIC/UNLISTED Post만 조회된다
- **AND** FOLLOWERS, DIRECT와 다른 작성자의 Tombstone은 조회되지 않는다

#### Scenario: 작성자 조회

- **WHEN** 유효한 current Profile이 Post Author다
- **THEN** eligible PUBLIC, UNLISTED, FOLLOWERS와 DIRECT Active Post를 조회할 수 있다
- **AND** 자신의 Tombstone Post를 조회할 수 있다

#### Scenario: established follower 조회

- **WHEN** 유효한 current Profile이 Active·eligible Post Author를 established `profile_follow` 관계로 팔로우한다
- **THEN** Active FOLLOWERS Post를 조회할 수 있다
- **AND** DIRECT Post와 Tombstone은 조회할 수 없다

#### Scenario: malformed Profile setting은 private 권한을 만들지 않음

- **WHEN** Profile setting이 비어 있거나 UUID가 아닌 값이라 actor helper가 `NULL`을 반환한다
- **THEN** SELECT는 오류를 일으키지 않고 anonymous 공개 조회와 같은 결과만 반환한다

#### Scenario: Author eligibility가 실패함

- **WHEN** Author Profile이 Active가 아니거나 Author Instance가 Suspended다
- **THEN** PUBLIC/UNLISTED를 포함한 해당 Author의 Active Post는 `kosmo_api`에 보이지 않는다

### Requirement: PostContent는 부모 Post viewer policy를 상속한다

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, PROD-713. `kosmo_api` PostContent SELECT policy는 MUST `post_content.post_id`가 가리키는 부모 Post가 같은 SQL session에서 Post SELECT policy를 통과할 때에만 row를 보인다. PostContent ID 직접 조회는 MUST NOT 부모 Post visibility, lifecycle 또는 author eligibility를 우회한다.

#### Scenario: 조회 가능한 부모의 content 조회

- **WHEN** viewer가 부모 Post SELECT policy를 통과하고 해당 PostContent ID를 직접 조회한다
- **THEN** PostContent row를 조회할 수 있다

#### Scenario: 조회 불가능한 부모의 content 직접 조회

- **WHEN** viewer가 부모 Post SELECT policy를 통과하지 못하고 PostContent ID를 알고 있다
- **THEN** PostContent row는 반환되지 않는다

#### Scenario: 작성자의 Tombstone content 조회

- **WHEN** current Profile이 Tombstone 부모 Post의 Author다
- **THEN** 부모 Post의 작성자 Tombstone 계약에 따라 PostContent를 조회할 수 있다
- **AND** 다른 viewer는 같은 PostContent를 조회할 수 없다

### Requirement: 현재 GraphQL Post 쓰기를 위한 최소 actor-bound DML을 허용한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-713. Temporal 전환 전 호환성을 위해 `kosmo_api`는 MUST current Profile을 Author로 하는 Post INSERT와 기존 작성자 Post UPDATE를 수행할 수 있고, current Profile이 Author인 부모 Post에 PostContent INSERT를 수행할 수 있다. INSERT policy는 MUST `WITH CHECK`를 사용하고 UPDATE policy는 MUST `USING`과 `WITH CHECK`를 함께 사용해 Author identity가 다른 Profile로 바뀌거나 없는 actor가 쓰기 권한을 얻는 것을 차단한다.

현재 GraphQL ordinary delete는 physical DELETE가 아니라 작성자 Post의 Tombstone UPDATE다. 따라서 `kosmo_api` Post physical DELETE policy와 PostContent UPDATE/DELETE policy는 MUST NOT 만든다. 이 호환 DML policy는 MUST Temporal 전환 후 PROD-765가 제거할 때까지 유지한다.

#### Scenario: 작성자가 Post skeleton과 PostContent를 생성함

- **WHEN** 유효한 current Profile이 자신의 `profile_id`로 Post를 INSERT하고 그 부모 Post에 PostContent를 INSERT한다
- **THEN** skeleton Post에 `current_content_id`가 아직 없어도 두 INSERT가 허용된다
- **AND** 작성자는 같은 transaction에서 Post의 current content와 reply parent를 UPDATE할 수 있다

#### Scenario: 작성자가 자신의 Post를 Tombstone으로 전이함

- **WHEN** 유효한 current Profile이 자신의 Active Post를 Tombstone 상태로 UPDATE한다
- **THEN** UPDATE와 `RETURNING` 결과가 허용된다
- **AND** 이후 반복 삭제 확인을 위한 작성자 SELECT가 유지된다

#### Scenario: 다른 actor와 account-only 쓰기는 거부됨

- **WHEN** current Profile이 Post Author와 다르거나 Profile helper가 `NULL`이다
- **THEN** Post INSERT/UPDATE와 PostContent INSERT는 RLS에 의해 거부된다

#### Scenario: 불필요한 physical mutation은 거부됨

- **WHEN** `kosmo_api`가 Post를 physical DELETE하거나 PostContent를 UPDATE/DELETE한다
- **THEN** 해당 command policy가 없으므로 RLS가 변경을 거부한다

### Requirement: RLS expand는 application·runtime 후속 경계를 선점하지 않는다

**Authority / Provenance:** PROD-713, PROD-462, PROD-716, PROD-765, PROD-766. 이 change는 MUST 기존 GraphQL viewer/author predicate와 순수 Repost source eligibility predicate를 유지하며, GraphQL credential 또는 operation session lifecycle을 MUST NOT 변경한다. Notification의 recipient Profile별 viewer context는 MUST NOT 일반 Account membership 권한으로 대체하며 해당 경계는 PROD-766이 소유한다. Production preflight, sync/apply와 post-apply live 검증은 MUST 이 capability의 구현·archive 완료 조건과 분리하고 별도 명시 승인을 요구한다.

#### Scenario: migration만 배포됨

- **WHEN** RLS migration이 배포됐지만 workload가 아직 owner credential을 사용한다
- **THEN** 기존 GraphQL runtime 동작은 바뀌지 않는다
- **AND** 이를 `kosmo_api` principal cutover 완료 증거로 사용하지 않는다

#### Scenario: Notification 후속 경계가 준비되지 않음

- **WHEN** recipient Profile이 operation selected Profile과 다른 Notification GraphQL 경로가 남아 있다
- **THEN** PROD-716은 principal cutover를 완료해서는 안 된다
- **AND** Post RLS를 Account의 모든 membership Profile에 넓혀 우회하지 않는다

#### Scenario: production 운영은 별도 승인임

- **WHEN** implementation, CI, 비운영 검증 또는 OpenSpec archive가 완료된다
- **THEN** production sync/apply나 live principal 검증 권한이 생기지 않는다
