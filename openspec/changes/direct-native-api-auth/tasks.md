## 1. PROD-318 API public-client session exchange

- [x] 1.1 `openid-client`를 API dependency로 추가하고, verified OIDC identity만으로 account/session을 만드는 shared DB writer를 도입해 BFF도 upstream token을 새 session에 저장하지 않게 한다.
- [x] 1.2 API REST의 `POST /login/native/session`에 public-client discovery, PKCE code exchange, exact redirect/input/body 제한, no-store 응답과 redacted failure 처리를 구현한다.
- [x] 1.3 API runtime에 `PUBLIC_OIDC_NATIVE_CLIENT_ID`를 연결하고 confidential web client/secret과 분리된 configuration을 검증한다.

## 2. PROD-318 Expo direct API transport

- [x] 2.1 Expo public config와 native AuthSession을 API origin·public native client로 전환하고, web login 경로를 유지한다.
- [x] 2.2 Relay network를 browser BFF/native API로 분기하고, SecureStore envelope을 API origin·native issuer/client 설정에 결속해 legacy/mismatch token을 삭제한다.
- [x] 2.3 앱 README와 `memory/frontend-react-native.md`, `memory/script.md`의 native BFF 전제를 새 계약으로 동기화한다.

## 3. PROD-318 검증

- [ ] 3.1 OIDC E2E mock을 confidential web client와 public native client로 분리하고, API direct exchange의 성공·PKCE/redirect/signature/payload 오류·no-store/no-cookie를 검증한다.
- [x] 3.2 app unit test에 browser/native GraphQL host·credential·Bearer behavior와 session envelope mismatch/legacy 삭제를 추가한다.
- [x] 3.3 API/unit, app Relay/typecheck/web export, web BFF regression을 실행하고 결과를 기록한다.

## 4. 공개 출시 gate

- [ ] 4.1 PROD-317의 authorization code 안전 소모와 PROD-319의 reliable edge rate limit 완료를 확인한다.
- [ ] 4.2 build-time public environment가 주입된 실제 Android 또는 iOS 기기에서 native login과 API direct authenticated GraphQL을 검증한다.
