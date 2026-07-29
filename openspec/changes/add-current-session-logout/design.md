## Context

현재 `session` table과 core enum에는 `ACTIVE`, `REVOKED`, `EXPIRED`가 이미 존재하지만, `packages/core/services`에는 Session 생성만 있고 현재 Session 폐기 action이 없다. API의 일반 request context는 Active Account와 Active Session만 `ctx.session`으로 도출하므로, 이 경계를 그대로 사용하면 Suspended Account의 Active Session을 폐기할 수 없고 terminal credential의 이미 인증 불가능한 결과도 결과 불명 실패와 구분할 수 없다.

Web은 Hono BFF가 발급한 HttpOnly `kosmo_session` cookie를 `/graphql`에서 bearer header로 변환하고, Native는 SecureStore token으로 API GraphQL을 직접 호출한다. Expo client는 Relay actor revision으로 Environment/Store를 교체할 수 있지만, 기존 shell의 logout control에는 handler가 없다. PROD-474가 core/API/BFF를 먼저 전달하고 PROD-475가 그 경계에 공용 UI를 연결하며, PROD-473이 두 결과의 종단 간 검증과 archive를 소유한다.

## Goals / Non-Goals

**Goals:**

- Active 또는 Suspended Account의 현재 Active Session을 같은 transport-neutral core action으로 안전하게 폐기한다.
- Web BFF와 Native GraphQL이 폐기, 이미 인증 불가능함과 결과 불명 실패를 일관되게 구분한다.
- 결과가 확정된 뒤에만 runtime credential과 viewer 종속 Relay 상태를 정리한다.
- 중복·경쟁 요청, 다른 Session 격리, Origin 보호와 cookie scope를 검증 가능한 경계로 만든다.
- backend와 Expo client가 독립 PR로 전달될 수 있도록 task ownership을 분리한다.

**Non-Goals:**

- Session expiration/cleanup, Session 목록, 전체·원격 로그아웃, OIDC global logout
- Session 폐기 시각·감사 이력 저장 또는 database schema 변경
- 로그인 시 기존 Session 재사용 정책과 authorization model 변경
- 메뉴 배치·스타일 개편과 Android·iOS production 배포

## Implementation Guidance

### Current Constraints

- 일반 API context의 Active Account filter를 완화하면 Suspended Account가 다른 인증 행동까지 수행할 수 있으므로 logout 예외를 기존 `ctx.session`에 섞을 수 없다.
- terminal Session과 Deleted Account credential은 일반 인증 context에서 사라지지만, logout transport는 이를 결과 불명 실패와 구분해야 한다.
- revoked Session은 기존 `Session` GraphQL Node auth scope를 만족하지 않으므로 mutation payload에서 Session Node를 반환하면 불필요한 재조회·권한 충돌이 생긴다.
- Web `/graphql` proxy는 upstream body를 그대로 전달하는 범용 경계다. logout cookie 제거를 이 proxy의 특정 GraphQL operation 해석에 결합하면 streaming proxy가 product action을 알아야 한다.
- `kosmo_session`은 로그인 route가 public origin에 따라 Secure 속성을 결정하고 `Path=/`, `SameSite=Lax`, HttpOnly로 설정한다. 삭제 response가 이 scope와 어긋나면 browser에 stale cookie가 남는다.
- Relay actor reset은 Environment/Store를 교체할 수 있지만, Web cookie는 client code가 직접 지울 수 없고 Native token 삭제는 비동기 SecureStore 경계를 거친다.

### Recommended Approach

1. **transport-neutral logout action이 폐기 인증과 조건부 revoke를 함께 소유한다.** GraphQL resolver와 BFF route는 bearer/cookie에서 얻은 raw Session credential을 같은 application action에 전달한다. 이 action이 `revokeable current Session`, `already unauthenticated`, `unknown failure`를 일관되게 구분하고, 일반 `ctx.session`의 Active Account 정책은 유지한다.
2. **공유 action은 식별한 current Session을 원자적으로 전이한다.** Active Session만 조건부로 Revoked로 갱신하고, 갱신 실패 시 현재 Session/Account 상태를 다시 확인해 terminal winner 또는 삭제된 Account를 이미 인증 불가능한 결과로 분류한다. terminal/missing credential은 조건부 revoke 단계에 진입하지 않는다. 명시적 비관적 lock 없이 PostgreSQL의 조건부 update와 짧은 transaction을 사용한다.
3. **GraphQL은 전용 mutation을 둔다.** `revokeCurrentSession`은 Session ID input 없이 special credential boundary를 사용하고, 확정 결과를 `RevokeCurrentSessionPayload { completed: Boolean! }`로 mapping한다. 예상 밖 DB/server 실패는 기존 `INTERNAL_SERVER_ERROR` 경로를 사용한다.
4. **Web은 전용 `POST /logout` route를 둔다.** 구성된 public origin과 Origin header를 정확히 비교한 뒤 cookie credential을 처리한다. 확정 결과는 cache 불가 `204 No Content`와 동일 scope의 expired `kosmo_session` cookie로 응답하고, 불명 실패는 cookie를 유지한 채 non-2xx를 반환한다. `/graphql` proxy는 변경하지 않는다.
5. **client logout action이 cleanup 순서를 소유한다.** Web은 credential 포함 `POST /logout`, Native는 Relay mutation을 호출한다. 성공 뒤 Native SecureStore token 삭제를 완료하고, 모든 runtime에서 actor revision을 바꿔 새 guest Environment/Store를 만든 다음 router replace로 `/`에 이동한다.
6. **현재 조작 가능한 shell control이 production action을 직접 소유한다.** layout마다 full/compact/drawer 중 하나만 조작 가능하므로 렌더된 `SidebarNavigation`의 logout control이 production action과 pending/error 상태를 직접 소유한다. caller가 lifecycle을 callback으로 교체할 수 없게 하고, 현재 surface 안에서 중복 요청을 막으며 실패 시 credential과 Environment를 유지한 채 접근 가능한 오류와 재시도를 제공한다. 별도 확인 dialog 없이 기존 logout control을 직접 실행하는 방식을 기본으로 한다.

