# ADR 0029: Native Push Notification Policy

## 상태

Accepted — PROD-875 요구사항 정리에서 사용자가 권한 요청 흐름, 현재 Push 대상 범위, 잠금 화면 기본 표시와
본문 예외, foreground OS 배너, Account의 Profile 수신 범위, Push 탭의 cross-profile 처리, 다중 설치 fan-out,
Push 만료와 첫 릴리스의 in-app 설정 부재를 확정했다. PROD-912에서
사용자가 해제·로그아웃·무효화된 installation row와 token의 즉시 삭제, 삭제 뒤 재등록의 신규 수신 시작
시각과 동일 Account의 재설치 중복 정리를 확정했다. 2026-09-29 사용자 승인으로 사전 안내 모달을 제거하고 앱
설정에서 OS 권한을 직접 요청하도록 변경했다. 2026-09-29 사용자 승인으로 Push 탭은 payload의 내부 경로 `href`로
직접 이동하도록 변경했고, registration 이후 전달 경계는 best-effort로 정리했다.

## 날짜

2026-09-10

## 맥락

현재 Notification 도메인은 Profile 또는 Account를 Recipient로 하는 인앱 Notification의 생성, 조회와
읽음 상태를 소유한다. FCM native push transport, device token lifecycle과 OS 권한 요청은 기존
Notification 계약에 포함되어 있지 않다. PROD-875에서 FCM native push를 도입하고 PROD-912에서
installation token lifecycle을 고정하므로 앱 설정의 권한 처리와 token 동기화,
잠금 화면 기본 정보, Account의 Profile 수신 범위와 첫 릴리스의 preference 경계를 별도의 제품 계약으로
고정해야 한다.

## 결정

- 앱 시작이나 로그인 완료 때 OS 권한을 자동 요청하지 않는다. 앱 설정의 알림 action은 OS 권한이 미결정이면
  OS 권한 요청을 시작하고, 이미 허용되거나 거부된 경우 OS 알림 설정을 연다. 허용된 로그인 세션은 로그인·앱
  활성화 때 FCM token을 자동 동기화하고, 권한 요청이 허용된 직후에도 token을 즉시 동기화한다.
- 서버의 FCM OS 표시 payload는 `notification.title`과 `notification.body`를 사용해 발신자, 알림 유형과 허용된 게시글 본문 미리보기를 표시한다. Operational Notification은 저장된 제목과 선택적 본문을 사용한다.
- Follow와 FollowRequest처럼 게시글 본문이 없는 알림은 본문 미리보기를 생략한다.
- 공통 Worker Notification Activity는 Domain Workflow의 Notification 생성 요청을 받아 기존 Core materializer를
  호출한다. 저장된 Notification ID가 반환되면 그 ID로 기존 Push delivery Workflow를 시작하고 start
  acknowledgement만 기다린다. materializer가 Notification을 만들지 않거나 실패하면 Push를 시작하지 않는다.
  commit 뒤 Workflow 시작이 실패해도 저장된 Notification을 유지하고 해당 시작만을 위해 Activity를 재시도하지
  않는다.
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
- 이전 문서의 `현재 Account·Session` 일치 조건은 이 Account 소유권 및 lifecycle association 규칙으로 대체한다.
- 삭제된 installation을 다시 등록하면 새 server-issued row ID를 사용한다. 이전 ID는 재사용하지 않으며, 늦게
  도착한 이전 ID의 unregister가 새 registration row를 삭제하지 않는다. registration과 Notification 생성 시각의
  엄격한 cut-off나 epoch recovery는 요구하지 않으며, 신규 수신은 일반 전달 flow에서 best-effort로 시작한다.
  이미 생성된 unread Notification을 별도 backlog로 재생하지 않는다.
- 같은 Account가 새 registration으로 현재 active token을 다시 등록하면 기존 중복 row를 같은 원자적 작업에서
  삭제한 뒤 새 row ID로 등록한다. 다른 Account가 소유한 active token은 삭제하거나
  탈취하지 않고 등록을 거부한다.
- 첫 릴리스에는 전역·알림 유형별·Profile별 in-app Push enable/disable control이나 preference API를
  두지 않는다. Push 수신 여부는 OS 알림 설정으로 제어하며, 기존 Notification의 Mute·Block·visibility
  억제 정책은 Push에도 적용한다.
- 잠금 화면 본문 미리보기는 sensitive 또는 Content Warning인 경우 가린다. 이 예외는 본문에만 적용하며,
  발신자·알림 유형·Recipient Profile 식별은 유지한다. 그 외에는 Recipient가 조회 권한을 가진 비공개
  본문을 미리보기에 포함한다.
- 앱이 foreground인 경우에도 OS 알림 배너를 표시한다. 별도의 custom in-app Push banner를 추가하지
  않는다.
