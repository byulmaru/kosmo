## Why

현재 remote Note 수신은 안전한 본문과 Media를 Post Content V1로 투영하지만 ActivityStreams typed `Mention`을
일반 링크와 구분해 보존하지 않는다. 그 결과 후속 renderer와 Notification이 같은 Profile identity를 소비할 수
있는 공통 기준이 없으므로, `PROD-340`이 소유한 인식·저장 계약을 `PROD-910`과 `PROD-911`의 소비자보다 먼저
닫는다.

## What Changes

- 검증된 ActivityPub `tag`의 typed `Mention`만 canonical Post Content node와 해당 immutable revision의
  Mentioned Profile 관계로 저장한다.
- typed tag의 actor URI는 이미 저장된 Local/Remote Profile stable identity로 확인하고, 본문 anchor URI는 같은
  Profile의 허용 href에 대응하는지 검증한다. Local Profile은 trusted canonical origin과 기존 Profile URL 규칙의 human URL을
  actor URI와 함께 사용할 수 있다. Remote Profile은 actor materialization·refresh에서 해당 Actor가 `url`로 광고하고 hostname이 있는 HTTP(S)로
  검증해 저장한 nullable profile URL alias를 actor URI와 함께 사용할 수 있다. alias는 Actor URI와 다른 hostname이어도 Actor가 직접
  광고한 URL이면 허용한다. alias가 없거나 검증되지 않으면 저장된 actor URI만 사용한다. actor URI와 human URL은 서로 다른 URI 형식일
  수 있으며 tag `name`·handle과 본문 visible label의 문자열 일치는 identity
  조건으로 사용하지 않는다.
- Mention node와 `post_mentions` revision-owned Profile 관계는 Post Content revision과 Profile을 가리키는 foreign
  keys와 함께 같은 저장 경계에서 생성하고, Current Post는 현재 Content의 관계를 투영한다. 과거 revision과 그
  관계는 보존한다.
- unresolved, malformed 또는 identity mismatch Mention은 Mention node·Profile 관계를 만들지 않고, Note가
  나머지 수신 검증을 통과하면 안전한 일반 link 또는 표시 text로 본문을 보존한다. 이 경로에서 신규 원격
  Profile lookup/materialization은 수행하지 않는다.
- 기존 duplicate `Create`의 first-write-wins no-op과 remote `Update(Note)` 제외 범위를 유지한다.
- 구 reader가 Mention을 포함한 본문을 보존할 수 있는 호환 처리는 `PROD-340` activation/rollout의 후속 gate로
  확보·검증한다. 구 reader는 기존 `bodyText` fallback을 재사용한 plain text 표시를 허용하며, link 클릭 동작과 문단
  구조의 일시적 저하를 허용한다. 이 2.x evidence는 2026-09-11 사용자 결정에 따라 deferred 상태이고 `PROD-910`
  renderer 구현·통합을 막지 않는다. 이 change에서는 document schema version을 올리거나 V1/V2 dual-read 또는 document
  version 변환을 도입하지 않으며, Mention node의 exact attr/field와 `post_mentions`의 column/index/primary-key shape는
  구현 선택으로 남긴다. `post_mentions` persistence를 위한 additive DB migration은 허용한다.
- `PROD-340`의 공통 계약·구현 gate와 `PROD-910`의 renderer·Profile 이동·접근성·통합 및 archive를 이
  change의 구현·완료 범위로 함께 추적한다. `PROD-911`의 Notification·FCM은 이 capability를 소비하는
  별도 change의 범위로 남긴다. local compose, outbound federation, `to`/`cc` audience와 DIRECT visibility도
  제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
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
  relation 재구축과 호환 검증을 연결한다.
- `packages/fedify`: actor materialization·refresh에서 Actor가 광고한 검증된 HTTP(S) profile URL alias를 기존 Actor identity에
  연결해 보존하고, inbound Note의 typed `tag`에 그 alias를 허용 href로 전달하며 `to`/`cc` audience와 분리한다. Mention 수신 중
  새 actor/profile fetch는 수행하지 않는다.
- PostgreSQL/Drizzle 및 GraphQL read projection: immutable revision 관계를 `post_mentions` table에 저장·조회하고,
  `PostContent.mentionedProfiles: [Profile!]!`에서 기존 Profile visibility predicate(Profile이 `ACTIVE`이고 소속 Instance가
  `SUSPENDED`가 아님)를 통과한 같은 revision의 Profile을 deduplicate해 제공한다. Post visibility·eligibility는 PostContent 조회의
  기존 정책을 따르며 viewer별 Profile Domain Block 정책은 이 field에서 새로 조합하지 않는다.
  document의 canonical UUID는 기존 Media와 같은 client-facing global ID로 projection하며, node global ID와 relation Profile ID를
  exact match한다. 저장 UUID와 `post_mentions`의 column/index/primary-key shape는 서버 구현 계약으로 유지한다.
- `packages/core`, `packages/fedify`의 unit/integration 검증: valid, duplicate, unresolved, malformed,
  mismatch, atomic rollback을 증명한다. legacy reader body preservation은 deferred 2.x gate로 별도 기록한다.
- `PROD-910`은 이 change에서 canonical node/relation을 소비하는 renderer/Profile 이동과 통합 검증,
  archive를 완료한다. `PROD-911`은 별도 Notification/FCM change에서 같은 capability를 소비하며 그
  범위·완료 책임은 이 change와 분리한다.
