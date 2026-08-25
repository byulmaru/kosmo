## Context

Canonical 도메인은 Follow Request를 객체 존재 자체가 Pending인 별도 객체로 정의하고, 생성·승인·거절·취소 시 Notification lifecycle 경계를 요구한다. 현재 저장소는 `notification` 단일 projection과 Follow/Reaction/Reply/Repost API·목록을 운영하지만 `notification_kind`에는 `FOLLOW_REQUEST`가 없고, `packages/core/services/profile-follow.ts`와 `profile-follow-request.ts`의 post-commit effect는 established Follow Notification만 생성·정리한다. `packages/fedify/src/inbound-follow.ts`의 verified inbound Follow와 Undo는 이 core lifecycle을 호출하므로, transport 전용 분기 없이 pending projection의 생성·삭제 결과를 연결해야 한다.

이번 change는 새 request가 생성된 이후의 projection과 관찰만 다룬다. 배포 이전 pending row는 Notification이 없는 상태로 유지하고, 받은 request connection·승인·거절 UI는 이미 별도 소유된 범위로 남긴다.

## Goals / Non-Goals

**Goals:**

- 새 Local 및 verified ActivityPub inbound pending request를 `FOLLOW_REQUEST` Notification으로 투영한다.
- 승인·거절·취소·verified inbound Undo에서 실제 request deletion 뒤 같은 source Notification을 Best Effort로 정리한다.
- 기존 Profile-scoped Notification connection, Unread count, Node/Read visibility와 목록 UI에 requester Profile을 연결한다.
- Notification effect 실패를 source lifecycle과 분리하고 Sentry에서 create/delete, kind, source ID를 확인할 수 있게 한다.
- additive enum migration과 배포 후 신규 source만 대상으로 하는 운영 검증 경계를 준비한다.

**Non-Goals:**

- 기존 pending request의 historical backfill, reconciliation/scan command, outbox·queue·retry·durable delivery intent.
- `PROD-566`이 소유한 received-request list, approval/rejection UX, route와 해당 mutation contract.
- Follow Request 자체의 pending-only 상태 모델, pair uniqueness, 권한·승인 정책 또는 ActivityPub actor verification 재설계.
- 새 Notification 종류, Account-scoped Operational Notification, push/realtime 알림과 별도 route.

## Implementation Guidance

### Current Constraints

- `followProfile`은 request/relation/count를 한 DB transaction에서 처리하고 commit 뒤 established relation에만 `createFollowNotification`을 호출한다. 새 pending 결과는 `created`가 true인 경우에만 별도 create effect를 실행해야 duplicate request가 재진입 때 item을 복구하지 않는다.
- `approveProfileFollowRequest`는 request 삭제와 relation/count 생성이 한 transaction에 있고 commit 뒤 Follow Notification을 생성한다. request Notification delete는 같은 post-commit 경계에서 별도로 await하되 transaction/savepoint에 넣지 않아야 한다.
- `rejectProfileFollowRequest`, `cancelProfileFollowRequest`와 `removeInboundFollow`는 삭제된 request row를 결과로 확인할 수 있어야 한다. 삭제가 no-op인 경우에는 cleanup을 실행하지 않아야 하며, raw source 삭제 경로는 API visible predicate가 orphan을 숨기는 기존 정책을 유지한다.
- Post-commit create와 terminal delete는 독립된 committed effect이므로 source SELECT와 Notification INSERT 사이에 overlap이 생기면 물리적 stale row가 남을 수 있다. 이 loose-source 경계의 사용자 계약은 물리적 즉시 수렴이 아니라 source·pair visibility predicate를 통한 connection·count·Node·Read 비노출이다.
- `handleInboundFollow`, `handleInboundUndo`는 이미 공통 core follow lifecycle을 사용한다. Fedify handler에 pending Notification SQL을 추가하면 Local/remote 동작과 failure boundary가 갈라진다.
- `notification.source_id`는 의도적인 loose reference다. API visibility/source loader는 `FOLLOW_REQUEST`일 때 실제 `profile_follow_request`와 Followee/Requester pair를 검증해야 하며, 요청 삭제 뒤 남은 row를 generic fallback으로 노출해서는 안 된다.
- `FollowRequestNotification` concrete object는 requester `profile`과 함께 같은 source의 `followRequest: ProfileFollowRequest!`를 Recipient visibility 경계 안에서 반환해야 한다. 이 field는 기존 received-request transition action이나 별도 snapshot을 추가하지 않고, visible source row를 재사용한다.
- connection·concrete Node는 visibility statement 또는 parent payload에서 Follow Request source row를 함께 운반하고, `profile`·`followRequest` field는 그 snapshot을 재사용해야 한다. Read payload는 다른 Notification kind와 같은 source loader 경계를 사용하며 Follow Request 전용 snapshot을 추가하지 않는다.
- Sentry 초기화는 runtime 앱에 있고 `@kosmo/core`는 Sentry를 직접 초기화하지 않는다. 따라서 기존 앱·Fedify 실행 경계에서 사용할 수 있는 최소 reporter 또는 동등한 runtime adapter를 선택하되, effect 오류를 swallow하는 지점에서 context가 유실되지 않게 해야 한다.

