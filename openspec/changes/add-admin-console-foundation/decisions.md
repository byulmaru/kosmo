## Context

이 기록은 PROD-689와 ADR 0026의 단일 Admin Console Viewer 계약을 PROD-690의 runtime·cluster 전달 경계로
구현하기 위한 결정을 남긴다.

## Decision Records

### Tailscale 접근 정책을 단일 admission 근거로 사용한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/admin-console-read.md`,
  `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`, `docs/architecture/admin-console.md`,
  `PROD-689`, `PROD-690`
- Status: Active
- Context / Problem: v1의 Account, Profile, Membership 읽기를 서로 다른 application 권한으로 나눌 제품 요구가
  없다.
- Decision Outcome: Tailscale 접근 정책을 통과한 Admin Console Viewer에게 하나의 admission을 부여한다.
  애플리케이션은 App Capability와 객체별 action을 소비하거나 계산하지 않는다.
- Alternatives Considered: App Capability action 분리는 불필요한 전달·검증 경계를 만들고 현재 Operator
  Ingress가 `AcceptAppCaps`를 선언하지도 않으므로 선택하지 않았다.
- Consequences: 후속 세 read projection은 같은 Viewer gate를 공유하되 응답 구조와 필드 계약은 분리한다.
- Confirmation / Follow-up: Linear PROD-689~693과 canonical 문서를 같은 계약으로 유지한다.

### Tailscale Operator Ingress와 ClusterIP Service를 사용한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/admin-console.md`, `PROD-690`
- Status: Active
- Context / Problem: App Capability 전달이 필요하지 않으므로 same-Pod Serve sidecar와 독립 node lifecycle을
  운영할 이유가 없다.
- Decision Outcome: `ingressClassName: tailscale` Ingress가 ClusterIP Admin Service로 요청을 전달한다.
  public Gateway/HTTPRoute, Funnel과 application LoadBalancer는 만들지 않는다.
- Alternatives Considered: Serve sidecar는 별도 node state·credential·lifecycle을 만들고 public ingress는 내부
  Admin surface를 노출하므로 선택하지 않았다.
- Consequences: Operator가 proxy identity와 lifecycle을 소유하며 Admin Pod는 일반 HTTP listener를 사용한다.
- Confirmation / Follow-up: Helm render와 dev tailnet hostname 응답으로 전달 경계를 확인한다.

### NetworkPolicy로 Admin workload 직접 접근을 차단한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/admin-console.md`, `PROD-690`
- Status: Active
- Context / Problem: ClusterIP와 Pod IP는 cluster·VPC 경로에서 직접 접근될 수 있어 Tailscale admission을 우회할
  수 있다.
- Decision Outcome: 일반 workload에서 오는 Admin ingress를 기본 거부하고 해당 Operator proxy만 application
  port에 허용한다. Kubernetes node 자체, kubelet과 node 권한을 가진 운영 주체의 node-origin 연결은 차단
  범위에서 제외한다.
- Alternatives Considered: ClusterIP type, tailnet ACL 추정 또는 caller header 검사는 직접 network path를
  닫지 못하므로 선택하지 않았다.
- Consequences: generated proxy label을 Operator 버전 및 live cluster에서 확인해야 한다. node로 source NAT된
  경로까지 차단했다고 주장하지 않는다.
- Confirmation / Follow-up: Helm fixture와 dev의 일반 Pod·node 밖 VPC direct-access test로 차단을 확인하고
  관찰된 source 경계를 함께 기록한다.

### 선택적 identity는 표시 metadata로만 사용한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`,
  `PROD-689`, `PROD-690`
- Status: Active
- Context / Problem: Tailscale login과 display name은 현재 Viewer를 설명할 수 있지만 admission과 Kosmo 도메인
  권한을 대신할 수 없다.
- Decision Outcome: 제공된 login과 display name만 정규화해 표시한다. 누락·정규화 실패는 익명 Viewer label로
  대체하고 접근 결과를 바꾸지 않는다.
