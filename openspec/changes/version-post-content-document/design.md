## Context

현재 `post_content`는 non-null `body_text`와 nullable `content_warning`만 저장하고 GraphQL과 앱도 `bodyText`를 직접 읽는다. PROD-267은 TipTap runtime과 JSON/HTML 저장을 제거했지만, remote Note와 후속 Mention/Custom Emoji가 요구하는 구조적 의미를 Plain Text 하나로는 보존할 수 없다. PROD-341은 editor 기능을 다시 도입하지 않고 제한된 versioned document를 공통 canonical body로 만든다.

현재 환경은 production이 아니며 사용자는 기존 Post 데이터를 보존하지 않아도 된다고 확정했다. 따라서 운영 중 구버전 workload와 rollback window를 위한 expand/transition/contract migration 대신 기존 Post/PostContent를 삭제하는 단일 breaking migration을 허용한다. remote Note projection과 materialization은 각각 PROD-259/PROD-261이 소유하며 이 변경은 그 입력·저장 계약만 제공한다.

## Goals / Non-Goals

**Goals:**

- V1 JSON 타입과 server-only `prosemirror-model` schema/canonicalizer를 분리한다.
- 모든 저장 경계가 version과 canonical document를 함께 사용하고 Plain Text는 필요할 때 파생한다.
- 기존 local Plain Text composer를 공통 변환 경계에 연결한다.
- GraphQL과 React Native/Web가 versioned document를 주고받고 제한된 renderer로 동일한 의미를 표시한다.
- remote-post OpenSpec의 stale TipTap storage 전제를 공통 document 계약으로 바꾼다.

**Non-Goals:**

- `pre`, formatting mark, image, attachment, Mention, Hashtag, Custom Emoji schema.
- TipTap, ProseMirror editor/view, WebView editor와 local rich-text compose UX.
- PROD-259의 HTML/plain parser와 PROD-261의 receipt/materialization transaction 구현.
- production data 보존, online migration, 구버전 workload rollback 또는 이번 migration의 down migration.

## Architecture

`@kosmo/core/post-content`는 앱에서도 import할 수 있는 JSON 타입, version 상수와 runtime-independent type guard만 제공한다. `@kosmo/core/post-content/server`는 `prosemirror-model`을 import하고 version registry, V1 schema, Plain Text 변환, canonicalization, projection과 equality를 제공한다. 앱 코드와 native-safe validation subpath는 server subpath를 import하지 않는다.

V1 schema는 `doc: paragraph+`, `paragraph: inline*`, `text`, mark를 허용하지 않는 `hard_break`, `href` attr만 가진 `link` mark로 구성한다. 서버는 JSON을 `nodeFromJSON()`과 `check()`로 검증한 뒤 허용 attr를 다시 확인하고, tree를 재구성하면서 빈 paragraph, 인접 text, link mark와 URL을 정규화한 다음 다시 `nodeFromJSON()`/`check()`/`toJSON()`을 통과시킨다. Plain Text 입력은 기존 trim/500자 validation 후 line ending을 LF로 통일하고 하나의 paragraph 안의 LF를 hard break로 바꾼다.

DB는 `post_content.body_schema_version integer not null`과 `body_document jsonb not null`을 저장하고 `body_text`를 제거한다. Drizzle row의 document는 native-safe JSON type으로 선언한다. Content Warning, revision ID, parent Post 소유 관계와 visibility access boundary는 유지한다.

GraphQL은 output-only `PostContentDocument` scalar를 추가하고 Relay에는 `@kosmo/core/post-content`의 `PostContentDocumentV1` custom type import를 설정한다. `PostContent.body`는 `schemaVersion`과 `document`를 묶은 object이며, 기존 `bodyText`는 DB field expose가 아니라 server projection resolver다. `CreatePostInput.bodyText`는 변경하지 않고 mutation이 server converter 결과를 저장한다.

앱 `PostBody`는 V1 document type guard를 통과한 document만 paragraph별 React Native `Text` tree로 렌더링한다. hard break는 LF로, link-marked text는 nested `Text`의 link action과 접근성 metadata로 표현한다. schema version이나 shape가 지원되지 않거나 link가 안전하지 않으면 GraphQL `bodyText`를 표시한다.

## Risks / Trade-offs

- [기존 Post 데이터가 모두 삭제됨] → 비프로덕션이라는 사용자 확정을 Linear/OpenSpec과 migration test에 기록하고 `post.current_content_id`를 먼저 null 처리한 뒤 content와 post를 순서대로 삭제한다.
- [JSON scalar가 schema validation을 우회할 수 있음] → scalar는 저장 row만 serialize하고 모든 write/import는 server canonicalizer를 거치게 하며 DB insert call site를 테스트한다.
- [앱 type guard와 서버 schema가 drift할 수 있음] → JSON 타입/상수는 native-safe subpath가 소유하고 공통 fixtures를 server와 renderer test에서 함께 사용한다.
- [파생 `bodyText` 계산 비용] → 현재 본문 최대 500자에서는 resolver projection 비용을 수용하며 두 번째 canonical 저장값을 만들지 않는다.
- [ProseMirror dependency가 native bundle에 포함될 수 있음] → package exports를 분리하고 앱 import graph 및 Expo export 결과에서 `prosemirror-model` 부재를 검증한다.
- [미지원 future version을 잘못 렌더링함] → server equality는 migration 없는 version을 거부하고 앱은 정확히 V1만 렌더링한 뒤 `bodyText` fallback을 사용한다.

## Migration Plan

1. migration에서 `post.current_content_id`를 null로 만들고 `post_content`, `post` 순서로 기존 행을 삭제한다.
2. `body_text`를 제거하고 non-null `body_schema_version`, `body_document`를 추가한다. 기존 행이 없으므로 default나 backfill 값을 두지 않는다.
3. 같은 release에서 core server boundary, API write/read와 앱 renderer를 배포한다.
4. migration test는 이전 schema에 여러 revision과 Content Warning을 넣은 뒤 migration 후 Post/PostContent가 비었고 새 필수 컬럼만 존재하는지 검증한다.

Rollback은 DB down migration이 아니라 새 데이터를 포기하고 이전 migration까지 DB를 재생성한 뒤 이전 application revision을 배포하는 방식으로만 지원한다. production 전환 전에 데이터 보존이나 mixed-version rollout이 필요해지면 이 계획을 폐기하고 별도 expand/transition/contract 이슈로 재설계한다.

## Open Questions

- 없음.
