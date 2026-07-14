## 1. PROD-325 Notification 단일 테이블 스키마와 조회 인덱스를 도입한다

- [ ] 1.1 `Notifications`의 미사용 UUID v8 discriminator, `notification_kind`의 `FOLLOW` 값과 단일 `notification` Drizzle table/export/relation을 추가한다.
- [ ] 1.2 Recipient Profile FK/cascade, FK 없는 `source_id`, `data jsonb NOT NULL DEFAULT '{}'`, `(kind, source_id, recipient_profile_id)` unique constraint, Recipient 목록 index와 Unread partial index를 additive migration에 반영한다.
- [ ] 1.3 migration/DB integration test로 Recipient FK, kind/data default, 직접 duplicate source 거부, `id DESC` index와 Unread partial index를 검증한다.
- [ ] 1.4 DB schema check와 migration 검증으로 `notification_follow`, source FK, cleanup trigger, deferred integrity, 미래 kind/data와 GIN index가 선제 추가되지 않았는지 확인한다.

## 2. PROD-274 Follow Notification의 source·Recipient 저장 경계를 제공한다

- [ ] 2.1 established `ProfileFollow`에서 Followee Recipient와 Follower Related Profile을 파생하고 Local Recipient만 허용하는 source-only create 경계를 구현한다.
- [ ] 2.2 `kind=FOLLOW`, `source_id=ProfileFollow.id`, `recipient_profile_id=Followee.id`, `data={}`인 row를 저장하고 existing source·Recipient 또는 concurrent unique conflict를 기존 item 성공이나 idempotent no-op으로 정규화한다.
- [ ] 2.3 `(kind, source_id)`를 받는 idempotent delete 경계를 구현하고 이미 없는 row도 성공한 no-op으로 정규화한다.
- [ ] 2.4 service/data-access test로 정확한 파생, Remote Recipient 거부, Local/Remote Follower, 동일 source 재호출, concurrent create와 반복 delete를 검증하고 target package check를 통과시킨다.

## 3. PROD-275 권한이 있는 Profile의 알림 목록·읽음·Unread count API를 제공한다

- [ ] 3.1 `Notification implements Node` interface와 `FollowNotification implements Notification & Node` concrete object를 추가하고 `kind = FOLLOW` type resolution, non-null `relatedProfile`, raw kind/source/data/snapshot 비노출을 구현한다.
- [ ] 3.2 `Profile.notifications`와 `Profile.unreadNotificationCount`에 role-independent Account-Profile membership 권한을 적용하고 selected Profile 부재·불일치와 API 권한을 분리한다.
- [ ] 3.3 Recipient Profile API visibility, source 존재, source Followee와 저장 Recipient 일치, Recipient Profile 기준 Related Profile visibility를 SQL page limit 전에 적용한 `id DESC` opaque cursor connection과 동일 predicate의 visible Unread count를 구현한다.
- [ ] 3.4 `markNotificationRead(input: { id })`가 membership·visible predicate와 최초 `readAt`을 보존하고 `notification`·`recipientProfile` payload 및 field/Node/Read error matrix를 따르게 한다.
- [ ] 3.5 API test로 `Notification` inline fragment와 `FollowNotification.__typename`, 현재 membership role 전체, 비선택 Profile, inactive Recipient, ID keyset page 경계, missing source·Recipient mismatch·hidden Related Profile의 list/count/Node/Read, 반복·동시 Read를 검증하고 generated schema/typecheck/lint를 통과시킨다.

## 4. PROD-276 ProfileFollow 생성·삭제에서 Follow 알림을 동기화한다

