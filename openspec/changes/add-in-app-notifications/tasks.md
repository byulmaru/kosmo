## 1. PROD-325 Notification 단일 테이블 스키마와 조회 인덱스를 도입한다

- [x] 1.1 UUID primary key, `notification_kind`의 `FOLLOW` 값과 단일 `notification` Drizzle table/export를 추가한다. 기존 생성 당시의 UUIDv8 ID는 PROD-366 이후에도 재작성하지 않는다.
- [x] 1.2 Recipient Profile FK/cascade, FK 없는 `source_id`, `data jsonb NOT NULL DEFAULT '{}'`, `(recipient_profile_id, kind, source_id)` unique constraint, Recipient 목록 index와 Unread partial index를 additive migration에 반영한다.
- [x] 1.3 migration/DB integration test로 Recipient FK, kind/data default, Recipient-first unique 순서와 직접 duplicate source 거부, `id DESC` index와 Unread partial index를 검증한다.
- [x] 1.4 DB schema check와 migration 검증으로 `notification_follow`, source FK, cleanup trigger, source-only cleanup index, deferred integrity, 미래 kind/data와 GIN index가 선제 추가되지 않았는지 확인한다.

## 2. PROD-274 Follow Notification의 source·Recipient 저장 경계를 제공한다

- [x] 2.1 established `ProfileFollow`에서 Followee Recipient와 Follower Related Profile을 파생하고 Local Recipient만 허용하는 source-only create 경계를 구현한다.
- [x] 2.2 `kind=FOLLOW`, `source_id=ProfileFollow.id`, `recipient_profile_id=Followee.id`, `data={}`인 row를 저장하고 existing source·Recipient 또는 concurrent unique conflict를 기존 item 성공이나 idempotent no-op으로 정규화한다.
- [x] 2.3 `(kind, source_id)`를 받는 idempotent delete 경계를 구현하고 이미 없는 row도 성공한 no-op으로 정규화한다.
- [x] 2.4 service/data-access test로 정확한 파생, Remote Recipient 거부, Local/Remote Follower, 동일 source 재호출, concurrent create와 반복 delete를 검증하고 target package check를 통과시킨다.

## 3. PROD-275 Notification GraphQL 타입·Node와 공통 visible 조회 기반을 제공한다

- [x] 3.1 `Notification implements Node` interface와 `FollowNotification implements Notification & Node` concrete object를 추가하고 FollowNotification concrete global ID가 해당 loader로 직접 route되어 row의 `kind = FOLLOW`와 visibility를 검증하게 한다. interface typename을 Node ID로 encode하거나 mismatch에서 다른 loader를 추론하지 않는다. `FollowNotification.profile`은 non-null로 제공하고 raw kind/source/data/snapshot은 노출하지 않는다.
- [x] 3.2 role-independent Account-Profile membership, Recipient Profile API visibility, source 존재, source Followee와 저장 Recipient 일치, Recipient Profile 기준 Related Profile visibility를 하나의 재사용 가능한 SQL-visible predicate로 제공한다. selected Profile은 권한 판정에 사용하지 않고 hidden row는 Node와 후속 API에서 존재하지 않는 것으로 취급한다.
- [x] 3.3 API test로 FollowNotification concrete global ID round trip, `Notification` inline fragment, 여러 concrete Node ID batch 결과 순서, typename mismatch에서 다른 loader를 추론하지 않는 동작, hidden row의 `null`, 기존 UUIDv8 Notification fixture, 현재 membership role 전체, 비선택 Profile, selected Profile 부재, inactive Recipient, missing source, Recipient mismatch와 hidden Related Profile을 검증하고 generated schema/typecheck/lint를 통과시킨다.

## 4. PROD-352 권한이 있는 Profile의 알림 목록 API를 제공한다

- [x] 4.1 `Profile.notifications`에 membership 권한과 공통 visible predicate를 SQL page limit 전에 적용한 `id DESC` opaque cursor connection을 구현한다.
- [x] 4.2 API test로 FOLLOW concrete resolution, membership·비선택 Profile, inactive Recipient, ID keyset page 경계와 hidden source·Recipient mismatch·Related Profile의 pre-limit filtering을 검증한다.

## 5. PROD-351 권한이 있는 Profile의 visible Unread count API를 제공한다

- [x] 5.1 `Profile.unreadNotificationCount`에 membership 권한과 공통 visible predicate 및 `read_at IS NULL`을 적용한다.
- [x] 5.2 API test로 membership·비선택 Profile과 inactive Recipient·missing source·Recipient mismatch·hidden Related Profile·read item 제외를 검증한다.