### Allowed Alternatives

- GraphQL/BFF는 각 transport에서 raw Session credential을 추출하는 방식만 각각 소유할 수 있다. credential 조회·결과 분류·조건부 revoke는 transport-neutral logout action 안에서 직접 수행하거나 그 action만 사용하는 server-side helper로 분리할 수 있다. 어느 방식이든 일반 API `ctx.session` 정책을 넓히거나 공유 action에 GraphQL/HTTP 타입을 전달해서는 안 된다.
- core의 조건부 전이는 단일 update 후 outcome 조회 또는 짧은 transaction 안의 동등한 방식으로 구현할 수 있다. specs의 terminal winner, 다른 Session 격리와 결과 분류를 만족해야 한다.
- shell 실패 표현은 inline status 또는 기존 접근 가능한 공통 오류 surface를 사용할 수 있다. raw backend message나 credential material을 노출하지 않고 재시도를 제공해야 한다.
- shell layout이 여러 logout surface를 동시에 조작 가능하게 바뀌면 action 상태를 공통 provider로 끌어올릴 수 있다. 현재처럼 한 surface만 조작 가능한 동안에는 production hook을 control 내부에서 직접 호출해 lifecycle 주입 seam을 만들지 않는다.

### Known Traps

- Suspended Account logout을 위해 일반 login scope에서 `Account.ACTIVE` filter를 제거하면 다른 보호 mutation의 권한이 확장된다.
- mutation에 Session ID를 받거나 cookie를 browser script에서 읽는 방식은 current-session 및 HttpOnly 계약을 위반한다.
- GraphQL proxy가 특정 operation response를 파싱해 cookie를 제거하게 만들면 범용 streaming proxy와 logout 정책이 결합된다.
- server 요청 전에 SecureStore token 또는 Relay store를 지우면 결과 불명 실패를 복구할 수 없다.
- `finally`에서 cookie/token을 제거하면 network 오류와 응답 유실도 성공으로 바뀐다.
- 기존 Environment의 record만 일부 삭제하면 viewer-relative record와 in-flight response가 다음 actor 상태에 섞일 수 있다.
- 명시적 row lock으로 모든 경쟁을 직렬화하면 현재 benign terminal-state race에 비해 복잡성과 deadlock 위험이 커진다.

## Risks / Trade-offs

- [응답 유실 뒤 server에서는 이미 revoke됐지만 client에는 credential이 남음] → retry가 terminal credential을 이미 인증 불가능한 확정 결과로 처리하고 그때 credential을 제거한다.
- [Origin header 검증이 reverse proxy public origin과 어긋남] → login과 동일하게 `PUBLIC_ORIGIN`을 우선하고, local HTTP와 TLS termination case를 BFF test에 포함한다.
- [cookie 삭제 scope 불일치] → 로그인/로그아웃이 같은 Session cookie 옵션 계산을 사용하고 `Set-Cookie` 속성을 회귀 검증한다.
- [Suspended Account 예외가 일반 인증으로 전파됨] → revoke 전용 credential boundary를 두고 기존 `currentSession`과 보호 mutation의 Active Account 회귀 테스트를 유지한다.
- [Relay cleanup 전에 이전 viewer UI가 잠깐 남음] → 성공 handler가 Environment 교체를 완료한 뒤 route replace를 수행하고, old Environment를 다음 session에 재사용하지 않는다.
- [backend보다 client가 먼저 배포됨] → 요청 실패 시 credential과 authenticated UI를 유지하므로 데이터 손실은 없지만 logout이 동작하지 않는다. backend를 선배포해 이 창을 피한다.

## Migration Plan

1. PROD-474에서 core revoke, API schema/mutation과 Web BFF route를 기존 Session state에 additive하게 배포한다. database migration은 없다.
2. 폐기·terminal credential·Suspended Account·결과 불명·경쟁·다른 Session 격리와 Origin/cookie response를 검증한다.
3. PROD-475에서 generated Relay artifact와 공용 logout action/shell handler를 배포하고 Web·Native client 검증을 수행한다.
4. PROD-473에서 Web cookie와 Native bearer 종단 간 흐름, 기존 login/session exchange 회귀와 Web production smoke를 확인한다.
5. 모든 구현 slice와 통합 검증이 끝난 뒤에만 change를 archive한다.

Rollback은 client를 먼저 이전 동작으로 되돌리고 backend endpoint를 후속으로 제거하는 순서를 사용한다. backend만 남는 것은 additive하고 안전하다. client가 남은 채 backend를 되돌리면 logout은 실패하되 credential을 유지하므로, backend rollback 전 client rollout 상태를 확인한다.

## Open Questions

제품 계약을 바꾸는 남은 질문은 없다. GraphQL payload, `POST /logout` response, direct-action UI와 cleanup 순서의 Implementation Choice는 `decisions.md`에서 OpenSpec Gate 승인 대상으로 제시한다.
