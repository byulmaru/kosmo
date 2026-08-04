## Context

이 기록은 `docs/domain/objects/post.md`와 `docs/domain/objects/reaction.md`의 Local Note·Reaction canonical
계약, `docs/domain/decisions/0017-activitypub-local-post-note.md`의 Note identity와 access boundary, 그리고
2026-08-04 현재 Linear `PROD-500`의 wire contract와 exclusions를 반영한다. `PROD-498`과 `PROD-499`는 각각
Remote inbound identity mapping과 Local outbound type/identity mapping의 선행 계약으로 사용한다. Proposal,
specification과 design은 이 authority를 구현 가능한 경계로 정리하며, 새로운 제품 요구사항이나 upstream
변경 필요 사항은 발견되지 않았다.

## Decision Records

### Local Note가 같은 Local Instance identity의 emojiReactions URI를 광고한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`; Linear: `PROD-500`
- Status: Active
- Context / Problem: 기존 Local Note는 canonical Note URI와 visibility/access 경계를 가지지만 FEP-c0e0 collection property가 없다. Note와 collection이 다른 origin을 사용하면 object identity와 dereference가 분리된다.
- Decision Outcome: Content가 있고 조회 가능한 Local Note만 `http://fedibird.com/ns#emojiReactions` property를 광고한다. 값은 Note의 Post UUID를 사용한 `/ap/note/{postId}/emoji-reactions` 절대 URI이며, Author Profile의 LOCAL Instance canonical origin과 같은 identity boundary를 사용한다. Note가 숨겨지는 Tombstone/contentless/unavailable/unviewable 상태면 property와 collection도 제공하지 않는다.
- Alternatives Considered: 서버 configured origin으로 모든 Note를 구성하는 방식은 다중 LOCAL Instance의 canonical identity를 훼손한다. 별도 collection origin이나 Note와 다른 접근 정책은 canonical Note contract와 PROD-500을 벗어나므로 선택하지 않았다.
- Consequences: advertisement와 collection dispatcher가 동일한 URI를 산출해야 하며, collection endpoint만 추가해 Note visibility를 넓힐 수 없다.
- Confirmation / Follow-up: PROD-500 구현에서 Note JSON property와 endpoint URI를 함께 검사하고, unavailable/권한 실패 시 두 값 모두 숨겨지는 Fedify test를 남긴다.

### Collection item은 현재 AP-expressible Reaction의 canonical mapping만 재사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`; Linear: `PROD-498`, `PROD-499`, `PROD-500`
- Status: Active
- Context / Problem: Reaction row는 Local과 Remote Profile을 함께 보유하지만 ActivityPub identity의 출처와 type/content mapping은 inbound/outbound 계약에 나뉘어 있다.
- Decision Outcome: 현재 존재하고 AP identity를 표현할 수 있는 Local·Remote Reaction만 투영한다. Local item은 Reaction Profile이 속한 LOCAL Instance에서 actor와 `/ap/reaction/{reactionId}`를 파생하고, Remote item은 `PROD-498`이 저장한 actor/activity URI를 재사용한다. `❤️`는 정확한 `Like(content: "❤️")`, `🥹`, `🎉`, `👀`, `☘️`, `🌈`은 각각 정확한 `EmojiReact(content)`로 만들며 object는 항상 대상 Local Note URI다. 삭제·identity 불가·unsupported/custom/legacy/Misskey 표현은 제외한다.
- Alternatives Considered: Remote UUID에서 새 local activity URI를 만드는 방식은 inbound identity를 위조한다. 원격 actor/Note를 fetch하거나 과거 Reaction을 backfill하는 방식은 현재 collection contract와 no-fetch/no-backfill 범위를 확장하므로 선택하지 않았다.
- Consequences: 구현은 기존 저장 row와 mapping을 읽기만 하며 Reaction send, inbound materialization, remote fetch를 collection read의 side effect로 호출하지 않는다.
- Confirmation / Follow-up: Local Instance가 configured origin과 다른 경우에도 actor/activity origin을 보존하는 test와 Remote stored URI 재사용 test, six allowed type 및 unsupported filtering test를 PROD-500 검증에 포함한다.

