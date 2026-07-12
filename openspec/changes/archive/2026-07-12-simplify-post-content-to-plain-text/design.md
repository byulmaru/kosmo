## Context

PR #217 이후 작성 UI는 React Native `TextInput`에서 Plain Text를 받고 앱의 pure TypeScript adapter로 TipTap `doc/paragraph/text` JSON을 만든다. API는 이 JSON을 `TipTapDocument` scalar로 받아 core parser로 검증하고, trim된 `bodyText`와 `bodyJson`을 함께 저장한다. 조회 시 목록은 이미 `bodyText`를 사용하지만 상세 본문은 `bodyJson`을 다시 Plain Text로 변환한다.

`post_content.body_text`는 모든 현재 생성 경로에서 non-null로 저장되며 최대 500자 정책을 통과한 projection이다. 사용자는 기존 `body_text`와 JSON을 추가 비교하거나 backfill하지 않고 현재 값을 canonical로 승격하기로 결정했다. Mastodon REST API 명칭을 따른 `spoiler_text`/`spoilerText`는 Kosmo 도메인 용어인 `content_warning`/`contentWarning`으로 바꾸고 ActivityPub 경계에서만 `summary`와 대응한다. `PostContent` revision과 `Post.currentContentId`, visibility와 active profile ownership 경계는 이 표현 변경과 독립적이므로 유지한다.

ActivityPub remote Note 수신/materialization은 아직 저장소에 구현되지 않았고 PROD-259/PROD-261에 계획돼 있다. 따라서 이 변경은 존재하지 않는 ingestion 경로를 새로 만들지 않고 PROD-259의 canonical output을 TipTap document에서 safe Plain Text로 바꾼다.

## Goals / Non-Goals

**Goals:**

- `body_text`만 canonical 게시글 본문으로 저장하고 기존 revision metadata를 유지한다.
- Content Warning은 DB·GraphQL에서 `contentWarning`으로 표현하고 ActivityPub `summary`와 adapter 경계에서 대응한다.
- GraphQL 생성 입력을 `bodyText: String!`로 바꾸고 `PostContent.bodyText` 출력만 유지한다.
- core validation에서 trim된 비어 있지 않은 최대 500자 Plain Text를 검증하고 내부 개행을 보존한다.
- TipTap scalar, parser, 앱 adapter, custom Relay scalar mapping과 `@tiptap/*` dependency를 삭제한다.
- migration, Relay compiler, API/app unit, Storybook, Web E2E와 strict OpenSpec validation으로 breaking 전환을 검증한다.

**Non-Goals:**

- TipTap WebView 또는 다른 rich text editor와 mark/node 기능.
- 게시 직후 이미 열린 Relay connection을 임시 갱신하는 updater; 이 동작은 후속 subscription이 담당한다.
- remote Note inbox hydration, Create receipt 또는 materialization 구현.
- 구버전 GraphQL 클라이언트와의 점진적 호환 기간.

## Risks / Trade-offs

- [기존 `body_text`가 과거 JSON과 다를 수 있음] → 사용자가 별도 일치 검증이 필요 없다고 결정했으므로 현재 non-null 값을 그대로 보존한다. migration 테스트는 행 수, ID, `body_text`, revision 연결과 metadata가 바뀌지 않는지만 검증한다.
- [컬럼과 GraphQL scalar를 한 번에 제거해 구버전 API/app이 실패함] → DB migration, API schema와 Relay 앱을 하나의 coordinated breaking release로 배포하고 구버전 호환을 제공하지 않는다.
- [trim 정책이 개행을 손상할 수 있음] → 입력 전체의 앞뒤 공백만 `trim()`하고 본문 내부 줄바꿈은 그대로 저장·표시하는 unit/E2E fixture를 둔다.
- [HTML을 Plain Text로 바꾸는 ActivityPub 규칙이 이번 코드에 없는 상태] → PROD-259를 safe Plain Text projection으로 재범위화하고 실제 외부 content parsing은 그 이슈에서 검증한다.
- [destructive migration 이후 구버전으로 단순 rollback할 수 없음] → 배포 전 DB backup을 확보한다. rollback은 backup 복원과 구버전 API/app의 동시 복원을 요구한다.

## Migration Plan

1. PROD-268 준비 PR에서 API/domain의 `contentWarning`을 legacy SQL 컬럼 `spoiler_text`에 매핑하고, Plain Text validation과 `bodyText` 직접 조회를 추가한다. 물리 DB, 기존 `body_json NOT NULL`, `TipTapDocument` scalar, create mutation과 composer write path는 유지한다.
2. PROD-268을 migration 없이 독립적으로 검증·머지한다. 이 시점의 main은 기존 물리 DB와 TipTap write/storage, 새 Plain Text read/validation 경계를 함께 가진다.
3. PROD-267 cutover PR에서 `spoiler_text`를 `content_warning`으로 rename하고 Drizzle schema의 `bodyJson`과 `bodyHtml`을 제거하며, 같은 migration으로 `body_json`, `body_html`을 drop한다. 기존 `body_text`는 update하지 않는다.
4. test DB에 기존 형식의 여러 revision과 개행 fixture를 적재하고 cutover migration 전후 `body_text`, ID, 관계, metadata 보존을 확인한다.
5. API resolver와 GraphQL schema에서 `TipTapDocument`, `content`, `bodyJson`을 제거하고 Relay composer를 `bodyText` 직접 제출로 전환한다.
6. `@kosmo/core/tiptap`, 수동 앱 GraphQL 타입과 TipTap dependencies를 제거하고 workspace 검색으로 잔여 import/문자열을 확인한다.
7. PROD-267의 DB migration과 새 API/app을 coordinated release로 배포한다.

## Open Questions

없음.
