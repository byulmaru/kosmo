## Context

`apps/web`과 `apps/api`는 Hono 기반 Node runtime이며 하나의 application image를 서로 다른 entrypoint로
실행한다. `apps/helm`은 공개 runtime을 Argo Rollout, ClusterIP Service와 Gateway API HTTPRoute로 배포하지만,
Admin Console은 이 공개 경계를 재사용할 수 없다.

Tailscale Operator Ingress는 Kubernetes Service를 L7 proxy한다. Admin Console의 admission은 tailnet의 접근
정책이 소유하며 애플리케이션은 App Capability header나 객체별 action을 해석하지 않는다. ClusterIP와 Pod IP는
cluster 또는 VPC 경로에서 직접 접근될 수 있으므로 Service type만으로 신뢰 경계가 닫히지 않는다.

## Goals / Non-Goals

**Goals:**

- 공개 runtime과 분리된 Admin shell·probe runtime을 만든다.
- Tailscale 접근 정책에서 허용된 Viewer에게 v1 읽기 전체의 공통 admission을 제공한다.
- Operator Ingress 뒤의 ClusterIP Service와 NetworkPolicy로 일반 workload의 직접 Service·Pod 접근을 차단한다.
- runtime, image, Helm render와 trust-boundary fixture를 자동 검증한다.

**Non-Goals:**

- Account, Profile, Membership data query와 GraphQL schema
- `apps/app`과의 공용 UI package
- 이번 PR의 REST/GraphQL endpoint와 DB read query 호출
- Tailscale App Capability, `AcceptAppCaps`, `Tailscale-App-Capabilities`와 application-level action authorization
- same-Pod Tailscale Serve sidecar, node state와 bootstrap credential
- public Gateway/HTTPRoute, Funnel 또는 application LoadBalancer
- Kosmo Account/Operator 매핑
- Admin-specific logging, audit, security event와 snapshot

## Implementation Guidance

### Recommended Approach

`apps/admin`은 `@sveltejs/adapter-node`로 빌드되는 독립 SvelteKit app을 Pod network에서 실행한다.
`GET /healthz`와 read-only shell route만 제공하고 정의되지 않은 route는 기본 거부한다. shell은 외부 asset이나
data query 없이 현재 Admin Console Viewer의 선택적 표시 metadata만 보여준다.

`hooks.server.ts`는 선택적 identity header를 request-local data로 정규화하고, root server layout/loader는 이를
shell에 전달한다. 이 server loader 경계는 후속 read projection에서 repository read query를 직접 호출할 수 있는
자리지만, 이번 PR에서는 DB query를 호출하지 않고 REST/GraphQL endpoint도 만들지 않는다.

선택적 identity header가 제공되면 login과 display name만 정규화해 표시한다. identity 누락이나 정규화 실패는
`식별 정보 없는 Admin Console Viewer`로 처리하며 admission 결과를 바꾸지 않는다. profile picture header나
identity 값을 Kosmo Account에 매핑하지 않는다.

Helm은 Admin Deployment, ClusterIP Service와 `ingressClassName: tailscale` Ingress를 만든다. public
Gateway/HTTPRoute와 application LoadBalancer는 만들지 않는다. Tailscale 접근 정책의 principal, hostname과
grant 자체는 cluster 외부 운영 설정이므로 repository에 사용자 식별자나 credential 값을 저장하지 않는다.

NetworkPolicy는 일반 workload에서 오는 Admin ingress를 기본 거부하고 Operator가 생성한 해당 Ingress
proxy만 application port에 접근하도록 허용한다. Kubernetes node 자체와 kubelet probe를 포함한 node-origin
연결은 차단 범위에서 제외한다. selector에 사용할 generated proxy label은 배포 대상 Operator 버전과 live
cluster에서 확인한 뒤 고정한다. label을 확인하기 전 특정 값을 durable 계약으로 가정하지 않는다.

shell과 SvelteKit page-data 응답은 `Cache-Control: no-store`를 사용한다. 생성된 immutable asset만 장기 cache를
허용하고, CSP는 self-origin script/style/connect만 허용하며 object와 frame embedding은 거부한다.

### Known Traps

- App Capability 전달을 위해 미지원 annotation이나 Serve sidecar를 추가하지 않는다.
- ClusterIP, caller IP, Host, `X-Forwarded-*`, identity header 또는 내부 shared secret을 application admission
  근거로 사용하지 않는다.
- public Gateway/HTTPRoute, Funnel이나 application LoadBalancer로 별도 entry를 만들지 않는다.
- NetworkPolicy 없이 ClusterIP만 만들고 일반 workload의 직접 접근 차단을 완료로 판단하지 않는다.
- Admin runtime에 기존 Web/API의 Sentry 또는 request logging middleware를 연결하지 않는다.

## Risks / Trade-offs

- [Generated proxy label은 Operator 버전과 실제 resource에 의존함] → dev에서 생성된 proxy Pod label을 확인한
  뒤 policy selector를 고정하고 Helm fixture와 live direct-access test를 함께 둔다.
- [독립 SvelteKit/Vite 생태계를 별도로 운영해야 함] → 공용 UI package를 이번 PR에 추가하지 않고, 현재 shell과
  server loader 경계만 소유한다. 후속 화면의 공용화 필요성은 별도 결정으로 판단한다.
- [NetworkPolicy selector가 Operator proxy를 차단할 수 있음] → generated proxy source를 확인하고 workload
  readiness와 tailnet 응답을 별도 증거로 수집한다.
- [표준 NetworkPolicy는 node-origin traffic을 차단하지 않음] → node 자체, kubelet과 node 권한을 가진 운영
  주체는 신뢰된 인프라로 보고 v1 위협 모델에서 제외한다. node로 source NAT된 경로까지 차단했다고 주장하지
  않고 live direct-access 결과에 source 경계를 함께 기록한다.
- [Tailscale 접근 정책은 repository 밖에서 관리됨] → 허용·거부 principal의 실제 설정을 repository 검증과
  분리하고, dev tailnet 통합 전제와 관찰 결과를 명시한다.

## Migration Plan

1. Admin SvelteKit package production build, image entrypoint와 Helm render를 배포 전 검증한다.
2. dev Operator 버전, generated proxy label, hostname과 Tailscale 접근 정책 준비를 확인한다.
3. dev에 Deployment, Service, Ingress와 NetworkPolicy를 sync하고 workload readiness를 확인한다.
4. 허용된 Viewer와 허용되지 않은 tailnet 주체의 hostname 접근을 각각 검증한다.
5. 일반 Pod와 node 밖 VPC 경로의 ClusterIP·Pod IP 접근 및 공개 인터넷 노출이 차단됨을 별도로 확인하고,
   node-origin 또는 node로 source NAT된 경로는 차단 증거에서 제외한다.
6. rollback은 application revision과 Helm resource를 이전 revision으로 되돌린다. tailnet 접근 정책 변경은 별도
   운영 절차를 따른다.

## Open Questions

- dev tailnet의 hostname과 허용 principal은 배포 전에 확인해야 한다. repository 기본값은 사용자 식별자나
  credential을 소유하지 않는다.
- 현재 환경에서는 live cluster의 generated proxy label, Operator 동작과 직접 접근 차단을 확인하지 못했으므로
  실제 배포 증거는 아직 없다.