### Recommended Approach

1. `notification_kind`에 `FOLLOW_REQUEST`를 추가하는 additive migration과 core enum을 먼저 준비한다. 기존 `notification` table, unique/index와 UUID 규칙은 재사용하고 source FK·extension table·backfill은 추가하지 않는다.
2. Notification service에 request source에서 Followee Recipient와 Follower Related Profile을 파생하는 idempotent create와 `(FOLLOW_REQUEST, sourceId)` delete 경계를 추가한다. 저장 결과나 오류를 호출자가 post-commit 관찰할 수 있는 기존 경계를 유지한다.
3. Local `followProfile`과 verified inbound Follow가 새 pending row를 실제로 만든 경우에만 commit 뒤 create effect를 await한다. duplicate/concurrent request와 이미 established relation을 재사용하는 경우에는 effect를 실행하지 않는다.
4. 승인·거절·취소·inbound Undo가 request row를 실제로 삭제한 경우에만 commit 뒤 delete effect를 await한다. 승인으로 생긴 established Follow Notification은 기존 Follow lifecycle을 그대로 호출한다.
5. API의 source loader, concrete Node ref와 공통 visible predicate에 `FOLLOW_REQUEST` branch를 추가한다. source request가 없거나 Followee가 저장 Recipient와 다르거나 requester가 Recipient 기준으로 보이지 않으면 connection·count·Node·Read에서 같은 방식으로 숨긴다.
6. 기존 Notification list item shape를 재사용해 requester Profile의 display/handle/avatar와 요청 의미를 표시하고, avatar·본문 activation은 requester의 `relativeHandle` Profile route와 기존 best-effort Read/cache updater를 사용한다. received-request route와 transition action은 추가하지 않는다.
7. create/delete effect의 catch 지점에서 operation, `FOLLOW_REQUEST`, source ID만 Sentry context로 기록한다. Reporter 호출 실패가 source action을 재실패시키지 않도록 하고, process 종료·retry·reconciliation은 현재 범위에서 허용하지 않는다.
8. core service, API integration, Fedify production-listener, app/storybook 또는 E2E 검증을 source creation/deletion, visibility/count/Read, Profile activation, duplicate/concurrent, Sentry failure isolation 순서로 추가한다.

### Allowed Alternatives

- Notification 저장·정리 경계를 기존 `notification.ts`에 둘지 명확한 follow-request lifecycle 모듈에 둘지는 공개 source-only/idempotent 계약과 post-commit failure semantics가 같다면 선택할 수 있다.
- Sentry 최소 context는 core가 받는 좁은 reporter callback, runtime별 adapter 또는 기존 Sentry helper의 context 확장 중 하나를 사용할 수 있다. 어느 방법도 core domain이 DSN 초기화나 사용자 payload 저장을 담당하게 해서는 안 된다.
- 목록 item은 기존 Follow row renderer를 action/fragment만 확장하거나 별도 Follow Request renderer로 분리할 수 있다. 둘 다 같은 list connection, requester route, Read/cache와 accessibility semantics를 유지해야 한다.

### Known Traps

