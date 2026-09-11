## Why

Kosmo의 기존 Notification은 저장·조회·읽음과 인앱 화면을 제공하지만, 네이티브 Android·iOS 설치에는
FCM을 통한 OS Push 전달 경계가 없다. PROD-875와 세 child의 공통 계약을 하나의 검증 가능한 change로
구체화해, 권한·Profile·설치·개인정보 경계를 보존하면서 실제 기기에서 전달 결과를 증명할 수 있게 한다.

## What Changes

- Account가 소유한 모든 Profile을 Recipient 단위로 식별하고, 현재 로그인되어 OS 알림을 허용한 모든 앱
  설치에 canonical Notification 저장 성공 결과를 공통 flow로 fan-out하는 계약을 정의한다. 현재 runtime은
  검증 inventory이며 닫힌 type whitelist가 아니고, 향후 domain owner가 연결한 canonical type도 같은 전달
  lifecycle을 사용한다.
- 로그인된 첫 앱 실행의 안내와 명시적인 `알림 받기` CTA, 같은 설치의 닫기·거부·일반 업데이트 뒤 반복 억제,
  OS 설정 이동과 foreground OS banner를 네이티브 client 범위로 정의한다.
- sender·알림 유형·게시글 본문 미리보기, 게시글 본문이 없는 알림의 excerpt 생략, sensitive·Content
  Warning 본문 숨김, Recipient 권한이 확인된 private 본문 포함과 token·private body의 일반 로그·analytics
  비기록 경계를 정의한다.
- cross-profile Push tap의 접근 권한 재검증·Profile 전환·target 이동, 삭제·접근 불가 target의 접근 가능한
  알림 목록 fallback, logged-out tap의 일반 로그인 수렴을 정의한다.
- 설치 registration 이후 생성된 Notification만 전달하고, 최초 생성 시각 기준 24시간 expiry·retry 독립성·no
  backlog·read state 독립성·Provider accepted와 실제 도착의 증거 분리를 정의한다.
- 최초 `registerPushInstallation`은 외부 installation ID 없이 서버가 새 installation row ID를 발급해 반환하고,
  `updatePushInstallation`은 반환된 ID로 현재 Account·Session row만 갱신하며, `unregisterPushInstallation`은
  해당 ID만 해제한다. 삭제된 ID는 재생성하지 않고, 없는 unregister는 멱등 완료로 처리해 늦은 이전 unregister가
  새 registration row에 영향을 주지 않도록 한다.
- Account·Profile·설치·device·FCM token 등록 lifecycle, 비동기 Provider 전달, retry·dedup·invalid token
  cleanup과 원본 Notification commit 이후 실패 격리를 세 구현 slice의 책임으로 나누고, PROD-875가 Android·iOS
  실제 기기 종단 간 검증과 최종 OpenSpec archive를 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`, `docs/domain/decisions/0029-native-push-notification-policy.md`, `docs/design/notifications.md`
- Linear Contract: [PROD-875](https://linear.app/byulmaru/issue/PROD-875)
- Linear Implementations: [PROD-912](https://linear.app/byulmaru/issue/PROD-912), [PROD-913](https://linear.app/byulmaru/issue/PROD-913), [PROD-914](https://linear.app/byulmaru/issue/PROD-914)
- Related future scope: `PROD-911`은 향후 Mention 생성·통합과 유형별 source·표시 계약을 소유한다. 해당 type이
  domain owner에 의해 canonical Notification으로 연결·저장되면 이 change의 공통 Push flow를 사용하며, 미래
  generator 자체 구현은 이 change 범위가 아니다.

## Capabilities

### New Capabilities

- `native-fcm-push`: Account 설치·FCM token lifecycle, native 권한·표시·tap, canonical Notification의 FCM 전달과
  Android·iOS 종단 간 검증을 하나의 공유 행동 계약으로 제공한다.

### Modified Capabilities

- 없음. 기존 `notification` capability의 인앱 생성·조회·Read 계약은 유지하고, native transport를 별도 capability로
  추가한다.

## Impact

- `packages/core`의 Notification 및 Account/Profile 권한 경계와 설치·token 도메인/API 계약
- `apps/api`의 인증된 설치 registration과 Provider 전달 경계
- `apps/worker`의 Notification commit 이후 비동기 전달, retry·dedup·invalid token 결과 처리
- `apps/app`의 Android·iOS 권한 안내, native FCM token 연결, OS banner와 cross-profile Push tap
- Android·iOS signed build와 실제 기기 검증, 운영 관측과 최소 개인정보 로그 경계
- 새 외부 dependency, endpoint 이름, DB table/field, SDK와 workflow 설정은 이 change의 승인 전 구현 선택으로
  고정하지 않는다.