## 6. PROD-350 권한이 있는 Profile의 Notification Read mutation을 제공한다

- [x] 6.1 `markNotificationRead(input: { id })`가 membership·공통 visible predicate와 최초 `readAt`을 보존하고 `notification`·`recipientProfile` payload 및 Read error matrix를 따르게 한다.
- [x] 6.2 API test로 없는 ID·membership 부재·hidden item, 반복·동시 Read, 최초 timestamp 보존과 visible Unread count 일관성을 검증한다.

## 7. PROD-276 ProfileFollow 생성·삭제에서 Follow 알림을 동기화한다

- [x] 7.1 `PROD-274`의 Follow Notification create 경계가 established source에서 Recipient를 파생해 idempotent insert를 직접 수행하고 테스트 전용 evaluator를 공개 계약에 추가하지 않게 한다.
- [x] 7.2 직접 Follow와 Follow Request 승인 public action이 top-level transaction을 소유하고, 새 established 관계 commit 뒤 create 경계를 같은 request에서 await하며 저장 실패에도 source action 성공을 보존하게 한다. pending request 생성과 기존 relation 재사용에는 호출하지 않는다.
- [x] 7.3 정상 ProfileFollow 삭제 transaction commit 뒤 delete-by-source port를 같은 request에서 await하고 cleanup 실패가 Unfollow 성공을 바꾸지 않게 한다.
- [x] 7.4 동일 source integration 재진입과 정상 delete는 idempotent하게 만들고 사용자 duplicate Follow는 integration을 다시 호출하지 않으며 materialized Remote Follower도 origin 분기 없이 같은 port를 사용하게 한다.
- [x] 7.5 action test로 직접 Follow와 승인에서 실제 Notification row의 새 established 생성, pending·기존 relation 재사용·duplicate 제외, Local Follower와 정상 cleanup을 검증하고 테스트 전용 callback, fire-and-forget, outbox/message queue, retry, backfill을 추가하지 않으며 이 slice가 ActivityPub ingress를 중복 구현하지 않았는지 확인한다.

## 8. PROD-277 알림 목록 화면과 항목 읽음·Profile 이동 흐름을 제공한다

- [x] 8.1 구현 전에 정상 item의 loading/error/empty/read 상태, activation과 Read/navigation 순서, fetch·refresh·pagination·Profile 전환 cache 선택을 결정하고 `notification` requirements/design/decisions를 갱신한다.
- [x] 8.2 갱신된 계약에 따라 `/notifications` placeholder를 selected Profile connection을 사용하는 공유 Expo Router/Relay 화면으로 교체한다.
- [x] 8.3 API가 반환한 visible Follow item의 Related Profile 정보만 표시하고 unavailable generic fallback, snapshot 또는 client-side filtering을 추가하지 않는다.
- [x] 8.4 Storybook story와 interaction/a11y test로 결정된 loading/error/empty/unread/read/긴 텍스트/pagination/Profile 전환과 Read/navigation 흐름을 검증한다.
- [x] 8.5 app check, Relay compiler, Storybook build/test를 통과시키고 결정된 Android/iOS/Web smoke 항목을 확인한다.
- [x] 8.6 `알림` 제목과 disabled 설정 placeholder, 탭·section heading 없는 단일 목록, Figma Like 위계를 적용한 Follow 행으로 화면을 정렬하고 Web refresh action을 제거하되 native pull-to-refresh는 유지한다.
- [x] 8.7 Storybook interaction/a11y로 header·설정 placeholder·Web refresh action 부재·Follow 행 링크를 검증하고 app check, Storybook test/build와 platform smoke를 다시 통과시킨다.

## 9. PROD-324 모든 알림 셸 진입점에 Profile별 Unread badge를 제공한다

**Deliverable**

Android/iOS와 Web의 모든 지원 셸 알림 진입점이 selected Profile의 서버 제공 Unread count를 접근 가능하고 Profile 격리된 아이콘 badge로 표시한다.

**Guardrails**

- 기존 셸 label, row/touch target, route와 breakpoint 구조를 바꾸지 않고 알림 아이콘에만 badge를 overlay한다.
- Notification 목록 길이, hidden item 또는 client visibility 판정으로 count를 계산하거나 보정하지 않는다.
- 자동 foreground/reconnect listener, `NetInfo`, Push/realtime과 PROD-372가 소유하는 Read mutation/cache orchestration을 추가하지 않는다.

**Verification**

