# ADR 0029: Native Push Notification Policy

## 상태

Accepted — PROD-875 요구사항 정리에서 사용자가 권한 안내 시점, 현재 Push 대상 범위, 잠금 화면 기본
표시와 본문 예외, foreground OS 배너, Account의 Profile 수신 범위, 안내 반복 억제, Push 탭의
cross-profile 처리, 다중 설치 fan-out, Push 만료와 첫 릴리스의 in-app 설정 부재를 확정했다. PROD-912에서
사용자가 해제·로그아웃·무효화된 installation row와 token의 즉시 삭제, 삭제 뒤 재등록의 신규 수신 시작
시각과 동일 Account의 재설치 중복 정리를 확정했다. 2026-09-16 PROD-913에서 native SDK ownership,
prompt 완료 marker와 기존 Profile 전환·Notification 재검증 경계를 구현 선택으로 확정했으며, signed
Android·iOS device evidence는 아직 남아 있다.

## 날짜

2026-09-10

## 맥락

현재 Notification 도메인은 Profile 또는 Account를 Recipient로 하는 인앱 Notification의 생성, 조회와
읽음 상태를 소유한다. FCM native push transport, device token lifecycle과 OS 권한 요청은 기존
Notification 계약에 포함되어 있지 않다. PROD-875에서 FCM native push를 도입하고 PROD-912에서
installation token lifecycle을 고정하므로 권한 안내 시점,
잠금 화면 기본 정보, Account의 Profile 수신 범위와 첫 릴리스의 preference 경계를 별도의 제품 계약으로
고정해야 한다.

## 2026-09-16 PROD-913 구현 보완

아래 항목은 위 제품 정책을 native client에 적용하기 위한 구현 경계다. Provider SDK, server credential,
retry와 운영 관측은 PROD-914의 책임으로 남긴다.

- React Native Firebase Messaging(`@react-native-firebase/messaging`)은 FCM token 발급과
  `onTokenRefresh`를 단독으로 소유한다. Expo Notifications(`expo-notifications`)는 OS permission 요청·상태
  조회, foreground OS presentation과 notification response/tap callback을 단독으로 소유한다. Notifee는
  추가하거나 사용하지 않는다.
- client는 관찰된 OS permission이 revoked이고 저장된 server-issued installation ID가 있을 때에만
  `unregisterPushInstallation`을 호출한다. unregister 성공 뒤에만 local installation ID를 삭제하며, logout 시
  installation row cleanup의 권위는 server session revocation lifecycle에 있다.
- prompt 완료 사실은 AsyncStorage app-local marker 하나로 보존한다. marker는 close 또는 `알림 받기` action의
  permission 결과가 끝난 뒤 기록하고, Account·Profile별 상태나 서버 preference로 복제하지 않는다. AsyncStorage의
  uninstall/reinstall·backup/restore 보존 동작은 플랫폼과 설정에 따라 달라질 수 있으므로 physical installation
  identity 또는 backup 복원까지의 strict install-level once를 증명하는 근거로 사용하지 않는다.
- Push payload의 `recipientProfileId`는 Profile Relay Global ID를 사용한다. 로그인된 tap은 exact Push envelope를
  먼저 검증하고 `logged-in/exact envelope` → Notification Node network revalidation → `selectProfile` →
  `resetActor` → derived route/fallback 순서를 따른다. Node가 삭제되었거나 접근할 수 없으면 기존 Notification
  목록 fallback으로 수렴하며, 별도 tap API·Node/query/registry를 추가하지 않는다. logged-out tap은 원래 target을
  버리고 일반 login 흐름으로 수렴한다.
- 위 구현 선택은 signed Android·iOS build에서 token refresh, permission status, foreground OS banner, cross-profile
  tap, uninstall/reinstall·backup/restore를 실행해 확인해야 한다. iOS FCM–APNs provisioning/entitlement와 실제
  device arrival evidence도 아직 확인하지 않았다.

## 결정

- Android·iOS native 앱은 로그인된 상태의 첫 앱 실행에서 Push 알림 권한 안내를 표시한다. 새 로그인
  완료 직후 또는 이미 로그인된 상태에서 앱을 실행하는 경우를 포함할 수 있으며, 안내를 위해
  로그아웃·재로그인을 요구하지 않는다. 안내 표시는 OS 권한 대화상자를 여는 것과 분리한다.
- OS 권한 대화상자는 앱 시작이나 로그인 완료 때 자동으로 열지 않는다. 사용자가 안내의 `알림 받기`
  action을 활성화한 경우에만 OS 권한 요청을 시작한다.