- [ ] 4.1 `PROD-281` 공용 ProfileFollow action merge 뒤 새 Local Follow 관계에 공통 Notification eligibility port와 `PROD-274` create port를 연결하고 정책 미연결 기본값을 allow로 둔다.
- [ ] 4.2 Follow transaction commit 뒤 eligibility/create를 같은 request에서 await하고 deny·fail-closed evaluator error·저장 실패를 catch해 Follow 성공을 보존한다.
- [ ] 4.3 정상 ProfileFollow 삭제 transaction commit 뒤 delete-by-source port를 같은 request에서 await하고 cleanup 실패가 Unfollow 성공을 바꾸지 않게 한다.
- [ ] 4.4 동일 source integration 재진입과 정상 delete는 idempotent하게 만들고 사용자 duplicate Follow는 integration을 다시 호출하지 않으며 materialized Remote Follower도 origin 분기 없이 같은 port를 사용하게 한다.
- [ ] 4.5 action test로 allow/deny/evaluator error, create/delete failure, duplicate/re-entry, Local/Remote Follower와 정상 cleanup을 검증하고 fire-and-forget, outbox/message queue, retry, backfill과 ActivityPub ingress가 추가되지 않았는지 확인한다.

## 5. PROD-277 알림 목록 화면과 항목 읽음·Profile 이동 흐름을 제공한다

- [ ] 5.1 구현 전에 정상 item의 loading/error/empty/read 상태, activation과 Read/navigation 순서, fetch·refresh·pagination·Profile 전환 cache 선택을 결정하고 `notification` requirements/design/decisions를 갱신한다.
- [ ] 5.2 갱신된 계약에 따라 `/notifications` placeholder를 selected Profile connection을 사용하는 공유 Expo Router/Relay 화면으로 교체한다.
- [ ] 5.3 API가 반환한 visible Follow item의 Related Profile 정보만 표시하고 unavailable generic fallback, snapshot 또는 client-side filtering을 추가하지 않는다.
- [ ] 5.4 Storybook story와 interaction/a11y test로 결정된 loading/error/empty/unread/read/긴 텍스트/pagination/Profile 전환과 Read/navigation 흐름을 검증한다.
- [ ] 5.5 app check, Relay compiler, Storybook build/test를 통과시키고 결정된 Android/iOS/Web smoke 항목을 확인한다.

## 6. PROD-324 모든 알림 셸 진입점에 Profile별 Unread badge를 제공한다

- [ ] 6.1 구현 전에 shell surface, count cap, 접근성, loading/error/stale, app lifecycle과 Profile 전환 cache 선택을 결정하고 `web-app-shell` delta 및 관련 design/decisions를 추가한다.
- [ ] 6.2 모든 지원 shell 진입점이 selected Profile의 서버 제공 `unreadNotificationCount`를 표시하고 Profile 전환 시 다른 Recipient count를 재사용하지 않게 한다.
- [ ] 6.3 Read 성공/실패/반복/동시 요청 뒤 cache가 최초 visible 전이만 반영하고 refetch에서 서버 count로 수렴하게 하며 hidden item client 보정 로직을 만들지 않는다.
- [ ] 6.4 Storybook/interaction/Relay cache test와 app check로 0/1/다수/큰 수, Profile 전환, lifecycle, loading/error/stale와 count 일관성을 검증한다.

## 7. PROD-278 Local Follow Web E2E와 OpenSpec archive를 완료한다

- [ ] 7.1 모든 선행 slice가 merge되고 scoped validation을 통과했는지 확인한 뒤 Local Account/Profile A/B와 실제 Follow/Unfollow action을 사용하는 Web E2E fixture를 준비한다.
- [ ] 7.2 Follow 뒤 Recipient selected Profile 목록에 visible unread item이 나타나고 badge가 증가하며 다른 selected Profile UI/cache에는 섞이지 않는지 검증한다.
- [ ] 7.3 item의 Read·Related Profile 이동·반복 Read와 정상 Unfollow 뒤 목록/count/Node/Read cleanup을 end-to-end로 검증한다.
- [ ] 7.4 workspace required checks, canonical Notification 문서와 delta spec sync, 전체 32개 task 완료 및 `openspec validate add-in-app-notifications --strict`를 확인한다.
- [ ] 7.5 proposal 전체 scope가 완료된 뒤 change를 archive하고 archive 후 strict validation을 통과시키되 `PROD-327`, `PROD-328`, delivery queue/retry, Push/realtime과 ActivityPub ingress를 archive gate로 끌어오지 않는다.
