## 1. PROD-912 Account 설치 registration과 shared Domain/OpenSpec Gate

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0029-native-push-notification-policy.md`
- `docs/design/notifications.md`
- `PROD-875`
- `PROD-912`

**Deliverable**

인증된 Account가 외부 installation ID 없이 새 registration row를 발급하고 반환된 server-issued
`PushInstallation` GlobalID로 현재 Account가 소유한 FCM token을 갱신·해제하며, 등록 당시 연결된 `sessionId`는
lifecycle association으로 유지하고 요청 Session으로 재바인딩하지 않는다. 모든 Profile·eligible
installation·Recipient Profile·privacy·expiry·no-backlog·Read State 경계를 sibling 구현이 공유할 수 있는
server 계약과 lifecycle을 제공한다.

**Guardrails**

- 다른 Account의 설치·token을 등록하거나 변경하지 않는다.
- selected Profile 또는 most-recent installation으로 수신 범위를 줄이지 않는다.
- logout·account switch·Account deletion·명시적 해제·일치하는 invalid/unregistered token은 installation row와 token을 즉시 삭제해 이후 신규 전달의 eligibility를 정리한다.
- 최초 registration은 새 row ID를 반환하고, update는 반환된 ID와 인증된 현재 Account 소유권만 확인해 row를 갱신한다. 알 수 없거나 삭제된 ID와 다른 Account 소유 ID의 update는 row 존재 여부를 노출하지 않는 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패하며, unregister는 현재 Account 소유 ID만 삭제하고 unknown·foreign ID는 `{ completed: true }`로 멱등 완료한다. 같은 Account의 다른 Session도 row를 관리할 수 있고, 등록 당시 연결된 Session의 lifecycle cleanup은 유지한다.
- 같은 Account의 새 registration이 active token을 재등록하면 기존 duplicate row를 원자적으로 삭제하고 새 row ID와 registration epoch를 만든다. 다른 Account의 active token은 거부한다.
- DB UUID PK를 `PushInstallation` GlobalID로 인코딩하고 별도 Node/query/registry를 추가하지 않는다.
- registration 이후 생성된 Notification만 전달하고 기존 unread backlog를 replay하지 않는다.
- token, credential과 private body를 repository·client bundle·일반 로그·analytics에 기록하지 않는다.
- PROD-913과 PROD-914는 이 shared Gate 승인 후 착수하며, 912의 Provider integration 전체 완료를 서로의 선행 조건으로 만들지 않는다.

**Verification**

- Account ownership·다중 Profile·다중 installation의 등록·갱신·해제 동작 및 권한 실패를 실행 검증한다. register의 server-issued ID 반환, update의 Account-only 제한과 same-Account 다른 Session 허용, unknown·deleted·foreign ID에 대한 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`), unregister의 unknown·foreign ID `{ completed: true }`와 삭제 ID의 비재생성·late unregister 무효화를 포함한다.
- Session `REVOKED`·`EXPIRED`, Account 삭제의 기존 정리 순서와 Account 비활성의 auth·eligibility exclusion, explicit unregister와 matching/stale invalid-unregistered token 뒤 실제 row 삭제 및 신규 delivery eligibility를 확인한다.
- registration 시점 전후 Notification과 Read State를 사용해 no-backlog·expiry·read independence 경계를 검증한다.
- 인증·payload·token 개인정보가 로그와 analytics에 남지 않는지 관측 결과를 확인한다.

- [x] 1.1 shared Domain/OpenSpec Gate에서 Account·Profile·installation·token ownership과 신규 전달 eligibility를 승인된 계약으로 연결한다.
- [x] 1.2 인증된 Account의 server-issued ID registration·refresh·unregister lifecycle을 구현하고 다른 Account 접근은 거부하되 같은 Account의 다른 Session 관리는 허용한다. 등록 당시 연결된 Session의 lifecycle cleanup은 유지한다.
- [x] 1.3 logout·account switch·Account deletion·provider invalid/unregistered 결과를 이후 신규 전달 자격 정리와 연결한다.
- [x] 1.4 registration 이후 생성된 Notification만 대상이 되도록 no-backlog 경계를 구현하고, expiry·Read State와 충돌하지 않음을 검증한다.
- [x] 1.5 token·credential·private body 저장·관측 경계를 확인하고 PROD-913/914가 사용할 shared Gate evidence를 남긴다.

