## 1. PROD-652 — Mentioned Profile 저장과 createPost 계약

- Authority: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0017-profile-search-staged-visibility.md`, PROD-652
- Deliverable: 일반 Post와 Reply의 기존 `createPost`가 명시적으로 선택한 Profile ID 목록을 받아 현재 검색
  visibility를 재검증하고 Post·Content·Mentioned Profile 관계를 한 transaction에 저장한다.
- Guardrails: 본문 문자열에서 identity를 추론하지 않는다. ID 검증 중 network lookup·refresh·materialization을
  시작하지 않는다. `DIRECT`, ActivityPub recipient/typed Mention, notification과 PostContent schema는 변경하지
  않는다. 입력 생략·빈 목록은 기존 client와 호환되어야 한다.
- Verification: additive migration과 schema snapshot, PostgreSQL core service test, GraphQL unit·integration test,
  committed SDL, 실패 rollback과 기존 일반 Post·Reply 회귀를 확인한다.

- [ ] 1.1 `post_mention` join table, foreign key, `(post_id, profile_id)` unique constraint와 Profile 조회 index를
      additive migration으로 추가한다.
- [ ] 1.2 staged `searchProfiles` visibility predicate를 server-only 공용 경계로 정리하고, core `createPost`가
      Mentioned Profile ID를 bulk 검증·저장하도록 transaction을 확장한다.
- [ ] 1.3 `CreatePostInput.mentionedProfileIds` optional concrete Profile global ID list를 추가하고 decoded DB ID를
      공통 core action에 전달하며 GraphQL SDL을 갱신한다.
- [ ] 1.4 omitted·empty·valid local/remote·duplicate·wrong typename·missing·inactive·Suspended Instance ID와
      relation 실패 rollback을 core/API test로 고정한다.

## 2. PROD-652 — 유니버설 Composer Profile mention UX

- Authority: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/design/reply-composer.md`,
  `docs/design/accessibility.md`, PROD-425, PROD-652
- Deliverable: Web·Android·iOS의 일반 Post 및 Reply Composer에서 현재 `@` token으로 Profile을 검색하고,
  Avatar·표시 이름·`relativeHandle` 결과를 선택해 Plain Text와 Profile ID를 함께 관리·제출한다.
- Guardrails: 기존 React Native Plain Text input과 하나의 Composer/mutation을 재사용한다. 직접 입력한 text는
  relation으로 승격하지 않는다. 같은 Profile ID는 한 번만 제출한다. selected Profile·Reply Parent·Relay
  Environment context를 넘겨 상태를 공유하지 않으며 `DIRECT` UI를 열지 않는다.
- Verification: mention text-state unit test, Relay compiler, component/Storybook test, app check와 Web 및 실행 가능한
  Native platform runtime evidence로 keyboard·touch·focus·screen reader 상태를 확인한다.

- [ ] 2.1 cursor의 현재 `@` token, 선택 occurrence range, text edit에 따른 stale 연결 제거와 deduplicated ID
      projection을 순수 state 경계로 구현하고 unit test를 추가한다.
- [ ] 2.2 기존 `searchProfiles` Relay query를 사용하는 결과 surface를 추가해 Avatar·표시 이름·`relativeHandle`,
      loading·empty·error와 Web keyboard/pointer 및 Native touch/screen reader 계약을 구현한다.
- [ ] 2.3 일반 Post와 Reply 제출에 같은 Mentioned Profile ID state를 연결하고 성공 reset, 실패 보존,
      dirty/discard, Parent·actor·environment 전환과 늦은 completion 격리를 구현한다.
- [ ] 2.4 일반·Reply Composer의 local/remote 동일 handle 구분, 직접 입력 비승격, 삽입·삭제·수정, focus 복원과
      검색 실패 중 기존 작성 내용 보존을 component/Storybook test로 검증한다.

## 3. PROD-652 — 통합 검증과 계약 동기화

- Authority: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/design/reply-composer.md`,
  `memory/issue-openspec-workflow.md`, PROD-652
- Deliverable: DB·core·GraphQL·Web·Native 변경을 한 사용자 흐름으로 검증하고 canonical 문서와 active spec을
  최종 구현에 맞춰 동기화한다.
- Guardrails: PR readiness와 OpenSpec 전체 완료를 분리한다. 일부 구현 PR이 완료됐다는 이유로 change를
  archive하지 않는다. PROD-340·359·462의 후속 범위를 현재 완료 조건에 포함하지 않는다.
- Verification: 관련 workspace required validation, `openspec validate add-composer-profile-mentions --strict`,
  Web runtime과 실행 가능한 Native platform evidence, canonical/spec diff를 기록한다.

- [ ] 3.1 migration, core database, API GraphQL, app unit·Storybook·Relay·typecheck·lint 등 변경 surface의 required
      validation을 실행하고 실패·미실행 항목을 handoff에 기록한다.
- [ ] 3.2 Web과 실행 가능한 Android·iOS 경로에서 검색·선택·삽입·삭제·일반 Post·Reply 제출·오류 복구를 검증하고
      실행할 수 없는 platform은 근거와 남은 owner를 명시한다.
- [ ] 3.3 구현 결과를 canonical domain/design 문서와 active OpenSpec에 동기화하고 strict validation을 통과시킨다.
- [ ] 3.4 모든 task와 통합 completion evidence가 충족된 뒤에만 `add-composer-profile-mentions` change를 archive한다.
