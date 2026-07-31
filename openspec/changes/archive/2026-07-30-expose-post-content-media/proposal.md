## Why

현재 GraphQL PostContent는 Media ID만 가진 document를 노출해 viewer가 첨부 이미지를 표시할 수 없다.
PROD-570은 소유 Post의 권한을 그대로 사용해 실제 Media Node와 저장된 표시 metadata를 제공한다.

## What Changes

- `PostContent.media`는 document 순서의 실제 `Media` Node 목록을 반환한다.
- Media가 nullable Alt Text를 소유하고 createPost 첨부 입력은 같은 transaction에서 이를 갱신한다.
- `PostContent.media`가 `readMedia` scope를 grant하고 Media의 URL, media type, Alt Text가 이를 요구한다.
- Sensitive Media는 PostContent document root에 유지한다.
- standalone Media Node가 참조 Post를 통해 권한을 얻는 정책은 후속 이슈로 보류한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0013-media-storage-service-boundary.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- Linear Contract / Implementation: PROD-570

## Capabilities

### Modified Capabilities

- `post`: PostContent에 Post 권한을 따르는 ordered Media Node 조회를 추가한다.

## Impact

- Media nullable Alt Text column과 createPost transaction
- PostContent V1 Media node attrs
- API GraphQL Media/PostContent schema와 resolver
- core/API tests와 canonical/OpenSpec 문서