- Alternatives Considered: identity를 인가나 Account 매핑에 사용하면 Tailscale 주체와 Kosmo 도메인 주체가
  합쳐지므로 선택하지 않았다.
- Consequences: profile picture header는 사용하지 않고 identity 처리 실패는 요청 실패가 아니다.
- Confirmation / Follow-up: identity 있음·없음·정규화 실패 fixture에서 같은 shell 접근 결과를 검증한다.

### 독립 SvelteKit adapter-node runtime을 선택한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-690`의 구현 방향 확정
- Status: Active
- Context / Problem: 기존 Hono inline HTML shell은 동작을 제공하지만, Admin UI와 후속 server loader를 하나의
  Web runtime 경계에서 확장할 기반이 필요하다. 이번 PR에서는 별도 REST/GraphQL API나 공용 UI package를 만들지
  않는다.
- Decision Outcome: `apps/admin`은 SvelteKit과 `@sveltejs/adapter-node`를 사용하는 독립 Web-only 앱으로
  구현한다. `hooks.server.ts`에서 선택적 Viewer metadata를 request-local data로 정규화하고 root server
  layout/loader에서 현재 read-only shell에 전달한다. 후속 loader는 repository read query를 직접 호출할 수
  있지만, 이번 PR에서는 DB query를 호출하지 않는다.
- Alternatives Considered: Hono inline HTML은 현재 shell에는 작지만 UI 확장과 server loader 경계를 별도로
  설계해야 하므로 선택하지 않았다. React SPA와 별도 API는 브라우저와 서버 사이의 REST/GraphQL 계약을 새로
  만들게 되므로 선택하지 않았다. Expo Web은 공용 UI가 이번 PR의 목표가 아니며 Web-only Admin에 React Native
  플랫폼 제약과 앱 공용화 비용을 추가하므로 선택하지 않았다.
- Consequences: Svelte, SvelteKit, Vite와 adapter-node build/runtime dependency를 별도로 소유한다. UI
  컴포넌트·theme는 `apps/app`과 공유하지 않으며, 현재 PR의 화면은 shell에 한정한다. 후속 조회 화면은 같은
  server loader 경계에서 read query를 연결할 수 있지만 그 시점에 query·projection 계약을 별도로 검증한다.
- Confirmation / Follow-up: SvelteKit package check와 production build, image boot smoke에서 기존 shell·probe·
  no-store·CSP 동작을 확인한다.

### Admin-specific 관측 기능을 추가하지 않는다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/admin-console-read.md`,
  `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`, `docs/architecture/admin-console.md`,
  `PROD-689`, `PROD-690`
- Status: Active
- Context / Problem: 기존 Web/API middleware를 재사용하면 이번 v1에서 제외한 Admin-specific 기록을 함께
  도입할 수 있다.
- Decision Outcome: Admin package는 request logger, Sentry, audit writer나 identity snapshot을 연결하지 않는다.
- Alternatives Considered: 기존 Web/API 관측 경계 재사용과 새 Admin security-event는 upstream 제외 범위를
  바꾸므로 선택하지 않았다.
- Consequences: 검증은 응답·network·workload 상태로 수행한다.
- Confirmation / Follow-up: package dependency와 source에서 해당 integration이 없는지 정적으로 확인한다.

## Remaining Decisions

- dev tailnet hostname과 허용 principal은 live 배포 전에 확인한다.
- NetworkPolicy selector에 사용할 Operator-generated proxy label은 대상 Operator 버전과 live resource에서
  확인한다.

## Superseded Decisions

- 같은 Pod의 Tailscale Serve sidecar, `AcceptAppCaps`, localhost shell listener, 별도 probe listener와 persistent
  node-state Secret을 사용한다는 초안 결정은 App Capability를 사용하지 않는 것으로 확정하면서 구현 전에
  폐기했다.
