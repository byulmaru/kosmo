# native-fcm-push Specification

## Purpose

현재 Notification runtime의 결과를 Account의 네이티브 Android·iOS 설치에 FCM OS Push로 전달하고, 설치
lifecycle·권한·표시·탭 이동·실패 경계를 기존 Notification 권한과 수명에 맞춰 제공한다.

## ADDED Requirements

### Requirement: 현재 Notification과 수신 대상의 공통 범위

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-914` — Push는 canonical Notification이 저장 성공한 결과부터 시작하는 공통 flow를 통해 현재 Notification runtime이 생성·제공하는 모든 Notification을 대상으로 하며, 현재 Profile Notification은 Account의 모든 Profile과 현재 Account에 로그인되어 OS 알림을 허용한 모든 앱 설치를 Recipient 단위로 식별해 전달해야 한다(MUST). 현재 runtime 유형은 닫힌 Type whitelist가 아니며, 향후 canonical Notification도 해당 domain owner가 생성·source·표시·recipient/target 계약을 공통 flow에 연결한 저장 성공 결과로 공통 수신 대상·권한·privacy·lifecycle 계약을 적용해야 한다(MUST). 향후 generator 자체의 구현은 이 change 범위에 추가하지 않는다(MUST NOT).

현재 Notification runtime이 생성·제공하는 각 Notification은 해당 Notification의 Recipient Profile을 식별하는 Push 대상과 연결되어야 한다(MUST). selected Profile이나 가장 최근 설치 하나만을 기준으로 수신 범위를 줄여서는 안 된다(MUST NOT). 기존 Notification의 Mute·Block·visibility 억제, 수신자 소유권과 현재 조회 권한 semantics는 Push 대상 선택에도 적용해야 한다(MUST).

#### Scenario: 모든 Profile과 허용된 설치로 fan-out

- **WHEN** 현재 Account에 속한 둘 이상의 Profile과 해당 Account에 로그인되어 OS 알림을 허용한 둘 이상의 앱 설치가 있고 현재 runtime Notification이 생성된다
- **THEN** 시스템은 해당 Notification의 Recipient Profile을 식별한 Push를 각 eligible 앱 설치의 활성 token에 전달 대상으로 만든다
- **AND** 현재 selected Profile이나 가장 최근 설치만을 선택해 다른 Profile 또는 설치를 제외하지 않는다

#### Scenario: canonical Notification 공통 flow 진입

- **WHEN** 저장 성공한 canonical Notification이 현재 runtime의 Follow, FollowRequest처럼 게시글 본문이 없는 유형이거나 향후 domain owner가 추가한 유형이다
- **THEN** 시스템은 해당 Notification을 domain owner가 연결한 recipient/target 정보에 따라 같은 공통 Push flow에서 수신 대상·권한·privacy·expiry·retry/dedup·failure-isolation 계약으로 처리한다
- **AND** 새 유형을 추가할 때 Push transport 전체나 source별 전달 lifecycle을 복제할 필요가 없으며, 유형별 생성 권한·source semantics·표시 처리는 해당 domain owner가 연결한다
- **AND** 향후 generator 자체의 구현이나 PROD-911 Mention 통합을 이 capability가 선행 생성하지 않는다

#### Scenario: 기존 수신 억제와 권한 적용

- **WHEN** Notification의 Recipient 소유권, 현재 조회 권한 또는 기존 Mute·Block·visibility 억제 정책이 Push 대상 선택에 적용된다
- **THEN** 시스템은 그 정책으로 억제되거나 권한이 없는 대상을 Provider 호출 대상에서 제외한다
- **AND** Push 도입을 이유로 기존 Notification 생성·조회 정책을 재설계하지 않는다

### Requirement: 설치 registration과 신규 Notification 경계

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/domain/objects/notification.md`, `PROD-875`, `PROD-912`, `PROD-914` — 인증된 Account는 자신이 소유한 Android·iOS 앱 설치와 FCM registration token을 등록·갱신·해제할 수 있어야 하며(MUST), 시스템은 서버가 발급한 installation row ID와 설치별 소유권·token lifecycle을 관리해야 한다(MUST). 최초 `registerPushInstallation(input: { platform, token })`은 외부 installation ID 없이 새 row를 만들고 `PushInstallation` GlobalID인 `id: ID!`를 반환해야 하며(MUST). `updatePushInstallation(input: { id: ID!, platform, token })`은 반환된 ID와 인증된 현재 Account가 소유한 row만 갱신해야 하며(MUST), 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 드러내지 않는 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패해야 한다(MUST). `unregisterPushInstallation(input: { id: ID! })`은 인증된 현재 Account가 소유한 해당 ID만 삭제해야 하며(MUST), 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 노출하지 않고 `{ completed: true }`로 멱등 완료해야 한다(MUST). 등록 당시 연결된 `sessionId`는 lifecycle association으로 유지하고 현재 인증 Session과 비교하거나 요청 Session으로 재바인딩해서는 안 되며(MUST NOT), 따라서 같은 Account의 다른 Session도 row를 관리할 수 있어야 한다(MUST). 등록 당시 연결된 Session의 logout/revoke와 Account deletion cleanup은 유지해야 한다(MUST). active installation row만 token을 보관해야 하며(MUST), logout·account switch·Account deletion·명시적 해제·일치하는 invalid/unregistered 결과로 폐기된 설치 registration과 token은 즉시 삭제되어 이후 신규 전달 eligible target이 아니어야 한다(MUST). stale old-token 결과는 갱신된 현재 token을 삭제해서는 안 된다(MUST NOT). 같은 Account가 새 registration으로 현재 active token을 다시 등록하면 기존 중복 row를 원자적으로 삭제하고 새 row ID와 새 registration epoch로 등록해야 하며(MUST), 다른 Account의 active token은 거부해야 한다(MUST).