- pending request를 만드는 transaction 안에서 Notification insert를 실행하면 Notification 오류가 request를 rollback하고, transaction 밖 fire-and-forget은 요청 종료·테스트에서 실패 관찰을 잃는다.
- duplicate request에서도 create effect를 호출하면 배포 전에 누락된 item을 우연히 backfill하는 결과가 된다.
- approval/reject/cancel/inbound Undo에서 request가 실제 삭제됐는지 확인하지 않고 cleanup하면 새 request와 같은 source ID를 잘못 지울 수 있다.
- `FOLLOW_REQUEST` source를 Follow source loader로 해석하거나 request 삭제 뒤 이름 snapshot을 반환하면 hidden row와 Profile 접근 정책을 우회한다.
- connection·Node visibility query가 source 존재만 확인하고 concrete field에서 source를 다시 읽으면 request deletion race가 non-null GraphQL 오류를 만든다. 이 두 표면은 source projection을 같은 statement/parent row로 운반하고 fields에서 재사용한다.
- create/delete effect 사이의 모든 interleaving을 lock으로 직렬화하려 하면 post-commit transaction ownership과 이번 change의 retry/queue 제외 범위를 깨뜨린다. overlap stale row는 API visibility가 숨기는 허용된 best-effort 결과다.
- received-request connection 또는 승인·거절 mutation을 Notification item에 넣으면 `PROD-566` 소유권과 selected Profile UI 경계를 침범한다.
- Unread count를 list length로 보정하거나 다른 Profile의 normalized record를 재사용하면 기존 badge isolation 계약이 깨진다.
- Notification cleanup 실패를 일반 GraphQL/API 오류로 전파하거나 Sentry에 Profile name/handle·ActivityPub payload를 태그로 남기면 failure isolation과 개인정보 최소화가 깨진다.

## Risks / Trade-offs

- [post-commit create 실패 시 새 request에 Notification이 없을 수 있다] → source lifecycle을 rollback하지 않고 Sentry 최소 context로 관찰한다. retry·reconciliation은 명시적으로 후속 capability로 남긴다.
- [delete 실패 또는 raw source 삭제로 orphan row가 남을 수 있다] → 기존 visible predicate에서 source existence와 pair/visibility를 검증해 모든 API 표면에서 즉시 숨긴다.
- [enum migration과 새 runtime이 순서가 어긋날 수 있다] → enum 값 추가 migration을 별도 additive 단계로 적용하고, 새 code가 활성화되기 전에 dev migration과 schema smoke를 통과시킨다.
- [requester Profile이 unavailable하면 item이 보이지 않을 수 있다] → snapshot/generic fallback을 만들지 않고 Recipient 기준 visibility 정책을 따른다.
- [목록에서 requester Profile로 이동해도 받은 요청 처리까지 한 번에 할 수 없다] → 이번 activation 범위를 requester Profile로 고정하고 received-request route 통합은 `PROD-566` 후속으로 둔다.

## Migration Plan

1. OpenSpec Gate 승인 뒤 `notification_kind`에 `FOLLOW_REQUEST`를 추가하는 additive dev migration, enum/schema validation과 기존 pending row 비소급 검증을 준비한다.
2. core lifecycle과 API/Fedify/app 변경을 같은 호환 가능한 release에서 배포하고, migration 성공 후 새 Local/verified inbound pending request만 create/delete effect를 사용한다.
3. 기존 pending request에는 Notification을 만들지 않는다. 배포 전 row와 배포 후 신규 row를 구분하는 integration/DB-backed smoke를 실행한다.
4. production release 전 dev migration, 신규 lifecycle, 목록·Unread·badge·Sentry 관찰 증거를 별도 gate에서 확인한다. 이 change의 전체 scope·canonical 정합성·tasks가 완료된 뒤에만 archive한다.
5. rollback은 application release를 되돌리되 additive enum 값은 제거하지 않는다. rollback 중 새 code가 비활성화되면 FOLLOW_REQUEST row가 API에 노출되지 않도록 기존 workload 호환과 migration history를 확인한다. 생성된 request/Notification을 자동 삭제하거나 backfill하지 않는다.

## Open Questions

없음. requester Profile activation, `PROD-566` UI 경계, post-commit Sentry 최소 context, 기존 pending 비소급과 backfill/reconciliation 제외는 upstream contract에서 확정되었다.
