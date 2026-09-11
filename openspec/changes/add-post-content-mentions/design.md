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
- inbound target·anchor identity 증거가 기존 Profile stable identity로 확인되지 않거나 표시 label이 안전한 표시·구조 검증을 통과하지 못한 tag를 안전한 link 또는 text로 보존하고 신규 원격 Profile lookup/materialization을 피한다. 확인된 candidate만 `{ targetHref, label, profileId }`로 core에 전달하며 canonical node에는 `{ profileId, label }`만 저장한다. 표시 label이 Profile 이름·handle과 같다는 사실만으로 identity를 확정하지 않는다.
- duplicate `Create`의 first-write-wins no-op, remote `Update(Note)` 제외, 과거 revision 보존을 기존 동작과 함께 검증한다.
- 구 reader의 body preservation을 증명한 뒤 Mention 저장을 활성화하고, `PROD-910` renderer·Profile 이동 및 통합/archive까지 연결한다.

**Non-Goals:**

- `PROD-911`의 Notification·FCM 생성, 표시와 전송.
- remote `Update(Note)`, local compose, outbound federation, audience(`to`/`cc`) 해석, DIRECT/limited visibility 권한 변경.
- Mention node의 구체 필드, `post_mentions`의 column/index/primary-key shape, GraphQL payload 또는 UI route를 제품 계약으로 고정하는 일. document version은 기존 Post Content V1 additive 확장으로 이 change에서 확정한다.

## Implementation Guidance

### Current Constraints

- `packages/core/post-content`의 schema와 canonicalizer는 V1 document의 허용 node와 exact canonical form을 관리한다. Mention은 기존 V1 document와 node 의미를 바꾸지 않는 additive 확장으로 허용하되, 구 reader가 알 수 없는 node를 버리거나 canonicalization 결과를 달리할 수 있으므로 bodyText fallback을 먼저 검증해야 한다.
- `packages/core/activitypub-note-content.ts`는 원격 HTML/plain text를 동일한 안전한 schema로 투영한다. 이 경계 밖에서 다시 HTML을 만들거나 raw tag를 저장하면 기존 안전성·본문 보존 계약을 우회하게 된다.
- `packages/fedify/src/local-post-note.ts`도 canonical content에서 local ActivityPub Note의 평문·HTML을 파생하는 경로이므로, 공통 primitive projection을 바꿀 때 label text와 기존 safe link 보존을 함께 회귀 검증해야 한다. 이 change는 outbound typed Mention federation을 추가하지 않는다.
- `packages/fedify/src/inbound-create-note.ts`는 Note identity·visibility와 content/media projection을 호출한다. Fedify inbound adapter는 typed Mention의 target URI를 기존 Profile identity로 확인한 뒤 `{ targetHref, label, profileId }` candidate를 전달하며, 이 확인에서 새 원격 lookup/materialization을 수행하지 않는다. `to`/`cc` actor URI는 audience이고 `tag` Mention은 별도 입력이므로, 두 경로를 합쳐서 Mention을 추론하면 안 된다.
- `packages/core/services/post.ts`는 duplicate remote object URI를 먼저 판별하고, 최초 Create의 Post·Content·media·Current Content pointer를 transaction으로 만든다. Mention 관계를 별도 후처리로 쓰면 partial relation 또는 duplicate revision이 남을 수 있다.
- 현재 구현은 `post_mentions(post_content_id, profile_id)`를 immutable Post Content revision과 Profile을 잇는 persisted membership projection으로 사용한다. 두 column의 composite primary key와 Profile index, Post Content/Profile foreign key가 referential integrity를 보장하며, Post 하나에만 두거나 read-time JSON parsing만으로 대체하면 과거 revision의 의미가 사라진다. GraphQL read projection은 `PROD-910` 범위의 후속 구현 선택으로 남긴다.

### Recommended Approach