- 기본 잠금 화면 FCM Push는 발신자, 알림 유형과 게시글 본문 미리보기를 포함한다.
- Follow와 FollowRequest처럼 게시글 본문이 없는 알림은 본문 미리보기를 생략한다.
- Push transport는 canonical Notification이 저장 성공한 결과를 받는 공통 전달 flow를 소유한다. 현재
  Notification runtime이 생성·제공하는 모든 알림은 이 flow에서 같은 수신 대상 fan-out, 권한·visibility 억제,
  preview privacy, 24시간 expiry, no-backlog, retry·dedup와 원본 실패 격리 계약을 적용한다. 현재 runtime의
  유형 범위는 이 계약의 검증 inventory이지 닫힌 type whitelist가 아니다.
- 향후 canonical Notification type도 해당 도메인 owner가 생성 권한·source semantics·유형별 표시와 필요한
  target 정보를 공통 flow에 연결한 저장 성공 결과로 같은 공통 Push flow를 거치며, 새 type을 추가할 때 Push
  transport 전체나 source workflow별 전달 lifecycle을 복제하지 않는다. 미래 generator 자체의 구현·통합은 이
  ADR에서 확정하지 않는다.
- 현재 Account는 자신에게 속한 모든 Profile의 Push를 받으며, 각 Push에는 어느 Recipient Profile의
  알림인지 식별할 수 있는 정보가 포함되어야 한다. selected Profile만을 기준으로 Push 수신 범위를
  줄이지 않는다.
- 현재 Account에 로그인되어 있고 OS 알림을 허용한 모든 앱 설치를 Push 대상으로 한다. 가장 최근 설치 하나만
  대상으로 선택하지 않는다.
