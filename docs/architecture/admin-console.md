# Admin Console v1 아키텍처

## 목적과 범위

Admin Console은 신뢰된 Tailscale proxy 뒤에서 KOSMO의 Account와 Profile 운영 정보를 읽는 내부 Web
surface다. v1은 Account, Profile과 Account-Profile Membership을 변경하지 않는다.

이 문서는 요청이 Tailscale 접근 경계를 통과해 read projection으로 변환되는 구조를 정의한다. 객체별 허용
필드와 제외 필드는 [Admin Console Read Policy](../domain/policies/admin-console-read.md), Admin Console
Viewer와 `Account.Operator`의 분리는
[ADR 0026](../domain/decisions/0026-admin-console-tailscale-access-boundary.md)가 소유한다. 구체적인 route, GraphQL
field, 저장 모델과 UI layout은 각 구현 slice에서 정한다.

## 신뢰 경계

Admin Console 진입 권한의 source of truth는 Tailscale 접근 정책이다. 허용된 주체의 요청만 신뢰된 Tailscale
Operator Ingress와 Admin Service의 네트워크 경계를 통해 runtime에 도달한다. 애플리케이션은 App
Capabilities나 객체별 action을 추가로 계산하지 않는다.

- Admin Console Viewer는 Kosmo Account가 아니며 `Account.Operator` 권한을 얻지 않는다.
- 진입이 허용된 Viewer는 Account, Profile, Account-Profile Membership projection을 모두 읽을 수 있다.
- proxy identity header의 login과 display name은 선택적 표시 metadata이며 인가, Account 매핑, 조회 filter
  또는 projection 계산에 사용하지 않는다.
- client가 직접 주입한 identity header나 일반 workload가 신뢰된 proxy를 우회한 ClusterIP·Pod IP 요청은
  Admin Console 접근 경계가 아니다.
- Kubernetes node 자체, kubelet과 node 권한을 가진 운영 주체의 node-origin 연결은 신뢰된 인프라로 보고
  이번 위협 모델의 차단 대상에서 제외한다.
- public Gateway, Funnel 또는 외부 LoadBalancer는 Admin Console entry로 사용하지 않는다.

Admin ingress가 제공하는 Tailscale identity wire header의 UTF-8 Q encoded-word는 transport 구현에서
정규화한다. Q 인코딩 문법 또는 UTF-8 검증에 실패한 선택적 identity는 없는 것으로 취급하며 접근 결과를
바꾸지 않는다. 도메인 정책은 transport header를 인가 입력으로 소비하지 않는다.

## 요청 처리 경계

```text
Tailscale access policy
  -> trusted Operator Ingress
  -> network-restricted Admin Service
  -> Admin Console entry
  -> viewer-scoped query / loader
  -> policy projection
  -> response
```

1. Tailscale 접근 정책은 요청 주체가 Admin Console entry에 연결할 수 있는지 결정한다.
2. Operator Ingress는 허용된 요청을 ClusterIP Admin Service로 전달하고 선택적 identity metadata를 제공한다.
3. NetworkPolicy는 일반 workload에서 오는 Admin ingress를 해당 proxy 경계로 제한한다. node-origin probe와
   연결은 차단 대상으로 삼지 않는다. 실제 operator-generated proxy label은 배포 대상 버전과 live cluster에서
   확인한 뒤 selector로 고정한다.
4. query 계층은 [Admin Console Read Policy](../domain/policies/admin-console-read.md)의 projection을 적용한다.
5. response 조합은 Account, Profile, Membership projection을 구조적으로 분리한다.

read-only query는 state-changing application action이 아니므로 불필요한 `packages/core/services`
pass-through service를 만들지 않는다. 구현은 [Core 서비스 경계](./core-services.md)의 read query/loader 방향을
따른다.

## Projection 분리

세 projection은 같은 Admin Console Viewer에게 열리지만 응답 책임은 분리한다.

| projection                 | 책임                                        |
| -------------------------- | ------------------------------------------- |
| Account                    | Account 목록·상세와 OIDC subject exact 검색 |
| Profile                    | Profile 목록·상세                           |
| Account-Profile Membership | 두 객체 사이의 관계와 양방향 탐색           |

Account와 Profile projection은 상대 객체의 존재, Membership, 관계 count를 포함하지 않는다. 관계 정보는 별도
Membership projection으로만 받는다. selected Profile은 Membership이 아니라 Session 상태이므로 세
projection 모두에 포함하지 않는다.

OIDC subject, credential, Session token, private key를 포함한 세부 필드 경계는 architecture 문서에서 반복하지
않고 [Admin Console Read Policy](../domain/policies/admin-console-read.md)를 따른다.

## 실패 경계

- Tailscale 접근 정책에서 허용되지 않은 주체는 Admin Console entry에 연결할 수 없어야 한다.
- 일반 workload가 trusted proxy와 NetworkPolicy 경계를 우회한 ClusterIP·Pod IP 요청은 runtime에 도달할 수
  없어야 한다.
- node-origin 연결과 node 권한을 가진 운영 주체는 이 아키텍처의 차단 보장 범위에 포함하지 않는다.
- 선택적 identity 정규화 실패는 metadata 누락으로 처리하며 허용된 Viewer의 접근을 바꾸지 않는다.
- query의 not-found와 내부 실패는 연결 접근 실패와 구분한다.
- 외부 응답에는 proxy header, 내부 경로와 backend 원문 오류를 포함하지 않는다.

## 로깅 제외

Admin Console v1은 성공·실패 조회, identity snapshot, 접근 거부, proxy 우회·위조 header를 위한
Admin-specific logging, audit 또는 security-event contract를 만들지 않는다. 기존 공통 runtime 오류·접근
로그의 생명주기는 이 아키텍처가 변경하지 않는다.

## 전달 경계

- `PROD-690`은 독립 runtime, Tailscale Operator Ingress와 직접 접근 차단 기반을 소유한다.
- `PROD-691`과 `PROD-692`는 각각 Account와 Profile read projection을 소유한다.
- `PROD-693`은 Membership relation projection을 소유한다.
- OpenSpec, 애플리케이션 구현, Figma와 배포는 PROD-689 및 이 문서의 범위가 아니다.
- 취소된 `DSN-59`의 화면·검토·구현 범위는 이 architecture 문서로 복원하지 않는다.
