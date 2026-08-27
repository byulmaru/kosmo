# Admin Console 배포와 검증

Admin Console은 Tailscale 접근 정책과 Operator Ingress를 유일한 진입 경계로 사용한다. repository의 Helm
기본값은 `admin.enabled=false`이며, 실제 tailnet hostname과 proxy label을 확인하기 전에는 workload를
활성화하지 않는다.

## 사전 조건

- 대상 cluster의 Tailscale Operator 버전과 `ingressClassName: tailscale` 동작을 확인한다.
- tailnet 접근 정책에서 Admin Console hostname에 접근할 Viewer와 거부할 검증 주체를 준비한다.
- 기존 Tailscale Ingress proxy Pod에서 대상 Operator 버전이 생성하는 parent-resource label key를 확인한다.
- 실제 Admin Ingress 이름·namespace에 대응하는 proxy Pod label value를 확인할 절차를 준비한다.
- 사용자 식별자, auth key, client secret과 identity header 값은 repository values나 검증 기록에 저장하지 않는다.

기존 Ingress proxy의 label shape는 다음처럼 확인할 수 있다.

```sh
kubectl -n tailscale get pods \
  -l tailscale.com/parent-resource-type=ingress \
  --show-labels
```

관찰한 label을 그대로 복사하지 말고 대상 Admin Ingress의 resource name과 namespace에 대응하는지 확인한다.
NetworkPolicy는 `admin.tailscale.namespace`와 `admin.tailscale.proxyPodLabels`가 모두 실제 proxy와 일치할 때만
활성화한다.

## Repository 검증

```sh
pnpm --filter @kosmo/admin test
mise exec -- ./scripts/test-admin-helm.sh
./scripts/test-admin-image.sh
openspec validate add-admin-console-foundation --strict
```

Helm fixture의 `example.ts.net`과 proxy label 값은 render 검증용이며 실제 tailnet 설정이 아니다.

## 배포

환경별 Argo CD Helm values에 다음 값만 설정한다.

```yaml
admin:
  enabled: true
  tailscale:
    hostname: <tailnet short hostname>
    fqdn: <tailnet FQDN>
    namespace: tailscale
    proxyPodLabels:
      <live-verified label key>: <live-verified label value>
```

Tailscale 접근 정책의 principal이나 credential 값은 Helm values에 넣지 않는다. sync 뒤 Deployment, Service,
Ingress, NetworkPolicy와 EndpointSlice를 확인하고 workload가 Ready가 되기 전에 tailnet 접근 성공을 주장하지
않는다.

## Live 검증

다음 결과를 서로 다른 증거로 기록한다.

1. Admin Deployment와 EndpointSlice가 Ready다.
2. 허용된 Viewer가 tailnet hostname에서 shell을 받는다.
3. 허용되지 않은 tailnet 주체는 Admin runtime에 도달하지 않는다.
4. 일반 Pod와 node 밖 VPC source가 ClusterIP와 Pod IP의 application port에 직접 연결할 수 없다.
5. 공개 인터넷에서 hostname과 backend에 연결할 수 없다.

Kubernetes node 자체, kubelet, node 권한을 가진 운영 주체와 node로 source NAT된 연결은 차단 증거에서
제외하고 관찰된 source 경계를 함께 기록한다. identity login/display name은 표시 확인에만 사용하며 실제 값을
검증 출력에 남기지 않는다.

## Rollback

application revision을 이전 검증 revision으로 되돌리거나 `admin.enabled=false`로 sync해 Admin Deployment,
Service, Ingress와 NetworkPolicy를 함께 제거한다. tailnet 접근 정책 변경은 cluster rollback과 분리해 해당 운영
절차로 되돌린다. merge, image build, Argo CD sync와 live 접근은 각각 별도 완료 증거로 취급한다.
