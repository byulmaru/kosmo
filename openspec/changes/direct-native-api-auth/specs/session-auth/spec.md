## MODIFIED Requirements

### Requirement: Native OIDC code exchange

Kosmo API는 네이티브 공개 OIDC client가 client secret을 보유하지 않고 authorization code와 PKCE verifier를 Kosmo session token으로 교환할 수 있는 unauthenticated `exchangeNativeOidcSession` GraphQL mutation을 제공해야 한다(MUST). 새 Expo native bundle은 공개 API origin의 `/graphql`에서 이 mutation만 호출해야 한다(MUST).

#### Scenario: Exchange a valid native code

- **WHEN** 공개 API origin의 `/graphql`이 code, PKCE verifier, `kosmo://login/callback` redirect URI를 포함한 `exchangeNativeOidcSession` mutation을 받는다
- **THEN** API는 구성된 공개 native client ID와 client secret 없이 OIDC token endpoint에 authorization code, PKCE verifier, exact redirect URI를 제출한다
- **AND** API는 discovery metadata와 JWKS를 사용해 ID token signature, issuer, native client audience, expiration, issued-at claims를 검증한다
- **AND** Kosmo는 단일 configured issuer의 `sub`를 account identity로 사용하고, 해당 issuer가 보장하는 문자열 `name` claim을 display name으로 사용한다
- **AND** API는 OIDC 계정을 upsert하고 upstream OIDC token을 저장하지 않은 ACTIVE Kosmo session을 생성한다
- **AND** mutation payload로 Kosmo session token을 반환하고 session cookie를 설정하지 않는다
- **AND** 응답에 `Cache-Control: no-store`를 설정한다

#### Scenario: Reject an invalid native redirect URI

- **WHEN** native session 요청의 redirect URI가 `kosmo://login/callback`이 아니다
- **THEN** API는 기존 GraphQL validation contract에 따른 error를 반환한다
- **AND** OIDC token endpoint를 호출하지 않는다

#### Scenario: Reject malformed native exchange input

- **WHEN** native session 요청에 code 또는 PKCE verifier가 없거나 허용 길이를 벗어난다
- **THEN** API는 기존 GraphQL validation contract에 따른 error를 반환한다
- **AND** Kosmo session을 생성하지 않는다

#### Scenario: Reject an unverifiable token response

- **WHEN** OIDC token endpoint가 잘못된 signature, issuer, audience, expiration 또는 issued-at claims를 가진 ID token을 반환한다
- **THEN** API는 upstream OIDC 오류 세부 정보와 token material을 노출하지 않는 generic GraphQL error를 반환한다
- **AND** OIDC 계정 또는 Kosmo session을 생성하지 않는다

#### Scenario: Reject a raw OIDC token exchange

- **WHEN** native client가 authorization code와 PKCE verifier 대신 ID token 또는 access token을 session 교환 입력으로 제출한다
- **THEN** API는 raw token field를 정의하지 않은 GraphQL input contract로 요청을 거부한다
- **AND** OIDC token endpoint를 호출하지 않고 Kosmo session을 생성하지 않는다

#### Scenario: Do not expose or persist upstream OIDC material

- **WHEN** API가 native authorization code를 OIDC token endpoint에서 교환하고 Kosmo session을 생성하거나 거부한다
- **THEN** 성공 response payload, client bundle, log, 새 Kosmo session record에 OIDC client secret, authorization code, PKCE verifier, access token 또는 ID token을 포함하지 않는다