- Active installation row만 opaque FCM token을 보관한다. 최초 등록은 외부 installation ID를 받지 않고 서버가
  새 installation row ID를 발급해 반환한다. 갱신은 반환된 row ID와 인증된 현재 Account 소유권만 확인하며,
  알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 노출하지 않는 동일한
  `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패한다. 명시적 해제는 반환된 row ID와
  인증된 현재 Account 소유권만 확인해 해당 row를 삭제하며, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는
  row 존재 여부를 노출하지 않고 `{ completed: true }`로 멱등 완료한다. 등록 당시 연결된 `sessionId`는
  lifecycle association으로 유지하며 현재 인증 Session과 비교하거나 요청 Session으로 재바인딩하지 않는다.
  따라서 같은 Account의 다른 Session도 해당 row를 관리할 수 있지만, 등록 당시 연결된 Session의 로그아웃·폐기와
  Account 삭제에 따른 기존 cleanup은 유지한다. Provider가 invalid 또는 unregistered 결과를 반환해도 Account,
  row ID와 현재 token이 모두 일치하는 row만 즉시 삭제한다. 늦게 도착한 이전 token 결과는 갱신된 현재 token을
  삭제하지 않는다.
- client-side unregister는 OS permission revoked와 저장된 installation ID가 모두 있을 때만 실행하며, 성공 전에
  local ID를 삭제하지 않는다. logout에 따른 installation cleanup은 server session revocation이 계속 소유한다.
- 이전 문서의 `현재 Account·Session` 일치 조건은 이 Account 소유권 및 lifecycle association 규칙으로 대체한다.
- 삭제된 installation을 다시 등록하면 삭제 전 registration epoch나 unread Notification을 재사용하지 않고,
  새 row ID와 새 수신 시작 시각을 기록한다. 이전에 반환된 ID는 재사용하지 않으며, 늦게 도착한 이전 ID의
  unregister가 새 registration row를 삭제하지 않는다. 새 registration 시각 이전에 생성된 Notification은
  backlog로 전달하지 않는다.
- 같은 Account가 새 registration으로 현재 active token을 다시 등록하면 기존 중복 row를 같은 원자적 작업에서
  삭제한 뒤 새 row ID와 새 registration epoch로 등록한다. 다른 Account가 소유한 active token은 삭제하거나
  탈취하지 않고 등록을 거부한다.
- 첫 릴리스에는 전역·알림 유형별·Profile별 in-app Push enable/disable control이나 preference API를
  두지 않는다. Push 수신 여부는 OS 알림 설정으로 제어하며, 앱 설정은 OS 알림 설정으로 이동하는
  경로만 제공한다. 기존 Notification의 Mute·Block·visibility 억제 정책은 Push에도 적용한다.
- 잠금 화면 본문 미리보기는 sensitive 또는 Content Warning인 경우 가린다. 이 예외는 본문에만 적용하며,
  발신자·알림 유형·Recipient Profile 식별은 유지한다. 그 외에는 Recipient가 조회 권한을 가진 비공개
  본문을 미리보기에 포함한다.
- 앱이 foreground인 경우에도 OS 알림 배너를 표시한다. 별도의 custom in-app Push banner를 추가하지
  않는다.
- 같은 설치에서 안내를 닫거나 OS 권한을 거부한 뒤에는 안내를 자동으로 다시 표시하지 않는다. 일반적인
  앱 업데이트 뒤에도 안내를 자동으로 다시 표시하지 않는다.
- Push를 탭하면 로그인 상태와 exact envelope를 먼저 확인한 뒤 Notification Node를 네트워크에서 재검증한다.
  검증된 Node에 접근할 수 있으면 `selectProfile`을 호출하고 성공 뒤 `resetActor`를 실행한 다음 derived route를
  계산해 target을 연다. Node가 삭제되었거나 접근할 수 없으면 접근 가능한 알림 목록만 여는 derived fallback을
  따르며 별도 toast·message를 표시하지 않는다. 로그인되지 않은 상태에서 Push를 탭하면 원래 target을 버리고
  일반 로그인 흐름을 따르며, 로그인 뒤 Push target으로 자동 복귀하지 않는다.
- Notification 생성 시각부터 24시간이 지나면 해당 Push의 전달을 시도하지 않는다. 이 24시간은 최초
  Notification 생성 시각을 기준으로 하며, 재시도나 token refresh로 연장하거나 다시 시작하지 않는다. 이
  만료는 원래 인앱 Notification lifecycle을 변경하지 않는다.
- 최초 registration·새 device·OS 권한 허용으로 전달 대상을 등록할 때 registration을 받은 시점 이후에
  생성된 Notification만 전달한다. 이미 생성된 unread Notification을 새 설치나 권한 허용 뒤에 backlog로
  재생하지 않는다. OS 상태 변화의 정확한 감지 시점은 이 ADR에서 고정하지 않으며, client는 관찰 가능한
  OS 상태를 동기화한다.
- Notification이 현재 읽음 상태라는 이유만으로 Push 전송·재시도를 제외하거나 취소하지 않는다. 다른 표면에서
  읽어도 Push를 취소하지 않으며, 최초 Notification 생성 시각부터 24시간인 만료는 그대로 유지한다. Push
  전달 자체는 canonical read state를 변경하지 않는다.
- Provider의 accepted 응답은 기기 도착을 증명하지 않으며, Provider에 큐잉된 Push를 절대적으로 회수할 수
  있다는 보장도 없다. 이는 Provider·플랫폼의 관찰 가능한 경계다.
- 이 결정은 공통 Push flow가 canonical Notification 저장 성공 결과부터 수신 대상 fan-out과 전달 lifecycle을
  소유한다는 경계와, 권한 안내 시점, 현재 Push 대상 검증 범위, 기본 잠금 화면 정보와 본문 예외, foreground OS
  배너, 안내 반복 억제, OS 설정 이동, cross-profile target 처리, 다중 설치 fan-out, Push 만료와 read state
  독립성을 고정한다.
  PROD-912가 소유하는 installation token의 저장·폐기 lifecycle은 위와 같이 정한다. Provider SDK,
  전송 재시도·실패 처리와 payload의 정확한 필드 구조는 이 ADR에서 정하지 않으며, native client SDK ownership은
  위 `2026-09-16 PROD-913 구현 보완`에서 정한다.

## 남은 결정

- 게시글 본문 미리보기의 excerpt 길이와 자르기 규칙.
- PROD-911이 소유하는 향후 Mention 생성·통합과 유형별 source·표시 계약. 해당 type이 canonical Notification으로
  저장되면 공통 Push flow를 사용하며, 미래 generator 자체 구현은 이 ADR 범위가 아니다.

## 문서 반영

- [Notification presentation](../../design/notifications.md#native-fcm-push-권한-요청과-잠금-화면-미리보기--prod-875)은
  native 안내, AsyncStorage prompt marker, SDK ownership, client unregister 조건, 알림 대상 범위, 잠금 화면과
  foreground OS 표시를 정의한다.
- [Notification 객체](../objects/notification.md)는 Recipient와 인앱 Notification lifecycle을 계속 소유하며,
  native transport와 device token은 이 결정의 후속 구현 범위에서 별도로 다룬다.