1. inbound adapter는 Fedify vocabulary에서 typed `Mention`의 target URI를 기존 Profile identity로 확인한 뒤 `{ targetHref, label, profileId }` candidate를 core에 전달한다. `projectRemoteNoteContent`의 순수 HTML/plain-text parser는 candidate의 normalized targetHref와 본문의 safe anchor href·label을 대조해 `{ profileId, label }` Mention 또는 link/text를 만들며 DB·stored Profile identity를 조회하지 않는다. `createPost` transaction은 canonical document의 `profileId` 집합을 `post_mentions`에 저장하고 별도 ActivityPub actor lookup이나 fallback 재검증을 수행하지 않는다. Profile domain·handle이나 추측한 remote URL을 조합하지 않으며, 일반 anchor와 audience는 기존 의미를 둔다.
2. 해결 실패·malformed·identity mismatch는 기존 안전 parser가 만드는 link/text fallback으로 투영한다. 이 분기에서 remote actor/profile fetch나 신규 materialization을 호출하지 않으며, 나머지 Note가 통과하면 전체 본문을 저장한다.
3. 기존 Post 생성 transaction의 저장 경계 안에서 canonical document, `post_mentions`의 persisted revision-owned 관계 projection, Current Content pointer를 함께 만든다. 현재 구현은 `post_content_id`와 `profile_id`를 composite primary key로 묶고 각각 Post Content revision과 Profile foreign key로 연결하며 Profile index를 둔다. 관계는 canonical node에서 다시 계산할 수 있는 파생값으로 두고, 같은 revision과 Profile의 관계는 하나의 set entry로 만든다. document 안의 반복 Mention occurrence와 순서는 보존하되 relation을 중복 생성하지 않으며, 새 revision을 만들 때 이전 document와 관계를 건드리지 않는다. duplicate URI의 early no-op은 Mention projection보다 앞에 둔다. Local Post Content validator는 Mention node를 거부한다.
4. 먼저 서버의 본문 파생값에서 구 reader 표시까지 body text, Media와 Content Warning이 보존되는지 matrix를 실행한다. 구 reader는 기존 `bodyText` fallback을 재사용한 plain text 표시를 사용할 수 있으며, link 클릭 동작과 문단 구조의 일시적 저하는 허용한다. 호환 증거가 통과하면 기존 Post Content V1 additive 경로에서 Mention 저장을 활성화한다. document schema V2, V1/V2 dual-read 또는 document version 변환은 도입하지 않는다.
5. `PROD-910` renderer는 canonical node와 revision/Profile projection만 소비해 표시, Profile 이동과 접근성을 연결하고, 공통 저장·renderer 통합 검증과 archive 완료 증거를 소유한다. Notification/FCM은 `PROD-911` change에서 별도로 연결한다.

### Allowed Alternatives

- 선택 경로는 구 reader 호환 검증을 통과한 뒤 기존 V1 document에 Mention을 additive하게 보존하는 것이다. 구 reader가 unknown node를 보존하지 못해도 bodyText plain text fallback으로 글자·Media·Content Warning을 보존할 수 있다. document schema version을 올리고 V1/V2 dual-read 또는 document version 변환을 도입하는 대안은 기존 V1 document를 재작성하거나 breaking 의미를 도입할 필요가 없으므로 채택하지 않는다. relation persistence를 위한 additive DB migration은 이 대안 거부에 포함되지 않는다.
- 현재 선택한 `post_mentions` shape는 구현 세부이며 제품 계약을 확장하지 않는다. canonical node가 source of truth이고 relation은 그 node에서 재구축 가능해야 하며, 동일 revision/Profile relation은 set semantics를 가져야 한다. JSON-only read-time parsing을 persisted relation의 동등한 대안으로 사용하지 않는다. GraphQL read projection은 `PROD-910`에서 정한다.
- Mention 후보의 초기 추출은 Fedify adapter에서 수행할 수 있지만, identity 검증·fallback·canonicalization은 core의 공통 경계에 두어 다른 inbound 경로와 결과를 일치시킨다.

