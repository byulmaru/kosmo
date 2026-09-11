## Context

이 change는 [`PROD-340`](https://linear.app/byulmaru/issue/PROD-340/원격-note-mention을-pm-node와-profile-관계로-보존한다)이 정의한 inbound typed `Mention`의 공통 저장 계약과, [`PROD-910`](https://linear.app/byulmaru/issue/PROD-910/본문-mention을-표시하고-profile로-이동한다)이 소유한 renderer·Profile 이동·통합 및 archive를 함께 전달한다. [`PROD-911`](https://linear.app/byulmaru/issue/PROD-911/activitypub-수신-mention을-인앱-알림으로-생성표시하고-fcm과-연결한다)은 같은 공통 결과를 소비하는 별도 Notification change다.

현재 Post Content는 version 1의 document와 immutable revision을 canonicalize하는 경계를 갖는다. 2026-09-14 정정의 대상인 inbound Note 경로는 ActivityPub `Note`의 본문을 안전한 inline content와 Media로 투영하고 `createPost` transaction 안에서 Post, Post Content, Current Content pointer와 revision-owned Mention 관계를 함께 처리한다. 이 정정은 inbound adapter가 typed `Mention.href`를 known Profile stable identity로 확인한 `profileId` 집합을 body conversion과 독립적으로 전달하고, core parser가 body anchor를 best effort로 변환하도록 경계를 분리한다. 원문 anchor의 표시 문자열은 loose resource/length budget 계산 중에만 transient하게 사용하고 canonical document에는 저장하지 않는다. renderer는 같은 revision의 Profile `relativeHandle`에서 표시 문자열을 파생하며, Profile을 조회할 수 없으면 `@알 수 없는 사용자`를 비링크로 표시한다. Fedify의 `Mention`은 `Link` 계열이고 `Note.getTags()`는 object 또는 link를 반환하므로, 일반 anchor와 typed tag를 명시적으로 구분해야 한다. 기존 본문 parser에는 안전하지 않은 markup을 link 또는 text로 보존하는 fallback이 있으므로, Mention body node를 만들지 못한 경우에도 이 경계를 재사용해야 한다.

구 reader가 새 inline node를 만났을 때 본문을 보존하는지는 실제 코드와 호환 검증으로 확인해야 한다. document version은
기존 Post Content V1에 additive한 Mention 확장으로 고정하며, 기존 V1 document와 의미를 유지하기 위해 document
schema V2 전환이나 V1/V2 dual-read 또는 document version 변환은 도입하지 않는다. 관계는 body node와 독립된
typed identity 집합에서 파생하는 `post_mentions` persisted projection으로 저장한다. exact node와 relation shape는
구현 선택으로 기록하되, 제품 계약은 검증된 Mention만 관계로 저장하고 수신 검증·중복 Create·revision 보존 경계를 유지한다.

## Goals / Non-Goals

**Goals:**

- 검증된 inbound typed `Mention`을 canonical Post Content node와 immutable revision-owned Profile 관계로 원자적으로 저장한다.
- inbound typed `Mention.href`가 기존 Profile stable identity로 확인되는지와 본문 HTML 변환을 분리한다. Local Profile은 active Local Instance의 trusted canonical origin과 기존 Profile URL 규칙으로 human URL을 확인할 수 있다. Remote Profile URL alias는 기존 actor materialization·refresh가 저장한 값만 사용하며, alias가 없으면 이미 알려진 actor URI만 사용한다. typed identity가 확인된 경우 본문 anchor가 typed href 또는 저장 alias에 대응하면 `profileId`만 가진 canonical node로 표현할 수 있고, URL이 다르거나 anchor가 없으면 본문을 안전한 일반 link 또는 text로 보존한다. 일반 link/text와 audience는 관계를 만들지 않는다. 원문 anchor 표시 문자열은 loose resource/length budget 계산 중에만 transient하게 사용하고 저장하지 않는다. tag `name`·handle과 본문 표시 문자열의 일치만으로 identity를 확정하지 않으며, Mention 수신 중 새 remote fetch/materialization/backfill이나 live DB 변경을 수행하지 않는다. renderer는 Profile `relativeHandle`에서 표시 문자열을 파생하고, Profile을 조회할 수 없으면 `@알 수 없는 사용자`를 비링크로 표시한다.
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
- renderer는 Mention node의 client global ID와 `mentionedProfiles[].id`를 정확히 매칭해 target을 정한다. node 문서 순서를
  유지하고 표시 문자열은 매칭된 Profile의 `relativeHandle`에서 파생하며, client ID encode/decode나 positional/parallel response
  zip을 사용하지 않는다.
- 매칭된 Profile은 기존 KOSMO Profile route `/${relativeHandle}`로 이동한다. Profile relation이 없거나 기존 Profile visibility predicate를
  통과하지 않는 unavailable/deleted target이면 `@알 수 없는 사용자`를 link 없이 표시하고 actor URI·external URL·대체 문구를 사용하지 않는다.
- 기존 Post body의 `onBodyPress` callback과 부모 Post navigation은 유지한다. 활성 Mention link의 press는 event propagation을
  막아 부모 `onBodyPress`가 함께 실행되지 않게 한다.
- 활성 Mention link는 기존 Profile text-link의 의미·타이포그래피 강조 계약과 일반 link semantics를 재사용해 본문 일반 link와
  구분한다. 새 색상·타이포그래피 token이나 tooltip은 추가하지 않으며, accessible name에는 파생된 `relativeHandle`과 `displayName`을 포함한다.
- 새 Mention 전용 route, raw ActivityPub tag 재해석, Mention 수신 중 원격 Profile lookup/materialization은 추가하지 않는다.
- 구 reader 2.x bodyText·Media·Content Warning compatibility gate는 별도 deferred 후속 검증으로 기록한다. 이 gate는 `PROD-910`
  renderer 구현·통합의 선행 blocker가 아니며, gate 증거가 없을 때 완료로 주장하지 않는다.

## Implementation Guidance

### Current Constraints

- `packages/core/post-content`의 schema와 canonicalizer는 V1 document의 허용 node와 exact canonical form을 관리한다. Mention은 기존 V1 document와 node 의미를 바꾸지 않는 additive 확장으로 허용하되, 구 reader가 알 수 없는 node를 버리거나 canonicalization 결과를 달리할 수 있으므로 bodyText fallback을 먼저 검증해야 한다.
- `packages/core/activitypub-note-content.ts`는 원격 HTML/plain text를 동일한 안전한 schema로 투영한다. 이 경계 밖에서 다시 HTML을 만들거나 raw tag를 저장하면 기존 안전성·본문 보존 계약을 우회하게 된다.
- `packages/fedify/src/local-post-note.ts`도 canonical content에서 local ActivityPub Note의 평문·HTML을 파생하는 경로이므로, 공통 primitive projection을 바꿀 때 Mention의 저장하지 않는 원문 표시 문자열 처리와 기존 safe link 보존을 함께 회귀 검증해야 한다. 이 change는 outbound typed Mention federation을 추가하지 않는다.
- `packages/fedify/src/inbound-create-note.ts`는 Note identity·visibility와 content/media projection을 호출한다. Fedify inbound adapter는 typed `Mention.href`를 기존 `ActivityPubActor`·Profile identity로 확인하고, Local Profile이면 trusted local human URL을, Remote Profile이면 기존 actor materialization·refresh에서 저장된 Profile URL alias를 본문 parser에 별도 입력으로 전달할 수 있다. alias가 없으면 이미 알려진 actor URI만 사용한다. Mention 수신 중에는 새 원격 lookup/materialization/backfill을 수행하지 않는다. `to`/`cc` actor URI는 audience이고 `tag` Mention은 별도 입력이므로, 두 경로를 합쳐서 Mention을 추론하면 안 된다.
- `packages/core/services/post.ts`는 duplicate remote object URI를 먼저 판별하고, 최초 Create의 Post·Content·media·Current Content pointer를 transaction으로 만든다. Mention 관계를 별도 후처리로 쓰면 partial relation 또는 duplicate revision이 남을 수 있다.
- 현재 구현은 `post_mentions(post_content_id, profile_id)`를 immutable Post Content revision과 Profile을 잇는 persisted membership projection으로 사용한다. 두 column의 composite primary key와 Profile index, Post Content/Profile foreign key가 referential integrity를 보장하며, Post 하나에만 두거나 read-time JSON parsing만으로 대체하면 과거 revision의 의미가 사라진다. GraphQL은 결정된 `mentionedProfiles: [Profile!]!` visible relation과 document UUID의 global ID projection을 사용한다.

### Recommended Approach

1. inbound adapter는 Fedify vocabulary에서 typed `Mention.href`가 기존 Profile stable identity로 확인되는지 검사한다. 기존 actor materialization·refresh가 저장한 Profile URL alias는 본문 anchor를 best effort로 Mention node에 연결할 때만 사용하며, alias가 없으면 알려진 actor URI만 사용한다. `projectRemoteNoteContent`의 순수 HTML/plain-text parser는 typed identity 입력과 safe anchor href를 독립적으로 처리해 대응하는 anchor만 `profileId` 단일 attr의 Mention으로 표현하고, URL이 다르거나 anchor가 없으면 일반 link/text로 보존한다. 원문 표시 문자열은 loose resource/length budget 계산을 위한 transient 입력으로만 사용하고 canonical document, relation 또는 renderer 입력에 저장하지 않는다. tag `name`·handle을 identity나 exact-match 조건으로 사용하지 않는다. parser는 DB·stored Profile identity를 조회하지 않는다. `createPost` transaction은 adapter가 확인한 typed `profileId` 집합을 body document와 함께 `post_mentions`에 저장하며, 일반 link/text와 audience로 relation을 만들거나 별도 ActivityPub actor lookup·fallback 재검증을 수행하지 않는다. Profile domain·handle에서 remote URL을 추측하지 않는다.
2. 알려진 Profile로 확인되지 않는 typed Mention은 canonical Mention node와 relation을 만들지 않고 기존 안전 parser의 link/text fallback으로 투영한다. 본문 URL 불일치는 typed identity를 실패시키지 않으며 그 anchor만 ordinary link/text로 남긴다. 이 분기에서 remote actor/profile fetch·신규 materialization·backfill/live DB 변경을 수행하지 않으며, 나머지 Note가 통과하면 전체 본문을 저장한다.
3. 기존 Post 생성 transaction의 저장 경계 안에서 canonical document, typed identity 집합에서 파생한 `post_mentions` revision-owned 관계 projection, Current Content pointer를 함께 만든다. 현재 구현은 `post_content_id`와 `profile_id`를 composite primary key로 묶고 각각 Post Content revision과 Profile foreign key로 연결하며 Profile index를 둔다. 관계는 body node와 독립적으로 typed identity에서 파생하고, 같은 revision과 Profile의 관계는 하나의 set entry로 만든다. document 안의 반복 Mention occurrence와 순서는 보존하되 relation을 중복 생성하지 않으며, body URL mismatch·ordinary link fallback이 relation을 제거하지 않는다. 새 revision을 만들 때 이전 document와 관계를 건드리지 않는다. duplicate URI의 early no-op은 Mention projection보다 앞에 둔다. Local Post Content validator는 Mention node를 거부한다.
4. 먼저 서버의 본문 파생값에서 구 reader 표시까지 body text, Media와 Content Warning이 보존되는지 matrix를 실행한다. 구 reader는 기존 `bodyText` fallback을 재사용한 plain text 표시를 사용할 수 있으며, link 클릭 동작과 문단 구조의 일시적 저하는 허용한다. 호환 증거가 통과하면 기존 Post Content V1 additive 경로에서 Mention 저장을 활성화한다. document schema V2, V1/V2 dual-read 또는 document version 변환은 도입하지 않는다.
5. `PROD-910` renderer는 canonical node와 revision/Profile projection만 소비해 표시, Profile 이동과 접근성을 연결하고, 공통 저장·renderer 통합 검증과 archive 완료 증거를 소유한다. GraphQL은 `mentionedProfiles` visible relation과 document global ID를 exact matching에 사용한다. Notification/FCM은 `PROD-911` change에서 별도로 연결한다.

### Allowed Alternatives

- 선택 경로는 구 reader 호환 검증을 통과한 뒤 기존 V1 document에 Mention을 additive하게 보존하는 것이다. 구 reader가 unknown node를 보존하지 못해도 bodyText plain text fallback으로 글자·Media·Content Warning을 보존할 수 있다. document schema version을 올리고 V1/V2 dual-read 또는 document version 변환을 도입하는 대안은 기존 V1 document를 재작성하거나 breaking 의미를 도입할 필요가 없으므로 채택하지 않는다. 2026-09-14 정정 범위는 기존 DB/actor refresh 경계를 재사용하며 새 migration이나 live DB 변경을 포함하지 않는다.
- 현재 선택한 `post_mentions` shape는 구현 세부이며 제품 계약을 확장하지 않는다. typed `Mention.href`에서 확인한 Profile identity 집합이 relation projection의 source이며, body node와 독립적으로 동일 revision/Profile relation은 set semantics를 가져야 한다. JSON-only read-time parsing을 persisted relation의 동등한 대안으로 사용하지 않는다. GraphQL은 기존 Profile visibility predicate와 PostContent 조회 정책을 통과한 `mentionedProfiles: [Profile!]!` relation을 제공하고 document UUID를 global ID로 projection한다.
- Mention 후보 추출과 typed `Mention.href`의 known Profile stable identity 검증은 inbound adapter 경계에서 수행한다. core의 공통 projection/parser 경계는 전달된 identity와 body candidates를 사용해 안전한 body conversion·fallback과 best-effort node 표현을 수행해 다른 inbound 경로와 결과를 일치시킨다.

### Known Traps

- HTML anchor나 `to`/`cc` actor URI만으로 Mention을 추론하지 않는다. typed `Mention.href`의 Profile identity 확인과 본문 anchor 변환은 독립적이며, URL 불일치만으로 typed identity를 실패시키지 않는다.
- 서로 다른 Profile 후보가 같은 본문 anchor href를 공유하면 그 anchor는 ambiguous ordinary link/text로 낮추고 first match를 선택하지 않는다. typed `Mention.href`가 각각 알려진 Profile이면 relation은 유지한다.
- Local actor URI와 trusted human Profile URL의 표현이 다를 수 있음을 전제로 하며, Remote Profile URL alias는 기존 actor materialization·refresh가 저장한 값만 사용한다. alias가 없으면 actor URI만 사용하고, human URL을 handle·domain에서 추측하지 않는다. tag `name`·handle과 본문 visible label의 exact match를 요구하지 않는다.
- 해결되지 않은 target을 위해 Mention 수신 중 WebFinger, actor fetch, 원격 Profile materialization 또는 backfill/live DB 변경을 호출하지 않는다. Profile URL alias는 기존 정상 actor materialization·refresh 경계에서만 갱신한다.
- Current Post에만 관계를 저장하거나 새 revision에서 과거 관계를 재작성하지 않는다.
- duplicate `Create`를 body가 바뀌었다는 이유로 Update처럼 처리하거나 timestamp·relation을 갱신하지 않는다.
- 구 reader 호환성 증거 없이 Mention writer activation을 완료로 주장하지 않는다. 이 deferred gate는 `PROD-910` renderer 구현·통합의 blocker가 아니다.
- 안전 parser를 우회해 원격 HTML 또는 표시 문자열을 raw HTML로 저장하지 않는다.

## Risks / Trade-offs

- [구 reader가 unknown node를 제거함] → 저장 활성화 전에 서버 본문 파생값부터 구 reader 표시까지 body text·Media·Content Warning을 검증하고, 기존 bodyText plain text fallback을 사용한다. document schema version은 V1 additive로 유지하며, 기존 relation persistence DB 경계를 재사용한다.
- [stable identity 검증이 너무 느슨해 다른 Profile을 연결함] → inbound adapter에서 typed `Mention.href`를 저장 Profile stable identity로 확인하고, 일반 link/text와 audience에서는 relation을 만들지 않는다. 본문 anchor URL은 표시 변환에만 best effort로 사용하며, tag `name`·handle은 identity에서 제외한다. body ambiguity가 relation identity를 덮어쓰지 않는다.
- [relation과 Current pointer가 부분 저장됨] → 기존 Post transaction에 포함하고 relation 저장 실패를 전체 rollback으로 검증한다.
- [renderer가 document와 relation을 서로 다르게 해석함] → `PROD-910` 통합 검증에서 현재 revision, 과거 revision, unresolved fallback을 함께 확인한다.
- [Mention 저장 뒤 pre-Mention 서버 binary로 전체 rollback함] → 구 binary의 기존 `bodyText` 파생기가 Mention node를 지원하지 않을 수 있으므로, 호환·데이터 대응 증거 없이 전체 rollback을 안전하다고 간주하지 않는다. 기본 rollback은 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하는 운영 절차로 기록한다.

## Migration Plan

1. 기존 actor materialization·refresh가 제공하는 Profile URL metadata를 재사용한다. 2026-09-14 정정 범위에서 새 metadata migration, live DB 변경, 기존 Actor/Profile/Post backfill은 수행하지 않는다. alias가 없는 동안에는 알려진 actor URI로만 typed identity를 확인하고, 이후 정상 refresh로 alias가 채워져도 이미 저장된 글을 자동 보정하지 않는다.
2. `post_mentions`의 기존 revision-owned 저장 경계를 유지한다. 2026-09-14 정정 범위에는 live DB schema 변경이나 migration 실행을 포함하지 않는다.
3. 서버의 본문 파생값에서 GraphQL `bodyText`와 legacy renderer 표시까지 body text·Media·Content Warning preservation을 end-to-end로 증명하고, plain text fallback의 허용된 link/문단 저하를 확인한다. 이 reader gate가 끝날 때까지 writer 활성화 상태로 전환하지 않는다.
4. 호환 증거가 통과한 뒤 기존 Post Content V1 additive 경로에서 Mention storage를 활성화하고 `PROD-910` renderer·Profile 이동과 접근성을 연결해 통합 검증을 완료한다. document schema V2, V1/V2 dual-read 또는 document version 변환은 추가하지 않으며, 새 feature flag도 이 change에서 구현하지 않는다. `PROD-911`은 별도 change가 이 결과를 소비한다.
5. 문제 발생 시 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 기존 DB/data를 유지하고, 안전 link/text 경로로 수신을 계속한다. pre-Mention server binary 전체 rollback은 기존 bodyText 파생기가 Mention node를 잃을 수 있으므로 별도 호환·데이터 대응 증거 없이는 수행하지 않는다. 재활성화 조건은 통합 검증 기록에 남긴다.

## Open Questions

- GraphQL field/connection 구현의 resolver·fragment 배치는 코드 소유자가 정한다. 외부 계약은 `PostContent.mentionedProfiles: [Profile!]!`,
  기존 Profile visibility predicate와 PostContent 조회 정책, canonical UUID의 global ID projection, exact global ID matching으로 닫혀 있다.