### Wire contract는 ActivityStreams Collection과 50개 opaque keyset page다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`; Linear: `PROD-500`; FEP-c0e0 (`https://fep.swf.pub/fep/c0e0/fep-c0e0.html`)
- Status: Active
- Context / Problem: collection을 역참조 가능하게 만들면서 empty result, 51개 이상 result와 동일 timestamp Reaction의 순서를 wire에서 결정해야 한다.
- Decision Outcome: 광고된 URI는 ActivityStreams `Collection`으로 응답하고 현재 노출 가능한 전체 item 수를 `totalItems`로 제공한다. 각 page는 최대 50개 item을 가지며 `createdAt DESC` 후 Reaction UUID `DESC`로 정렬한다. 다음 page는 이 두 값의 opaque keyset cursor를 사용해 경계를 이어가고, invalid 또는 현재 collection 경계로 해석할 수 없는 cursor는 정상 collection page로 응답하지 않는다.
- Alternatives Considered: offset/page number는 삽입·삭제와 동일 timestamp에서 중복·누락을 만들 수 있다. `createdAt` 단독 cursor는 tie-break를 보존하지 못하므로 선택하지 않았다. cursor 원문을 공개 query parameter로 신뢰하는 방식도 opaque/invalid cursor 계약을 위반한다.
- Consequences: page size와 comparator는 public wire behavior가 되며, cursor codec은 이 comparator를 손실 없이 encode/decode하고 invalid 입력을 명확히 거부해야 한다.
- Confirmation / Follow-up: 0, 50, 51개, 동일 `createdAt`, invalid cursor와 첫/다음 page의 순서·`totalItems`를 Fedify endpoint test로 증명한다.

### Collection dispatcher는 기존 Local Note 접근 경계를 재사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`; Linear: `PROD-500`
- Status: Active
- Context / Problem: Local Note dispatcher는 Post state, Content, Author Profile/Instance availability와 Followers Only signed-fetch를 이미 판정한다. Collection이 이를 별도로 구현하면 Note와 collection 사이에 authorization drift가 생긴다.
- Decision Outcome: collection request는 기존 Local Note load/authorization boundary를 통과한 뒤에만 Reaction read projection을 수행한다. Public·Unlisted는 기존 guest 범위를, Followers Only는 signed author 또는 established follower 범위를 그대로 사용하며, unauthorized/unavailable 결과는 Note와 같은 숨김 semantics로 반환한다. 구체적인 helper/function 이름이나 파일 배치는 고정하지 않는다.
- Alternatives Considered: collection 전용 visibility query와 별도 follower policy를 만드는 방식은 동일 계약을 두 군데 유지하게 해 drift와 정보 노출 위험을 높이므로 선택하지 않았다.
- Consequences: 구현자는 기존 Note route의 authorization semantics를 호출하거나 동등한 공용 경계를 사용해야 하며, collection endpoint를 public하게 열어서는 안 된다.
- Confirmation / Follow-up: Public/Unlisted guest, Followers Only author/follower, unauthorized requester, Mentioned Profiles와 unavailable Post의 endpoint 결과를 기존 Note 응답과 비교해 검증한다.

### Collection projection은 read-only additive 변경으로 제한한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`; Linear: `PROD-498`, `PROD-499`, `PROD-500`
- Status: Active
- Context / Problem: collection을 구현하는 과정에서 기존 Reaction lifecycle이나 저장 구조를 재사용한다는 이유로 delivery side effect, schema migration 또는 다른 API 범위를 함께 변경할 수 있다.
- Decision Outcome: PROD-500은 Local Note projection/property와 collection read dispatcher/query만 additive하게 변경한다. 저장된 `Reactions`와 `ActivityPubReactions` mapping을 읽어 item을 만들고, inbound/outbound delivery, queue/outbox, retry, GraphQL, UI, Reaction schema/migration과 remote fetch/backfill은 변경하지 않는다.
- Alternatives Considered: collection 전용 Reaction history table 또는 materialization job을 추가하는 방식은 현재 row/mapping만 사용한다는 contract와 제외 범위를 확장한다. 기존 send handler를 호출해 item을 만드는 방식은 read에 외부 side effect를 섞으므로 선택하지 않았다.
- Consequences: 삭제되거나 identity가 사라진 과거 Reaction은 collection에 복원되지 않는다. 별도 migration 없이 기존 data와 구버전 Note consumer에 additive하게 배포·rollback할 수 있다.
- Confirmation / Follow-up: diff에서 scope 밖 파일·schema migration이 없는지 확인하고, collection test가 outbound/inbound handler를 호출하지 않음을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
