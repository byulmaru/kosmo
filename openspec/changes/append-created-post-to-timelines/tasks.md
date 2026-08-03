## 1. Caller-local Relay Store update

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-641`

**Deliverable**

`createPost`의 normalized `post`가 요청 actor의 이미 로드된 Home·작성자 Profile managed connection에 최신순·중복 없이 반영된다.

**Guardrails**

- 기존 `CreatePostPayload.post`와 API 작성 transaction을 유지한다.
- Home은 Original·Quote·Reply를 포함하고, Profile은 `replyParent == null`인 경우에만 갱신한다.
- connection이 없으면 record를 만들지 않으며 Post List 정책·cursor를 합성하지 않는다.
- actor Environment 전환과 Composer lifecycle guard를 유지한다.

**Verification**

- Relay compiler가 `post { id ...PostListItem_post }`와 Home/Profile connection handle을 통과하는지 확인한다.
- Relay compiler가 목록 fragment를 선택한 `@prependNode`와 client-only connection 변수를 처리하는지 확인한다.
- Relay Store 테스트가 Home/Profile connection ID 선택, 최신순 prepend, duplicate completion, Reply/Home-only, loaded/unloaded connection과 부분 GraphQL 오류를 검증하는지 확인한다.
- API schema/resolver 테스트는 `CreatePostPayload.post`만 유지하는지 확인한다.

- [x] 1.1 Home/Profile managed connection identity를 유지하고 Composer mutation의 Relay `@prependNode` directive에 필요한 connection ID만 전달한다.
- [x] 1.2 API edge field와 server projection/export 및 관련 선택·테스트를 제거한다.
- [x] 1.3 수동 updater를 제거하고 테스트·OpenSpec·frontend memory를 Relay 선언형 prepend 계약으로 정렬한다.
- [x] 1.4 Relay compiler, app/API focused checks와 formatting/diff validation을 실행한다.
