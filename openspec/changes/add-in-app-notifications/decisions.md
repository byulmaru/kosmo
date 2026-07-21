## Context

이 기록은 [PROD-273](https://linear.app/byulmaru/issue/PROD-273), canonical Notification·Follow Relationship 문서, `add-in-app-notifications` proposal/specs/design과 `PROD-325`, `PROD-274`, `PROD-275`, `PROD-352`, `PROD-351`, `PROD-350`, `PROD-276`, `PROD-380`, `PROD-277`, `PROD-324` 구현 이슈 및 계약 부모 `PROD-271`의 통합·archive 경계를 반영한다. `PROD-323`과 PR #244가 Follow Request를 pending-only 모델로 먼저 정렬했으며, 이번 change는 Follow를 재사용 가능한 Profile-scoped Notification 기반의 첫 sample source로 사용한다.

## Decision Records

### Notification은 하나의 capability와 여러 구현 slice를 공유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 저장, API, source action, 목록, badge와 E2E가 같은 사용자 결과를 만들지만 각각 별도 PR로 전달된다.
- Decision Outcome: `notification` 하나의 새 capability와 `data-model`, `api-platform` delta를 사용한다. 구현은 `PROD-325`, `274`, `275`, `352`, `351`, `350`, `276`, `380`, `277`, `324` heading으로 나누고 계약 부모 `PROD-271`이 통합·archive heading을 소유하되 모든 slice가 이 change를 공유한다.
- Alternatives Considered: DB/API/UI별 OpenSpec 분리, `PROD-271` Project 전체를 하나의 장기 change로 유지, 기존 `profile` capability에 모든 요구사항 추가.
- Consequences: 각 구현 PR은 자기 Linear 이슈와 검증만 소유하고, 전체 task·canonical 문서 sync와 archive는 계약 부모 `PROD-271`이 수행한다. 취소된 `PROD-278`의 별도 test/archive 책임은 부모에 흡수한다.
- Confirmation / Follow-up: `tasks.md` 최상위 heading과 Linear 구현 이슈를 1:1로 유지하고 archive gate에서 전체 PR merge를 확인한다.

### Notification은 단일 table projection으로 저장한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 첫 Follow delivery에 base/type-specific extension, 두 discriminator, trigger와 deferred integrity를 도입하면 미래 type을 위해 현재 복잡성을 지불한다.
- Decision Outcome: `notification(id, recipient_profile_id, kind, source_id, data, created_at, read_at)` 하나만 둔다. ID는 UUID v8이고 `Notifications` discriminator 하나를 사용한다.
- Alternatives Considered: base와 type-specific extension, 하나의 wide table에 type별 nullable FK, PostgreSQL partitioning.
- Consequences: GraphQL Node identity와 읽음 상태가 한 row에 있고 후속 Profile-scoped kind도 기본적으로 같은 table을 사용한다. 별도 `notification_follow`, extension discriminator와 cross-table integrity trigger는 없다. Account-scoped Operational 저장은 선결정하지 않는다.
- Confirmation / Follow-up: `PROD-325`가 최신 main에서 미사용 discriminator를 할당하고 단일 schema/migration을 검증한다.

### kind, loose source ID와 최소 JSONB data를 사용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 여러 Notification source table을 하나의 FK로 표현할 수 없지만 type별 extension을 만들 필요도 없다. 미래 payload를 선제 설계하거나 표시 snapshot을 저장하면 schema가 실제 요구보다 커진다.
- Decision Outcome: PostgreSQL `notification_kind`에는 현재 `FOLLOW`만 두고, `source_id uuid`에는 의도적으로 FK를 만들지 않는다. Recipient, kind와 source 조합은 unique다. `data jsonb NOT NULL DEFAULT '{}'`는 kind별 애플리케이션 타입으로 검증하며 FOLLOW는 `{}`를 사용한다.
- Alternatives Considered: source FK가 있는 extension table, 범용 untyped payload, Recipient/Related Profile과 이름·handle snapshot 복제.
- Consequences: kind가 source table과 data shape를 결정한다. 같은 source가 여러 Recipient에게 투영될 수 있고, raw source/data는 API에 노출하지 않으며 GIN index나 범용 payload framework를 선제 추가하지 않는다.
- Confirmation / Follow-up: 후속 Profile-scoped kind는 실제 필요가 생길 때 enum value, source mapping과 최소 data validation을 함께 추가한다. Account-scoped kind는 별도 저장 결정을 가진다.

### source uniqueness는 Recipient-first 물리 순서로 둔다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: source uniqueness의 논리적 의미는 같지만 물리 column 순서는 Recipient 기준 접근과 source-only cleanup 중 어느 경로를 우선할지 결정한다. 현재 PROD-325는 Recipient inbox 기반을 먼저 제공하며 source cleanup 조회 최적화는 아직 구현 범위가 아니다.
- Decision Outcome: unique constraint의 물리 순서는 `(recipient_profile_id, kind, source_id)`로 둔다. source-only cleanup을 위한 별도 `(kind, source_id)` index는 선제 추가하지 않는다.
- Alternatives Considered: `(kind, source_id, recipient_profile_id)` 순서로 source cleanup prefix까지 제공, Recipient-first unique와 별도 `(kind, source_id)` index를 함께 추가.
- Consequences: 같은 Recipient, kind와 source의 직접 중복은 계속 거부되고 같은 source의 여러 Recipient projection도 허용된다. 이 unique index만으로는 `(kind, source_id)` source-only 조회를 지원하지 않으며, 실제 cleanup 구현에서 필요가 확인되면 별도 Issue/OpenSpec 범위로 index를 추가한다.
- Confirmation / Follow-up: `PROD-325`가 migration과 DB test로 정확한 column 순서를 검증한다. `PROD-274` 이후 cleanup 구현은 현재 index가 cleanup 조회를 지원한다고 가정하지 않는다.

### GraphQL은 Notification interface와 kind별 concrete object를 사용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 공통 `type` enum과 nullable kind별 field를 한 object에 모으면 새 kind가 추가될 때 공통 object가 넓어지고, 클라이언트도 실제 제공 field와 무관한 enum 분기를 해야 한다.
- Decision Outcome: `Notification implements Node` interface는 `id`, `createdAt`, nullable `readAt`만 제공한다. `FollowNotification implements Notification & Node`는 non-null `profile`을 제공한다. 저장 row의 `kind`가 concrete GraphQL type을 결정하며 public `NotificationType` enum과 공통 `type` field는 노출하지 않는다. 각 concrete object는 자신의 typename과 Notification DB UUID를 global ID로 반환하고, 해당 typename에 등록된 Pothos loader가 DB UUID로 row를 직접 조회해 예상 `kind`와 visibility를 검증한다. 단일 `Notifications` discriminator를 먼저 해석하는 공통 Node route는 두지 않는다.
- Alternatives Considered: `Notification` 단일 object와 `NotificationType` enum, nullable kind별 field를 가진 wide object, kind마다 서로 무관한 connection.
- Consequences: `Profile.notifications`는 `NotificationConnection`을 반환하고 클라이언트는 `... on FollowNotification` inline fragment로 kind별 field를 선택한다. unavailable Follow item은 숨기므로 generic object나 nullable Related Profile fallback이 없다. concrete typename과 row의 `kind`가 일치하지 않거나 visibility를 만족하지 않으면 loader는 object 없음으로 처리해 Node가 `null`을 반환한다. interface typename으로 route하거나 mismatch에서 다른 concrete loader를 추론해 재시도하지 않는다.
- Confirmation / Follow-up: `PROD-275`가 `node(id:)`에서 FOLLOW row를 `FollowNotification` loader로 직접 resolve하고 typename/row mismatch, hidden·unsupported row와 batch 순서를 검증하며, `PROD-352`가 같은 concrete resolution을 connection에서 검증한다. 후속 kind는 자신의 concrete object와 Pothos loader를 추가하며 공통 interface에는 모든 kind가 공유하는 field만 추가한다.

### source identity와 상관관계는 ProfileFollow row가 소유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Follower/Followee pair uniqueness만 사용하면 Unfollow 뒤 Re-follow의 새 사건을 구분하지 못하고 Recipient/Related Profile을 복제하면 source와 drift할 수 있다.
- Decision Outcome: uniqueness는 `(FOLLOW, ProfileFollow.id, Followee.id)` source·Recipient 단위다. 저장 경계는 established `ProfileFollow` 하나만 입력으로 받고 Followee=Recipient, Follower=Related Profile을 파생하며 Recipient가 Local Profile인지 검증한다.
- Alternatives Considered: follower/followee pair uniqueness, 호출자가 Recipient/Related Profile ID 전달, duplicate conflict를 source action 실패로 반환.
- Consequences: 동일 source 재처리는 item 하나를 유지하고, 새 source ID의 Re-follow는 새 item을 만들 수 있다. 사용자 duplicate Follow는 새 관계가 아니므로 Notification integration을 다시 호출하지 않는다.
- Confirmation / Follow-up: `PROD-274`가 source 파생, Local/Remote Follower, Remote Recipient 거부, existing/concurrent source와 Re-follow를 검증한다.

### 정상 source 삭제는 application boundary가 정리한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: `source_id`에 FK가 없으므로 raw source 삭제를 database cascade로 감지할 수 없다. trigger를 추가하면 단일 projection의 단순성이 사라진다.
- Decision Outcome: 정상 ProfileFollow 삭제 action은 source commit 뒤 `(FOLLOW, source_id)` idempotent delete 경계를 호출한다. create/delete 모두 같은 source identity를 사용한다.
- Alternatives Considered: source FK extension과 cleanup trigger, DB event trigger, orphan을 영구 허용.
- Consequences: delete 호출 실패, process 종료나 action 외 raw delete로 orphan row가 남을 수 있다. API는 source를 확인하지 못하는 row를 숨기고 장기 비동기 cleanup은 `PROD-328`이 소유한다.
- Confirmation / Follow-up: `PROD-274`가 delete-by-source 의미를, `PROD-276`이 정상 action 연결과 delete failure isolation을 검증한다.

### Notification 생성·삭제는 Follow commit 이후 best-effort로 격리한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Notification을 Follow transaction에 넣으면 정책/저장 오류가 핵심 Follow 결과를 rollback한다. fire-and-forget은 request 종료와 unhandled rejection 때문에 실행 보장이 없고 현재 durable queue가 없다.
- Decision Outcome: ProfileFollow 생성·삭제 transaction을 먼저 commit한 뒤 같은 request에서 Notification create/delete를 `await`하고 오류를 catch한다.
- Alternatives Considered: 동일 transaction 원자성, savepoint, fire-and-forget, outbox/message queue/worker.
- Consequences: item 유실과 orphan을 첫 delivery에서 받아들이며 자동 retry/reconciliation을 제공하지 않는다. Follow response latency에는 Notification 경계 await 비용이 포함된다.
- Confirmation / Follow-up: `PROD-276`이 실제 Notification row의 생성·정리와 source action의 best-effort 오류 격리 구조를 검증한다. durable delivery가 필요하면 별도 Issue → OpenSpec으로 결정한다.

### 공개 Follow source action이 top-level transaction과 post-commit effect를 소유한다

- Decision Date: 2026-07-17
- Status: Accepted
- Context / Problem: Follow Request 승인 service가 caller transaction을 받으면 함수 반환 시점에는 outer transaction이 commit되지 않았을 수 있다. 이때 shared database connection에서 Notification source를 다시 읽으면 uncommitted `ProfileFollow`를 찾지 못해 오류가 격리된 채 item이 누락된다.
- Decision Outcome: 직접 Follow와 Follow Request 승인의 공개 action은 top-level source transaction을 소유하고, 새 established relation이 commit된 뒤 같은 request에서 Follow Notification create 경계를 await/catch한다. transaction 조합이 필요한 request/relation 변경은 post-commit effect를 호출하지 않는 내부 primitive로 분리한다.
- Alternatives Considered: optional transaction을 유지하면서 함수 반환 전에 Notification을 호출, outer caller가 실행할 post-commit callback 등록 계약 추가, Notification을 source transaction에 포함.
- Consequences: 공개 승인 action은 caller transaction에 직접 합류하지 않는다. 내부 primitive는 transaction 조합성을 유지하지만 Notification integration은 공개 action의 commit 이후에만 실행된다. 기존 relationship을 재사용하는 승인은 새 source가 아니므로 integration을 호출하거나 누락 item을 backfill하지 않는다.
- Confirmation / Follow-up: `PROD-276`은 신규 승인 Notification 하나, 기존 relation 재사용 제외, Notification 실패에도 승인 결과 보존을 검증한다. `PROD-321`은 후속 Follow Request Notification 제거만 소유하고 Follow item을 직접 만들지 않는다.

### Remote compatibility는 materialized source mapping까지만 origin-neutral하다

- Decision Date: 2026-07-14
- Status: Superseded
- Context / Problem: Local/Remote Profile이 같은 `ProfileFollow` 모델을 쓰지만 이번 change에 ActivityPub ingress와 actor materialization을 포함하면 별도 federation capability와 결합된다.
- Decision Outcome: 이미 materialize된 Remote Follower와 Local Followee의 established `ProfileFollow`를 저장 경계에 입력할 때 origin 분기 없이 같은 mapping을 사용한다.
- Alternatives Considered: Local source만 허용, ActivityPub inbound Follow/Undo 전체를 archive gate에 포함.
- Consequences: `PROD-274`와 `PROD-276` target test만 Remote compatibility를 확인하고 대표 E2E는 Local→Local Follow를 사용한다.
- Confirmation / Follow-up: 실제 inbound flow는 `PROD-243`과 그 선행 이슈가 소유한다.

### 새 established Follow source의 생성 진입점과 Follower origin은 Notification 조건이 아니다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 저장 경계는 established `ProfileFollow`를 source로 origin-neutral하게 해석하지만 이전 계약은 ActivityPub ingress를 전체 제외해, verified inbound Follow가 새 relation을 만들어도 Local Followee에게 Notification을 만들지 않는 모순이 있었다.
- Decision Outcome: Local Recipient에게 새 established `ProfileFollow`가 생성되면 Local action, Follow Request 승인 또는 verified ActivityPub inbound Follow 중 어떤 진입점인지와 Follower가 Local/Remote인지에 관계없이 공통 core public action이 commit 이후 같은 Follow Notification create 경계를 await/catch한다. core action은 caller-supplied direction 대신 저장된 Profile origin pair에서 flow를 파생하며 verified inbound Undo는 established relation을 실제 삭제했을 때만 같은 public action의 delete-by-source effect를 실행한다.
- Alternatives Considered: ActivityPub ingress를 계속 제외, Fedify handler가 Notification을 직접 호출, relation transaction 내부에서 Notification을 원자적으로 저장·삭제.
- Consequences: pending request, duplicate Follow, 기존 relation 재사용과 relation/request 삭제 no-op은 established Notification lifecycle을 실행하지 않는다. Notification 실패는 relation/request/count transaction이나 ActivityPub handler 성공을 rollback하지 않으며, Fedify adapter는 relation mutation과 Notification 호출을 중복 구현하지 않는다.
- Confirmation / Follow-up: `PROD-380`이 production listener → concrete handler → core action → DB/Notification integration, duplicate/concurrent idempotency, pending/no-op 제외와 create/delete 실패 격리를 검증한다. `add-activitypub-remote-follow`에는 새 protocol 동작 없이 이 cross-capability 경계만 동기화한다.

### Follow Notification create 경계가 eligibility를 소유한다

- Decision Date: 2026-07-16
- Status: Superseded
- Context / Problem: ProfileFollow action이 eligibility와 저장 경계를 각각 호출하면 source에서 Recipient와 Related Profile을 파생하는 책임이 action과 Notification service에 나뉘고, 다른 호출자가 eligibility를 우회할 수 있다.
- Decision Outcome: `createFollowNotification`은 established `ProfileFollow` source에서 Recipient와 Related Profile을 파생한 뒤 공통 eligibility evaluator를 먼저 호출하고, allow일 때만 기존 idempotent insert를 수행한다. evaluator가 없을 때는 default allow다. evaluator·source·저장 오류는 caller에 반환하며 ProfileFollow action이 commit 이후 이를 `await`하고 catch한다.
- Alternatives Considered: ProfileFollow action이 eligibility와 저장 경계를 별도로 호출, 별도 policy-aware facade 추가, create 경계가 evaluator 오류를 내부에서 정상 no-op으로 삼킴.
- Consequences: 모든 Follow Notification create 호출이 같은 eligibility 경계를 통과하고 후속 `PROD-327`은 evaluator만 연결할 수 있다. deny는 정상 no-op이지만 evaluator 오류는 source action에서 격리되며 direct caller는 오류를 관찰한다.
- Confirmation / Follow-up: `PROD-276`이 default allow, deny, evaluator 오류, 저장 실패와 source action commit 보존을 검증한다.

### 현재 Follow Notification 경계에는 정책 주입점을 노출하지 않는다

- Decision Date: 2026-07-17
- Status: Accepted
- Context / Problem: 실제 Mute·Block 정책 구현과 production composition이 없는 상태에서 evaluator와 action callback을 먼저 공개하면 테스트가 production 계약을 결정하고 caller가 알림 생명주기나 후속 정책을 우회할 수 있다.
- Decision Outcome: `createFollowNotification(sourceId)`는 established source에서 Recipient를 파생해 idempotent insert를 직접 수행한다. `followProfile`과 `unfollowProfile`은 Notification create/delete를 내부에서 직접 호출하며 테스트용 callback이나 evaluator를 받지 않는다. 실제 정책과 구체 연결 지점은 `PROD-327`이 구현과 함께 결정한다.
- Alternatives Considered: default allow evaluator를 공개 인자로 유지, 별도 policy-aware facade를 미리 추가, action에 create/delete callback을 유지.
- Consequences: 현재 공개 서비스 계약은 실제 production 경로만 표현하고 pending Follow Request나 caller가 알림 생명주기를 선택적으로 우회할 수 없다. deny와 policy error 시나리오는 실제 정책이 구현될 때까지 이 change의 검증 범위에서 제외한다.
- Confirmation / Follow-up: `PROD-276`은 established 생성, pending·duplicate 제외, 정상 cleanup을 실제 Notification row로 검증한다. 이 결정은 2026-07-16의 “Follow Notification create 경계가 eligibility를 소유한다” 결정을 대체한다.

### Notification API 권한은 Account-Profile membership이다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: selected Profile만 API authorization에 사용하면 같은 Account가 권한을 가진 다른 Profile을 명시적으로 조회할 수 없고 UI 선택 상태가 서버 권한 모델과 결합된다.
- Decision Outcome: `Profile.notifications`와 `Profile.unreadNotificationCount`는 요청 Account와 target Profile 사이 membership을 요구하며 membership role은 판정에 사용하지 않는다. selected Profile의 존재·일치 여부는 API 권한 조건이 아니다. Read도 item Recipient Profile membership을 검사한다.
- Alternatives Considered: selected Profile 전용 API, Account root inbox, 일부 운영 role만 허용.
- Consequences: Profile field의 인증/membership 실패는 `PERMISSION_DENIED`다. Node는 없는 ID·membership 부재·hidden item을 `null`로, Read는 membership 부재·hidden item·없는 ID를 `NOT_FOUND`로 정규화한다. UI/cache는 계속 selected Profile별로 격리한다.
- Confirmation / Follow-up: `PROD-275`가 공통 role-independent membership과 비선택 Profile·selected Profile 부재를 검증하고, `PROD-352`·`PROD-351`·`PROD-350`이 각 API 표면의 error matrix를 검증한다.

### UUID ID 단독 cursor에서 같은 millisecond의 임의 순서를 허용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: PROD-366 이전 공용 UUID generator는 millisecond timestamp 뒤에 random tail을 사용하므로 같은 millisecond에 생성된 ID의 대소가 생성 순서와 일치하지 않는다. ID 단독 cursor는 첫 page 뒤 같은 millisecond에 추가된 item을 오래된 page에 섞을 수 있다.
- Decision Outcome: Notification connection은 `Notification.id DESC` 단일 keyset과 opaque ID cursor를 유지한다. 같은 millisecond 안의 생성 순서와 새 item의 page 배치는 보장하지 않는다.
- Alternatives Considered: `(createdAt DESC, id DESC)` composite cursor, Notification 전용 monotonic ordering key, 공용 ID 생성 정책 변경, offset pagination.
- Consequences: 다음 page는 `id < cursor` 경계로 조회하고 목록 index는 `(recipient_profile_id, id DESC)`다. 같은 millisecond에 뒤늦게 생성된 item은 ID random tail에 따라 기존 cursor의 다음 page에 나타날 수 있으며, 이 정도의 순서 차이는 현재 Notification 제품 요구에서 허용한다.
- Confirmation / Follow-up: `PROD-352`가 고정된 item 집합의 ID keyset page 경계와 visible item 중복/누락 방지를 검증하되 같은 millisecond의 생성 chronology나 concurrent insert snapshot은 요구하지 않는다.

### unavailable item은 API 전체에서 숨긴다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: source 또는 Related Profile을 조회할 수 없는 Follow item은 사용자에게 의미가 없고 generic fallback을 반환하면 정보 노출과 count drift를 만든다. 다만 첫 delivery에는 즉시 물리 삭제할 비동기 기반이 없다.
- Decision Outcome: Recipient Profile 자체가 API에 노출되지 않거나 source가 없거나 source Followee가 저장 Recipient와 다르거나 Recipient Profile을 viewer로 Related Profile을 조회할 수 없는 item은 connection, Unread count, Node와 Read에서 존재하지 않는 것으로 취급한다. SQL visible predicate를 pagination limit 전에 적용하며 count도 같은 predicate를 사용한다.
- Alternatives Considered: `profile: null` generic item, snapshot fallback, count에는 포함하고 목록만 숨김, page fetch 뒤 client filtering.
- Consequences: DB row와 기존 `read_at`은 cleanup 전까지 남을 수 있고 visibility가 회복되면 기존 상태로 다시 노출될 수 있다. raw source/data와 generic unavailable UI는 없다.
- Confirmation / Follow-up: `PROD-275`가 공통 predicate와 Node 숨김을 검증하고, `PROD-352`·`PROD-351`·`PROD-350`이 list/count/Read에서 동일 predicate를 재사용하는지 검증한다.

### Read는 최초 readAt과 visible Recipient count를 보존한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 반복·동시 Read가 timestamp를 덮어쓰거나 count를 두 번 감소시키면 목록과 badge가 불일치한다.
- Decision Outcome: Read update는 membership과 visible predicate를 포함하고 `read_at = coalesce(read_at, now())` 의미로 최초 시각을 보존한다. Unread count는 같은 visible predicate와 `read_at IS NULL`로 계산한다. payload는 `notification`과 `recipientProfile`을 반환한다.
- Alternatives Considered: client-side count decrement만 사용, mutable stored counter, 매 Read마다 timestamp 갱신.
- Consequences: 반복·동시 Read는 idempotent하고 hidden item은 Read하거나 count할 수 없다. Relay는 payload의 두 Node를 통해 정확한 Profile cache를 갱신한다.
- Confirmation / Follow-up: `PROD-350`이 최초 timestamp와 concurrent update를, `PROD-351`이 visible count를 검증한다.

### invalid source 또는 unavailable Related Profile item은 장기적으로 비동기 삭제한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: API hidden만으로 사용자 노출은 막지만 source가 invalid하거나 Related Profile을 볼 수 없는 의미 없는 row가 영구 보존되는 상태는 이상적인 domain lifecycle이 아니다. 반면 Recipient Profile의 비활성화·정지는 복구될 수 있다.
- Decision Outcome: source가 없거나 Recipient와 일치하지 않거나 Related Profile이 Recipient 기준으로 unavailable이 되면 Notification을 비동기적이고 idempotent하게 삭제하는 방향을 채택한다. Recipient Profile 자체의 일시 비활성화·정지가 삭제 원인인지는 확정하지 않는다. 현재 change에는 event, queue/scan, worker, retry와 허용 지연 구현을 포함하지 않는다.
- Alternatives Considered: hidden row 영구 보존, 현재 change에 동기 trigger나 queue 도입.
- Consequences: 현재 구현은 공통 hidden predicate만 제공하고 실제 cleanup 전까지 row가 남을 수 있다. 별도 `PROD-328`이 구현 수단, lifecycle event와 Recipient inactivity 보존/삭제를 정한다.
- Confirmation / Follow-up: `PROD-328`은 이번 change의 task와 archive gate가 아니며 별도 Issue → OpenSpec → Implementation을 따른다.

### 목록과 badge의 세부 UX 결정은 구현 소유 이슈로 미룬다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: `PROD-273`은 공통 저장·API 계약을 확정하지만 표시·interaction·navigation·refresh·cache UX는 `PROD-277`, badge UX는 `PROD-324`가 소유한다.
- Decision Outcome: 정상 item의 Read/navigation 순서, 실패 표현, refresh/cache 동작, badge cap·접근성·loading/error를 각 구현 이슈가 결정하고 같은 change에 동기화한다. unavailable item은 API가 반환하지 않으므로 별도 fallback UX를 결정하지 않는다.
- Alternatives Considered: 모든 UI 결정을 `PROD-273`에서 선결정, UI 구현을 별도 OpenSpec change로 분리.
- Consequences: UI 구현 이슈는 코드를 작성하기 전에 선택지를 결정하고 이 change를 갱신해야 한다.
- Confirmation / Follow-up: `PROD-277`은 `notification` UI requirements/design/decision을, `PROD-324`는 `web-app-shell` delta와 관련 design/decision을 먼저 추가한다.

### Follow 알림 목록은 단일 목록과 단수 Related Profile 표현을 사용한다

- Decision Date: 2026-07-19
- Status: Accepted
- Context / Problem: Figma의 Like 알림은 여러 avatar를 묶는 표현을 제공하지만 현재 API의 Follow item은 `profile: Profile!` 한 명만 반환하고 Profile image field나 aggregation identity·count를 제공하지 않는다.
- Decision Outcome: 모바일과 Web 모두 탭이나 section heading 없는 단일 목록을 사용한다. 상단은 `알림` 제목과 44px 알림 설정 control로 구성하고 설정 route가 없는 동안 control은 `알림 설정 (준비 중)` disabled placeholder로 둔다. Follow item은 Figma Like 알림 행처럼 왼쪽 28px kind icon과 오른쪽 콘텐츠 column을 같은 상단선에 놓고, 콘텐츠 첫 Avatar row에 28px initials Avatar와 오른쪽 상대 시각을 둔 뒤 `OOO님이 팔로우했습니다` 문구를 아래에 표시한다. Avatar와 본문은 Related Profile link로 제공한다. inline 맞팔로우, 빈 action 영역, snippet, image avatar와 client-side 복수 사용자 aggregation은 추가하지 않는다.
- Alternatives Considered: 기존 `KOSMO` eyebrow와 `모두` section heading 유지, 설정 control 숨김, 준비 중 안내를 실행하는 active control, 동일 사용자의 인접 item을 client에서 묶기, Figma Follow variant의 맞팔로우 영역을 빈 채 유지하기.
- Consequences: 설정 기능 없이도 향후 header layout을 보존하되 작동하지 않는 control을 실행 가능하게 오인시키지 않는다. 이번 UI는 현재 GraphQL 계약과 pagination·readAt identity를 보존한다. `N명이 팔로우했습니다`와 겹친 avatar는 aggregation key·count·대표 Profile 목록·pagination/read 의미를 함께 정의하는 후속 API 이슈가 필요하다.
- Confirmation / Follow-up: Storybook은 header placeholder, 탭·section heading 부재, 단일 Follow item과 긴 이름·handle을 검증하고 복수 사용자 fixture를 만들지 않는다.

### 목록 조회·refresh·pagination은 selected Profile Relay connection으로 격리한다

- Decision Date: 2026-07-19
- Status: Accepted
- Context / Problem: 목록이 selected Profile을 바꿀 때 이전 Recipient edge를 재사용하거나 route state에서 page를 직접 합치면 Profile 간 노출과 pagination drift가 발생할 수 있다.
- Decision Outcome: route query는 selected Profile을 target으로 `store-and-network` fetch를 사용하고 initial loading/error/retry/empty를 구분한다. native는 pull-to-refresh를 제공한다. Web은 별도 in-app refresh action 없이 browser의 표준 document reload를 사용하며 reload 뒤 새 Relay Environment가 query를 다시 실행한다. pagination은 20개 단위 Relay connection으로 수행하고 next-page 요청 중복을 막으며 실패 시 기존 item과 cursor 위치를 유지해 재시도한다. actor별 Environment/Store 재생성이 Profile cache 격리를 소유한다.
- Alternatives Considered: Web에 별도 keyboard-accessible refresh button 유지, route local array/cursor 누적, selected Profile ID를 무시한 단일 connection, native refresh 없이 화면 재진입에만 의존.
- Consequences: Relay가 edge 누적과 중복 제거를 소유하고 Profile 전환은 새 actor query를 실행한다. unavailable item client filtering은 없다.
- Confirmation / Follow-up: Storybook interaction은 initial query 상태, next-page loading/failure/retry, Web refresh control 부재와 selected Profile 전환을 검증한다. native pull-to-refresh는 platform smoke로 확인한다.

### Profile 이동은 Read side effect와 독립적으로 즉시 시작한다

- Decision Date: 2026-07-17
- Status: Accepted
- Context / Problem: item 활성화가 Read network 완료를 기다리면 느리거나 실패한 요청이 사용자의 명시적 Profile 이동을 막는다.
- Decision Outcome: Avatar와 본문 link 활성화는 Related Profile navigation을 즉시 시작한다. Read pending·failure·retry는 navigation을 지연, 취소 또는 되돌리지 않는다. 2026-07-20 UI 보정으로 Read 여부와 관계없이 기본 배경은 `card`로 통일하고 Web pointer hover 중에만 `surface`로 강조한다. native에는 hover 배경을 추가하지 않으며 `readAt = null`은 접근성 Unread 상태로 전달한다.
- Alternatives Considered: Read 성공 뒤 이동, 이동을 optimistic Read 성공으로 간주, item 전체를 link가 아닌 mutation button으로 만들기.
- Consequences: link의 Web keyboard/browser semantics를 유지한다. 시각적 hover는 Read 상태를 나타내지 않고 pointer 위치만 피드백하며, Unread 구분은 접근성 정보와 후속 badge에 의존한다. client Read mutation과 정확한 Unread count cache 갱신은 `PROD-372`, shell badge 표시는 `PROD-324`가 소유한다.
- Confirmation / Follow-up: PROD-277은 link 이동과 read/unread 표시를 검증하고 PROD-372가 mutation 성공·실패·재시도와 cache 수렴을 추가한다.

### Unread badge는 기존 셸 알림 아이콘에 selected Profile count만 겹쳐 표시한다

- Decision Date: 2026-07-20
- Status: Superseded
- Context / Problem: Web Figma 화면에는 아직 Unread badge가 없고 모바일 Figma의 badge 예시는 현재 공용 셸 코드의 label 구조와 다르다. 새 badge가 기존 내비게이션 layout을 바꾸거나 Profile 전환 중 다른 Recipient count를 노출하지 않으면서 모든 Android/iOS/Web 셸 surface에서 일관되게 동작해야 한다.
- Decision Outcome: 하단 탭 바, 모바일 drawer, Web compact 레일과 full 사이드바의 기존 알림 아이콘에만 badge를 overlay한다. 기존 label과 내비게이션 구조는 유지하고 label 옆 별도 pill을 만들지 않는다. `0`은 숨기고 `1..99`는 정확한 숫자, `100` 이상은 `99+`로 표시하며 기존 light/dark neutral token 조합으로 대비를 확보한다. control은 양수 count에서 capped 표시값이 아닌 실제 서버 count를 사용한 `알림, 읽지 않은 알림 N개`, 그 외에는 `알림`으로 읽고 시각 badge는 accessibility tree에서 숨긴다. 최초 성공 전과 Profile 전환 직후에는 숨긴다. badge count 조회와 `{ selectedProfileId, lastSuccessfulCount }` 상태는 전체 셸 query의 Suspense/Error boundary와 분리된 non-suspending controller가 소유해 같은 Profile의 environment 교체나 조회 실패 중에도 마지막 성공값과 셸 진입점을 유지한다. controller는 Relay operation/store를 사용하며 count 오류를 셸 boundary로 throw하지 않는다. count-only 오류를 위한 메시지나 retry control은 추가하지 않고 다음 Profile 전환, 셸 load·재진입 또는 기존 셸 오류 retry에서 다시 조회한다. 자동 foreground/reconnect listener나 `NetInfo`는 추가하지 않는다.
- Alternatives Considered: label 옆 count pill, count 없는 dot, Figma mobile의 primary/card 색 조합, danger 색, badge 전용 또는 `onPrimary` token 추가, `NetInfo` 기반 즉시 reconnect refresh.
- Consequences: badge는 셸 layout과 touch target을 바꾸지 않고 모든 surface에서 같은 normalized Profile field를 표시한다. count controller는 셸 query와 별도의 오류/상태 경계를 가지지만 ad hoc network stack을 만들지 않는다. 최초 count-only 실패는 다음 기존 refresh까지 badge 없이 남고, 성공 뒤 오류나 활성 상태 reconnect만 발생하면 마지막 성공 count가 다음 기존 refresh까지 stale할 수 있다. Profile 전환은 다른 Profile의 마지막 값을 재사용하지 않고 같은 Profile의 count 오류는 전체 셸 오류로 승격하지 않는다. Read mutation과 optimistic/cache orchestration은 `PROD-372`가 소유하며 badge consumer는 목록 길이나 hidden item으로 보정하지 않는다.
- Confirmation / Follow-up: `PROD-324`가 `web-app-shell` delta, shell/Storybook/Relay cache test와 platform smoke를 소유한다. `PROD-372`는 Read 결과의 `recipientProfile.unreadNotificationCount` cache 반영을 소유하고 `PROD-278`이 최종 Follow→badge→Read 수렴을 Web E2E로 검증한다.

### 모바일 drawer는 숫자 대신 작은 Unread dot을 표시한다

- Decision Date: 2026-07-21
- Status: Superseded
- Context / Problem: 같은 16px count badge를 24px 하단 탭 아이콘과 20px drawer 아이콘에 재사용하면 drawer에서 badge가 아이콘보다 시각적으로 우세하고 `99+`가 행 정렬을 어수선하게 만든다. 모바일 drawer가 열리기 전부터 하단 탭이 정확한 count를 제공하므로 drawer에서는 Unread 존재 여부만으로 충분하다.
- Decision Outcome: 모바일 drawer의 기존 알림 행과 accessible name은 유지하되 양수 count는 알림 아이콘 우상단의 숫자 없는 8px dot으로 표시한다. 하단 탭과 Web compact/full 사이드바는 기존 `1..99`와 `99+` count 정책을 유지하며, 하단 탭 count badge는 padding과 offset을 줄여 24px 아이콘과 정렬한다. 모든 표면은 동일한 실제 서버 count를 accessible name으로 읽고 `0` 또는 최초 성공 전에는 badge를 숨긴다. 공용 badge component 하나가 count와 dot 시각 variant를 제공한다.
- Alternatives Considered: 모든 표면에 같은 count badge 유지, drawer 알림 행 제거, 전체 모바일 drawer 내비게이션 재설계, 모든 표면을 dot으로 통일.
- Consequences: drawer는 정확한 숫자를 시각적으로 중복하지 않아 더 가볍게 보이지만 screen reader는 실제 count를 계속 얻는다. 기존 route, label, row, touch target, controller와 Profile 격리·오류 계약은 바뀌지 않는다. 전체 drawer 정보 구조 변경은 PROD-324 범위에 포함하지 않는다.
- Confirmation / Follow-up: Storybook interaction은 같은 count에서 하단 탭의 `99+`, drawer의 dot과 두 진입점의 실제 count accessible name을 검증한다. 이 결정은 2026-07-20 결정의 “모든 surface에서 같은 formatted count를 표시한다”는 시각적 부분만 대체하고 나머지 상태·접근성·lifecycle 결정은 유지한다.

### 모든 셸 Unread badge는 accent dot으로 통일한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 숫자 count badge는 아이콘보다 시각적으로 크고 셸 표면마다 다른 정보 밀도와 정렬을 만들었다. 정확한 count는 screen reader에 계속 제공할 수 있으므로, 시각적으로는 모든 셸 진입점에서 Unread 존재 여부만 일관되게 알리는 편이 낫다. badge 색도 `text`에 직접 결합하면 후속 강조색 변경이 여러 component에 퍼진다.
- Decision Outcome: Android/iOS와 좁은 Web의 하단 탭 바·모바일 drawer, Web compact 레일과 full 사이드바 모두 양수 count를 같은 숫자 없는 8px dot으로 알림 아이콘에 overlay한다. dot은 icon wrapper 기준 `right: 2px`, `top: -1px`에 놓고 semantic `accent` token을 사용한다. `onAccent`는 향후 accent 배경 위 foreground content를 위한 짝 토큰으로 함께 정의하지만 현재 dot은 content가 없어 사용하지 않는다. `0`과 최초 성공 전에는 dot을 숨긴다. 모든 진입점은 양수 count에서 실제 서버 count를 사용한 `알림, 읽지 않은 알림 N개`라는 하나의 accessible name을 유지하며 dot은 accessibility tree에서 숨긴다. 공용 badge component는 시각 variant나 count formatter 없이 양수 여부만 렌더링한다. count controller의 Profile 격리, 같은 Profile의 마지막 성공값, normalized Relay record 구독, non-suspending 오류 경계와 기존 refresh 수렴 계약은 유지한다.
- Alternatives Considered: 하단 탭·Web에는 count를 남기고 drawer만 dot으로 표시, `1..99`/`99+` count를 모든 표면에 유지, badge 전용 color token, 짝 foreground token 없는 `accent`만 추가.
- Consequences: 사용자는 모든 표면에서 같은 위치와 크기의 표시로 Unread 존재 여부를 보고, 정확한 숫자는 접근성 이름으로만 얻는다. 시각 count cap과 formatter·variant가 사라져 공용 component가 단순해진다. 현재 light/dark `accent` 값은 기존 dot 외관을 보존하지만 후속 색 변경은 token 매핑만 수정하면 된다. 기존 route, label, row/touch target, count controller와 Profile 격리·오류 동작은 바뀌지 않는다.
- Confirmation / Follow-up: Storybook interaction은 0/1/99/100과 하단 탭·drawer·compact/full에서 숫자가 없고 같은 dot geometry를 사용하는지, 실제 count accessible name과 normalized Relay 갱신·Profile 전환·마지막 성공값 계약이 유지되는지 검증한다. 이 결정은 2026-07-20 결정과 같은 날의 drawer-only dot 결정을 대체한다.

### Notification Node는 concrete global ID 계약을 따른다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PROD-366이 DB UUID discriminator 기반 Node routing을 concrete typename 기반 opaque global ID로 대체하고 신규 DB ID를 UUIDv7으로 전환했다.
- Decision Outcome: FollowNotification은 자신의 concrete typename과 Notification DB UUID를 global ID로 반환하고, 해당 typename의 loader가 row를 batch load해 `kind = FOLLOW`와 visibility를 검증한다. 기존 Notification UUIDv8은 재작성하지 않고 신규 UUIDv7과 공존한다.
- Alternatives Considered: 기존 Notifications discriminator 전용 route 유지, interface typename encode, raw UUID fallback. 모두 PROD-366의 공개 identity 계약과 충돌해 채택하지 않았다.
- Consequences: 기존의 “단일 Notifications discriminator로 kind-aware route” 구현 지침은 폐기된다. Notification connection cursor는 계속 DB UUID를 사용하므로 GraphQL global ID encoding과 분리된다.
- Confirmation / Follow-up: `PROD-275`가 concrete global ID round trip, row kind mismatch, hidden row, batch 순서와 기존 UUIDv8 fixture를 검증한다.

## Remaining Decisions

- 실제 Profile Mute·Profile Block·Domain Block 정책과 구체 연결 지점 및 정책별 억제 test는 후속 `PROD-327`의 별도 OpenSpec에서 결정한다.
- invalid source·unavailable Related Profile item의 원인별 event, queue/scan, retry, 허용 지연과 대량 처리 및 Recipient inactivity cleanup 여부는 `PROD-328`의 별도 OpenSpec에서 결정한다.
- outbox/message queue, delivery retry/reconciliation, Push/realtime과 다른 Notification kind는 필요를 소유하는 별도 Linear 이슈와 OpenSpec에서 결정한다.

## Superseded Decisions

- 이 PR의 초기 draft가 제안한 기존 이름의 `notification_item` base + `notification_follow` extension, source FK/cascade, cleanup trigger와 deferred integrity constraint는 단일 `notification` projection 결정으로 대체한다.
- 이 PR의 초기 draft가 제안한 selected Profile 전용 API 권한은 role-independent Account-Profile membership 권한으로 대체한다.
- 이 PR의 초기 draft가 제안한 `profile: null` generic fallback, Read 허용과 Unread count 포함은 unavailable item 전면 숨김으로 대체한다.
- 2026-07-14의 Notification 단일 table 결정 중 “UUIDv8 `Notifications` discriminator를 신규 ID와 GraphQL Node routing에 사용한다”는 부분은 PROD-366의 신규 UUIDv7·기존 UUIDv8 무마이그레이션 공존과 concrete global ID 결정으로 대체한다. 단일 table projection 결정 자체는 유지한다.
- 2026-07-16의 공개 eligibility evaluator와 default allow 결정은 2026-07-17의 production 경로 전용 계약 결정으로 대체한다.
