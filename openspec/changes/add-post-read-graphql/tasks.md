## 1. Spec

- [x] 1.1 `post` capability에 게시글 단건 조회 query와 프로필 게시글 목록 connection delta spec을 작성한다.
- [x] 1.2 OpenSpec 변경안을 strict mode로 검증한다.

## 2. GraphQL Query

- [ ] 2.1 ID로 단일 활성 게시글을 조회하는 `post(id: ID!): Post` query를 추가한다.
- [ ] 2.2 없는/비활성 게시글은 기존 `Post` Node 로더에 위임해 `null`을 반환한다.

## 3. Profile Posts Connection

- [ ] 3.1 `Profile.posts` Relay connection을 `post/field/profile.ts`에 추가한다.
- [ ] 3.2 `state=ACTIVE` 게시글을 `id desc` 최신순으로 cursor 페이지네이션한다.
- [ ] 3.3 게시글이 없는 프로필은 빈 connection을 반환한다.

## 4. Verification

- [x] 4.1 GraphQL schema를 생성하고 `schema.graphql` diff를 확인한다.
- [x] 4.2 API TypeScript 타입체크를 실행한다.
- [x] 4.3 ESLint/Prettier 검증을 실행한다.
- [ ] 4.4 테스트 DB에서 수동 GraphQL 목록/단건/`null` 케이스를 확인한다. (Docker 미실행으로 보류)
