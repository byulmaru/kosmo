## Why

현재 제품은 최대 500자의 서식 없는 게시글만 제공하지만 저장소와 GraphQL 계약은 TipTap JSON을 canonical 본문으로 유지해 DB, API, Relay 앱과 테스트에 불필요한 변환·의존성을 남긴다. PR #217로 작성 UI가 이미 React Native `TextInput` 기반 Plain Text로 전환됐으므로, 제품 계약도 `bodyText` 하나로 정렬해 이후 revision과 ActivityPub 작업의 기준을 단순화한다.

## What Changes

- **BREAKING** `CreatePostInput.content: TipTapDocument!`를 `CreatePostInput.bodyText: String!`로 교체하고 `TipTapDocument` scalar와 `PostContent.bodyJson`을 제거한다.
- `post_content.body_text`를 canonical 게시글 본문으로 승격하고 기존 값을 그대로 보존한 채 `body_json`과 사용하지 않는 `body_html` 컬럼을 제거하며 `spoiler_text`를 도메인 용어인 `content_warning`으로 이름을 바꾼다.
- Plain Text 본문에 기존 빈 본문 거부, trim 기준 최대 500자, 개행 보존 정책을 적용한다.
- `PostContent` revision, `Post.currentContentId`, visibility, 작성자 ownership과 Node 경계를 유지한다.
- core TipTap parser·validator·entrypoint와 `@tiptap/*`·ProseMirror 의존성을 제거한다.
- Expo/React Native Web 앱이 adapter 없이 `bodyText`를 직접 제출·표시하도록 Relay schema, artifact, fixture와 Storybook을 갱신한다.
- 계획 중인 ActivityPub remote Note projection은 실행 가능한 HTML이나 TipTap document를 저장하지 않고 canonical Plain Text만 산출하도록 PROD-259의 전제를 재범위화한다. 실제 remote Note materialization은 PROD-259/PROD-261 범위에 남긴다.
- 게시 직후 이미 열린 목록 갱신, rich text 기능과 editor 도입은 포함하지 않는다.
- 구현은 merge-safe한 두 PR로 나눈다. PROD-268은 API/domain의 CW rename을 legacy `spoiler_text` 컬럼에 매핑하고 Plain Text validation과 `bodyText` 직접 조회를 준비하면서 기존 물리 DB와 TipTap write/storage 계약을 유지한다. PROD-267은 물리 컬럼 rename과 DB·GraphQL·Relay write 계약을 한 번에 전환한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: 게시글 생성·조회·유니버설 작성 흐름을 TipTap JSON 대신 canonical `bodyText` 계약으로 변경한다.
- `data-model`: `post_content`가 Plain Text 본문과 revision metadata만 저장하도록 TipTap JSON/HTML 저장 계약을 제거한다.

## Impact

- DB: `post_content.body_json`, `post_content.body_html` 제거, `spoiler_text` → `content_warning` rename migration과 Drizzle schema 갱신.
- GraphQL/API: breaking input·output schema, validation, resolver와 schema snapshot 갱신.
- core: `@kosmo/core/tiptap`, TipTap validation과 네 개의 `@tiptap/*` dependency 제거.
- Relay 앱: custom scalar mapping·adapter·수동 GraphQL 타입 제거, composer/body fragment와 generated artifact 재생성.
- 검증: migration, API/app unit, Storybook, Relay compiler, Web E2E, OpenSpec strict validation.
- 연합 작업: PROD-259를 TipTap projection에서 safe Plain Text projection으로 재범위화하며, remote Note 수신/materialization 자체는 이 변경에서 새로 구현하지 않는다.