대상 registration을 받은 시점을 경계로 그 이후 생성된 Notification만 해당 설치에 전달해야 한다(MUST). 새 설치, 새 device 또는 OS 권한 허용 시점에 이미 생성된 unread Notification을 backlog로 재생해서는 안 된다(MUST NOT). OS 상태 변화의 정확한 감지 시점은 이 capability가 고정하지 않으며, client는 관찰 가능한 OS 상태를 동기화한다.

#### Scenario: 자신의 설치만 등록

- **WHEN** 인증된 Account가 `registerPushInstallation`으로 platform·native FCM token을 등록한다
- **THEN** 시스템은 외부 installation ID 없이 새 row를 만들고 `PushInstallation` GlobalID인 `id`를 반환한다
- **AND** 인증된 Account가 `id: ID!`로 `updatePushInstallation`을 호출하면 현재 Account가 소유한 row만 platform·token과 함께 갱신한다
- **AND** 같은 Account의 다른 Session에서 같은 `id`로 update 또는 unregister를 호출해도 Account 소유권만 확인해 성공하며, registration 당시 연결된 `sessionId`는 요청 Session으로 바뀌지 않는다
- **AND** 알 수 없거나 삭제된 ID와 다른 Account 소유 ID의 update는 동일한 `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패하고, unregister는 `{ completed: true }`를 반환해 row 존재 여부를 노출하지 않는다
- **AND** 인증된 Account가 `id: ID!`로 `unregisterPushInstallation`을 호출하면 해당 row와 token만 삭제한다
- **AND** 다른 Account의 설치나 token을 등록·삭제하지 못하게 한다

#### Scenario: 삭제된 ID는 재생성하지 않고 늦은 해제를 무시한다

- **WHEN** registration이 반환한 `id`가 해제된 뒤 같은 Account가 다시 `registerPushInstallation`을 호출한다
- **THEN** 시스템은 새 `id`를 반환하고 새 registration epoch를 기록하며 이전 `id`를 재사용하지 않는다
- **AND** 이전 `id`를 사용하는 늦은 `unregisterPushInstallation`은 새 registration row를 삭제하지 않는다
- **AND** 이미 없는 `id`의 unregister는 멱등 완료를 반환한다

#### Scenario: registration 이후 생성된 Notification만 전달

- **WHEN** 설치 registration 또는 OS 권한 허용이 Notification 생성 시각보다 뒤에 완료된다
- **THEN** 시스템은 registration을 받은 시점 이후 생성된 Notification만 해당 설치의 전달 대상으로 만든다
- **AND** registration 이전에 생성된 unread Notification을 backlog로 재생하지 않는다

#### Scenario: 폐기된 설치의 신규 전달 무효화

- **WHEN** 등록 당시 연결된 Session이 logout/revoke 또는 Account 전환으로 폐기되거나, Account 삭제 또는 명시적 해제로 설치가 폐기된다
- **THEN** 시스템은 그 설치를 이후 신규 Notification 전달의 eligible target에서 제외한다
- **AND** 시스템은 설치 row와 opaque token을 즉시 삭제하고 삭제 전 registration epoch를 보존하지 않는다
- **AND** Provider가 이미 accepted·queued한 Push의 실제 도착 또는 회수는 이 상태 변화로 보장하지 않는다

#### Scenario: old token 무효화와 재설치 중복 정리

- **WHEN** Provider가 갱신 전 old token을 invalid 또는 unregistered로 응답하거나, 같은 Account가 새 registration으로 현재 active token을 다시 등록한다
- **THEN** old token 결과는 Account·row ID·현재 token이 모두 일치하지 않으면 아무 row도 삭제하지 않고, 같은 Account의 active duplicate는 기존 row를 원자적으로 삭제한 뒤 새 row ID로 등록한다
- **AND** 새 registration은 새 수신 시작 시각과 epoch를 사용하며 registration 이전 Notification을 backlog로 전달하지 않는다
- **AND** 다른 Account가 소유한 active token은 삭제하거나 등록하지 않는다

### Requirement: 네이티브 권한 안내와 OS 표시

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `PROD-875`, `PROD-912`, `PROD-913` — Android·iOS native 앱은 로그인된 상태의 첫 앱 실행에서 권한 안내를 표시해야 하며(MUST), 새 로그인 완료 직후와 이미 로그인된 상태의 실행을 포함할 수 있고 안내를 위해 logout·relogin을 요구해서는 안 된다(MUST NOT). OS 권한 요청은 사용자가 안내의 `알림 받기` action을 명시적으로 활성화한 경우에만 시작해야 한다(MUST).

같은 설치에서 안내를 닫거나 OS 권한을 거부한 뒤와 일반적인 앱 업데이트 뒤에는 안내를 자동으로 다시 표시해서는 안 된다(MUST NOT). Push 수신 제어는 OS 알림 설정이 소유하며, 첫 릴리스는 전역·유형별·Profile별 in-app Push switch 또는 preference API를 제공해서는 안 된다(MUST NOT). 앱 설정은 OS 알림 설정으로 이동하는 action을 제공해야 한다(MUST). Foreground에서도 OS 알림 banner를 표시해야 하며 별도 custom in-app Push banner를 추가해서는 안 된다(MUST NOT).

#### Scenario: 명시적 CTA에서만 OS 권한 요청

- **WHEN** 로그인된 상태의 첫 앱 실행에서 Push 안내를 표시한다
- **THEN** 안내 표시만으로 OS 권한 대화상자를 자동으로 열지 않는다
- **AND** 사용자가 `알림 받기` action을 활성화한 경우에만 OS 권한 요청을 시작한다

#### Scenario: 안내 반복 억제와 OS 설정 이동

- **WHEN** 사용자가 같은 설치의 안내를 닫거나 OS 권한을 거부하거나 일반적인 앱 업데이트 뒤 앱을 실행한다
- **THEN** 시스템은 Push 안내를 자동으로 다시 표시하지 않는다
- **AND** 사용자가 Push 수신 상태를 바꾸려면 앱 설정에서 OS 알림 설정으로 이동할 수 있다

#### Scenario: Foreground OS banner

- **WHEN** eligible 설치의 앱이 foreground 상태에서 Push를 수신한다
- **THEN** 시스템은 OS 알림 banner를 표시한다
- **AND** 앱 안에 별도의 custom in-app Push banner를 추가하지 않는다

### Requirement: Push payload와 개인정보 경계

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `docs/domain/objects/notification.md`, `PROD-875`, `PROD-912`, `PROD-913`, `PROD-914` — 기본 Push 표시에는 sender, Notification type, Recipient Profile 식별과 게시글 본문이 있는 경우의 body preview를 포함해야 한다(MUST). 게시글 본문이 없는 Notification은 게시글 본문 excerpt를 생략해야 하며(MUST), sender·type·Recipient Profile 식별은 유지해야 한다(MUST). sensitive 또는 Content Warning body는 잠금 화면과 OS banner에서 가려야 하며(MUST), sensitive·Content Warning이 아닌 private body는 Recipient 조회 권한이 확인된 경우 표시해야 한다(MUST).

FCM registration token, Provider service credential과 authorized private body는 client bundle·repository·일반 로그·analytics에 기록해서는 안 된다(MUST NOT). private body를 payload에 포함하는 경우에도 Recipient 권한 경계를 다시 확인해야 한다(MUST).

#### Scenario: 게시글 본문이 있는 일반 Notification

- **WHEN** Recipient가 조회 권한을 가진 일반 게시글을 원인으로 하는 Push를 구성한다
- **THEN** 표시 정보는 sender, Notification type, Recipient Profile 식별과 게시글 body excerpt를 포함한다

#### Scenario: 게시글 본문이 없는 Notification

- **WHEN** Follow 또는 FollowRequest처럼 원인 게시글 본문이 없는 Notification을 구성한다
- **THEN** 시스템은 sender, Notification type과 Recipient Profile 식별을 유지한다
- **AND** 존재하지 않는 게시글 body preview를 만들거나 전체 Push body를 임의로 대체하지 않는다

#### Scenario: sensitive·Content Warning과 private body

- **WHEN** Push의 원인 게시글이 sensitive 또는 Content Warning이거나 Recipient가 조회 권한을 가진 private 게시글이다
- **THEN** sensitive·Content Warning body는 잠금 화면과 OS banner에서 가린다
- **AND** sensitive·Content Warning이 아닌 private body는 Recipient 권한이 확인된 경우 body excerpt를 표시한다

#### Scenario: 민감정보 로그 경계

- **WHEN** 시스템이 registration, Provider 전달 또는 client 수신을 기록·관측한다
- **THEN** FCM token, Provider service credential과 private body를 일반 로그·analytics에 기록하지 않는다
- **AND** Provider 전달 결과 관측은 payload 민감정보 없이 수행한다

### Requirement: Push tap의 Profile·target 수렴

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`, `docs/domain/objects/notification.md`, `PROD-875`, `PROD-913` — Push tap은 현재 Account가 Recipient Profile에 접근할 수 있는지 다시 확인한 뒤, 접근 가능하면 해당 Profile로 전환해 target을 열어야 한다(MUST). target이 삭제되었거나 접근할 수 없으면 접근 가능한 알림 목록만 열고 별도 toast·message를 표시해서는 안 된다(MUST NOT).

