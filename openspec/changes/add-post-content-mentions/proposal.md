## Why

현재 remote Note 수신은 안전한 본문과 Media를 Post Content V1로 투영하지만 ActivityStreams typed `Mention`을
일반 링크와 구분해 보존하지 않는다. 그 결과 후속 renderer와 Notification이 같은 Profile identity를 소비할 수
있는 공통 기준이 없으므로, `PROD-340`이 소유한 인식·저장 계약을 `PROD-910`과 `PROD-911`의 소비자보다 먼저
닫는다.

## What Changes

- 검증된 ActivityPub `tag`의 typed `Mention.href`가 이미 알려진 Profile stable identity로 해석될 때만 canonical Mention
  projection 후보로 인정한다. 이 identity 확인은 본문 HTML 변환과 독립적이다. 본문 anchor URI가 typed href 또는 기존 정상
  actor materialization·refresh로 저장된 Profile URL alias에 대응하면 canonical node로 표현할 수 있고, URL이 다르거나 anchor가
  없으면 안전한 일반 link 또는 표시 text로 보존한다. 일반 link/text는 Mention 관계를 만들지 않는다.
- Local Profile은 trusted canonical origin과 기존 Profile URL 규칙의 human URL을 actor URI와 함께 사용할 수 있다. Remote
  Profile URL alias가 없으면 이미 알려진 actor URI만 사용하며 Mention 수신 중 URL fetch·신규 Profile materialization·backfill을
  수행하지 않는다. 누락 alias는 기존 정상 actor materialization·refresh에서만 채우며, 새 migration이나 live DB 변경을 이
  계약에 추가하지 않는다. tag `name`·handle과 본문 visible label의 문자열 일치로 identity를 확정하거나 거부하지 않는다.
- typed `Mention.href`에서 확인한 Profile identity 집합과 body Mention node는 독립적으로 Post Content revision에 투영한다.
  `post_mentions` revision-owned Profile 관계와 Current Content pointer는 같은 저장 경계에서 생성하고, 본문 anchor URL이 다르거나
  없어 ordinary link/text가 되어도 확인된 typed Profile 관계는 보존한다. 과거 revision과 그 관계는 보존한다.
- unresolved, malformed 또는 identity를 확인할 수 없는 typed Mention은 Mention node·Profile 관계를 만들지 않고, Note가
  나머지 수신 검증을 통과하면 안전한 일반 link 또는 표시 text로 본문을 보존한다. 알려진 typed identity의 본문 URL 불일치는
  identity 실패가 아니며 해당 anchor만 fallback으로 낮춘다. 이 경로에서 신규 원격 Profile lookup/materialization은 수행하지 않는다.
- canonical Mention node에는 `profileId`만 저장한다. 원문 anchor의 표시 문자열은 수신 중 loose resource/length budget 계산에만
  transient하게 사용하고 저장하지 않는다. body conversion은 기존 안전 parser 경계를 따르며, renderer는 같은 revision의 Profile `relativeHandle`에서
  표시 문자열을 파생하며, Profile을 조회할 수 없으면 Profile 이동 없는 `@알 수 없는 사용자`를 표시한다.
- 기존 duplicate `Create`의 first-write-wins no-op과 remote `Update(Note)` 제외 범위를 유지한다.
- 구 reader가 Mention을 포함한 본문을 보존할 수 있는 호환 처리를 먼저 확보·검증한 뒤 현재 Post Content V1에
  additive한 Mention node 저장을 활성화한다. 구 reader는 기존 `bodyText` fallback을 재사용한 plain text 표시를
  허용하며, link 클릭 동작과 문단 구조의 일시적 저하를 허용한다. 이 change에서는 document schema version을
  올리거나 V1/V2 dual-read 또는 document version 변환을 도입하지 않으며, Mention node의 exact attr/field와
  `post_mentions`의 column/index/primary-key shape는 구현 선택으로 남긴다. 2026-09-14 정정 범위에는 새 migration이나 live DB
  변경을 포함하지 않는다.
- `PROD-340`의 공통 계약·구현 gate와 `PROD-910`의 renderer·Profile 이동·접근성·통합 및 archive를 이
  change의 구현·완료 범위로 함께 추적한다. `PROD-911`의 Notification·FCM은 이 capability를 소비하는
  별도 change의 범위로 남긴다. local compose, outbound federation, `to`/`cc` audience와 DIRECT visibility도
  제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`,
  `docs/domain/decisions/0030-post-content-mention-identity.md`
- Linear Contract / Common implementation gate: [`PROD-340`](https://linear.app/byulmaru/issue/PROD-340/원격-note-mention을-pm-node와-profile-관계로-보존한다)
- Linear Implementation / integration and archive: [`PROD-910`](https://linear.app/byulmaru/issue/PROD-910/본문-mention을-표시하고-profile로-이동한다)
- Separate consumer change: [`PROD-911`](https://linear.app/byulmaru/issue/PROD-911/activitypub-수신-mention을-인앱-알림으로-생성표시하고-fcm과-연결한다)

## Capabilities

### New Capabilities

- `post-content-mentions`: 검증된 inbound typed Mention의 canonical Post Content node, revision-owned Profile
  관계, 안전한 fallback과 구 reader 호환 활성화 gate를 정의한다.

### Modified Capabilities

- `post-content-document`: Mention-bearing document를 읽는 기존 native/web renderer의 unknown node fallback과
  bodyText·Media·Content Warning 보존 경계를 구 reader 계약에 반영한다. 기존 remote Post ingestion 요구사항은
  일반 audience URI·anchor를 Mention으로 오인하지 않는 경계를 그대로 유지하고, 기존 Post Content V1에 additive한
  typed `Mention` node를 허용하는 schema와 reader fallback을 새 공통 capability에 맞춰 반영한다. 이 change는
  document schema V2, V1/V2 dual-read 또는 document version 변환을 추가하지 않는다.

## Impact

- `packages/core`: 기존 V1 Post Content canonicalizer/validator와 Post 생성 transaction에 typed Mention projection,
  body node와 독립적인 relation persistence와 호환 검증을 연결한다.
- `packages/fedify`: 기존 actor materialization·refresh가 보유한 Profile URL metadata를 재사용하고, inbound Note의 typed
  `Mention.href`를 이미 알려진 Profile identity와 확인해 `to`/`cc` audience와 분리한다. Mention 수신 중 새 actor/profile fetch,
  materialization 또는 backfill은 수행하지 않는다.
- PostgreSQL/Drizzle 및 GraphQL read projection: immutable revision 관계를 `post_mentions` table에 저장·조회하되
  column/index/primary-key shape는 구현 전 검토한다.
- `packages/core`, `packages/fedify`의 unit/integration 검증: valid, duplicate, unresolved, malformed,
  mismatch, atomic rollback과 legacy reader body preservation을 증명한다.
- `PROD-910`은 이 change에서 canonical node/relation을 소비하는 renderer/Profile 이동과 통합 검증,
  archive를 완료한다. `PROD-911`은 별도 Notification/FCM change에서 같은 capability를 소비하며 그
  범위·완료 책임은 이 change와 분리한다.