## 2. PROD-913 Android·iOS 권한·token·tap 연결

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0029-native-push-notification-policy.md`
- `docs/design/notifications.md`
- `PROD-875`
- `PROD-912`
- `PROD-913`

**Deliverable**

Android·iOS signed 앱이 로그인된 첫 실행의 Push 안내와 명시적 CTA, OS 권한·token lifecycle·foreground OS
banner·background/terminated 수신·Push tap navigation을 shared server 계약에 맞춰 제공한다.

**Guardrails**

- OS 권한 대화상자는 `알림 받기` action에서만 시작하고 앱 시작·로그인 완료에서 자동으로 열지 않는다.
- 같은 설치에서 안내 close·permission deny·일반 update 뒤 자동 안내를 반복하지 않으며, in-app Push switch/preference API를 만들지 않는다.
- foreground에서도 OS banner를 사용하고 custom in-app Push banner를 추가하지 않는다.
- cross-profile tap은 현재 Account의 Recipient Profile 접근을 재검증한 뒤 Profile 전환·target 이동을 수행한다.
- 삭제·접근 불가 target은 접근 가능한 Notification 목록만 열고 toast·message를 표시하지 않는다.
- logged-out tap은 target을 버리고 일반 login으로 수렴하며 login 뒤 target을 자동 복귀하지 않는다.
- Provider handoff 뒤 OS 표시를 보장하기 위한 receive-time permission check나 terminated iOS data-only fetch를 전제로 하지 않는다.

**Verification**

- Android·iOS signed build에서 신규 login·이미 로그인된 첫 실행, CTA close·deny·update와 OS Settings 이동을 확인한다.
- foreground·background·terminated 수신과 OS banner, native token registration·refresh·unregister를 실제 기기에서 확인한다.
- cross-profile valid target, deleted/inaccessible target, logged-out tap을 각각 실제 기기에서 확인한다.
- Provider accepted·workflow success와 실제 device arrival evidence를 별도로 기록한다.

- [ ] 2.1 로그인된 첫 앱 실행의 안내, 명시적 `알림 받기` CTA, close·deny·update 반복 억제와 OS Settings 이동을 구현한다.
- [ ] 2.2 OS permission 상태에 따라 native FCM token registration·refresh·unregister를 PROD-912 lifecycle에 연결한다.
- [ ] 2.3 foreground OS banner와 background·terminated 수신을 연결하고 custom in-app Push banner를 추가하지 않는다.
- [ ] 2.4 Push tap의 Account/Recipient Profile 권한 재검증, cross-profile 전환·target 이동, deleted/inaccessible 목록 fallback을 구현한다.
- [ ] 2.5 logged-out tap의 일반 login 수렴과 target 폐기를 구현하고 Android·iOS signed device evidence를 수집한다.

## 3. PROD-914 canonical Notification FCM 전달

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0029-native-push-notification-policy.md`
- `docs/design/notifications.md`
- `PROD-875`
- `PROD-912`
- `PROD-914`
- [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)
- [FCM iOS receive messages](https://firebase.google.com/docs/cloud-messaging/ios/receive-messages)

**Deliverable**

원본 Notification commit 이후 현재 runtime의 모든 Notification을 eligible Profile·installation token에
비동기로 전달하고, 권한 기반 payload redaction, expiry·retry·dedup·partial/terminal 결과, invalid token
cleanup과 운영 관측을 제공한다.

**Guardrails**

- 현재 runtime을 별도 Type whitelist로 복제하거나 미래 generator·Mention을 추가하지 않는다.
- 기존 Mute·Block·visibility·ownership·조회 권한 semantics를 Push target selection에 적용한다.
- sender·type·Recipient Profile을 유지하고, bodyless Notification의 post excerpt를 생략한다.
- sensitive·Content Warning body는 OS 표시에서 가리고, 권한 확인된 authorized private body는 표시하며, token·credential·private body를 일반 로그·analytics에 기록하지 않는다.
- Provider handoff 전에 권한·redaction을 적용하고 payload는 Provider의 documented size limit을 넘지 않게 한다.
- retry·backoff·Provider TTL/APNs expiration은 최초 Notification 생성 시각부터 남은 24시간을 넘기지 않는다.
- Read State를 send/retry gate 또는 cancel 조건으로 사용하지 않고, Push delivery가 Read State를 변경하지 않는다.
- Provider accepted·queued를 actual device arrival 또는 absolute retract evidence로 취급하지 않는다.
- Provider 실패가 원본 Notification transaction·인앱 흐름을 rollback하거나 실패시키지 않는다.

**Verification**

- 현재 runtime Notification의 모든 생성 경로와 Profile·installation fan-out, 기존 억제·권한 경계를 실행 검증한다.
- 일반·bodyless·sensitive/CW·authorized private payload와 token/private body 비로그·비analytics 경계를 검증한다.
- FCM payload size, original-created-at expiry, remaining provider TTL, retry/backoff, dedup, partial/terminal outcome을 검증한다.
- Provider fake/response evidence와 Android·iOS signed device arrival evidence를 분리한다.
- original Notification commit 성공과 Provider failure/retry를 독립적으로 확인하고 Read State가 변하지 않음을 검증한다.

- [ ] 3.1 현재 5개 generator(`createFollowNotification`, `createFollowRequestNotification`, `createReactionNotification`, `createRepostNotification`, `createReplyNotification`)가 공통 전달 flow에 연결되는 현재 inventory를 확인하고, 향후 canonical type도 domain owner가 연결한 저장 성공 결과로 같은 flow에 진입할 수 있도록 기존 Recipient·Mute·Block·visibility 정책과 연결해 eligible target을 계산한다.
- [ ] 3.2 sender·type·Recipient Profile·body preview payload를 권한·sensitive/CW redaction과 bodyless 규칙에 맞춰 구성하고 Provider handoff 전에 크기를 검증한다.
- [ ] 3.3 Notification materialization 뒤 Provider 전달을 시작하고, 원본 Notification 실패 격리와 installation별 success·transient·timeout·rate limit·partial·terminal 결과를 구현한다. 복구 불가능한 추가 post-commit 외부 start window를 만들지 않는다.
- [ ] 3.4 최초 Notification 생성 시각 기준 24시간 expiry, retry/backoff·dedup와 no-backlog registration 경계를 구현한다.
- [ ] 3.5 invalid/unregistered token 결과를 PROD-912 cleanup 경계로 연결하고 token·credential·private body 비노출 관측을 검증한다.
- [ ] 3.6 Read State 독립성, Provider accepted/queued와 actual arrival 분리, 원본 commit 실패 격리를 실행 검증하고, 기존 source Workflow가 Notification materialization 전에 시작 실패하는 관측 경계를 별도로 기록한다.

## 4. PROD-875 Android·iOS 종단 간 통합과 archive

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0029-native-push-notification-policy.md`
- `docs/design/notifications.md`
- `PROD-875`
- `PROD-912`
- `PROD-913`
- `PROD-914`

**Deliverable**

세 child의 scoped validation을 하나의 Android·iOS signed-build 종단 간 결과로 통합하고, 전체 declared scope와
OpenSpec requirements가 충족된 뒤 change archive를 소유한다.

**Guardrails**

- PROD-912 shared Gate 승인과 child별 결과를 선행 조건으로 확인한다.
- Provider accepted·workflow success·actual device arrival·OS permission 상태를 하나의 성공 주장으로 합치지 않는다.
- Push 실패가 canonical Notification 생성·조회·Read 또는 기존 in-app lifecycle을 rollback하지 않는다.
- 현재 PROD-875 scope 밖의 Web Push, marketing broadcast, future generator·PROD-911 generator 자체 구현과 in-app preference를 검증 scope에 추가하지 않는다.
- 개별 child 완료만으로 전체 change archive를 주장하지 않으며 PROD-875가 남은 cross-slice evidence와 archive를 소유한다.

**Verification**

- Android·iOS 각각에서 permission CTA·OS Settings·foreground/background/terminated·token refresh·logout/account switch를 확인한다.
- all Profile·all eligible installation fan-out, body privacy, cross-profile/inaccessible/logged-out tap, expiry/no-backlog/read independence를 확인한다.
- Provider fake/accepted·retry·failure evidence와 실제 signed device arrival을 분리해 기록한다.
- `openspec validate add-native-fcm-push-notifications --strict`와 repository의 관련 lint/type/test/build checks를 통과시킨다.
- 전체 declared scope가 완료되고 canonical·Linear·OpenSpec 정합성이 재확인된 뒤에만 archive한다.

- [ ] 4.1 PROD-912 Gate와 세 child의 implementation/scoped validation evidence를 기준 branch에서 수집한다.
- [ ] 4.2 Android signed build에서 권한·token·foreground/background/terminated·tap·multi-profile/multi-installation 시나리오를 실행한다.
- [ ] 4.3 iOS signed build에서 같은 시나리오와 iOS FCM–APNs/device arrival evidence를 실행한다.
- [ ] 4.4 Provider accepted·workflow·arrival·privacy·failure evidence를 cross-slice 결과로 통합하고 기존 Notification lifecycle 회귀를 확인한다.
- [ ] 4.5 전체 requirements와 task verification을 대조해 OpenSpec change를 archive할 completion package를 준비한다.