로그인되지 않은 상태에서 Push를 탭하면 원래 target을 버리고 일반 로그인 흐름을 따라야 하며(MUST), 로그인 뒤 Push target으로 자동 복귀해서는 안 된다(MUST NOT). 삭제·접근 불가 외의 target 처리에 대해 임의의 old-valid 또는 duplicate 자동 목록 fallback을 추가하지 않는다.

#### Scenario: 다른 Recipient Profile로 cross-profile 이동

- **WHEN** 현재 selected Profile과 Push의 Recipient Profile이 다르고 현재 Account가 Recipient Profile membership을 가진 상태에서 사용자가 Push를 탭한다
- **THEN** 시스템은 현재 Account의 Recipient Profile 접근 권한을 다시 확인한다
- **AND** 권한이 있으면 Recipient Profile로 전환한 뒤 target을 연다

#### Scenario: 삭제·접근 불가 target

- **WHEN** 사용자가 탭한 target이 삭제되었거나 현재 Account가 접근할 수 없다
- **THEN** 시스템은 현재 접근 가능한 Notification 목록만 연다
- **AND** 설명용 toast·message 또는 target을 대신하는 다른 자동 fallback을 표시하지 않는다

#### Scenario: logged-out tap

- **WHEN** 로그인되지 않은 상태에서 사용자가 Push를 탭한다
- **THEN** 시스템은 원래 Push target을 버리고 일반 로그인 흐름을 따른다
- **AND** 로그인 완료 뒤 원래 Push target으로 자동 복귀하지 않는다

