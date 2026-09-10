## Context

현재 `packages/core/services/notification.ts`가 Follow, FollowRequest, Reaction, Repost, Reply 등 현재
runtime Notification을 저장하고 `packages/core/db`가 Recipient Profile과 Read State를 소유한다. 이
Notification은 source lifecycle과 visibility 정책에 따라 post-commit effect로 materialize되며, 기존 인앱
조회·Read 계약은 새 transport에서도 정본으로 유지해야 한다.

`apps/app`은 Expo Router, React Native와 Relay를 공유하고 native session token을 SecureStore에서 복원한다.
현재 native FCM registration과 OS Push tap 경계는 없으므로 권한 안내, token 등록, OS 표시와 route 이동을
새 native 경계로 연결해야 한다. `apps/worker`는 Activity registry와 Temporal Workflow로 commit 이후 효과를
실행하고, 기존 core service는 commit 결과와 effect 실패를 분리한다.

## Goals / Non-Goals

**Goals:**

- Account의 모든 Profile과 현재 로그인되어 OS 알림을 허용한 모든 앱 설치에 Recipient를 식별한 Push를 전달한다.
- native 권한 안내·OS banner·token lifecycle·cross-profile tap을 기존 Account, Profile, Notification 권한과
  연결한다.
- 원본 Notification lifecycle, Read State와 Provider 실패를 분리하고, 24시간 expiry·no backlog·privacy
  경계를 실제 검증 가능한 흐름으로 만든다.
- PROD-912, PROD-913, PROD-914의 구현·검증 결과를 PROD-875의 Android·iOS 종단 간 evidence로 합친다.

**Non-Goals:**

- Web Push, 마케팅 broadcast, in-app Push preference UI/API와 custom in-app foreground banner
- 미래 Notification generator·PROD-911 Mention 생성·통합 자체의 구현
- 기존 Notification Type, Read State, Mute·Block·visibility 정책의 재설계
- 정확한 GraphQL operation 이름, REST endpoint, DB table/field, FCM SDK, retry 수치 또는 provider workflow
  설정을 이 OpenSpec에서 고정하는 것
- 과거 Notification unread backlog의 replay나 provider accepted를 실제 기기 도착으로 해석하는 것

## Implementation Guidance

### Current Constraints

- Notification 생성기는 `packages/core/services/notification.ts`와 Reply service에 분산되어 있고, source
  visibility와 Recipient 관계를 각 service가 판정한다. Push 대상 선택을 별도 Type 목록으로 복제하면 현재
  runtime 범위와 drift가 발생한다.
- 현재 runtime의 Notification generator는 `createFollowNotification`, `createFollowRequestNotification`,
  `createReactionNotification`, `createRepostNotification`, `createReplyNotification`의 5개다. Reader에서 이
  5개가 각각 `profileFollowPairWorkflow`, `reactionCreateEffectsWorkflow`, `postRepostWorkflow`,
  `postCreateEffectsWorkflow`의 기존 Activity로 실행되는 것을 확인했으며, 이 목록은 현재 integration inventory이지
  닫힌 type 목록이 아니다. 향후 canonical Notification은 해당 domain owner가 필요한 생성·source·표시·target
  계약을 연결한 저장 성공 결과로 같은 공통 전달 flow에 진입해야 하며, source별 Push 전달 lifecycle을 복제하지 않는다.
- Notification DB row의 `recipientProfileId`, `kind`, `sourceId`, `createdAt`은 기존 인앱 lifecycle의
  일부다. Push가 이를 Read mutation이나 별도 Notification row로 대체해서는 안 된다.
- `apps/worker/src/activities.ts`가 production Activity registry이고, 기존 Worker Workflow는 post-commit
  effects를 실행한다. Provider 호출을 원본 transaction 안에 넣으면 provider 장애가 Notification 생성에
  전파될 수 있다.
- Post·repost·reaction service는 원본 transaction 뒤 기존 Workflow start를 시도하고 실패를 관측하지만, follow
  pair는 기존 `executeUpdateWithStart` 경계를 사용한다. Reader에서 Notification materialization 전 Workflow
  start 실패를 위한 전역 repair나 outbox는 확인되지 않았다. 이 change는 이 기존 start-failure 경계를 보존하고
  전역 repair/reconciliation을 새 범위로 확장하지 않는다.
