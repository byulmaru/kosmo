## ADDED Requirements

### Requirement: Trusted ingress Post SQL은 명시적 database handle을 사용한다

**Authority / Provenance**: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, Linear `PROD-710`

MUST: Web trusted federation ingress가 inbound ActivityPub 요청으로 Post 또는 Post Content를 조회·생성·변경할 때 해당 요청에 명시적으로 전달된 `DatabaseHandle`로 SQL을 실행한다. 이전된 호출부는 전역 database singleton을 직접 선택하거나 handle 누락을 전역 database로 대체해서는 안 된다.

#### Scenario: Remote Note 수신

- **WHEN** Web trusted federation ingress가 유효한 remote `Create(Note)`를 처리한다
- **THEN** Post, Post Content와 연관된 SQL은 ingress가 전달한 database handle 안에서 실행된다

#### Scenario: Remote Post 삭제

- **WHEN** Web trusted federation ingress가 저장된 remote Post에 대한 유효한 `Delete(Note)`를 처리한다
- **THEN** Post 조회와 Tombstone 전이는 같은 명시적 database handle 안에서 실행된다

### Requirement: Inbound transaction composition과 결과를 보존한다

**Authority / Provenance**: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, Linear `PROD-710`

MUST: Post core service는 `Database` 또는 caller가 소유한 `Transaction`을 입력받아 기존 transaction과 savepoint 의미를 보존한다. handle 이전은 ActivityPub 처리 결과, 원자성, 오류와 post-commit 시점을 바꾸어서는 안 된다.

#### Scenario: Caller-owned transaction 성공

- **WHEN** inbound handler가 전달받은 transaction 안에서 Post와 Post Content를 성공적으로 저장한다
- **THEN** 모든 SQL은 해당 transaction에 합류하고 outer transaction commit 뒤에만 결과가 확정된다

#### Scenario: Inbound 처리 실패

- **WHEN** Post/PostContent 처리 중 오류가 발생한다
- **THEN** 해당 요청의 변경은 기존 원자성 계약에 따라 rollback되고 부분 저장이 남지 않는다

### Requirement: 최초 배포는 owner principal과 외부 계약을 유지한다

**Authority / Provenance**: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, Linear `PROD-710`

MUST: 최초 배포의 Web trusted federation ingress는 기존 `DATABASE_URL` owner connection을 명시적 handle source로 사용한다. API/Web BFF 기본 connection, GraphQL operation database, role·credential·GRANT·schema와 ActivityPub 응답 계약을 변경해서는 안 된다.

#### Scenario: 기존 owner source로 실행

- **WHEN** PROD-710 구현만 배포되어 inbound federation 요청을 처리한다
- **THEN** 명시적 handle의 PostgreSQL principal은 기존 owner connection과 같고 principal 전환은 발생하지 않는다

#### Scenario: 후속 credential source 교체

- **WHEN** 후속 PROD-715가 승인된 Worker credential source를 연결한다
- **THEN** Post/PostContent SQL callsite를 다시 변경하지 않고 ingress handle 생성 경계의 source만 교체할 수 있다

### Requirement: Request database lifetime을 항상 정리한다

**Authority / Provenance**: Linear `PROD-710`

MUST: Web trusted federation ingress는 각 요청의 명시적 database connection lifetime을 소유하고 정상 완료, handler 오류와 transaction rollback 뒤에 항상 connection resource를 정리한다.

#### Scenario: 정상 요청 cleanup

- **WHEN** inbound ActivityPub 요청이 성공적으로 완료된다
- **THEN** 요청에 사용된 database connection은 응답 완료 전에 정리된다

#### Scenario: 실패 요청 cleanup

- **WHEN** inbound ActivityPub handler 또는 transaction이 오류로 종료된다
- **THEN** 요청에 사용된 database connection은 오류를 보존한 채 정리된다
