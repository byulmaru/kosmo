## Why

Local Media 업로드 시작·완료로 Ready Media를 만들 수 있지만 새 Post 작성 mutation과 Composer가 이를 사용하지
않아 사용자는 이미지를 게시할 수 없다. PostContent V1을 additive하게 확장해 Media를 작성 내용에 포함하고,
같은 결과를 앱과 최초 ActivityPub Note까지 연결해야 한다.

## What Changes

- PostContent V1 ProseMirror body에 순서 있는 Media block node를 추가하고 document root에 Sensitive Media
  attr를 추가한다.
- Media node가 Media identity와 revision별 nullable Alt Text를 소유하며 별도 Post-Media 관계 테이블이나
  Media ID 배열은 저장하지 않는다.
- `createPost`가 최대 4개의 Ready Local Media를 검증해 첫 PostContent document에 원자적으로 저장하고
  body-only, media-only와 body+media 작성을 지원한다.
- Post Composer가 Web/iOS/Android 갤러리 이미지를 선택 즉시 직접 업로드하고 미리보기·진행·실패·재시도·제거,
  Alt Text와 Sensitive Media를 관리한다.
- 새 Local Post의 text/rich node는 ActivityPub `Note.content` HTML로, Media node는 순서 있는
  `Note.attachment` Image로, Sensitive Media는 지원하는 sensitive 속성으로 투영한다.
- 기존 Post 수정, 새 revision 교체와 `Update(Note)` delivery는 독립 Backlog로 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `docs/design/accessibility.md`,
  `docs/design/breakpoints.md`
- Linear Contract: PROD-461
- Linear Implementations: PROD-554, PROD-553, PROD-559

## Capabilities

### New Capabilities

- `post-composer-media-upload`: 유니버설 Composer의 이미지 선택, 직접 업로드, 항목별 상태와 작성 연결
- `activitypub-post-media`: 새 Local Note의 Media attachment, Alt Text와 sensitive 표현

### Modified Capabilities

- `data-model`: PostContent V1 document가 revision-owned Media node와 Sensitive Media를 저장하도록 변경한다.
- `post-content-document`: V1 ProseMirror schema와 canonicalization이 ordered Media node와 document-wide Sensitive Media를 지원하도록 확장한다.
- `post`: PostContent GraphQL document, 새 Post 작성 API와 Plain Text Composer가 Media 입력을 지원하도록
  변경한다.

## Impact

- Core: PostContent V1 schema·canonicalization·Plain Text projection과 `createPost` Media 검증
- API: Media item을 받는 `CreatePostInput`, PostContent document global ID projection과 권한 오류
- App: `expo-image-picker`, 항목별 direct upload state, preview·Alt Text·Sensitive Media UI와 Relay mutation
- Fedify: Local Note HTML/attachment/sensitive projection과 Media Storage public original URL
- Storage: 기존 `media.document` JSONB를 additive하게 사용하며 DB table/column migration은 추가하지 않는다.
