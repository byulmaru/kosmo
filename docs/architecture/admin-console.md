# Admin Console v1 아키텍처

## 목적과 범위

Admin Console은 신뢰된 Tailscale proxy 뒤에서 KOSMO의 Account와 Profile 운영 정보를 읽는 내부 Web
surface다. v1은 Account, Profile과 Account-Profile Membership을 변경하지 않는다.

이 문서는 요청이 신뢰 경계를 통과해 권한별 read projection으로 변환되는 구조를 정의한다. 객체별 허용
필드와 제외 필드는 [Admin Console Read Policy](../domain/policies/admin-console-read.md), Capability Holder와
`Account.Operator`의 분리는
[ADR 0025](../domain/decisions/0025-admin-console-capability-holder-boundary.md)가 소유한다. 구체적인 route,
GraphQL field, 저장 모델과 UI layout은 각 구현 slice에서 정한다.

## 신뢰 경계

Admin Console 인가의 유일한 입력은 신뢰된 Tailscale proxy가 전달한 app capability다. proxy identity
header의 login과 display name은 현재 요청 주체를 표시하기 위한 선택적 metadata이며 인가, Account 매핑,
조회 filter 또는 projection 계산에 사용하지 않는다.

- Capability Holder는 Kosmo Account가 아니며 `Account.Operator` 권한을 얻지 않는다.
- identity header가 없어도 capability가 유효하면 허용된 read를 수행할 수 있다.
- client가 직접 주입한 capability·identity header나 신뢰된 proxy를 우회한 요청은 인가 입력으로 사용하지
  않는다.
- frontend navigation이나 화면 표시 여부는 server-side action 검증을 대신하지 않는다.

Admin ingress는 Tailscale Serve가 전달한 capability와 identity wire header를 RFC 2047 decode하고 UTF-8로
검증한 뒤 downstream에 전달한다. capability header 정규화 실패는 data query 전에 요청을 거부하고, 선택적인
identity header 정규화 실패는 해당 metadata가 없는 것으로 취급해 인가 결과를 바꾸지 않는다. 도메인 정책은
이 경계를 통과한 정규화된 capability JSON만 소비한다.

## 요청 처리 경계

```text
Trusted Tailscale proxy
  -> Admin Console entry
  -> wire header normalization
  -> capability payload validation
  -> supported action set calculation
  -> action-scoped query / loader
  -> policy projection
  -> response
```

1. entry는 trusted proxy 경계를 확인하고 capability·identity wire header를 RFC 2047 decode한 뒤 UTF-8로
   검증한다.
2. 정규화된 capability payload에 target namespace가 없으면 grant 없음으로 처리한다. target namespace가
   존재하지만 그 값, parameter object 또는 `action` 배열 타입이 malformed이면 payload 전체를 거부한다.
   정확한 schema와 valid/malformed 사례는
   [Admin Console Read Policy](../domain/policies/admin-console-read.md)를 따른다.
3. `byulmaru.co/cap/kosmo-admin` namespace의 알려진 action만 모아 합집합을 계산한다. unknown action과
   wildcard는 grant를 만들지 않는다.
4. 필요한 action이 없으면 대상 query나 loader를 실행하기 전에 요청을 거부한다.
5. query 계층은 action에 허용된 객체만 읽고
   [Admin Console Read Policy](../domain/policies/admin-console-read.md)의 projection을 적용한다.
6. response 조합은 권한 없는 객체나 관계를 `null`, `0`, 빈 배열 또는 placeholder로 암시하지 않는다.

wire header 정규화 이후의 read 흐름은 특정 transport에 종속되지 않는다. read-only query는 state-changing
application action이 아니므로 불필요한 `packages/core/services` pass-through service를 만들지 않는다. 구현은
[Core 서비스 경계](./core-services.md)의 read query/loader 방향을 따른다.

## Projection 분리

세 read projection은 서로 독립된 권한 경계다.

| projection                 | 필요한 action                   | 책임                                        |
| -------------------------- | ------------------------------- | ------------------------------------------- |
| Account                    | `account.read`                  | Account 목록·상세와 OIDC subject exact 검색 |
| Profile                    | `profile.read`                  | Profile 목록·상세                           |
| Account-Profile Membership | `account.read` + `profile.read` | 두 객체 사이의 관계와 양방향 탐색           |

Account와 Profile projection은 상대 객체의 존재, Membership, 관계 count를 포함하지 않는다. 두 action을 모두
가진 요청도 관계 정보는 별도 Membership projection으로만 받는다. selected Profile은 Membership이 아니라
Session 상태이므로 세 projection 모두에 포함하지 않는다.

OIDC subject, credential, Session token, private key를 포함한 세부 필드 경계는 architecture 문서에서 반복하지
않고 [Admin Console Read Policy](../domain/policies/admin-console-read.md)를 따른다.

## 실패 경계

- trusted proxy 경계를 확인할 수 없거나 capability header 정규화에 실패하거나 정규화된 payload가
  malformed이면 data query 전에 거부한다.
- capability가 유효하지만 필요한 action이 없으면 해당 객체나 관계 query 전에 거부한다.
- 권한 검증을 통과한 뒤의 not-found와 내부 query 실패는 인가 실패와 구분한다.
- 외부 응답에는 capability payload, proxy header, 내부 경로와 backend 원문 오류를 포함하지 않는다.

## 로깅 제외

Admin Console v1은 성공·실패 조회, capability 판정, identity/capability snapshot, proxy 우회·위조 header를
위한 Admin-specific logging, audit 또는 security-event contract를 만들지 않는다. 기존 공통 runtime
오류·접근 로그의 생명주기는 이 아키텍처가 변경하지 않는다.

## 전달 경계

- `PROD-690`은 trusted proxy와 capability 검증 기반을 소유한다.
- `PROD-691`과 `PROD-692`는 각각 Account와 Profile read projection을 소유한다.
- `PROD-693`은 두 action을 모두 요구하는 Membership relation projection을 소유한다.
- OpenSpec, 애플리케이션 구현, Figma와 배포는 PROD-689 및 이 문서의 범위가 아니다.
- 취소된 `DSN-59`의 화면·검토·구현 범위는 이 architecture 문서로 복원하지 않는다.
