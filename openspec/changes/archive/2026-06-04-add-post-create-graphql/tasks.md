## 1. Spec

- [x] 1.1 `post` capability와 `data-model` delta spec을 작성한다.
- [x] 1.2 OpenSpec 변경안을 strict mode로 검증한다.

## 2. Data Model

- [x] 2.1 `post_content`에 TipTap JSON 본문을 저장할 JSONB 컬럼을 추가한다.
- [x] 2.2 `@kosmo/core/tiptap`에 TipTap library 기반 문서 schema, validation, Plain Text projection helper를 추가한다.
- [x] 2.3 게시글 TipTap 본문 검증 primitive를 추가한다.

## 3. GraphQL Types

- [x] 3.1 `PostState`와 `PostVisibility` enum을 GraphQL schema에 등록한다.
- [x] 3.2 `Post` Node ref와 기본 필드를 추가한다.
- [x] 3.3 `PostContent` Node ref와 TipTap JSON 원본 및 Plain Text projection 필드를 추가한다.
- [x] 3.4 `Post.profile`과 `Post.content` 관계 필드를 추가한다.

## 4. Mutation

- [x] 4.1 입력과 출력에 사용하는 `TipTapDocument` GraphQL custom scalar를 추가한다.
- [x] 4.2 `createPost(input: { content, visibility })` mutation을 추가한다.
- [x] 4.3 `usingProfile` auth scope로 로그인 session과 active profile을 요구한다.
- [x] 4.4 `ctx.session.profileId`를 작성자 프로필 ID로 사용한다.
- [x] 4.5 transaction 안에서 `post`, `post_content`, `post.current_content_id`를 함께 저장한다.
- [x] 4.6 mutation 성공 시 생성된 `Post`를 반환한다.

## 5. Verification

- [x] 5.1 GraphQL schema를 생성하고 `schema.graphql` diff를 확인한다.
- [x] 5.2 API TypeScript 타입체크를 실행한다.
- [x] 5.3 ESLint/Prettier 검증을 실행한다.
- [x] 5.4 테스트 DB에 Drizzle schema push를 실행해 DB 변경 적용 가능성을 확인한다.
- [x] 5.5 수동 GraphQL mutation 예시와 남은 리스크를 정리한다.
