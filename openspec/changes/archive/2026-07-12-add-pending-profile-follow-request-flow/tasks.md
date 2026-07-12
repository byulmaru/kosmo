## 1. PROD-272 contract alignment

- [x] 1.1 canonical Follow Request, Follow Relationship, Notification 문서를 pending-only 계약으로 정렬한다.
- [x] 1.2 profile follow request OpenSpec proposal/spec/design/decisions/tasks를 작성하고 strict validation한다.

## 2. PROD-272 lifecycle and API

- [x] 2.1 local/remote 생성과 승인·거절·취소가 공유하는 transaction-aware lifecycle 및 integration port를 구현한다.
- [x] 2.2 request participant loader, GraphQL Node, 자기 Profile의 incoming/outgoing 조회와 viewer state를 구현한다.
- [x] 2.3 follow 생성 응답과 approve/reject/cancel mutations를 lifecycle에 연결한다.
- [x] 2.4 중복, 권한, 승인/거절/취소 결과와 port 호출을 단위·로컬 통합 테스트로 검증한다.

## 3. PROD-272 universal client flow

- [x] 3.1 FollowButton Relay 계약에 pending request와 cancel mutation을 연결한다.
- [x] 3.2 FollowButton의 팔로우/요청됨/팔로잉 및 loading/error 상태를 구현하고 component test/story를 갱신한다.
- [x] 3.3 Notification 화면은 소유 이슈에 남기고 기존 화면을 변경하지 않았음을 확인한다.

## 4. PROD-272 validation and completion

- [x] 4.1 GraphQL schema와 Relay artifacts를 재생성한다.
- [x] 4.2 관련 TypeScript, ESLint, Prettier, 단위/로컬 통합 검증을 실행한다.
- [x] 4.3 구현·canonical 문서·OpenSpec task를 최종 대조하고 모든 task를 완료 표시한다.
