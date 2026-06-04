## Why

현재 GraphQL API에는 프로필과 팔로우 기능은 있지만 게시글 작성 mutation과 게시글 조회용 기본 타입이 없다. 이번 사이클의 게시글 범위는 Plain Text 글쓰기부터 시작하되, 이후 리치 텍스트 확장을 위해 입력과 저장 포맷은 TipTap 문서 JSON으로 정해야 한다.

## What Changes

- TipTap 문서 JSON과 공개 범위 입력을 받는 `createPost` GraphQL mutation을 추가한다.
- 게시글 작성자는 현재 세션의 active profile로 결정한다.
- 게시글과 현재 콘텐츠를 생성하고, 게시글 본문은 Plain Text projection과 TipTap JSON 문서로 저장한다.
- GraphQL에 `Post`, `PostContent`, `TipTapDocument` scalar, 게시글 상태/공개 범위 enum을 노출한다.
- 본문 검증, 로그인 없음, active profile 없음 오류를 GraphQL result/error 구조에 맞게 처리한다.
- 이미지, 첨부, TipTap 확장 node/mark, 인용, 리포스트, 조회 목록 API는 이번 변경 범위에서 제외한다.

## Capabilities

### New Capabilities

- `post`: 게시글 GraphQL 타입과 TipTap 문서 기반 게시글 작성 mutation 계약을 정의한다.

### Modified Capabilities

- `data-model`: `post_content`가 Plain Text projection과 함께 TipTap JSON 본문을 저장하도록 게시글 콘텐츠 저장 요구사항을 확장한다.

## Impact

- `packages/core/db/tables.ts`: `post_content` 저장 컬럼 확장
- `packages/core/tiptap`: TipTap library 기반 문서 schema, validation, Plain Text projection helper 추가
- `packages/core/validation`: 게시글 본문 검증 primitive 추가
- `apps/api/src/graphql`: 게시글 resolver, mutation, enum 등록 추가
- `apps/api/schema.graphql`: 게시글 작성 mutation과 관련 타입 반영
- DB schema: `post_content.body_json` JSONB 컬럼 추가 필요
