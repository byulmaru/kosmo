## Why

승인제 팔로우 요청은 이미 pending-only 저장·처리 계약을 사용하지만 현재 Notification projection과 목록에는 나타나지 않는다. 새로 들어온 요청을 수신 Profile이 알 수 있도록 요청의 생성부터 승인·거절·취소까지를 Notification으로 연결하고, 기존 pending 데이터의 의미를 바꾸지 않는 배포 후 lifecycle을 제공한다.

## What Changes

- 새 pending `ProfileFollowRequest`가 생성될 때 Followee(수신 Profile)를 Recipient로 하는 `FOLLOW_REQUEST` Notification을 만든다.
- Local 요청과 verified ActivityPub inbound 요청이 같은 core lifecycle을 사용하고, 실제 pending request row가 제거될 때 대응 Notification도 정리한다.
- Notification 목록·Unread count·Read/Node visibility에 `FOLLOW_REQUEST`를 통합한다. item의 Related Profile은 요청자(Follower)이며 item 활성화는 요청자 Profile route로 이동한다.
- Notification 저장·정리 실패는 request 생성·승인·거절·취소 또는 inbound ActivityPub 처리의 성공을 rollback하지 않으며, post-commit 실패를 최소 context(`operation`, `notificationKind=FOLLOW_REQUEST`, `sourceId`)로 Sentry에 보고한다.
- 동일 source에 대한 재호출·동시 요청은 idempotent하게 수렴시키고, 이미 배포 전에 존재하던 pending request에는 Notification을 소급 생성하지 않는다. backfill/reconciliation command, outbox·retry·queue는 제공하지 않는다.
- 받은 요청 목록과 승인·거절 UI는 `PROD-566` 소유로 남기며 이번 변경에서는 구현하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- Linear Contract: `PROD-321` (Follow Request를 Notification으로 생성·정리하고 알림 목록에 표시한다)
- Linear Implementations: 없음. (통합·받은 요청 관리 UI는 `PROD-566`의 소유 경계로 확인한다.)

## Capabilities

### New Capabilities

없음. 기존 Profile-scoped Notification 계약의 새 source kind와 목록 표현을 확장한다.

### Modified Capabilities

- `notification`: `FOLLOW_REQUEST` source의 생성·정리·실패 격리, visible GraphQL/Unread/Read 계약과 requester Profile 활성화·목록 표시를 추가한다.
- `data-model`: 단일 Notification projection의 enum과 source mapping에 `FOLLOW_REQUEST`를 추가한다.

## Impact

- `packages/core`: Notification kind와 source 저장 경계, pending request 생성·승인·거절·취소 및 inbound Follow/Undo lifecycle의 post-commit create/delete 연결과 Sentry 보고 경계를 갱신한다.
- `packages/fedify`: 기존 verified inbound Follow/Undo handler가 공통 core pending lifecycle을 통해 새 Notification 동작을 사용하도록 통합 검증한다.
- `apps/api`: Follow Request Notification concrete Node/source loader, visibility, Profile Notification connection·Unread count·Read 통합을 추가한다.
- `apps/app`: 기존 Notification 목록의 Profile activation과 Relay/cache/badge가 `FOLLOW_REQUEST` item을 표시하도록 확장한다. 받은 요청 관리·승인·거절 화면은 변경하지 않는다.
- `drizzle/`: 개발 enum migration과 schema validation을 제공하되, 기존 pending row에 대한 data backfill/reconciliation migration은 만들지 않는다.
- 배포 후 기존 pending row는 그대로 남고 알림이 없는 상태가 허용된다. merge 후 dev migration, 신규 lifecycle, 목록/count/badge, Sentry 관찰 및 OpenSpec archive를 별도 gate로 검증한다.