- `apps/app`의 native Relay 요청은 SecureStore session token과 API origin을 사용한다. Push registration과
  tap revalidation은 이 인증 경계를 우회하거나 client bundle에 service credential을 포함할 수 없다.
- FCM accepted·queued 결과만으로 Android·iOS OS 도착을 확인할 수 없다. signed build와 실제 device arrival
  evidence를 provider response·workflow success와 분리해야 한다.
- FCM notification message와 optional data는 background OS 표시와 tap metadata에 사용할 수 있지만, foreground
  표시 동작은 앱 callback에 의존한다. FCM payload에는 4096-byte 상한이 있으므로 정확한 body excerpt를
  Provider handoff 전에 구성·redact해야 한다([FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)).
- iOS silent/data-only background delivery는 terminated 상태에서 보장되지 않으므로, OS 표시 전에 앱이 서버에서
  body를 fetch해야 한다는 설계를 전제할 수 없다([FCM iOS receive messages](https://firebase.google.com/docs/cloud-messaging/ios/receive-messages)).
- 현재 Expo Notifications 문서는 Android의 FCM과 iOS의 APNs 연동을 모두 안내한다([Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)).
  두 플랫폼의 FCM registration·event 경계를 직접 다뤄야 하는 경우의 구현 후보는 React Native Firebase Messaging과
  Expo Notifications의 조합이지만, 정확한 SDK 선택·구성은 이 change에서 고정하지 않는다. 두 계층이 token을
  중복 등록하거나 foreground notification을 이중 표시하지 않는지 통합 검증이 필요하다.

### Recommended Approach

이 안내는 비규범적 기본 경로다. 구현자는 specs와 독립적으로 확인된 decisions를 만족하는 범위에서 조정할
수 있다.

1. **서버 registration 경계:** 기존 인증된 API와 core service 정책에 설치 소유권, platform, token 상태와
   등록·갱신·해제 lifecycle을 연결한다. 권장 모델은 앱 설치마다 stable installation identity를 두고 현재
   authenticated session에 binding하며, token refresh는 같은 installation을 갱신하고 logout·revoke·account
   switch는 기존 auth/revoke semantics로 소유권을 폐기하는 것이다. 이 모델은 비규범적 권장사항이며 새 API
   shape나 preference registry를 추가하지 않는다. Recipient Profile과 eligible installation을 현재 Account
   membership, OS 허용 상태와 기존 Notification visibility 정책에서 계산하고, token은 서버 저장 경계에서만
   Provider 전달에 사용한다. operation 이름과 저장 schema는 고정하지 않는다. 동시 logout·re-register,
   account switch, token refresh에서 다른 Account가 token을 소유하지 않는지 security/concurrency를 검증한다.
2. **native 권한과 표시:** 로그인된 첫 실행에서 installation-local 안내 상태를 관찰하고 `알림 받기` CTA에서만
   OS 권한 요청을 시작한다. 권한 상태가 허용된 뒤 native FCM token을 등록·갱신하고, OS native notification
   surface가 foreground banner와 background·terminated 수신을 담당하도록 한다. 일반 앱 lifecycle과 logout/
   account switch를 registration lifecycle에 연결한다.
3. **tap routing:** Push payload에는 Recipient Profile과 target을 다시 조회할 수 있는 최소 식별 정보를 둔다.
   앱은 현재 Account 권한을 서버에서 재검증한 뒤 Profile 전환과 route 이동을 수행하고, 삭제·접근 불가 target은
   접근 가능한 Notification 목록으로 수렴한다. logged-out tap은 일반 login으로 수렴하고 원래 target을 보존하지
   않는다.
4. **공통 post-commit delivery flow:** canonical Notification materialization이 성공한 결과를 하나의 공통
   전달 lifecycle 경계로 넘겨 installation별 target 계산과 Provider 전달을 수행한다. 현재 source Workflow가 이
   flow를 호출할 수 있고, 향후 generator도 domain owner가 연결한 저장 성공 결과를 같은 flow로 넘긴다. 어떤
   경우에도 Notification row가 실제로 materialize되기 전에 Provider 전달을 시작하지 않는다. Provider handoff
   전에 Recipient 권한과 sensitive·Content Warning redaction을 적용한 sender·type·body preview와 tap
   metadata를 구성하고 payload 크기를 검증한다. OS가 background에서 표시할 수 있는 메시지 형태를 사용하되,
   receive-time 앱 permission check나 iOS terminated data-only fetch를 표시 전제 조건으로 삼지 않는다.
   attempt마다 최초 Notification 생성 시각의 24시간 expiry와 eligible target을 판정하고 Provider TTL/APNs
   expiration도 남은 원본 수명 안에서 계산한다. 설치별 idempotency/dedup와 provider outcome을 보존하고,
   invalid/unregistered token 결과는 registration lifecycle cleanup으로 넘기며, 실패가 원본 Notification
   transaction을 바꾸지 않도록 한다. 정확한 API·workflow·activity shape는 고정하지 않으며, 기존 source
   Workflow start가 Notification materialization 전에 실패하면 현재 start-failure 관측 경계를 유지하고, 이
   change는 전역 repair/reconciliation을 보장하거나 새 범위로 확장하지 않는다.
5. **증거 수집:** unit/integration 검증은 registration ownership, payload redaction, expiry, no backlog,
   read independence, retry/dedup와 post-commit isolation을 확인한다. 별도 signed Android·iOS 검증은
   permission CTA, foreground/background/terminated, cross-profile, inaccessible, logged-out, token refresh와
   실제 device arrival을 확인하고 Provider accepted evidence와 나란히 기록한다.

### Allowed Alternatives

- registration은 기존 GraphQL boundary의 authenticated operation으로 제공할 수 있고, 기존 API의 다른
  authenticated boundary가 동일한 ownership·error·privacy 계약을 더 잘 보존하면 그 경로도 허용한다.
- delivery 실행은 기존 Temporal Activity/Workflow를 확장하거나 동등한 durable worker 경계를 사용할 수 있다.
  어느 경로든 commit 이후 실행, installation별 결과, retry·dedup, 24시간 expiry, invalid token cleanup과
  원본 실패 격리를 보존해야 한다.
- FCM payload는 OS 표시용 notification/data 조합을 사용할 수 있다. 선택한 메시지 형태는 sender·type·body
  redaction·Recipient Profile·tap routing을 만족해야 한다.
- Native client는 React Native Firebase Messaging, Expo Notifications 또는 기존 앱의 동등한 native 경계를
  조합할 수 있다. Expo Notifications가 안내하는 iOS APNs token만으로는 이 capability가 요구하는 direct FCM
  registration/token 계약을 충족하지 않으므로, Expo Notifications를 OS presentation·permission·tap에 사용하면
  RNFirebase Messaging 같은 Firebase Messaging bridge(또는 동등한 bridge)가 FCM token·event 경계를 소유해야
  한다. 선택한 경로는 권한·token·foreground 표시·tap ownership을 하나의 경계로 정하고, 이중 표시가 없음을
  실제 signed Android·iOS build에서 확인해야 한다.
- installation-local 안내 상태는 현재 native storage 관례에 맞는 durable client storage를 사용할 수 있다.
  구현은 same-install close/deny/update 반복 억제와 OS Settings 이동을 보존해야 한다.

### Known Traps

- selected Profile 또는 가장 최근 token 하나만 선택해 다른 Profile·설치의 Push를 누락시키는 것
- 새 설치·권한 허용 뒤 기존 unread Notification을 backlog로 재생하는 것
- 현재 Read State를 send/retry gate로 사용하거나 Push delivery에서 Read mutation을 실행하는 것
- Provider accepted·queued를 실제 device arrival 또는 절대적 retract 증거로 저장하는 것
- data-only payload를 사용해 terminated iOS 앱이 표시 직전에 서버에서 body를 fetch할 수 있다고 가정하는 것
- Provider handoff 뒤 OS permission을 다시 검사해 OS가 표시하지 않을 것을 보장한다고 주장하는 것
- 4096-byte Provider payload 상한과 최초 Notification 생성 시각부터 남은 TTL을 무시하는 것
- service credential, FCM token 또는 authorized private body를 client bundle·일반 로그·analytics에 남기는 것
- sensitive·Content Warning body를 sender/type/Recipient Profile까지 함께 숨기거나, 권한 없는 private body를
  payload에 넣는 것
- OS 권한을 앱 시작·로그인 완료 때 자동으로 요청하거나 foreground에 별도 custom in-app banner를 만드는 것
- retry가 최초 Notification 생성 후 24시간을 넘기거나 Provider 호출을 원본 Notification transaction에 결합하는 것
- 현재 runtime type 목록을 별도 whitelist로 복제하거나 PROD-911 Mention generator를 선행 구현하는 것
- 삭제·접근 불가 target 외의 상태에서 임의의 old-valid/duplicate 자동 목록 fallback을 추가하는 것

## Risks / Trade-offs

- [Provider 도착 불확실성] FCM accepted는 실제 기기 도착을 증명하지 않는다 → provider response, workflow
  result, signed device arrival evidence를 별도 관측하고 보고한다.
- [다중 Profile·설치 fan-out 비용] 한 Notification이 여러 token으로 확장되어 부분 실패가 발생할 수 있다 →
  installation별 dedup, bounded retry와 partial/terminal outcome을 유지한다.
- [OS 상태 drift] 사용자가 OS 설정을 앱 밖에서 바꿀 수 있다 → client가 관찰 가능한 permission 상태를
  동기화하고 서버 registration 자격을 다시 평가한다.
- [payload 개인정보와 유용성의 균형] body preview는 유용하지만 잠금 화면에 노출될 수 있다 → sensitive/CW
  redaction, Recipient 권한 확인과 로그·analytics 비기록을 함께 검증한다.
- [no backlog 선택] 새 설치가 과거 unread를 받지 않는다 → registration 이후 생성 시각 경계를 명시적으로
  관측하고 인앱 Notification lifecycle은 그대로 보존한다.

## Migration Plan

1. Account-owned installation/token registration과 Provider credential의 server-only 경계를 additive하게
   도입하고, 기존 Notification과 인앱 조회·Read에는 영향을 주지 않는다.
2. Android·iOS client를 signed build에 연결해 권한 안내, CTA, OS Settings 이동, token registration과 tap
   routing을 먼저 검증한다. 기존 session/logout/account switch 경계를 함께 확인한다.
3. Provider delivery와 retry/cleanup을 commit 이후 경계에 연결하고, provider fake·integration 검증 뒤 실제
   Android·iOS 설치에서 foreground/background/terminated와 cross-profile flow를 확인한다.
4. 실패 시 Provider delivery/registration 경계를 중지하거나 이전 client build로 되돌릴 수 있어야 하며,
   canonical Notification row·Read State·인앱 lifecycle은 rollback으로 삭제·재생하지 않는다. 새 설치·권한
   허용 이전 Notification backlog를 migration으로 backfill하지 않는다.

## Open Questions

- 설치 registration의 정확한 API operation과 저장 schema, 그리고 기존 API/core ownership 경계를 구현 전에
  결정해야 한다. stable installation identity를 현재 session에 binding하고 기존 auth/revoke semantics를
  재사용하는 권장 모델을 기준으로, 동시 logout·re-register·account switch·token refresh의 소유권 security와
  concurrency를 검증한다.
- FCM service credential 주입 위치, provider SDK와 native client SDK 구성 선택, retry/backoff 수치와 운영 관측
  필드는 구현 slice의 security·operations review에서 결정해야 한다. 후보 조합을 채택할 경우 RNFirebase
  Messaging과 Expo Notifications 간 token·foreground presentation·tap 중복 경계를 먼저 확인한다.
- 기존 source Workflow가 Notification materialization 전에 시작 실패하는 경계는 현재 관측 방식으로 유지한다.
  전역 repair/reconciliation은 범위 밖으로 두고, 공통 전달 flow가 materialization 뒤 복구 불가능한 추가
  post-commit 외부 start window 없이 실행되는지 확인한다.
- Android·iOS의 OS permission 상태 읽기·설정 이동 API와 signed-build evidence 수집 방식은 native slice에서
  결정해야 한다.
- 게시글 body excerpt의 길이·자르기 규칙은 ADR 0029의 남은 결정이며 현재 Push contract의 blocker가 아니다.