- Profile Notification Push payload는 `notificationId`, `recipientProfileId`, 내부 앱 경로 문자열 `href`를
  route data로 제공한다. Push를 탭하면 native client가 `href`가 현재 Profile 경로(하위 경로 포함)와
  `/follow-requests` 중 하나의 내부 경로인지 검증한다. `href`가 없거나 유효하지 않으면 Profile을 전환하지 않고
  일반 알림 목록을 연다. 유효하면 현재 선택된 Profile이 `recipientProfileId`와 다를 때 기존 Profile 전환 흐름에서
  현재 Account의 Profile membership를 확인해 전환한 뒤 `href`로 직접 이동한다. `notificationId`로 목적지를
  조회하지 않는다. 실제 목적지가 없거나 삭제됐거나 접근할 수 없는 경우는 해당 화면의 기존 처리를 따른다.
- Operational Notification Push는 저장된 `href`로 직접 이동한다. 내부 앱 경로는 앱에서 열고 HTTP(S) 외부 링크는
  브라우저에서 연다. 이 경로는 Profile을 전환하지 않는다. 안전한 내부 경로 또는 HTTP(S) 주소가 없으면 Profile을
  전환하지 않고 일반 알림 목록을 연다. 로그인되지 않은 상태에서 Push를 탭하면 원래 target을 버리고 일반 로그인
  흐름을 따르며, 로그인 뒤 Push target으로 자동 복귀하지 않는다. Push tap은 canonical Read State를 바꾸지 않는다.
- Notification 생성 시각부터 24시간이 지나면 해당 Push의 전달을 시도하지 않는다. 이 24시간은 최초
  Notification 생성 시각을 기준으로 하며, 재시도나 token refresh로 연장하거나 다시 시작하지 않는다. 이
  만료는 원래 인앱 Notification lifecycle을 변경하지 않는다.
- 최초 registration·새 device·OS 권한 허용 뒤 신규 Notification 전달은 일반 flow에서 best-effort로 시작한다.
  registration 시각과 Notification 생성 시각의 엄격한 cut-off는 요구하지 않으며, 이미 생성된 unread Notification을
  별도 backlog로 재생하지 않는다. OS 상태 변화의 정확한 감지 시점은 이 ADR에서 고정하지 않으며, client는
  관찰 가능한 OS 상태를 동기화한다.
- Notification이 현재 읽음 상태라는 이유만으로 Push 전송·재시도를 제외하거나 취소하지 않는다. 다른 표면에서
  읽어도 Push를 취소하지 않으며, 최초 Notification 생성 시각부터 24시간인 만료는 그대로 유지한다. Push
  전달 자체는 canonical read state를 변경하지 않는다.
- Provider의 accepted 응답은 기기 도착을 증명하지 않으며, Provider에 큐잉된 Push를 절대적으로 회수할 수
  있다는 보장도 없다. 이는 Provider·플랫폼의 관찰 가능한 경계다.
- 이 결정은 공통 Worker Notification Activity가 저장된 Notification ID를 기존 Push delivery Workflow에
  연결하고, Push flow가 이후 수신 대상 fan-out과 전달 lifecycle을 소유한다는 경계와 앱 설정의 권한 상태별 동작,
  현재 Push 대상 검증 범위, 기본 잠금 화면 정보와 본문 예외, foreground OS 배너, OS 설정 이동과 token 동기화,
  Profile 및 Operational target 처리, 다중 설치 fan-out, Push 만료와 read state 독립성을 고정한다.
  PROD-912가 소유하는 installation token의 저장·폐기 lifecycle은 위와 같이 정한다. Provider SDK,
  정확한 retry/backoff 정책과 route data 및 OS 표시용 title/body 밖의 provider payload는 이 ADR에서 정하지 않는다.

## 남은 결정

- 영구적인 본문 미리보기 길이·자르기 계약은 정하지 않는다. 현재 구현 기본값은 기존 plain-text extraction 이후 Unicode code point 기준 최대 160자로 본문 미리보기를 만들고, 더 길면 말줄임표를 붙이는 것이다. 이는 영구 API 계약이 아니다.
- PROD-911이 소유하는 향후 Mention 생성·통합과 유형별 source·표시 계약. 해당 type이 canonical Notification으로
  저장되면 공통 Push flow를 사용하며, 미래 generator 자체 구현은 이 ADR 범위가 아니다.

## 문서 반영

- [Notification presentation](../../design/notifications.md#native-fcm-push-권한-요청과-잠금-화면-미리보기--prod-875)은
  앱 설정의 권한 처리, 알림 대상 범위, 잠금 화면과 foreground OS 표시를 정의한다.
- [Notification 객체](../objects/notification.md)는 Recipient와 인앱 Notification lifecycle을 계속 소유하며,
  native transport와 device token은 이 결정의 후속 구현 범위에서 별도로 다룬다.