### Known Traps

- HTML anchor나 `to`/`cc` actor URI만으로 Mention을 추론하지 않는다.
- 해결되지 않은 target을 위해 WebFinger, actor fetch 또는 원격 Profile materialization을 호출하지 않는다.
- Current Post에만 관계를 저장하거나 새 revision에서 과거 관계를 재작성하지 않는다.
- duplicate `Create`를 body가 바뀌었다는 이유로 Update처럼 처리하거나 timestamp·relation을 갱신하지 않는다.
- 구 reader 호환성 증거 없이 새 node 저장을 활성화하지 않는다.
- 안전 parser를 우회해 원격 HTML 또는 표시 문자열을 raw HTML로 저장하지 않는다.

## Risks / Trade-offs

- [구 reader가 unknown node를 제거함] → 저장 활성화 전에 서버 본문 파생값부터 구 reader 표시까지 body text·Media·Content Warning을 검증하고, 기존 bodyText plain text fallback을 사용한다. document schema version은 V1 additive로 유지하며, 필요한 relation persistence DB migration은 별도 additive migration으로 검증한다.
- [stable identity 검증이 너무 느슨해 다른 Profile을 연결함] → inbound adapter에서 target URI를 저장 Profile stable identity로 확인하고 core parser에서 normalized target href·anchor href·label을 일치시키며, 실패 시 link/text fallback으로 낮춘다.
- [relation과 Current pointer가 부분 저장됨] → 기존 Post transaction에 포함하고 relation 저장 실패를 전체 rollback으로 검증한다.
- [renderer가 document와 relation을 서로 다르게 해석함] → `PROD-910` 통합 검증에서 현재 revision, 과거 revision, unresolved fallback을 함께 확인한다.
- [Mention 저장 뒤 pre-Mention 서버 binary로 전체 rollback함] → 구 binary의 기존 `bodyText` 파생기가 Mention label을 보존하지 못할 수 있으므로, 호환·데이터 대응 증거 없이 전체 rollback을 안전하다고 간주하지 않는다. 기본 rollback은 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하는 운영 절차로 기록한다.

## Migration Plan

1. `post_mentions` additive migration을 writer 활성화 전에 적용한다. migration은 `post_content_id`·`profile_id` column, composite primary key, Profile index와 Post Content/Profile foreign key를 생성하며, document version 변환이나 기존 data backfill은 도입하지 않는다.
2. 서버의 본문 파생값에서 GraphQL `bodyText`와 legacy renderer 표시까지 body text·Media·Content Warning preservation을 end-to-end로 증명하고, plain text fallback의 허용된 link/문단 저하를 확인한다. 이 reader gate가 끝날 때까지 writer 활성화 상태로 전환하지 않는다.
3. 호환 증거가 통과한 뒤 기존 Post Content V1 additive 경로에서 Mention storage를 활성화하고 `PROD-910` renderer·Profile 이동과 접근성을 연결해 통합 검증을 완료한다. document schema V2, V1/V2 dual-read 또는 document version 변환은 추가하지 않으며, 새 feature flag도 이 change에서 구현하지 않는다. `PROD-911`은 별도 change가 이 결과를 소비한다.
4. 문제 발생 시 신규 Mention 쓰기를 중지하면서 기존 Mention 읽기·본문 파생 지원과 additive DB/data를 유지하고, 안전 link/text 경로로 수신을 계속한다. pre-Mention server binary 전체 rollback은 기존 bodyText 파생기가 Mention label을 잃을 수 있으므로 별도 호환·데이터 대응 증거 없이는 수행하지 않는다. 재활성화 조건은 통합 검증 기록에 남긴다.

## Open Questions

- GraphQL read projection과 UI route를 `PROD-910`에서 어떤 형태로 연결할지. 선택 결과는 기존 V1 document 의미와 revision-owned relation contract를 유지해야 한다.
