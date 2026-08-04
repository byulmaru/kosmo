## 1. PROD-500 Local Note advertisement와 collection endpoint

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `PROD-500`

**Deliverable**

조회 가능한 Local Note가 Author Profile의 LOCAL Instance canonical origin으로 만든
`/ap/note/{postId}/emoji-reactions` URI를 FEP-c0e0 property로 광고하고, 같은 URI가 역참조 가능한
ActivityStreams collection으로 응답된다.

**Guardrails**

- Note와 collection은 같은 Post Visibility, Post Eligibility, Author Profile/Instance availability와
  signed-fetch 조건을 적용한다.
- Tombstone, contentless, unavailable 또는 현재 viewer에게 제공하지 않는 Note에는 property와 collection을
  노출하지 않는다.
- collection endpoint를 추가해 기존 Note 접근 범위를 넓히거나 remote Note를 fetch/backfill하지 않는다.

**Verification**

- Public·Unlisted guest와 Followers Only signed author/follower가 Note와 같은 collection URI 및 authorization
  결과를 받는지 검증한다.
- unauthorized requester, Mentioned Profiles, unavailable Post에서 Note와 collection이 모두 숨겨지는지
  검증한다.
- collection 응답의 `Collection`, `totalItems`, 최대 50개 page와 advertisement URI 일치를 검증한다.

- [x] 1.1 조회 가능한 Local Note에 canonical FEP-c0e0 `emojiReactions` URI를 연결하고 동일 URI를
      dereference하는 collection endpoint를 구현한다.
- [x] 1.2 ActivityStreams Collection metadata와 현재 노출 가능한 `totalItems`, 빈 결과 및 최대 50개 page
      응답을 구현한다.
- [x] 1.3 Public·Unlisted·Followers Only·unauthorized·unavailable 경계와 signed-fetch 결과를 기존 Local
      Note 정책과 함께 검증한다.

## 2. PROD-500 Reaction item projection과 stable pagination

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- `PROD-498`
- `PROD-499`
- `PROD-500`

**Deliverable**

현재 AP-expressible Local·Remote Reaction이 canonical actor/activity/object identity와 허용된
`Like`·`EmojiReact` 표현으로 collection item에 투영되고, 50개 단위 page가 `createdAt DESC`와 Reaction UUID
`DESC` 경계를 잃지 않고 연결된다.

**Guardrails**

- Local actor와 `/ap/reaction/{reactionId}`는 Reaction Profile의 LOCAL Instance origin에서 파생하고,
  Remote actor/activity는 inbound mapping에 저장된 URI를 그대로 사용한다.
- `❤️`만 `Like(content: "❤️")`이고 나머지 `🥹`, `🎉`, `👀`, `☘️`, `🌈`은 `EmojiReact(content)`이며 모든
  object는 대상 Local Note URI다.
- 삭제·identity 불가·custom/legacy/Misskey Reaction과 remote fetch/backfill은 collection에서 제외한다.
- Reaction delivery, queue/outbox/retry, GraphQL/UI 및 Reaction schema/migration을 변경하지 않는다.

**Verification**

- Local Profile의 Instance origin 차이, 저장된 Remote identity 재사용, six allowed type의 type/content/object
  mapping을 검증한다.
- 0, 1, 50, 51개와 같은 `createdAt` tie-break에서 `totalItems`, first/next page, opaque keyset cursor의
  중복·누락 없는 순서를 검증한다.
- invalid cursor가 정상 page로 처리되지 않고 deleted/unavailable/unsupported item이 반환되지 않는지
  검증한다.

- [x] 2.1 현재 Reaction row와 저장된 inbound identity를 이용해 Local·Remote actor/activity/object와
      `Like`·`EmojiReact` item을 투영한다.
- [x] 2.2 `createdAt DESC`와 Reaction UUID `DESC`를 보존하는 opaque keyset cursor, 최대 50개 page와
      `totalItems` 계산을 구현한다.
- [x] 2.3 Local/Remote identity, six allowed type, empty/multiple/deleted/unsupported item, invalid cursor와
      no-fetch/no-side-effect 범위를 검증한다.

## 3. PROD-500 통합 검증과 archive 책임

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `PROD-500`

**Deliverable**

PROD-500의 구현·테스트·정합성 evidence가 canonical domain contract와 Linear wire contract를 충족하고,
변경 전체가 완료된 뒤 OpenSpec archive를 판단할 수 있는 상태가 된다.

**Guardrails**

- PROD-500 범위가 완료되기 전에는 change를 archive하지 않는다. PR readiness와 OpenSpec completion은 별도로
  판단한다.
- 구현·검증은 기존 inbound/outbound Reaction, GraphQL/UI, schema/migration, queue/outbox/retry를 포함하지
  않는다.
- 모든 task와 required validation이 실제 결과로 확인되고, 남은 Blocked decision이나 authority mismatch가
  없어야 archive한다.

**Verification**

- Fedify/domain contract test, 관련 typecheck·ESLint·Prettier와 `git diff --check` 결과를 기록한다.
- `openspec validate expose-activitypub-emoji-reactions --strict`와 전체 OpenSpec strict validation을 실행한다.
- 최신 canonical docs, Linear `PROD-500` 상태·relations와 proposal/spec/design/decisions/tasks의 정합성을
  archive 직전에 다시 확인한다.

- [x] 3.1 Note advertisement, collection page, Reaction mapping, pagination, visibility와 exclusion의 관련
      Fedify/domain test를 추가하고 통과시킨다.
- [x] 3.2 packages/fedify의 typecheck·lint·관련 test와 workspace Prettier, `git diff --check`를 통과시키고
      기존 Reaction 송수신 회귀가 없는지 확인한다.
- [ ] 3.3 PROD-500 구현 PR의 scope·verification evidence와 OpenSpec strict validation 결과를 정리해
      canonical/Linear 정합성을 확인한다.
- [ ] 3.4 PROD-500 owner가 모든 구현·검증 task와 completion evidence를 확인한 뒤에만
      `expose-activitypub-emoji-reactions` change를 archive한다.
