## 1. PROD-641 CreatePost edge projection

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-641`

**Deliverable**

`createPost` 성공 payload가 생성 Post와 함께 현재 selected Profile 관점에서 서버가 Home·작성자 Profile Post List 후보로 판정한 surface의 canonical connection edge를 제공한다.

**Guardrails**

- 기존 `CreatePostPayload.post`, Post 작성 transaction, 인증·membership·Media 검증과 공개 범위를 유지한다.
- Home·Profile edge는 기존 Post List 후보·Visibility·Eligibility·Control Decision과 Post ID cursor를 재사용한다.
- surface가 후보가 아니거나 Control Decision이 `Exclude`이면 해당 nullable edge를 반환하지 않는다.
- DB schema/migration과 Post List 정렬 정책을 변경하지 않는다.

**Verification**

- GraphQL schema가 기존 `post`와 additive nullable Home·Profile Post edge를 노출하는지 검증한다.
- Original, Reply, server-excluded surface, Remote selected Profile에서 edge nullability·Post Node identity·cursor가 Home/Profile query 정책과 일치하는지 resolver 테스트로 검증한다.
- 기존 본문·Media·인증·transaction createPost 테스트가 통과하는지 확인한다.

- [ ] 1.1 createPost 성공 결과가 현재 selected Profile 기준 Home·Profile Post List Policy를 재사용해 surface별 nullable edge를 제공하게 한다.
- [ ] 1.2 기존 Post payload와 동일 Node identity·server cursor를 가진 additive edge GraphQL 계약을 노출하고 schema snapshot을 동기화한다.
- [ ] 1.3 성공·nullable surface·Reply·Remote selected Profile·오류 경계의 API schema/resolver 회귀 테스트를 추가해 통과시킨다.

## 2. PROD-641 Current actor Relay connection synchronization

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-641`

**Deliverable**

Post 작성 성공 직후 server-derived edge가 요청 actor Store에 이미 로드된 대상 Home·작성자 Profile 목록에 최신순으로 정확히 한 번 나타난다.

**Guardrails**

- Home Query root와 작성자 Profile Node의 connection identity를 분리하고 pagination 인자와 무관하게 안정적으로 유지한다.
- payload가 제공한 edge만 반영하며 Post List 후보·Control Decision, Post Node 또는 cursor를 클라이언트에서 합성하지 않는다.
- 동일 canonical Post Node의 edge를 중복시키지 않고 기존 edge 상대 순서와 cursor를 바꾸지 않는다.
- 대상 connection이 로드되지 않았으면 connection record를 만들거나 refetch하지 않는다.
- payload normalization과 membership 변경은 요청을 시작한 Relay Environment에만 적용한다.

**Verification**

- Home·Profile managed connection identity와 generated Relay operation이 schema에 대해 compile되는지 확인한다.
- 두 edge, Home-only Reply, nullable edge, loaded/unloaded connection, existing same-node edge와 duplicate completion을 Relay Store 테스트로 검증한다.
- actor A 요청 뒤 actor B 전환과 route unmount에서 actor B Store·Composer·navigation이 바뀌지 않는지 검증한다.

- [ ] 2.1 Home과 Profile Post List가 actor·surface별 안정적인 managed connection identity를 제공하게 한다.
- [ ] 2.2 Composer mutation이 server-derived edge를 선택하고 요청 actor의 로드된 대상 connection에 최신순·중복 없이 반영하게 한다.
- [ ] 2.3 실패·늦은 completion에서도 기존 Composer lifecycle guard와 actor Environment 격리를 유지하고 비대상 connection·새 route UI를 변경하지 않게 한다.

## 3. PROD-641 Regression coverage and project memory

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-641`

**Deliverable**

Home·Profile·Composer 회귀 검증과 project memory가 createPost 호출자 즉시 반영 및 다른 producer Subscription 책임 경계를 일관되게 설명한다.

**Guardrails**

- GraphQL Subscription·server push, 다른 viewer Store 갱신과 광범위한 connection refetch를 추가하지 않는다.
- 생성 Post 경로 자동 이동, 타임라인 정렬 변경 또는 client-side 후보 정책 재구현을 추가하지 않는다.
- 다른 producer의 장기 실시간 전달·reconnect·resume·fan-out은 PROD-641 범위에 포함하지 않는다.

**Verification**

- Home/Profile 목록 표시와 Composer 성공·실패·중복 제출·route lifecycle 회귀 테스트가 통과하는지 확인한다.
- frontend memory가 PROD-641과 PROD-644의 소유권을 구분하고 기존 actor Store 원칙을 유지하는지 diff로 확인한다.

- [ ] 3.1 Home·Profile 목록과 Composer의 성공·실패·duplicate·actor/route 전환 회귀 테스트를 완성한다.
- [ ] 3.2 `memory/frontend-react-native.md`의 “Subscription만 membership을 소유” 전제를 createPost 호출자 로컬 반영과 다른 producer Subscription 경계로 갱신한다.

## 4. PROD-641 Integration verification and OpenSpec completion

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-641`

**Deliverable**

PROD-641이 소유한 API·Relay·Home·Profile·Composer 결과를 하나의 통합 흐름으로 검증하고, 전체 범위 완료 뒤 delta spec을 active `post` capability에 동기화해 change를 archive한다.

**Guardrails**

- PR readiness와 OpenSpec 전체 completion/archive를 별도로 판정한다.
- 구현·회귀 테스트·통합 검증과 모든 task가 완료되기 전에는 change를 archive하지 않는다.
- archive 직전에 최신 canonical 문서와 Linear 본문을 OpenSpec과 독립적으로 다시 대조한다.

**Verification**

- API schema/test, Relay compiler, app check와 관련 앱 테스트, ESLint·Prettier, change strict validation 결과를 기록한다.
- 작성 성공 직후 target Home/Profile에 한 번만 표시되고 실패·actor 전환·unloaded surface에서 잘못된 membership이 없는 통합 evidence를 남긴다.
- archive 뒤 active specs와 전체 OpenSpec strict validation이 통과하는지 확인한다.

- [ ] 4.1 API schema/test, `pnpm --filter @kosmo/app relay`, app check·관련 테스트, `pnpm lint:eslint`, `pnpm lint:prettier`와 `openspec validate append-created-post-to-timelines --strict`를 통과시키고 결과를 기록한다.
- [ ] 4.2 Home·Profile·Composer를 연결한 PROD-641 통합 시나리오와 최신 canonical·Linear 정합성을 확인한다.
- [ ] 4.3 모든 PROD-641 task와 required verification이 완료된 뒤 delta를 active `post` spec에 동기화하고 change를 archive한 다음 전체 OpenSpec strict validation을 통과시킨다.
