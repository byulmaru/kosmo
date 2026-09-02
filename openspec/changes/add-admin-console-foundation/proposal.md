## Why

Kosmo에는 공개 Web/API와 분리되고 Tailscale 접근 제어로만 진입할 수 있는 Admin Console runtime이 없다.
후속 Account·Profile·Membership 조회를 추가하기 전에 독립 shell, cluster 전달 경계와 직접 접근 차단을 하나의
기반으로 제공해야 한다.

## What Changes

- 독립 workspace package `apps/admin`에 SvelteKit과 `@sveltejs/adapter-node` 기반 runtime을 추가해 `/healthz`, 기본 deny와 읽기 전용 빈 Admin Console shell을 제공한다.
- Tailscale 접근 정책을 통과한 Viewer가 별도 app capability나 객체별 action 없이 shell에 진입하도록 한다.
- Admin runtime을 기존 application image와 entrypoint에 포함한다.
- Tailscale Operator Ingress, ClusterIP Service와 NetworkPolicy를 추가해 일반 workload에서는 Operator
  proxy를 통해서만 Admin workload에 도달하도록 한다. node-origin 연결은 차단 범위에서 제외한다.
- public Gateway/HTTPRoute, Funnel, application LoadBalancer는 추가하지 않는다.
- 선택적 Tailscale login과 display name은 표시 metadata로만 사용하고 애플리케이션 인가에는 사용하지 않는다.
- 현재 PR에서는 shell만 제공하며, SvelteKit server loader를 통한 read query 호출과 REST/GraphQL endpoint는 후속 조회 PR에서 다룬다.
- Admin-specific logging, audit, security event와 identity snapshot은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/policies/admin-console-read.md`,
  `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`,
  `docs/architecture/admin-console.md`
- Linear Contract: `PROD-689`
- Linear Implementation: `PROD-690`

## Capabilities

이 섹션의 capability는 OpenSpec 기능 단위이며 Tailscale App Capability가 아니다.

### New Capabilities

- `admin-console-foundation`: 독립 Admin runtime, Tailscale admission, trusted Operator Ingress와 network
  isolation을 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/admin`: 신규 독립 Node/SvelteKit runtime, adapter-node build output, read-only shell과 테스트
- `Dockerfile`, `docker-entrypoint.sh`, workspace lockfile: Admin runtime build·실행 포함
- `apps/helm`: Admin Deployment, ClusterIP Service, Tailscale Operator Ingress와 NetworkPolicy
- CI/검증: package typecheck·unit test·production build, image boot, Helm render와 network-isolation smoke
