# Admin Console 배포와 검증

Admin Console은 Tailscale 접근 정책과 Operator Ingress를 유일한 진입 경계로 사용한다. Helm chart는 Admin
workload를 별도 opt-in 값 없이 생성하며, hostname은 release name과 환경에서 파생한다.

## 사전 조건

- 대상 cluster의 Tailscale Operator 버전과 `ingressClassName: tailscale` 동작을 확인한다.
- tailnet 접근 정책에서 Admin Console hostname에 접근할 Viewer와 거부할 검증 주체를 준비한다.
- 사용자 식별자, auth key, client secret과 identity header 값은 repository values나 검증 기록에 저장하지 않는다.

merge 후 dev에 배포하면 생성된 Tailscale Ingress proxy가 release·namespace에서 파생된 NetworkPolicy selector와
일치하는지 확인한다. 이 live 확인은 repository CI와 별도의 운영 검증이다.

```sh
kubectl -n tailscale get pods \
  -l tailscale.com/parent-resource-type=ingress \
  --show-labels
```

## Repository 검증

```sh
pnpm --filter @kosmo/admin test
mise exec -- helm lint apps/helm --set env=dev
docker build --target runtime --tag kosmo-admin-smoke .
pnpm exec openspec validate add-admin-console-foundation --strict
```

CI test workflow는 위 검증과 함께 Admin image boot 및 dev/prod Helm render와 HTTP smoke를 실행한다. Helm
hostname은 release name과 환경에서 파생되며 tailnet 운영 설정은 repository 밖에서 관리한다.

## 배포

별도 Admin Helm values는 설정하지 않는다. Tailscale 접근 정책의 principal이나 credential 값은 Helm values에
넣지 않는다. sync 뒤 Deployment, Service, Ingress, NetworkPolicy와 EndpointSlice를 확인하고 workload가 Ready가
되기 전에 tailnet 접근 성공을 주장하지 않는다.

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

application revision을 이전 검증 revision으로 되돌린다. tailnet 접근 정책 변경은 cluster rollback과 분리해 해당
운영 절차로 되돌린다.
