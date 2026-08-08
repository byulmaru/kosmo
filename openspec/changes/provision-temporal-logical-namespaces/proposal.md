## Why

PROD-695로 self-hosted Temporal Server는 준비됐지만 Kosmo가 사용할 logical namespace와 History retention은 아직 Worker rollout 전에 생성·검증되지 않는다. 외부 Terraform runner에서 ClusterIP frontend에 접근하기 위해 third-party provider나 별도 접속 경로를 추가하지 않고, 각 애플리케이션 환경 내부에서 작은 bootstrap Job으로 수렴시킨다.

## What Changes

- 각 Kosmo 환경의 Argo CD sync가 Temporal namespace provisioning PreSync Job을 실행한다.
- Job은 cluster-internal frontend에 연결해 namespace가 없으면 생성하고, 있으면 owner email과 retention을 선언값으로 갱신한다.
- `kosmo-dev`는 3일, `kosmo-prod`는 30일 retention과 공통 owner `dev@byulmaru.co`를 사용한다.
- frontend 연결 또는 CLI 실행이 실패하면 PreSync가 실패하고 후속 workload sync를 차단한다.
- Namespace 삭제는 수행하지 않는다.
- Terraform provider/resource, Tailscale frontend endpoint와 외부 runner port-forward는 도입하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. application-owned logical namespace와 platform-owned Temporal Server 경계는 Linear 계약으로 확정한다.
- Linear Contract: [PROD-719](https://linear.app/byulmaru/issue/PROD-719/kosmo-temporal-logical-namespace를-presync에서-프로비저닝한다)
- Linear Implementations: PROD-719. 후속 Worker runtime은 [PROD-730](https://linear.app/byulmaru/issue/PROD-730/kosmo-temporal-worker-runtime을-구현배포한다)가 소유한다.

## Capabilities

### New Capabilities

- `temporal-namespace-provisioning`: 환경별 Argo CD PreSync Job이 cluster-internal Temporal namespace의 생성과 owner·retention 수렴을 수행한다.

### Modified Capabilities

없음.

## Impact

- `apps/helm`에 환경별 Temporal namespace 설정과 PreSync Job이 추가된다.
- Temporal CLI를 제공하는 고정된 호환 image가 runtime dependency로 추가된다.
- API, Web, application Terraform, Temporal Worker SDK와 business Workflow에는 변경이 없다.
