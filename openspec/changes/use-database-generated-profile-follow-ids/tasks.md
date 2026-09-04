## 1. PROD-892 PostgreSQL default identity와 Follow transition

**Authority / Provenance**

- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `docs/architecture/core-services.md`
- PROD-892

**Deliverable**

신규 ProfileFollow와 ProfileFollowRequest는 PostgreSQL `uuidv7()` default로 생성한 ID를 사용하고, 정상 transition은 해당 DB row ID로 결과와 effects를 연결한다. transaction completion-loss retry는 row/effect를 중복하지 않고 현재 관계 상태로 수렴하며, 복원할 수 없는 create effect 누락을 수용한다.

**Guardrails**

- 기존 pair uniqueness, in-flight admission, exact Request ID와 ABA 방어를 유지한다.
- Approve/Accept completion-loss retry는 exact pending source가 command expected Request와 일치할 때만 effects 없이 `ESTABLISHED`로 수렴한다.
- pending Request bootstrap과 Unfollow exact deleted-source 복구는 변경하지 않는다.
- UUID 생성 Activity, application UUIDv7 generator, receipt, outbox, sweeper, reconciliation과 DB migration을 추가하지 않는다.
- PROD-328과 PR #665/#666을 변경하지 않는다.

**Verification**

- 실제 Follow/Request/Approve transition이 insert한 DB row에서 PostgreSQL `uuid_extract_version(id) = 7`을 확인한다.
- 정상 결과와 create effect source가 DB row ID와 일치하는지, duplicate와 completion-loss 재실행에서 row/effect가 증가하지 않는지 확인한다.
- 이전 bundle로 생성한 대표 Open/Pending/Approve Workflow history를 새 bundle로 replay한다.
- Core/Worker focused tests, Worker build, strict OpenSpec validation과 formatting checks를 실행한다.

- [x] 1.1 PostgreSQL default identity와 completion-loss 보장 경계를 canonical Follow 문서와 Temporal architecture memory에 동기화한다.
- [x] 1.2 신규 Follow/Request가 DB default identity를 사용하고 정상 결과/effects가 반환 row ID를 따르도록 구현한다.
- [x] 1.3 duplicate 및 Approve/Accept completion-loss에서 중복 effects 없이 pair lifecycle이 올바른 상태로 수렴하도록 구현한다.
- [x] 1.4 실제 DB UUID version·source identity·중복 의미와 이전 Workflow history replay를 검증하고 관련 build/spec/format checks를 통과시킨다.
