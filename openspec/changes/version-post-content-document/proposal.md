## Why

현재 `PostContent.bodyText`는 일반 링크와 강제 개행 같은 구조를 canonical 본문에서 보존할 수 없고, ActivityPub import가 필요한 의미를 별도 annotation이나 실행 가능한 HTML 없이 표현할 공통 경계가 없다. PROD-341은 제품 전반의 canonical 본문을 Kosmo가 소유하는 versioned ProseMirror document JSON으로 확장해 서버, API와 유니버설 앱이 같은 제한된 문서 의미를 사용하게 한다.

## What Changes

- **BREAKING** `post_content.body_text`를 schema version과 canonical document JSON으로 교체하고, 비프로덕션의 기존 `Post`/`PostContent` 데이터는 migration에서 모두 삭제한다.
- V1을 `doc`, `paragraph`, `text`, `hard_break` node와 안전한 absolute HTTP(S) `link` mark로 제한한다. `pre`와 그 밖의 rich-text node/mark는 지원하지 않는다.
- 서버 전용 `prosemirror-model` `Schema`, `nodeFromJSON()`, `check()`, `toJSON()` 경계로 입력을 검증하고 결정적으로 canonicalize한다.
- 로컬 `bodyText` 입력을 V1 document로 변환하고, 읽기·검색·접근성·500자 검증용 Plain Text를 document에서 결정적으로 파생한다.
- GraphQL `PostContent`가 schema version과 document JSON을 노출하고, `bodyText`는 저장값이 아닌 호환용 파생 필드로 유지한다. 로컬 composer의 `CreatePostInput.bodyText`는 유지한다.
- React Native/Web 앱은 ProseMirror runtime 없이 JSON 타입과 제한된 paragraph/text/hard-break/link renderer를 사용한다.
- 활성 remote-post OpenSpec의 stale TipTap/Plain Text storage 전제를 이 공통 document 계약과 동기화하되 remote Note projection과 materialization 구현은 PROD-259/PROD-261에 남긴다.

## Capabilities

### New Capabilities

- `post-content-document`: versioned canonical document schema, canonicalization, Plain Text projection, revision equality와 안전한 제한 renderer 경계를 정의한다.

### Modified Capabilities

- `data-model`: `PostContent` 저장 본문을 Plain Text에서 schema-versioned canonical document JSON으로 교체한다.
- `post`: GraphQL과 유니버설 앱의 게시글 작성·조회 계약을 versioned document와 파생 Plain Text에 맞춘다.

## Impact

- `packages/core`: native-safe document JSON 타입과 server-only ProseMirror schema/canonicalizer/Plain Text projection을 추가하고 `prosemirror-model`을 서버 전용 dependency로 사용한다.
- `packages/core/db`, `drizzle`: `post_content` 본문 컬럼과 destructive non-production migration을 변경한다.
- `apps/api`: GraphQL document scalar/object, 파생 `bodyText`, 로컬 Plain Text 입력 변환과 revision output을 추가한다.
- `apps/app`: Relay scalar mapping과 제한된 native/web renderer를 추가하되 editor/view runtime은 포함하지 않는다.
- `openspec/changes/add-activitypub-remote-post-ingestion`: stale TipTap projection과 revision 비교 문구를 PROD-341 document 계약으로 동기화한다.
- TipTap, ProseMirror editor/view, WebView editor runtime, remote Note projection/materialization, Mention/Custom Emoji relation은 포함하지 않는다.
