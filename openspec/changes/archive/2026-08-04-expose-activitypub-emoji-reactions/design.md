## Context

현재 Fedify의 Local Note dispatcher는 Content, Visibility, Author Profile/Instance와 media 가용성을 확인한
뒤 `/ap/note/{postId}` Note를 직렬화한다. `authorizeLocalPostNote`는 같은 row 경계를 사용하고 Followers Only
요청에 대해 signed author 또는 established follower만 허용한다. Note projection에는 아직 FEP-c0e0
`emojiReactions` property가 없고, 그 URI를 역참조할 collection dispatcher도 없다.

Reaction row는 `postId`, `profileId`, 허용된 `type`, `createdAt`과 UUID를 보유한다. inbound mapping은 Remote
Reaction의 ActivityPub URI를 `ActivityPubReactions`에 저장하고, local outbound mapping은 Reaction Profile의
Local Instance identity와 `/ap/reaction/{reactionId}`를 사용한다. 따라서 collection은 이미 저장된 row와
identity를 projection해야 하며, 원격 Note/Profile을 새로 조회해 collection을 완성할 수 없다.

## Goals / Non-Goals

**Goals:**

- 조회 가능한 Local Note에 canonical `emojiReactions` collection URI를 광고한다.
- ActivityStreams Collection, `totalItems`, 최대 50개 page, `createdAt DESC`와 Reaction UUID `DESC`를 이용한
  opaque keyset cursor를 제공한다.
- 현재 AP-expressible Local·Remote Reaction을 canonical `Like` 또는 `EmojiReact` item으로 투영하고, Local
  Note와 같은 visibility, eligibility, availability와 signed-fetch 경계를 적용한다.
- 기존 Note·Reaction identity와 inbound/outbound mapping을 재사용하면서 additive한 Fedify endpoint만 추가한다.

**Non-Goals:**

- Remote Note collection fetch/backfill/materialization, custom emoji, legacy `EmojiReaction` 또는 Misskey
  extension 지원
- Reaction 저장 schema, migration, GraphQL contract, 앱 UI 변경
- inbound/outbound Reaction delivery, queue/outbox, retry 또는 기존 lifecycle 재구현
- Note가 제공되지 않는 Tombstone, contentless, unavailable, unviewable Post의 collection 노출

## Implementation Guidance

### Current Constraints

- Local Note의 canonical identity는 Author Profile이 속한 LOCAL Instance의 origin으로 구성된다. 현재 Note
  loader와 authorization은 요청 context의 canonical origin, Post/Content state, Profile/Instance state를 함께
  검증하므로 collection도 이 경계를 우회하지 않아야 한다.
- Followers Only authorization은 Note 접근과 signed actor/follower 판정을 공유해야 한다. Collection URI가
  별도로 존재한다는 이유로 Post 또는 Reaction visibility를 넓힐 수 없다.
- `Reactions`에는 `createdAt`과 UUID가 있으며 `(postId, type, createdAt DESC, id DESC)` index가 있다. 모든
  허용 type을 하나의 feed로 합칠 때에도 최종 정렬과 cursor 경계는 `(createdAt, id)`를 기준으로 계산해야 한다.
- `ActivityPubReactions`는 Remote inbound activity URI와 Reaction을 연결하지만, local Reaction에 별도 remote
  identity를 만들면 안 된다. Profile의 actor와 Instance origin을 local item identity에 사용하고, 저장된
  remote actor/activity URI가 없는 row는 AP-expressible로 간주하지 않는다.
- ActivityStreams vocabulary와 Fedify dispatcher를 사용하되, projection/query helper의 구체적인 함수명이나
  파일 배치는 현재 공개 계약이 아니다. Note advertisement와 collection dispatcher가 동일한 canonical URI를
  산출하는지가 구현 경계다.

### Recommended Approach

1. Local Note projection이 Note identity와 같은 Local Instance origin으로
   `/ap/note/{postId}/emoji-reactions` URI를 만들고 FEP-c0e0 property에 연결하도록 확장한다. 같은 URI를
   collection dispatcher route에 등록해 advertisement와 dereference가 어긋나지 않게 한다.
2. Collection request는 기존 Local Note loader/authorization 결과를 먼저 적용한다. 접근 가능한 Note만
   collection metadata와 page를 만들고, 접근 실패나 unavailable Post는 Note와 같은 숨김 결과를 반환한다.
3. 현재 Post의 Reaction row를 조회할 때 삭제·비활성·identity 불가 row를 제외하고, Local Profile은 Profile의
   LOCAL Instance actor/origin에서 activity identity를 파생한다. Remote Profile은 inbound mapping에 저장된
   actor/activity URI를 그대로 사용하며, 부족한 identity를 위해 remote fetch/backfill을 시도하지 않는다.
4. 결과를 `createdAt DESC`, 같은 시각의 Reaction UUID `DESC`로 정렬하고 이 두 값을 opaque keyset cursor에
   담는다. 첫 page와 다음 page의 경계를 같은 collection ordering으로 해석하며, decode 또는 boundary 검증에
   실패한 cursor는 정상 page로 처리하지 않는다. 특히 경계 Reaction이 삭제되었거나 더 이상 ActivityPub item으로
   표현되지 않으면 해당 cursor를 현재 collection 경계로 해석할 수 없으므로 invalid cursor와 동일하게 거부한다.
   Collection의 `totalItems`는 현재 노출 가능한 item 수를 나타내고 page에는 최대 50개 item만 포함한다.
