## 1. 스펙 정렬

- [x] 1.1 `FOLLOWERS` accepted follower 접근 정책을 `post` capability delta spec에 반영한다
- [x] 1.2 `DIRECT`, 삭제/숨김/블라인드, 에러 계약은 후속 PROD-121 범위로 남긴다

## 2. GraphQL API 구현

- [x] 2.1 `postVisibilityAccessWhere`에 accepted follower의 `FOLLOWERS` 글 접근 조건을 추가한다
- [x] 2.2 `Post` Node 로딩과 `Profile.posts`가 같은 visibility 정책을 공유하게 한다

## 3. 검증

- [x] 3.1 API 타입체크를 통과시킨다
- [x] 3.2 ESLint, Prettier, OpenSpec 검증을 통과시킨다
