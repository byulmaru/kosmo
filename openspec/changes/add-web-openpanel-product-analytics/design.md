## Context

Kosmo Web은 Expo Router와 React Relay를 사용하며, 인증 상태는 `SessionProvider`와 `RelayActorProvider`가 함께 관리한다. 현재 제품 분석 client나 공통 event taxonomy는 없다. 이번 변경은 self-hosted OpenPanel을 연결하면서 인증·mutation·검색의 기존 성공 판정을 그대로 사용하고, 분석 장애가 제품 동작으로 전파되지 않도록 해야 한다.

OpenPanel Web SDK의 자동 화면·외부 링크·속성 추적은 브라우저 전역 상태를 사용한다. 따라서 native bundle에 SDK를 포함하지 않고 Web에서만 client를 초기화해야 한다. Session replay는 화면에 렌더링된 정보를 기록할 수 있으므로 SDK 기본 입력 마스킹에 더해 canonical Post Content renderer를 명시적으로 마스킹해야 한다.

## Goals / Non-Goals

**Goals:**

- Client ID가 있는 Web 빌드에서만 OpenPanel을 초기화한다.
- 익명 방문부터 로그인 Account identity, 성공한 로그아웃까지 identity 생명주기를 연결한다.
- 핵심 mutation과 검색 흐름을 제한된 속성의 성공 이벤트로 계측한다.
- 10% session replay에서 모든 입력값과 Post Content를 마스킹한다.
- 실제 처리와 일치하는 공개 개인정보 처리방침과 삭제 운영 절차를 제공한다.

**Non-Goals:**

- Android·iOS 분석 SDK 도입
- 재게시·반응·북마크 이벤트 계측
- 사용자 설정 기반 분석 opt-out UI
- OpenPanel Account 데이터 삭제 자동화
- 기존 domain 객체나 GraphQL 계약 변경

## Implementation Guidance

### Current Constraints

- Session query는 현재 Account의 이름만 노출하므로 opaque Account ID를 함께 읽도록 확장해야 한다.
- mutation callback은 GraphQL payload 오류와 network 오류를 별도로 처리한다. 기존 성공 분기 안에서만 이벤트를 보내야 한다.
- 검색어는 URL query에 존재하므로 자동 화면 추적에는 포함될 수 있지만, 명시적 검색 이벤트 속성에는 다시 복제하지 않아야 한다.
- 공통 Post Content renderer는 plain text와 structured document를 모두 렌더링하므로 마스킹 경계로 사용하기 적합하다.

### Recommended Approach

플랫폼별 모듈 해석을 사용해 Web 구현은 `@openpanel/web` singleton을 지연 생성하고 native 구현은 동일 API의 no-op으로 둔다. 공통 event helper가 OpenPanel의 event name과 선택적 properties를 그대로 전달하고, 모든 SDK 호출은 오류를 흡수하는 fire-and-forget 경계 뒤에 둔다. 허용된 이벤트와 속성은 실제 성공 경계의 호출부와 payload test로 유지한다.

App provider가 Session query 경계 밖에서 anonymous client를 초기화하여 guest·Session error 화면에서도 자동 수집과 replay를 유지한다. Session 내부의 bridge는 guest에서 이전 identity를 clear하고, valid Session에서 Account ID를 identify한다. 명시적 로그아웃 경계도 서버 로그아웃과 actor reset이 완료된 뒤 identity를 clear한다. Profile·Post·Follow mutation과 검색 UI는 기존 성공 callback에서만 event helper를 호출한다.

SDK는 `trackScreenViews`, `trackOutgoingLinks`, `trackAttributes`를 활성화하고 replay를 10%로 설정한다. `maskAllInputs`를 사용하고 canonical Post Content root에는 플랫폼 분기 없이 OpenPanel replay block attribute를 부여해 텍스트와 하위 DOM 속성을 함께 제외한다.

개인정보 처리방침은 인증 바깥 `/privacy` route로 제공하고 landing과 menu에서 연결한다. OpenPanel 배포·검증·Account별 삭제는 운영 문서에 분리해 기록한다.

### Allowed Alternatives

- 동일한 플랫폼 분리와 failure isolation을 보장한다면 provider 대신 Web layout effect에서 Session identity를 동기화할 수 있다.
- event helper를 별도 component나 hook으로 감싸더라도 같은 failure isolation을 보장할 수 있다.

### Known Traps

- Client ID가 없는 환경에서 SDK singleton 또는 browser listener를 생성하면 no-op 요구를 위반한다.
- 이름, handle, 검색어, Post 본문, 오류 원문을 event property나 identity trait로 보내면 허용된 taxonomy를 벗어난다.
- mutation 요청 직후 또는 optimistic update 시점의 이벤트는 실제 성공보다 먼저 기록될 수 있다.
- replay mask를 개별 Post surface에 반복하면 새 surface에서 누락되므로 canonical renderer 경계에 적용해야 한다.
- 분석 오류를 사용자 오류 상태나 Sentry에 전달하면 제품 실패 또는 재귀적인 telemetry가 발생할 수 있다.

## Risks / Trade-offs

- [자동 화면 추적 URL에 검색 query가 포함됨] → 개인정보 처리방침에 이를 명시하고 명시적 검색 이벤트에는 query를 포함하지 않는다.
- [표시명·handle 등 Post 밖 텍스트가 replay에 보일 수 있음] → 승인된 범위를 고지하고 입력값은 마스킹하며 Post Content subtree는 수집에서 제외한다.
- [Client ID가 공개 Web bundle에 포함됨] → 비밀로 취급하지 않고 OpenPanel project 설정과 ingress에서 허용 origin을 제한한다.
- [수동 Account 삭제가 느리거나 실수 위험이 있음] → 대상 확인, dry-run, 승인, 삭제, 잔존 검증 순서를 runbook으로 고정하고 자동화는 후속 이슈로 분리한다.
- [분석 차단기나 endpoint 장애로 데이터가 누락될 수 있음] → 분석은 best-effort로 취급하고 제품 흐름의 가용성을 우선한다.

## Migration Plan

1. SDK와 Web 전용 분석 경계, identity, 명시적 이벤트, replay 마스킹을 배포한다.
2. 개인정보 처리방침과 운영 runbook을 함께 배포한다.
3. production build에만 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`를 주입한다.
4. production에서 anonymous screen, 로그인 identify, 핵심·검색 이벤트, replay 마스킹과 로그아웃 clear를 검증한다.
5. 문제가 있으면 build의 Client ID 주입을 제거해 client 생성을 중단하고, 필요하면 이전 image로 rollback한다.

## Open Questions

없음.