- 하단 탭 바, 모바일 drawer, Web compact/full sidebar에서 count formatting과 하나의 accessible navigation entry를 검증한다.
- 최초 loading/count-only error의 badge 숨김과 전용 retry 부재, 같은 Profile의 마지막 성공값, Profile 전환 격리와 normalized Relay Profile count 반영을 검증한다.

- [x] 9.1 shell surface, count cap, 접근성, loading/error/stale, app lifecycle과 Profile 전환 cache 선택을 결정하고 `web-app-shell` delta 및 관련 design/decisions를 추가한다.
- [x] 9.2 전체 셸 query의 Suspense/Error boundary와 분리된 non-suspending count controller와 공용 badge 표시 경계를 만들고, 모든 지원 shell 알림 아이콘이 selected Profile의 서버 제공 `unreadNotificationCount`를 표시하며 Profile 전환 시 다른 Recipient count를 재사용하지 않게 한다.
- [x] 9.3 normalized `Profile.unreadNotificationCount` 변경을 모든 셸 surface가 반영하고 기존 actor revision/refetch에서 서버 count로 수렴하게 하되 Read updater, speculative decrement와 hidden item client 보정 로직을 만들지 않는다.
- [x] 9.4 formatter/state 단위 test와 Storybook interaction/a11y·Relay cache test로 mobile/drawer/compact/full, 0/1/99/100, 실제 count를 사용하는 접근성 이름, Profile 전환, 기존 lifecycle, loading/error/stale와 count 일관성을 검증한다. 최초 count-only 실패에는 badge와 전용 retry control이 없고, 성공 count `7` 뒤 같은 Profile의 count 조회 실패에도 셸 진입점과 `7` badge가 유지되며 다음 기존 refresh에서 수렴하는 회귀 test를 포함한다. app check·Relay compiler·Storybook build/test를 통과시킨다.

## 10. PROD-380 ActivityPub inbound Follow/Undo를 Follow Notification lifecycle에 연결한다

- [x] 10.1 verified inbound Follow/Undo concrete handler가 caller-supplied direction 없이 Profile origin pair에서 flow를 파생하는 공통 core public action에 relation/request/count transaction과 exact-row 경쟁 보호를 위임하고 Fedify adapter에 relation mutation이나 Notification 호출을 중복 구현하지 않게 한다.
- [x] 10.2 OPEN 신규 established relation commit 뒤 같은 request에서 Follow Notification create를 await/catch하고, APPROVAL_REQUIRED pending·existing relation·duplicate/concurrent Follow에는 lifecycle을 실행하지 않게 한다.
- [x] 10.3 inbound Undo가 established relation을 실제 삭제한 commit 뒤에만 같은 source Notification delete를 await/catch하고, pending request 삭제와 relation 삭제 no-op에는 cleanup을 실행하지 않게 한다.
- [x] 10.4 production listener → concrete Follow/Undo handler → core action → DB/Notification integration test로 신규 생성, duplicate/concurrent no-op, pending-only, established cleanup과 pending/no-op cleanup 제외를 검증한다.
- [x] 10.5 Notification create/delete 실패가 relation/request/count transaction과 ActivityPub handler 성공을 rollback하지 않는지 검증하고 core/Fedify test, typecheck와 strict OpenSpec validation을 통과시킨다.

## 11. PROD-271 Local Follow Web E2E와 OpenSpec archive를 완료한다

- [ ] 11.1 모든 선행 slice가 merge되고 scoped validation을 통과했는지 확인한 뒤 Local Account/Profile A/B와 실제 Follow/Unfollow action을 사용하는 Web E2E fixture를 준비한다.
- [ ] 11.2 Follow 뒤 Recipient selected Profile 목록에 visible unread item이 나타나고 badge가 증가하며 다른 selected Profile UI/cache에는 섞이지 않는지 검증한다.
- [ ] 11.3 item의 Read·Related Profile 이동·반복 Read와 정상 Unfollow 뒤 목록/count/Node/Read cleanup을 end-to-end로 검증한다.
- [ ] 11.4 `PROD-380` production ActivityPub integration evidence, workspace required checks, canonical Notification 문서와 delta spec sync, 전체 task 완료 및 `openspec validate add-in-app-notifications --strict`를 확인한다.
- [ ] 11.5 proposal 전체 scope가 완료된 뒤 change를 archive하고 archive 후 strict validation을 통과시키되 `PROD-327`, `PROD-328`, delivery queue/retry, Push/realtime, ActivityPub transport 재구현과 remote network E2E를 archive gate로 끌어오지 않는다.
