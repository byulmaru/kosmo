## Context

이 change는 [`PROD-340`](https://linear.app/byulmaru/issue/PROD-340/원격-note-mention을-pm-node와-profile-관계로-보존한다)이 정의한 inbound typed `Mention`의 공통 저장 계약과, [`PROD-910`](https://linear.app/byulmaru/issue/PROD-910/본문-mention을-표시하고-profile로-이동한다)이 소유한 renderer·Profile 이동·통합 및 archive를 함께 전달한다. [`PROD-911`](https://linear.app/byulmaru/issue/PROD-911/activitypub-수신-mention을-인앱-알림으로-생성표시하고-fcm과-연결한다)은 같은 공통 결과를 소비하는 별도 Notification change다.

현재 Post Content는 version 1의 document와 immutable revision을 canonicalize하는 경계를 갖고 있다. inbound Note 경로는 ActivityPub `Note`의 본문을 안전한 inline content와 Media로 투영하고 `createPost` transaction 안에서 Post, Post Content, Current Content pointer를 함께 저장하지만, typed `Mention`과 revision-owned Profile 관계는 아직 저장하지 않는다. Fedify의 `Mention`은 `Link` 계열이고 `Note.getTags()`는 object 또는 link를 반환하므로, 일반 anchor와 typed tag를 명시적으로 구분해야 한다. 기존 본문 parser에는 안전하지 않은 markup을 link 또는 text로 보존하는 fallback이 있으므로, Mention을 해결하지 못한 경우에도 이 경계를 재사용해야 한다.

구 reader가 새 inline node를 만났을 때 본문을 보존하는지는 실제 코드와 호환 검증으로 확인해야 한다. document version은
기존 Post Content V1에 additive한 Mention 확장으로 고정하며, 기존 V1 document와 의미를 유지하기 위해 document
schema V2 전환이나 V1/V2 dual-read 또는 document version 변환은 도입하지 않는다. 관계는 canonical node에서
재구축할 수 있는 `post_mentions` persisted projection으로 저장한다. exact node와 relation shape는 구현 선택으로
기록하되, 제품 계약은 검증된 Mention만 관계로 저장하고 수신 검증·중복 Create·revision 보존 경계를 유지한다.

## Goals / Non-Goals

**Goals:**

- 검증된 inbound typed `Mention`을 canonical Post Content node와 immutable revision-owned Profile 관계로 원자적으로 저장한다.
- inbound typed tag의 actor URI와 본문 anchor URI가 기존 Profile stable identity의 허용 URI로 확인되지 않거나 표시 label이 안전한 표시·구조 검증을 통과하지 못한 tag를 안전한 link 또는 text로 보존하고 신규 원격 Profile lookup/materialization을 피한다. Local Profile은 active Local Instance의 trusted canonical origin과 기존 Profile URL 규칙으로 human URL을 확인할 수 있다. Remote Profile은 actor materialization·refresh에서 같은 Actor document의 `url`로 광고하고 hostname이 있는 HTTP(S)로 검증해 저장한 nullable profile URL alias를 actor URI와 함께 허용하며, alias가 없거나 검증되지 않으면 저장된 actor URI만 허용한다. 확인된 허용 href와 `profileId`만 공통 parser 경계에 전달하고 parser가 원문 HTML에서 본문 visible label을 읽어 안전하게 정규화하며 canonical node에는 `{ profileId, label }`만 저장한다. tag `name`·handle과 본문 label의 문자열 일치만으로 identity를 확정하지 않는다.
- duplicate `Create`의 first-write-wins no-op, remote `Update(Note)` 제외, 과거 revision 보존을 기존 동작과 함께 검증한다.
- 구 reader의 body preservation을 증명한 뒤 Mention 저장을 활성화하고, `PROD-910` renderer·Profile 이동 및 통합/archive까지 연결한다.

**Non-Goals:**

- `PROD-911`의 Notification·FCM 생성, 표시와 전송.
- remote `Update(Note)`, local compose, outbound federation, audience(`to`/`cc`) 해석, DIRECT/limited visibility 권한 변경.
- Mention node의 저장 UUID를 외부에 노출하거나 `post_mentions`의 column/index/primary-key shape를 바꾸는 일. document version은 기존 Post Content V1 additive 확장으로 이 change에서 확정한다.

### `PROD-910` renderer·read projection 결정 (2026-09-11)

- `PostContent.document` Mention node는 서버에서 canonical Profile UUID를 계속 엄격하게 검증·저장한다. GraphQL은 기존 Media처럼
  document 내부 UUID를 client-facing global ID로 projection하며, Native read guard도 Media와 같은 non-empty opaque ID 계약을 사용한다.
- `PostContent`는 기존 Profile visibility predicate(Profile이 `ACTIVE`이고 소속 Instance가 `SUSPENDED`가 아님)를 통과한
  revision-owned 관계를 `mentionedProfiles: [Profile!]!`로 제공한다. 관계는 Profile별로 deduplicate하며 Post visibility·eligibility는
  PostContent 조회의 기존 정책을 따른다. viewer별 Profile Domain Block 정책은 이 consumer 계약에서 새로 조합하지 않는다.
- renderer는 Mention node의 client global ID와 `mentionedProfiles[].id`를 정확히 매칭해 target을 정한다. node 문서 순서와
  `label`은 그대로 렌더링하며, client ID encode/decode나 positional/parallel response zip을 사용하지 않는다.
- 매칭된 Profile은 기존 KOSMO Profile route `/${relativeHandle}`로 이동한다. Profile relation이 없거나 기존 Profile visibility predicate를
  통과하지 않는 unavailable/deleted target이면 원래 `label`을 유지하되 link만 비활성화하고 actor URI·external URL·대체 문구를 사용하지 않는다.
- 기존 Post body의 `onBodyPress` callback과 부모 Post navigation은 유지한다. 활성 Mention link의 press는 event propagation을
  막아 부모 `onBodyPress`가 함께 실행되지 않게 한다.
- 활성 Mention link는 기존 Profile text-link의 의미·타이포그래피 강조 계약과 일반 link semantics를 재사용해 본문 일반 link와
  구분한다. 새 색상·타이포그래피 token이나 tooltip은 추가하지 않으며, accessible name에는 visible label·`displayName`·`relativeHandle`을 포함한다.
- 새 Mention 전용 route, raw ActivityPub tag 재해석, Mention 수신 중 원격 Profile lookup/materialization은 추가하지 않는다.
- 구 reader 2.x bodyText·Media·Content Warning compatibility gate는 별도 deferred 후속 검증으로 기록한다. 이 gate는 `PROD-910`
  renderer 구현·통합의 선행 blocker가 아니며, gate 증거가 없을 때 완료로 주장하지 않는다.

## Implementation Guidance

### Current Constraints

- `packages/core/post-content`의 schema와 canonicalizer는 V1 document의 허용 node와 exact canonical form을 관리한다. Mention은 기존 V1 document와 node 의미를 바꾸지 않는 additive 확장으로 허용하되, 구 reader가 알 수 없는 node를 버리거나 canonicalization 결과를 달리할 수 있으므로 bodyText fallback을 먼저 검증해야 한다.
- `packages/core/activitypub-note-content.ts`는 원격 HTML/plain text를 동일한 안전한 schema로 투영한다. 이 경계 밖에서 다시 HTML을 만들거나 raw tag를 저장하면 기존 안전성·본문 보존 계약을 우회하게 된다.
- `packages/fedify/src/local-post-note.ts`도 canonical content에서 local ActivityPub Note의 평문·HTML을 파생하는 경로이므로, 공통 primitive projection을 바꿀 때 label text와 기존 safe link 보존을 함께 회귀 검증해야 한다. 이 change는 outbound typed Mention federation을 추가하지 않는다.
- `packages/fedify/src/inbound-create-note.ts`는 Note identity·visibility와 content/media projection을 호출한다. Fedify inbound adapter는 typed Mention의 actor URI를 기존 `ActivityPubActor`·Profile identity로 확인하고, Local Profile이면 active Local Instance의 trusted canonical origin과 기존 Profile URL 규칙에서 허용 href를 만들며, Remote Profile이면 actor materialization·refresh에서 저장된 hostname 보유 HTTP(S) Actor `url` alias가 있을 때 actor URI와 함께 허용 href로 전달한다. alias가 없으면 저장된 actor URI만 전달한다. Mention 수신 중에는 새 원격 lookup/materialization을 수행하지 않는다. `to`/`cc` actor URI는 audience이고 `tag` Mention은 별도 입력이므로, 두 경로를 합쳐서 Mention을 추론하면 안 된다.
- `packages/core/services/post.ts`는 duplicate remote object URI를 먼저 판별하고, 최초 Create의 Post·Content·media·Current Content pointer를 transaction으로 만든다. Mention 관계를 별도 후처리로 쓰면 partial relation 또는 duplicate revision이 남을 수 있다.
- 현재 구현은 `post_mentions(post_content_id, profile_id)`를 immutable Post Content revision과 Profile을 잇는 persisted membership projection으로 사용한다. 두 column의 composite primary key와 Profile index, Post Content/Profile foreign key가 referential integrity를 보장하며, Post 하나에만 두거나 read-time JSON parsing만으로 대체하면 과거 revision의 의미가 사라진다. GraphQL은 결정된 `mentionedProfiles: [Profile!]!` visible relation과 document UUID의 global ID projection을 사용한다.

### Recommended Approach

1. actor materialization·refresh는 동일 Actor document의 `url`에서 hostname이 있는 HTTP(S)로 정규화 가능한 profile URL alias를 nullable actor metadata로 보존하고, alias가 없거나 검증되지 않은 기존 row는 null로 둔다. inbound adapter는 Fedify vocabulary에서 typed `Mention`의 actor URI를 기존 Profile stable identity로 확인하고, Local Profile이면 trusted local human URL을, Remote Profile이면 저장된 Actor `url` alias를 actor URI와 함께 허용 href로 전달한다. 동일한 허용 href가 서로 다른 `profileId` 후보에 공유되면 core parser의 normalized href matching 경계에서 ambiguous로 처리해 parser가 first match를 선택하지 않게 한다. `projectRemoteNoteContent`의 순수 HTML/plain-text parser는 전달받은 허용 href와 본문의 safe anchor href를 대조해 `{ profileId, label }` Mention 또는 link/text를 만들며, Local actor URI와 human URL이 서로 다르다는 이유로 mismatch 처리하지 않는다. 본문 visible label은 안전하게 정규화해 저장하고 tag `name`·handle을 identity나 exact-match 조건으로 사용하지 않는다. parser는 DB·stored Profile identity를 조회하지 않는다. `createPost` transaction은 canonical document의 `profileId` 집합을 `post_mentions`에 저장하고 별도 ActivityPub actor lookup이나 fallback 재검증을 수행하지 않는다. Profile domain·handle에서 remote URL을 추측하지 않으며, 일반 anchor와 audience는 기존 의미를 둔다.
2. 해결 실패·malformed·identity mismatch는 기존 안전 parser가 만드는 link/text fallback으로 투영한다. 이 분기에서 remote actor/profile fetch나 신규 materialization을 호출하지 않으며, actor alias가 null이거나 검증되지 않은 기존 row는 actor URI만 허용해 처리한다. 나머지 Note가 통과하면 전체 본문을 저장한다.
3. 기존 Post 생성 transaction의 저장 경계 안에서 canonical document, `post_mentions`의 persisted revision-owned 관계 projection, Current Content pointer를 함께 만든다. 현재 구현은 `post_content_id`와 `profile_id`를 composite primary key로 묶고 각각 Post Content revision과 Profile foreign key로 연결하며 Profile index를 둔다. 관계는 canonical node에서 다시 계산할 수 있는 파생값으로 두고, 같은 revision과 Profile의 관계는 하나의 set entry로 만든다. document 안의 반복 Mention occurrence와 순서는 보존하되 relation을 중복 생성하지 않으며, 새 revision을 만들 때 이전 document와 관계를 건드리지 않는다. duplicate URI의 early no-op은 Mention projection보다 앞에 둔다. Local Post Content validator는 Mention node를 거부한다.
4. 구 reader compatibility는 `PROD-340` 저장 활성화 gate의 deferred 후속 검증으로 기록한다. 기존 `bodyText` fallback을 재사용한
   plain text 표시에서 글자·Media·Content Warning 보존을 확인해야 한다는 계약은 유지하지만, 이 증거가 없는 상태도
   `PROD-910` renderer의 표시·Profile 이동 구현과 통합 검증을 막지 않는다. document schema V2, V1/V2 dual-read 또는 document
   version 변환은 도입하지 않는다.
5. `PROD-910` renderer는 canonical node와 revision/Profile projection만 소비해 표시, Profile 이동과 접근성을 연결하고, 공통 저장·
   renderer 통합 검증과 archive 완료 증거를 소유한다. GraphQL read projection은 위에서 결정한 `mentionedProfiles` relation과
   global ID 매칭을 사용하며, Notification/FCM은 `PROD-911` change에서 별도로 연결한다.

### Allowed Alternatives

- 선택 경로는 구 reader 호환 검증을 통과한 뒤 기존 V1 document에 Mention을 additive하게 보존하는 것이다. 구 reader가 unknown node를 보존하지 못해도 bodyText plain text fallback으로 글자·Media·Content Warning을 보존할 수 있다. document schema version을 올리고 V1/V2 dual-read 또는 document version 변환을 도입하는 대안은 기존 V1 document를 재작성하거나 breaking 의미를 도입할 필요가 없으므로 채택하지 않는다. relation persistence를 위한 additive DB migration은 이 대안 거부에 포함되지 않는다.
- 현재 선택한 `post_mentions` shape는 저장 구현 세부이며 제품 계약을 확장하지 않는다. canonical node가 source of truth이고 relation은
  그 node에서 재구축 가능해야 하며, 동일 revision/Profile relation은 set semantics를 가져야 한다. JSON-only read-time parsing을
  persisted relation의 동등한 대안으로 사용하지 않는다. GraphQL은 기존 Profile visibility predicate와 PostContent 조회 정책을
  통과한 `mentionedProfiles: [Profile!]!` relation을 제공하고 document UUID를 global ID로 projection한다.
- Mention 후보의 초기 추출은 Fedify adapter에서 수행할 수 있지만, identity 검증·fallback·canonicalization은 core의 공통 경계에 두어 다른 inbound 경로와 결과를 일치시킨다.

### Known Traps

- HTML anchor나 `to`/`cc` actor URI만으로 Mention을 추론하지 않는다. typed tag의 actor URI가 기존 Profile identity로 확인되어도 본문 anchor가 허용 href에 대응하지 않으면 fallback으로 낮춘다.
- 서로 다른 Profile 후보가 같은 허용 href를 공유하면 first match로 연결하지 않고 해당 href를 ambiguous fallback으로 낮춘다.
- Local actor URI와 trusted human Profile URL의 표현이 다를 수 있음을 전제로 하며, Remote는 Actor가 광고하고 materialization·refresh에서 hostname이 있는 HTTP(S)로 검증해 저장한 URL alias만 허용한다. alias는 Actor URI와 다른 hostname이어도 직접 광고된 URL이면 허용한다. alias가 없으면 actor URI만 사용하고, human URL을 handle·domain에서 추측하지 않는다. tag `name`·handle과 본문 visible label의 exact match를 요구하지 않는다.
- 해결되지 않은 target을 위해 Mention 수신 중 WebFinger, actor fetch 또는 원격 Profile materialization을 호출하지 않는다. actor URL alias는 별도 actor materialization·refresh 경계에서만 갱신한다.
- Current Post에만 관계를 저장하거나 새 revision에서 과거 관계를 재작성하지 않는다.
- duplicate `Create`를 body가 바뀌었다는 이유로 Update처럼 처리하거나 timestamp·relation을 갱신하지 않는다.
- 구 reader 호환성 증거 없이 Mention writer activation을 완료로 주장하지 않는다. 이 deferred gate는 `PROD-910` renderer 구현·통합의 blocker가 아니다.
- 안전 parser를 우회해 원격 HTML 또는 표시 문자열을 raw HTML로 저장하지 않는다.

## Risks / Trade-offs

- [구 reader가 unknown node를 제거함] → 저장 활성화 전에 서버 본문 파생값부터 구 reader 표시까지 body text·Media·Content Warning을 검증하고, 기존 bodyText plain text fallback을 사용한다. document schema version은 V1 additive로 유지하며, 필요한 relation persistence DB migration은 별도 additive migration으로 검증한다.
- [stable identity 검증이 너무 느슨해 다른 Profile을 연결함] → inbound adapter에서 actor URI를 저장 Profile stable identity로 확인하고 Local은 trusted human Profile URL을 함께, Remote는 같은 Actor document에서 광고된 hostname 보유 HTTP(S) URL을 materialization·refresh 시 저장한 alias를 actor URI와 함께 허용 href로 전달해 core parser에서 anchor href와 대조한다. alias가 없거나 검증되지 않으면 actor URI만 사용하며, tag `name`·handle은 identity에서 제외하고 실패 시 link/text fallback으로 낮춘다.
- [relation과 Current pointer가 부분 저장됨] → 기존 Post transaction에 포함하고 relation 저장 실패를 전체 rollback으로 검증한다.
- [renderer가 document와 relation을 서로 다르게 해석함] → `PROD-910` 통합 검증에서 현재 revision, 과거 revision, unresolved fallback을 함께 확인한다.
- [Mention 저장 뒤 pre-Mention 서버 binary로 전체 rollback함] → 구 binary의 기존 `bodyText` 파생기가 Mention label을 보존하지 못할 수 있으므로, 호환·데이터 대응 증거 없이 전체 rollback을 안전하다고 간주하지 않는다. 기본 rollback은 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하는 운영 절차로 기록한다.

## Migration Plan

1. Actor materialization·refresh가 같은 Actor document의 `url`에서 hostname이 있는 HTTP(S)로 정규화 가능한 nullable profile URL alias를 Actor identity에 연결해 보존할 수 있도록 additive metadata 저장을 적용한다. refresh document가 `url`을 생략하거나 검증에 실패하면 이전 alias를 제거하고 null로 갱신한다. 기존 Actor row의 alias는 null로 시작하며 기존 Profile/Post를 backfill하거나 기존 글을 자동 보정하지 않는다.
2. `post_mentions` additive migration을 writer 활성화 전에 적용한다. migration은 `post_content_id`·`profile_id` column, composite primary key, Profile index와 Post Content/Profile foreign key를 생성하며, document version 변환이나 기존 data backfill은 도입하지 않는다.
3. 서버의 본문 파생값에서 GraphQL `bodyText`와 legacy renderer 표시까지 body text·Media·Content Warning preservation을 end-to-end로
   증명하는 reader gate는 deferred 상태로 기록한다. plain text fallback의 허용된 link/문단 저하를 확인해야 한다는 계약은 유지하되,
   이 gate를 `PROD-910` renderer 착수·통합의 blocker로 사용하지 않는다.
4. 기존 Post Content V1 additive 경로와 결정된 `mentionedProfiles` read projection을 사용해 `PROD-910` renderer·Profile 이동과
   접근성을 연결해 통합 검증한다. document schema V2, V1/V2 dual-read 또는 document version 변환은 추가하지 않으며, 새 feature
   flag도 이 change에서 구현하지 않는다. `PROD-911`은 별도 change가 이 결과를 소비한다.
5. 문제 발생 시 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하고, 안전 link/text 경로로 수신을 계속한다. pre-Mention server binary 전체 rollback은 기존 bodyText 파생기가 Mention label을 잃을 수 있으므로 별도 호환·데이터 대응 증거 없이는 수행하지 않는다. 재활성화 조건은 통합 검증 기록에 남긴다.

## Open Questions

- GraphQL field/connection 구현의 resolver·fragment 배치는 코드 소유자가 정한다. 외부 계약은 `PostContent.mentionedProfiles: [Profile!]!`,
  기존 Profile visibility predicate와 PostContent 조회 정책, canonical UUID의 global ID projection, exact global ID matching으로 닫혀 있다.