5. 기존 outbound reaction projection의 six-type mapping과 identity/object 규칙을 재사용하되, collection
   read 중 delivery side effect를 호출하지 않는다. `❤️`는 `Like(content: "❤️")`, 나머지 허용 five type은
   `EmojiReact(content: type)`으로 만들고 모든 object를 Local Note URI로 설정한다.
6. Note advertisement, collection metadata/page, zero/50/51개와 동일 timestamp tie-break, local/remote
   identity, deleted/unavailable/unsupported filtering, Public/Unlisted guest, Followers Only signed
   author/follower, unauthorized hidden 결과를 Fedify 단위·통합 test로 검증한다. 기존 inbound/outbound,
   GraphQL/UI와 schema가 변하지 않았다는 범위도 확인한다.

### Allowed Alternatives

- Opaque cursor는 서명된 token, 인코딩된 비교 키 또는 기존 cursor utility를 사용할 수 있다. 구현 방식은
  외부에서 `(createdAt, Reaction UUID)`를 직접 신뢰하지 않고 invalid cursor를 page로 반환하지 않는 계약을
  만족해야 한다.
- Collection/page serialization은 Fedify의 native collection builder를 사용하거나 dispatcher 경계에서
  직접 구성할 수 있다. 두 방식 모두 `Collection`, `totalItems`, 최대 50 page와 canonical item identity를
  보장해야 한다.
- Reaction 조회는 기존 query helper를 확장하거나 collection 전용 read query로 둘 수 있다. 어느 경우에도
  inbound/outbound side effect, remote fetch/backfill, schema migration을 추가하지 않는다.
- Note property는 기존 Note projection에서 직접 설정하거나 동일 URI를 보장하는 얇은 projection wrapper에서
  설정할 수 있다. Note와 collection이 서로 다른 origin 또는 Post UUID를 사용하지 않아야 한다.

### Known Traps

- 서버의 configured origin을 모든 local actor에 재사용해 Reaction Profile이 속한 다른 LOCAL Instance의
  canonical origin을 잃는 것
- Note authorization을 건너뛴 채 collection URI의 존재만으로 Followers Only 또는 unavailable Post를 노출하는 것
- Remote mapping이 없는 Reaction을 local UUID 기반 remote activity로 위조하거나 원격 actor/Note를 fetch하는 것
- `createdAt`만 정렬하거나 offset/page number를 사용해 동일 timestamp에서 중복·누락을 만드는 것
- 50개 제한을 `totalItems`에 적용하거나 invalid cursor를 첫 page/빈 page로 오인하는 것
- custom/legacy/Misskey 표현, Mentioned Profiles, Tombstone/contentless Post를 collection에 섞는 것
- collection read에서 outbound delivery, queue/outbox, retry, GraphQL resolver 또는 UI 변경을 호출하는 것

## Risks / Trade-offs

- **동시 Reaction 변경과 page 경계:** keyset ordering은 page 경계의 중복·누락을 줄이지만, 요청 사이의 새
  Reaction 추가·삭제를 영속 snapshot으로 고정하지는 않는다. 현재 collection ordering과 `totalItems`를 각
  요청에서 다시 계산하고 tie-break를 항상 검증한다. 발급된 cursor의 경계 Reaction이 삭제되거나 더 이상
  ActivityPub item으로 표현되지 않으면 cursor를 현재 경계로 해석할 수 없어 invalid page로 거부한다.
- **현재 row만 표현 가능:** 삭제되거나 identity가 사라진 Reaction을 복구하기 위한 history/backfill을 두지
  않는다. 이는 PROD-500의 no-fetch/no-backfill 경계를 지키지만 과거 활동의 collection 재현은 보장하지 않는다.
- **다중 Instance join 비용:** Local actor identity와 Remote mapping을 함께 확인하는 read query는 단순
  Post 조회보다 join이 많다. 기존 `postId`/정렬 index와 제한된 page size를 활용하고, 확인되지 않은 새 index나
  migration은 별도 근거가 있을 때만 제안한다.
- **권한 결과의 federation 표현:** unauthorized 또는 unavailable 요청은 collection page가 아닌 Note와 같은
  숨김 결과여야 한다. Fedify dispatcher의 null/authorization semantics가 이 결과를 유지하는지 endpoint test로
  확인한다.

## Migration Plan

1. PROD-500 구현에서 기존 Local Note projection에 property를 추가하고 동일 origin의 collection dispatcher와
   read projection을 additive하게 배포한다. Database migration, Reaction backfill, remote fetch는 없다.
2. 배포 전 Fedify/domain contract, identity/type mapping, pagination/cursor, visibility/signed-fetch와
   unsupported/deleted/unavailable filtering을 검증하고 기존 inbound/outbound/GraphQL/UI test를 회귀시킨다.
3. 구버전 Note consumer는 알 수 없는 property를 무시할 수 있으므로 기존 Note delivery와 호환된다. Rollback은
   property와 dispatcher를 함께 제거하며, 기존 Reaction row와 inbound URI mapping은 유지한다.
4. PROD-500의 구현 PR과 validation evidence가 모두 완료되고 canonical docs/spec/decision/task가 정합하면
   change archive 검토를 진행한다. 별도 후속 migration 또는 archive 작업을 이 change의 구현으로 만들지 않는다.

## Open Questions

제품·도메인 계약을 바꾸는 남은 질문은 없다. Cursor codec, query decomposition과 Fedify serialization 방식은
`decisions.md`에 기록한 Implementation Choice 범위에서 구현자가 선택한다.
