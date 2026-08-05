## Context

이 결정 기록은 `PROD-321`의 최신 범위와 `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`를 바탕으로 새 `FOLLOW_REQUEST` Notification의 source mapping, lifecycle, 실패 관찰과 UI 소유 경계를 정리한다. 기존 pending-only request와 Profile-scoped Notification projection을 유지하면서 Local·verified ActivityPub inbound의 신규 pending row만 연결해야 한다.

## Decision Records

### Follow Request Notification은 Followee Recipient와 Follower Related Profile을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `PROD-321`
- Status: Active
- Context / Problem: Follow Request Notification의 수신자와 목록 활성화 대상을 정하지 않으면 Followee가 요청을 알 수 없거나 source 관계와 다른 Profile을 표시할 수 있다.
- Decision Outcome: `kind = FOLLOW_REQUEST`의 source는 `ProfileFollowRequest.id`, Recipient는 request의 Followee Profile, Related Profile과 목록 활성화 대상은 request의 Follower(요청자) Profile로 파생한다. Profile ID·이름·handle snapshot은 저장하지 않는다.
- Alternatives Considered: Followee를 Related Profile로 사용하거나 request에 표시용 snapshot을 복제하면 canonical Notification type별 관계와 Profile visibility를 우회한다. received-request route를 activation 대상으로 삼는 선택은 이번 issue의 requester Profile 범위와 `PROD-566` route 소유를 벗어난다.
- Consequences: source가 제거되거나 requester가 Recipient 기준으로 보이지 않으면 item은 모든 API 표면에서 숨겨지며, UI는 기존 Profile route만 사용한다.
- Confirmation / Follow-up: core source mapping, API visible predicate/Node와 app list activation test에서 같은 Follower/Followee 관계를 확인한다.

### Notification effect는 source transaction 이후 Best Effort로 처리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-321`
- Status: Active
- Context / Problem: Notification 저장·정리 오류가 pending request의 생성·삭제 또는 승인 시 relation/count를 rollback하면 pending-only lifecycle과 ActivityPub handler 성공이 깨진다.
- Decision Outcome: request/relation/count transaction을 먼저 commit하고 같은 request에서 실제 새 request가 생성된 경우 create, 실제 request가 삭제된 경우 delete effect를 await한다. effect 오류는 source action과 handler 성공을 바꾸지 않고 catch한다. 같은 방향의 재진입(create-create 또는 delete-delete)은 `(recipient_profile_id, kind, source_id)` uniqueness와 source delete의 idempotency로 멱등 처리한다. 반대 방향의 create/delete overlap은 transaction을 rollback하지 않으며 물리적 stale row가 남을 수 있지만, source/pair visibility predicate로 사용자 표면에서는 숨긴다.
- Alternatives Considered: Notification을 source transaction/savepoint에 넣으면 저장 오류가 source rollback으로 전파되고, fire-and-forget은 종료·검증 시점의 관찰을 보장하지 못한다. outbox/queue/retry는 이번 issue의 명시적 제외 범위다.
- Consequences: 일시적으로 누락되거나 orphan인 row가 남을 수 있으므로 기존 visible predicate가 source 존재와 pair를 매번 검증해야 한다. backfill/reconciliation 책임은 추가하지 않는다.
- Confirmation / Follow-up: Local core, request transition, inbound Follow/Undo integration에서 create/delete failure isolation과 duplicate/concurrent no-op을 DB-backed test로 확인한다.

### API visibility와 source field는 같은 snapshot을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-321`
- Status: Active
- Context / Problem: PR #500 review thread `PRRT_kwDOR_2JU86WN7qn`에서 Notification connection/Node가 source request를 visible로 확인한 뒤 별도 source loader가 실행되기 전에 request가 삭제되면 non-null Follow Request field가 GraphQL 오류를 낼 수 있음이 발견되었다. Read mutation payload도 같은 경합을 가질 수 있다.
- Decision Outcome: Follow Request Notification의 connection·concrete Node·Read payload는 visibility 조회와 함께 source row를 같은 SQL statement 또는 parent payload snapshot으로 운반하고, concrete fields는 그 snapshot을 재사용한다. Snapshot을 얻지 못한 source-less item은 기존 계약대로 모든 API 표면에서 숨긴다.
- Alternatives Considered: concrete field에서 source를 다시 조회하면 visibility와 source가 서로 다른 DB snapshot을 보게 되고, non-null field 오류 또는 stale item 노출이 발생한다. source row lock이나 retry/outbox는 benign social race와 이번 change 범위를 불필요하게 확장한다.
- Consequences: 한 GraphQL operation은 source 삭제 전의 일관된 row를 반환할 수 있으며, 후속 operation은 source/pair visibility predicate로 item을 숨긴다. Snapshot 없는 generic fallback과 source ID/name snapshot 저장은 추가하지 않는다.
- Confirmation / Follow-up: API integration regression에서 Node·connection source fields와 Read payload를 source deletion overlap으로 검증한다.

