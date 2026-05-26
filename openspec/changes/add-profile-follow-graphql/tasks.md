# Tasks

## 1. Spec

- [x] 1.1 `profile` capability에 팔로우 GraphQL 요구사항을 추가한다.
- [x] 1.2 OpenSpec 변경안을 strict mode로 검증한다.

## 2. GraphQL Fields

- [ ] 2.1 `ProfileFollow.follower`와 `ProfileFollow.followee` 관계 필드를 추가한다.
- [ ] 2.2 `Profile.followers`와 `Profile.following` connection을 accepted 관계 기준으로 추가한다.
- [ ] 2.3 `Profile.followersCount`와 `Profile.followingCount`를 accepted 관계 기준으로 추가한다.
- [ ] 2.4 viewer active profile 기준 follow 상태 필드를 추가한다.

## 3. Mutations

- [ ] 3.1 `followProfile` mutation을 추가한다.
- [ ] 3.2 자기 자신 follow 시 `ConflictError`를 반환한다.
- [ ] 3.3 이미 `ACCEPTED` 상태로 존재하는 follow 관계는 기존 `ProfileFollow`를 반환해 멱등 성공 처리한다.
- [ ] 3.4 `unfollowProfile` mutation을 추가한다.
- [ ] 3.5 존재하지 않는 follow 관계 unfollow는 멱등 성공 처리한다.

## 4. Verification

- [ ] 4.1 API TypeScript 타입체크를 실행한다.
- [ ] 4.2 ESLint/Prettier 검증을 실행한다.
- [ ] 4.3 GraphQL schema 생성 또는 schema diff를 확인한다.
- [ ] 4.4 PR 본문에 pending/rejected follow 재요청 정책이 이번 범위에서 제외되었음을 남긴다.
- [ ] 4.5 수동 GraphQL 검증 쿼리와 남은 리스크를 정리한다.
