## ADDED Requirements

### Requirement: Follow Request Notification source lifecycle

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-321` — 새 pending Follow Request Notification은 source 생성부터 pending-only 종료까지의 lifecycle을 반영해야 한다(MUST).

시스템은 새로 생성된 pending `ProfileFollowRequest`를 source로 하는 Profile-scoped `FOLLOW_REQUEST` Notification을 Followee Profile에 생성하고, 해당 request의 pending-only lifecycle이 끝나면 같은 source의 Notification을 정리해야 한다(MUST).

#### Scenario: 새 Local pending request에서 알림 생성

- **WHEN** Local Follower가 `APPROVAL_REQUIRED` Local Followee에게 새 `ProfileFollowRequest`를 생성하고 source transaction이 commit된다
- **THEN** 시스템은 `kind = FOLLOW_REQUEST`, `source_id = ProfileFollowRequest.id`, `recipient_profile_id = Followee.id`, `data = {}`인 Unread Notification을 하나 생성한다
- **AND** Related Profile은 source request의 Follower Profile에서 파생한다
- **AND** 저장 count나 `ProfileFollow` 관계는 변경하지 않는다

#### Scenario: verified ActivityPub inbound pending request에서 알림 생성

- **WHEN** verified ActivityPub inbound Follow가 `APPROVAL_REQUIRED` Local Followee에 새 pending `ProfileFollowRequest`를 만들고 source transaction이 commit된다
- **THEN** Local Followee를 Recipient로 하고 Remote Follower를 Related Profile로 하는 `FOLLOW_REQUEST` Notification이 같은 post-commit lifecycle에서 하나 생성된다
- **AND** Fedify handler는 request 또는 Notification 저장을 별도로 중복 수행하지 않는다

#### Scenario: outbound Remote pending request는 제외

- **WHEN** Local Follower가 ActivityPub Remote Followee에게 pending `ProfileFollowRequest`를 생성한다
- **THEN** request의 pending-only 저장·ActivityPub delivery lifecycle은 기존 계약을 따르지만 Profile-scoped `FOLLOW_REQUEST` Notification은 생성하지 않는다
- **AND** Remote Recipient를 Local Notification 목록·Unread count에 투영하려고 시도하지 않는다

#### Scenario: duplicate pending request는 과거 누락을 복구하지 않음

- **WHEN** 같은 Follower/Followee pair의 pending request가 이미 존재하거나 동일 inbound Follow가 동시 재처리된다
- **THEN** 시스템은 기존 request와 대응하는 기존 Notification을 재사용하거나 idempotent no-op으로 끝낸다
- **AND** 새로운 Notification을 추가하지 않는다
- **AND** 배포 전에 이미 존재하던 pending request를 duplicate Follow, 목록 조회 또는 다른 요청으로 backfill하지 않는다

#### Scenario: 승인으로 request source가 제거됨

- **WHEN** Followee가 pending request를 승인하여 request row를 제거하고 새 `ProfileFollow`를 원자적으로 생성한 뒤 commit한다
- **THEN** 시스템은 `(FOLLOW_REQUEST, ProfileFollowRequest.id)` Notification을 post-commit으로 정리한다
- **AND** 새 관계의 `FOLLOW` Notification은 기존 Follow source lifecycle에 따라 독립적으로 처리된다
- **AND** 승인 transaction은 Notification 실패 때문에 rollback되지 않는다

#### Scenario: 거절·취소로 request source가 제거됨

- **WHEN** Followee가 request를 거절하거나 Follower가 request를 취소하여 pending row가 실제로 삭제된 뒤 commit된다
- **THEN** 시스템은 대응하는 `FOLLOW_REQUEST` Notification의 삭제를 같은 request에서 await한다
- **AND** 거절·취소는 relation 또는 저장 count를 변경하지 않는다

#### Scenario: verified ActivityPub inbound Undo가 pending request를 제거함

- **WHEN** verified ActivityPub inbound Undo(Follow)가 pending `ProfileFollowRequest`를 실제로 삭제하고 commit된다
- **THEN** 시스템은 해당 request source의 `FOLLOW_REQUEST` Notification 정리를 await한다
- **AND** pending request 삭제가 no-op이면 Notification cleanup을 실행하지 않는다

#### Scenario: request 삭제 no-op

- **WHEN** 승인·거절·취소 또는 inbound Undo가 이미 제거된 request ID를 처리하여 request row를 삭제하지 않는다
- **THEN** 시스템은 성공한 request deletion으로 간주하지 않는다
- **AND** 새로운 Notification을 생성하거나 해당 source의 정리를 다시 lifecycle 결과로 요구하지 않는다

#### Scenario: post-commit create와 terminal delete overlap

- **WHEN** post-commit create가 pending source를 읽은 뒤 Notification insert 전에 request가 terminal transition으로 삭제되고 대응 cleanup이 commit된다
- **THEN** source와 Notification effect는 서로의 transaction을 rollback하지 않는다
- **AND** insert가 뒤늦게 완료되어 물리적인 stale Notification row가 남더라도 source existence·pair visibility predicate 때문에 connection·Unread count·Node·Read에서는 즉시 숨긴다
- **AND** 시스템은 이 overlap을 해결하기 위해 source foreign key, retry, outbox 또는 reconciliation을 추가하지 않는다

### Requirement: Follow Request Notification 실패 격리와 관찰

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `PROD-321` — Follow Request Notification effect 실패는 source lifecycle을 바꾸지 않으면서 관찰되어야 한다(MUST).

시스템은 Follow Request Notification의 post-commit create/delete 실패가 request lifecycle, relation/count transaction 또는 ActivityPub handler 성공을 변경하지 않도록 격리하고, 실패를 최소한의 Sentry context로 관찰해야 한다(MUST).

#### Scenario: create 실패 격리

- **WHEN** 새 Local 또는 verified inbound pending request가 commit된 뒤 `FOLLOW_REQUEST` Notification create가 실패한다
- **THEN** pending request와 source action 성공 결과를 유지한다
- **AND** Local/remote request 생성 transaction이나 ActivityPub handler를 rollback하지 않는다
- **AND** Sentry에 `operation`(create), `notificationKind = FOLLOW_REQUEST`, `sourceId = ProfileFollowRequest.id`를 전달한다

#### Scenario: delete 실패 격리

- **WHEN** request deletion이 commit된 뒤 `FOLLOW_REQUEST` Notification delete가 catch 가능한 오류로 실패한다
- **THEN** request deletion, 승인 시 relation/count 결과와 handler 성공을 유지한다
- **AND** Sentry에 `operation`(delete), `notificationKind = FOLLOW_REQUEST`, `sourceId = ProfileFollowRequest.id`를 전달한다
- **AND** effect 완료 전에 process가 종료된 경우에는 Sentry 보고를 보장하지 않는다
- **AND** retry, outbox, queue, reconciliation 또는 backfill command를 실행하지 않는다

#### Scenario: 최소 context 유지

- **WHEN** Notification create 또는 delete post-commit effect의 오류를 Sentry에 보고한다
- **THEN** 보고 context에는 operation, `notificationKind = FOLLOW_REQUEST`, source ID만 포함한다
- **AND** request body, profile 이름·handle 또는 ActivityPub payload 같은 추가 개인정보를 필수 context로 복제하지 않는다

### Requirement: Follow Request Notification API visibility

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `PROD-321` — visible Follow Request Notification은 기존 Profile-scoped API 계약에 통합되어야 한다(MUST).

API는 visible `FOLLOW_REQUEST` Notification을 기존 Profile-scoped Notification connection·Unread count·Node·Read 계약에 통합하되, request source와 Recipient/Related Profile 관계를 Recipient Profile 기준으로 검증해야 한다(MUST).

#### Scenario: concrete Follow Request Notification

- **WHEN** GraphQL이 `kind = FOLLOW_REQUEST` row를 resolve한다
- **THEN** API는 Notification interface와 Node를 구현하는 Follow Request 전용 concrete object를 반환한다
- **AND** object의 requester Profile field는 source request의 Follower Profile에서 파생한다
- **AND** object의 `followRequest: ProfileFollowRequest!` field는 Recipient가 접근할 수 있는 같은 source request를 반환한다
- **AND** raw kind, source ID, data snapshot 또는 받은 요청 처리 action을 공개하지 않는다

#### Scenario: source와 recipient 일치 검증

- **WHEN** Follow Request Notification을 connection, Unread count, Node 또는 Read에서 조회한다
- **THEN** source request가 존재하고 source의 Followee가 저장된 Recipient Profile과 일치하며 requester Profile이 Recipient Profile을 기준으로 조회 가능할 때만 item을 visible로 취급한다
- **AND** visible concrete object의 `followRequest`도 같은 source request를 사용하며 Recipient 기준 visibility를 우회하지 않는다
- **AND** request row가 제거되었거나 관계가 불일치하면 item, count와 Read 결과를 존재하지 않는 것으로 처리한다

#### Scenario: requester Profile 권한과 membership

- **WHEN** 로그인 Account가 Recipient Profile membership을 가지고 Notification 목록 또는 item을 조회한다
- **THEN** API는 selected Profile과 무관하게 해당 Recipient의 visible Follow Request Notification을 반환한다
- **AND** requester Profile이 Recipient Profile의 조회 정책을 통과하지 않으면 item을 숨기고 generic fallback을 반환하지 않는다

#### Scenario: visibility와 source field의 일관된 snapshot

- **WHEN** connection 또는 Node가 pending Follow Request source를 visible로 확인한 뒤 concrete field를 resolve하기 전에 같은 request가 삭제된다
- **THEN** API는 visibility row와 함께 읽은 source snapshot을 사용해 non-null `profile`·`followRequest` field를 일관되게 resolve하거나 부모 Notification을 존재하지 않는 것으로 처리한다
- **AND** source를 별도 조회해 `Notification source not found` GraphQL 오류를 발생시키지 않는다

#### Scenario: unread와 read 반영

- **WHEN** visible Follow Request Notification을 읽음 처리한다
- **THEN** 기존 idempotent Read mutation이 Notification의 최초 `readAt`과 Recipient Profile의 visible Unread count를 갱신한다
- **AND** request가 승인·거절·취소·취소된 inbound Undo로 삭제되면 Notification은 목록과 count에서 사라진다

### Requirement: Follow Request Notification 목록과 requester Profile 활성화

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `docs/design/page-header.md`, `PROD-321` — 목록은 requester Profile을 표시하고 활성화해야 한다(MUST).

클라이언트는 selected Profile의 visible `FOLLOW_REQUEST` Notification을 기존 단일 Notification 목록, Relay/cache scope와 서버 제공 Unread badge에 포함해야 하며(MUST), item 활성화는 요청자(Follower) Profile로 이동해야 한다(MUST).

#### Scenario: 목록 item 표시

- **WHEN** selected Profile이 수신한 visible Follow Request Notification이 목록 connection에 포함된다
- **THEN** 기존 Notification row의 kind 표현·상대 시각·Unread 표시 구조 안에 requester Profile identity와 팔로우 요청 의미를 표시한다
- **AND** requester Profile의 display/handle과 조회 가능한 avatar를 source에서 파생한다
- **AND** 받은 요청 목록의 별도 row, 승인·거절·취소 action 또는 inline 맞팔로우 control을 추가하지 않는다

#### Scenario: requester Profile로 활성화

- **WHEN** 사용자가 Follow Request Notification의 avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 requester Profile의 기존 `relativeHandle` Profile route로 이동한다
- **AND** canonical received-request route로 이동하거나 해당 route를 새로 만들지 않는다
- **AND** 기존 목록의 best-effort Read mutation과 Profile별 Relay cache 갱신을 적용한다

#### Scenario: 목록과 Unread badge 통합

- **WHEN** selected Profile에 Follow Request Notification이 Unread 상태로 존재한다
- **THEN** 서버의 `unreadNotificationCount`가 기존 Notification 목록과 shell badge에 해당 item을 포함한다
- **AND** 클라이언트는 목록 길이나 숨겨진 item을 이용해 count를 임의로 재계산하지 않는다
- **AND** Profile 전환 시 다른 Profile의 item·count·badge가 노출되지 않는다

#### Scenario: 빈 목록 copy 범위

- **WHEN** 목록에 Follow Request Notification을 포함한 visible item이 하나도 없다
- **THEN** 기존 Notification empty state는 요청·팔로우 알림을 포함한 Notification 의미를 설명할 수 있다
- **AND** 받은 요청 관리 화면의 빈 상태나 승인 안내를 대신 표시하지 않는다