### Post-commit effect 오류는 Sentry 최소 context로 관찰한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-321`, `docs/domain/objects/notification.md`
- Status: Active
- Context / Problem: Best-effort effect를 조용히 무시하면 운영에서 누락·정리 실패를 구별할 수 없지만, 전체 request payload를 Sentry에 남기면 개인정보와 ActivityPub payload가 과도하게 수집된다.
- Decision Outcome: create/delete effect가 실패할 때 runtime Sentry reporter에 `operation`(create 또는 delete), `notificationKind = FOLLOW_REQUEST`, `sourceId = ProfileFollowRequest.id`만 전달한다. reporter 자체의 실패는 source lifecycle에 전파하지 않는다.
- Alternatives Considered: 예외를 GraphQL/Fedify handler로 재전파하면 lifecycle rollback/실패 응답이 되고, Profile name·handle·request body를 태그로 넣으면 최소 관찰 경계를 넘는다. 무관찰 swallow는 운영 확인이 불가능하다.
- Consequences: source ID만으로 누락·orphan row를 추적해야 하며, 자동 retry·queue·reconciliation은 제공하지 않는다. runtime adapter의 구체 파일·함수는 구현 선택으로 남긴다.
- Confirmation / Follow-up: create/delete failure test에서 Sentry mock이 세 context만 받는지와 source 결과가 성공으로 유지되는지 확인한다.

### 배포 후 신규 pending request만 projection한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-321`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- Status: Active
- Context / Problem: enum과 runtime을 배포하면서 기존 pending request에 Notification을 소급하면 사용자에게 과거 요청이 새 알림으로 재생되고 migration/reconciliation 범위가 넓어진다.
- Decision Outcome: 새 code가 실제로 insert한 Local 또는 verified inbound pending request만 create effect 대상이다. 배포 이전 pending row, duplicate Follow, 목록 조회, runtime startup은 Notification을 생성하지 않는다. 별도 backfill/reconciliation command를 만들지 않는다.
- Alternatives Considered: 전체 pending row backfill은 명시적 제외 범위이고, duplicate 요청 시 opportunistic backfill은 idempotent creation과 배포 경계를 혼합한다. startup scan은 재실행·운영 비용과 failure semantics를 추가한다.
- Consequences: 배포 직후 기존 pending request와 신규 request의 알림 유무가 다를 수 있다. 이 차이는 허용된 rollout 결과이며 dev enum migration·신규 lifecycle·목록/count/badge 관찰 gate에서 확인한다.
- Confirmation / Follow-up: migration smoke와 기존 pending fixture를 배포 전/후로 나눠 row 수·Notification 수를 비교한다.

### Notification 목록은 requester Profile만 활성화한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-321`, `PROD-566`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`
- Status: Active
- Context / Problem: Notification row에서 받은 요청 관리 화면으로 직접 이동하면 아직 별도 route와 승인·거절 UI를 소유한 issue와 경계가 겹친다.
- Decision Outcome: Notification 목록 item의 avatar와 본문은 Follower requester Profile의 기존 `relativeHandle` route로 이동한다. 받은 request connection, approval/rejection action과 canonical received-request route 통합은 이번 change에서 추가하지 않는다.
- Alternatives Considered: Followee 자기 Profile로 이동하거나 received-request route를 새로 만들면 요청을 보낸 주체를 확인하려는 item 목적과 owner-separated `PROD-566` 범위를 모두 흐린다.
- Consequences: 사용자는 이번 알림에서 요청자 Profile을 확인하지만 요청 처리까지는 후속 UI가 필요하다. 기존 Notification list, Read mutation, Profile-scoped badge와 Relay cache만 확장한다.
- Confirmation / Follow-up: app/storybook 또는 E2E에서 requester route, no approval controls, selected Profile cache/badge isolation을 확인하고 `PROD-566` merge 이후 canonical route 통합을 별도 검토한다.

## Remaining Decisions

- 없음. Sentry adapter의 파일·함수 선택과 concrete GraphQL type 이름은 기존 runtime/API 관례 안의 구현 선택으로 남기며 공개 behavior를 바꾸지 않는다.

## Superseded Decisions

- 없음.
