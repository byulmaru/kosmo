## Why

Expo 앱은 현재 로그인과 GraphQL 요청을 웹 BFF에 의존한다. 웹의 cookie/BFF 경계는 유지하되, 공개 OIDC client와 PKCE를 사용하는 네이티브 앱은 Kosmo API에서 직접 세션을 발급받고 API에 직접 요청해야 한다.

이 변경은 API/server 구현 [PROD-318](https://linear.app/byulmaru/issue/PROD-318/api%EC%97%90-public-client-oidc-%EC%84%B8%EC%85%98-%EA%B5%90%ED%99%98-graphql%EC%9D%84-%EC%B6%94%EA%B0%80%ED%95%9C%EB%8B%A4)과 Expo client 구현 [PROD-338](https://linear.app/byulmaru/issue/PROD-338/expo-%EC%95%B1%EC%9D%84-api-graphql-%EC%A7%81%EC%A0%91-%EC%9D%B8%EC%A6%9D-%EA%B2%BD%EB%A1%9C%EB%A1%9C-%EC%A0%84%ED%99%98%ED%95%9C%EB%8B%A4)의 공유 계약이다. IdP가 authorization code를 검증 전에 소모하지 않게 하는 [PROD-317](https://linear.app/byulmaru/issue/PROD-317/oidc-token-endpoint%EA%B0%80-%EA%B2%80%EC%A6%9D-%EC%8B%A4%ED%8C%A8-%EC%A0%84-authorization-code%EB%A5%BC-%EC%86%8C%EB%AA%A8%ED%95%98%EC%A7%80-%EC%95%8A%EA%B2%8C-%ED%95%9C%EB%8B%A4) 완료가 출시 gate다.

## What Changes

- Kosmo API가 공개 네이티브 OIDC client의 authorization code와 PKCE verifier를 검증된 Kosmo session token으로 교환한다. API는 client secret을 사용하지 않고, discovery/JWKS로 token 응답을 검증한다.
- Expo native login과 Relay network를 공개 API origin으로 전환한다. 새 네이티브 bundle은 웹 BFF의 로그인·GraphQL endpoint를 호출하지 않는다.
- SecureStore의 session envelope을 API origin과 native OIDC client 설정에 묶어, 환경 또는 client 설정이 달라진 token을 재사용하지 않는다.
- 웹의 confidential OIDC client, HttpOnly cookie, BFF `/graphql` 경로는 유지한다. 배포된 모바일 앱이 없으므로 BFF의 임시 native session endpoint는 제거한다.

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `session-auth`: 네이티브 PKCE code exchange의 소유자를 웹 BFF에서 API로 옮기고, public client 검증·secret 비보관 계약을 명시한다.
- `native-webview-client`: Expo native login의 session 교환과 저장 경계를 API origin 및 공개 native client로 전환한다.
- `universal-expo-client`: 네이티브 Relay transport와 SecureStore environment 검증을 web origin 대신 API origin 기준으로 전환한다.

## Impact

- `apps/api`: native session exchange GraphQL mutation, OIDC public-client configuration, session 생성 경계와 테스트
- `apps/app`: AuthSession 설정, API origin 설정, SecureStore envelope, Relay network와 단위 테스트
- `packages/core`: verified OIDC identity 기반 shared session service의 business-logic ownership
- deployment/runtime environment: API용 native OIDC client ID와 Expo 공개 API origin 설정
- `apps/web`: 웹 전용 BFF 흐름의 회귀 검증과 미배포 native session route 제거
- `apps/api`는 OIDC client 라이브러리를 사용해야 할 수 있으며, 추가 dependency는 pnpm으로 관리한다
- 구현은 API/server PR과 그 위의 Expo client PR로 나누며, OpenSpec change는 두 PR이 공유한다
