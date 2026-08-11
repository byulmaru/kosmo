## 1. PROD-710 Web trusted ingress Post DB execution boundary

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear `PROD-710`

**Deliverable**

Web trusted federation ingress의 Post/PostContent SQL이 요청에서 전달된 명시적 database handle을 사용하고, 최초 배포의 기존 owner 결과와 transaction/post-commit 동작을 유지하며 요청 종료 시 connection resource를 정리한다.

**Guardrails**

- 최초 handle source는 기존 `DATABASE_URL` owner connection이다.
- API/Web BFF 기본 DB, GraphQL operation DB/RLS, role·Vault·Secret·GRANT·Helm credential selector를 바꾸지 않는다.
- Temporal Workflow/Activity, Fedify MessageQueue와 production sync/apply/cutover를 포함하지 않는다.
- caller-owned transaction은 Post SQL과 core action에 그대로 합류하고 post-commit에는 transaction을 전달하지 않는다.

**Verification**

- production callsite inventory에서 inbound Post/PostContent 전역 singleton 직접 참조가 남지 않았는지 확인한다.
- DB-backed inbound ActivityPub 테스트로 create/delete/announce 결과, transaction commit/rollback과 post-commit 순서를 확인한다.
- Web request 테스트로 success/error/fallthrough connection cleanup과 기존 federation 응답을 확인한다.
- Core/Fedify/Web typecheck, lint, tests, Prettier, OpenSpec strict validation과 `git diff --check`를 통과시킨다.

- [x] 1.1 Web federation entry부터 inbound Post/PostContent SQL과 core action까지 production callsite를 인벤토리하고 이전 범위를 확정한다.
- [x] 1.2 기존 owner `DATABASE_URL`로 request database handle과 idempotent cleanup lifetime을 제공한다.
- [x] 1.3 Fedify context와 inbound Post/PostContent helper·direct SQL·core action이 같은 명시적 handle을 사용하게 한다.
- [x] 1.4 transaction composition, rollback, post-commit ordering과 success/error cleanup 회귀 테스트를 추가한다.
- [x] 1.5 관련 Core/Fedify/Web 검증과 repository formatting/OpenSpec strict validation을 완료한다.
