## Why

`profile_follow_request`는 row 존재 자체가 승인 대기를 뜻하는 pending-only 저장 계약을 이미 가지지만,
승인제 Profile을 향한 요청 생성·조회·승인·거절·취소 API와 사용자 흐름이 없다. canonical Follow Request
문서에는 Accepted/Rejected terminal 상태와 처리 시각이 남아 있어 실제 data model과도 충돌한다.

## What Changes

- canonical Follow Request를 pending-only 객체로 정렬하고 승인·거절·취소 시 요청 row를 삭제한다.
- `followProfile`이 승인제 Profile에 대해 중복 없는 `ProfileFollowRequest`를 만들고 기존 관계와 요청을
  멱등하게 반환한다.
- 요청 당사자만 incoming/outgoing 요청을 조회하고, followee만 승인·거절하며 follower만 취소할 수 있는
  GraphQL 계약을 제공한다.
- 승인은 요청 삭제와 `ProfileFollow` 생성을 한 transaction에서 수행하고, 거절·취소는 요청만 삭제한다.
- remote Follow 요청도 같은 request row와 lifecycle service를 사용하며, 승인·거절 delivery는 ActivityPub
  Follow delivery port로 위임한다.
- Notification의 저장 모델은 추가하지 않고 request 생성·정리 lifecycle hook만 호출한다.
- 유니버설 FollowButton은 승인제 대상의 요청 대기와 취소 상태를 표시한다.

## Capabilities

### New Capabilities

- `profile-follow-request`: local/remote Follow Request의 pending-only 생성, 조회, 처리, federation 및
  notification lifecycle 경계를 정의한다.

### Modified Capabilities

- `profile`: 승인제 Profile follow가 conflict가 아니라 pending request를 만들고 viewer request 상태를
  노출하도록 변경한다.
- `universal-expo-client`: FollowButton이 follow relationship과 pending request를 구분해 요청 생성·취소를
  수행하도록 변경한다.

## Impact

- Linear: [PROD-272](https://linear.app/byulmaru/issue/PROD-272/follow-request의-pending-only-생성처리-흐름을-제공한다)
- Canonical domain: `docs/domain/objects/follow-request.md`, 관련 Follow Relationship/Notification 문서와 ADR.
- `packages/core`: pending-only lifecycle service, notification/activity delivery port, transaction 경계.
- `apps/api`: Follow Request GraphQL Node, viewer query fields, follow/approve/reject/cancel mutations.
- `apps/app`: Relay fragment/mutation과 FollowButton pending UI.
- 데이터베이스 migration이나 Accepted/Rejected 상태 컬럼은 추가하지 않는다.