### Requirement: 비동기 전달, 만료와 Provider 경계

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/domain/objects/notification.md`, `PROD-875`, `PROD-912`, `PROD-914` — 원본 Notification commit 이후 FCM 전달을 시작해야 하며(MUST), Provider 실패·retry·partial fan-out·terminal failure가 원본 Notification transaction 또는 인앱 흐름을 rollback하거나 실패시키지 않아야 한다(MUST NOT). Notification 생성 시각부터 24시간이 지나면 해당 Push의 전달을 시도하지 않아야 하고(MUST), 24시간은 최초 Notification 생성 시각을 기준으로 하며 retry·backoff·token refresh로 연장하거나 다시 시작해서는 안 된다(MUST NOT). 이 만료는 원래 인앱 Notification lifecycle을 변경하지 않는다(MUST NOT).

Notification이 현재 읽음 상태라는 이유만으로 Push 전송·재시도를 제외하거나 취소해서는 안 되며(MUST NOT), Push 전달 자체가 canonical read state를 변경해서도 안 된다(MUST NOT). Provider accepted는 실제 기기 도착을 증명하지 않으며, Provider가 accepted·queued Push를 절대적으로 회수할 수 있다는 보장을 하지 않는다(MUST NOT). Provider 응답과 실제 Android·iOS device arrival evidence는 별도로 관측해야 한다(MUST).

#### Scenario: 원본 commit과 전달 실패 격리

- **WHEN** Notification commit이 완료된 뒤 FCM Provider가 timeout, rate limit, transient failure 또는 terminal failure를 반환한다
- **THEN** 시스템은 원본 Notification과 인앱 흐름을 보존하고 전달 결과를 실패·재시도 관측으로 분리한다
- **AND** Provider 실패를 이유로 원본 Notification transaction을 rollback하거나 생성 요청을 실패시키지 않는다

#### Scenario: 원본 생성 시각 기준 expiry

- **WHEN** Notification 생성 시각으로부터 24시간이 지났거나 retry·token refresh가 발생한다
- **THEN** 시스템은 최초 생성 시각을 기준으로 expiry를 판정하고 24시간 이후 전달을 시도하지 않는다
- **AND** retry·token refresh로 expiry를 연장하거나 원래 인앱 Notification lifecycle을 변경하지 않는다

#### Scenario: Read state 독립성

- **WHEN** Push 전달을 시도할 때 Notification이 이미 Read이거나 다른 표면에서 Read로 전환된다
- **THEN** 시스템은 그 Read state만을 이유로 eligible Push 전송·재시도를 필터링하거나 취소하지 않는다
- **AND** Push 전달은 canonical read state를 변경하지 않는다

#### Scenario: Provider accepted와 실제 도착

- **WHEN** Provider가 Push를 accepted 또는 queued로 응답한다
- **THEN** 시스템은 이를 Provider 경계의 결과로 관측한다
- **AND** accepted·queued를 실제 기기 도착 또는 절대적 회수 가능성의 증거로 기록하지 않는다

### Requirement: Provider 결과와 token lifecycle 정합성

**Authority / Provenance:** `docs/domain/decisions/0029-native-push-notification-policy.md`, `PROD-912`, `PROD-914` — 전달 구현은 유효 token 선택, success·transient failure·timeout·rate limit·partial fan-out·terminal failure·retry/backoff·deduplication을 구분해 관측해야 한다(MUST). 확인된 성공 installation/job은 retry에서 재전송하지 않도록 installation/job deduplication을 적용해야 하지만(MUST), ambiguous Provider outcome에서 재시도 중복을 절대적으로 제거한다고 보장해서는 안 된다(MUST NOT). Provider의 invalid 또는 unregistered token 결과는 설치 token lifecycle cleanup 경계로 전달해야 하며(MUST). 정확한 Provider SDK, endpoint, retry 수치와 저장 field는 이 capability가 고정하지 않는다.

#### Scenario: 부분 fan-out과 중복 전달 방지

- **WHEN** 하나의 Notification이 여러 eligible 설치를 대상으로 하고 일부 Provider 호출만 성공하거나 retryable failure가 발생한다
- **THEN** 시스템은 설치별 결과를 success, retryable 또는 terminal 결과로 구분하고 다른 설치의 결과와 섞지 않는다
- **AND** 확인된 성공 installation/job은 installation/job deduplication으로 retry에서 재전송하지 않는다
- **AND** retry는 최초 Notification 생성 후 24시간 경계를 넘지 않으며, ambiguous Provider outcome에서는 중복 가능성을 제거했거나 OS에서 exactly-once 전달을 보장한다고 주장하지 않는다

#### Scenario: invalid token cleanup

- **WHEN** Provider가 특정 FCM token을 invalid 또는 unregistered로 응답한다
- **THEN** 시스템은 해당 token을 이후 전달 대상에서 정리할 수 있도록 912가 소유한 token lifecycle 경계로 결과를 전달한다
- **AND** 다른 Account의 token을 변경하거나 Provider 응답을 실제 기기 도착으로 해석하지 않는다
