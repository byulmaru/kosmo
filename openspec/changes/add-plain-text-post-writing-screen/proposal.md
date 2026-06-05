## Why

현재 웹 앱의 글쓰기 탭은 안내 문구만 표시하고 있어 사용자가 게시글을 실제로 작성할 수 없다. `PROD-92`에서 게시글 작성 GraphQL mutation과 TipTap 문서 저장 계약이 준비되었으므로, 이번 변경은 로그인한 사용자가 선택된 프로필로 TipTap 기반 게시글을 작성하는 웹 화면 흐름을 추가한다.

## What Changes

- 웹 `/compose` 탭을 TipTap 기반 게시글 작성 폼으로 전환한다.
- 작성 본문은 TipTap editor로 입력하고 editor의 TipTap `doc` JSON을 `createPost` mutation에 전달한다.
- `kosmo-old`의 작성 화면을 참고해 게시글 공개 범위 선택을 제공한다.
- 선택된 프로필이 없는 상태, 빈 본문, 길이 초과, mutation 실패를 화면에서 처리한다.
- 작성 중에는 제출 중 상태와 중복 제출 방지를 제공한다.
- 작성 성공 후 별도 완료 패널이나 경로 이동 없이 작성 폼을 초기화한다.
- 이미지, 첨부, 리치 텍스트 편집, 인용, 리포스트, 게시글 상세/목록 API 구현은 이번 범위에서 제외한다.

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `post`: 웹 클라이언트의 TipTap 기반 게시글 작성 화면, 공개 범위 선택, 선택 프로필 기반 작성 흐름, 작성 성공 후 초기화와 실패 상태 표시 요구사항을 추가한다.

## Impact

- `apps/web`: `/compose` 페이지, GraphQL `createPost` mutation 사용, 공개 범위 선택 UI, TipTap editor 본문 검증, 제출/오류 UI.
- `apps/web/src/lib/components`: TipTap editor와 공개 범위 선택을 포함한 새 글 작성 컴포넌트, 기존 `Button` 등 폼 컴포넌트 재사용 또는 필요한 최소 조정.
- `apps/api/schema.graphql`: `PROD-92`에서 추가된 `createPost`, `Post`, `PostContent`, `PostVisibility`, `TipTapDocument` 계약을 클라이언트에서 사용한다.
- `openspec`: `post` delta spec, 설계 문서, 구현 task 추가.
