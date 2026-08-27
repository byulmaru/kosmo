## 1. PROD-690 Admin runtime

**Authority / Provenance**

- `docs/domain/policies/admin-console-read.md`
- `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`
- `docs/architecture/admin-console.md`
- `PROD-689`
- `PROD-690`

**Deliverable**

독립 Admin runtime이 workload probe와 읽기 전용 shell을 제공한다.

**Guardrails**

- application-level App Capability나 객체별 action 검사를 추가하지 않는다.
- 선택적 identity는 표시 metadata로만 사용하며 Kosmo Account에 매핑하지 않는다.
- 정의되지 않은 route는 기본 거부하고 Admin-specific logging은 추가하지 않는다.

**Verification**

- package typecheck와 unit test로 probe, default deny, identity 독립성과 shell 응답을 검증한다.

- [ ] 1.1 독립 workspace package와 probe·shell runtime을 추가한다.
- [ ] 1.2 선택적 Viewer identity 표시와 익명 fallback을 구현한다.
- [ ] 1.3 identity·route matrix unit test를 추가하고 package check를 통과시킨다.

## 2. PROD-690 Image와 Tailscale Operator Ingress 배포

**Authority / Provenance**

- `docs/architecture/admin-console.md`
- `PROD-690`

**Deliverable**

기존 application image가 Admin runtime을 실행하고, Tailscale Operator Ingress와 ClusterIP Service를 통해서만
tailnet 요청이 Admin workload에 도달한다.

**Guardrails**

- public Gateway/HTTPRoute, Funnel과 application LoadBalancer를 만들지 않는다.
- App Capability, Serve sidecar, Admin 전용 Tailscale node state나 bootstrap credential을 만들지 않는다.
- 일반 workload의 Admin ingress는 기본 거부하고 해당 Operator proxy만 허용한다. node-origin 연결은 차단
  범위에서 제외한다.

**Verification**

- image boot smoke와 dev/prod Helm lint·render로 entrypoint, Deployment, Service, Ingress, NetworkPolicy,
  probe와 public resource 부재를 확인한다.

- [ ] 2.1 application image와 entrypoint에 Admin runtime을 포함한다.
- [ ] 2.2 Admin Deployment, ClusterIP Service와 Tailscale Operator Ingress를 Helm에 추가한다.
- [ ] 2.3 generated proxy label을 확인하고 일반 workload source를 제한하는 최소 NetworkPolicy를 추가한다.
- [ ] 2.4 Admin image boot와 dev/prod Helm render 검증을 추가하고 통과시킨다.

## 3. PROD-690 통합 검증과 운영 handoff

**Authority / Provenance**

- `docs/domain/policies/admin-console-read.md`
- `docs/architecture/admin-console.md`
- `PROD-690`

**Deliverable**

repository 검증과 실제 dev tailnet 관찰이 Admin shell의 허용·거부, 직접 접근 차단과 배포 readiness를 구분해
증명한다.

**Guardrails**

- artifact, Helm render와 CI 성공을 실제 tailnet 배포·접속 증거로 대체하지 않는다.
- 사용자 식별자, credential 값과 identity header를 문서·test output·PR에 기록하지 않는다.
- OpenSpec archive는 이 change의 모든 task와 live 검증이 끝난 뒤 별도로 판단한다.

**Verification**

- workspace lint/test와 OpenSpec strict validation을 실행한다.
- dev workload Ready, tailnet 허용·거부 Viewer, 일반 Pod·node 밖 VPC source의 ClusterIP·Pod IP direct access
  차단과 공개 인터넷 비노출을 실제 환경에서 확인한다. node-origin과 node로 source NAT된 경로는 차단 증거에서
  제외하고 source 경계를 기록한다.

- [ ] 3.1 접근 정책 prerequisite, deploy·검증·rollback 절차를 사용자 식별자나 credential 값 없이 문서화한다.
- [ ] 3.2 workspace lint/test, image와 Helm 검증, OpenSpec strict validation을 통과시킨다.
- [ ] 3.3 dev에서 workload readiness와 Operator Ingress 전달을 확인한다.
- [ ] 3.4 dev tailnet의 허용·거부 접근과 일반 Pod·node 밖 VPC direct access·공개 인터넷 비노출을 확인하고,
      node-origin 예외를 구분해 기록한다.
- [ ] 3.5 모든 repository와 live 검증이 끝난 뒤 change archive 담당과 완료 여부를 확정한다.
