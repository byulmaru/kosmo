# PostgreSQL runtime client certificate 운영

## 범위

이 문서는 CloudNativePG가 `kosmo_api`, `kosmo_worker` DatabaseRole에 발급하는 client certificate의 선택적 소비·회전·rollback 경계를 정의한다.

- API와 Worker certificate 소비는 각각 opt-in이다. 비활성 경로는 기존 owner password·SCRAM과 direct `<cluster>-rw` endpoint를 유지한다.
- `kosmo_api` certificate는 API와 Web BFF 기본 connection만 사용한다. API에는 Worker certificate를 주입하지 않는다.
- `kosmo_worker` certificate는 Web trusted federation connection과 Temporal Worker DB Activity만 사용한다. 실제 client 전환은 PROD-715가 소유한다.
- Workload에는 Cluster CA Secret의 공개 `ca.crt` key만 projection한다. 자동 서명용 `ca.key`는 어떤 application Pod에도 mount하지 않는다.
- Production migration의 `kosmo_migration` LOGIN → `SET ROLE kosmo`, CNPG replication과 기존 Pooler는 변경하지 않는다.
- Application hot reload와 Secret restart controller는 사용하지 않는다. CNPG 갱신 뒤 해당 consumer만 계획 재시작한다.
- Secret 값, private key, certificate 원문과 connection string은 출력하거나 PR·Linear 근거에 첨부하지 않는다.

## 적용 전 확인

대상 namespace와 release를 명시하고 operator/CRD, Cluster CA signing key, 동명 role과 generated Secret 상태를 비민감 정보로 확인한다. Production에서는 아래 명령도 별도 명시적 apply 승인 전에는 read-only로만 실행한다.

```sh
NAMESPACE=kosmo-dev
RELEASE=kosmo
CLUSTER="${RELEASE}-postgres"

kubectl get deployment -n cnpg-system cnpg-controller-manager \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl get crd databaseroles.postgresql.cnpg.io
kubectl get cluster "$CLUSTER" -n "$NAMESPACE" \
  -o jsonpath='{.spec.certificates.clientCASecret}{"\n"}'
kubectl get secret "${CLUSTER}-ca" -n "$NAMESPACE" \
  -o json | jq -r '.data | keys | sort | join(",")'
kubectl get databaserole -n "$NAMESPACE" \
  "${RELEASE}-postgres-api" "${RELEASE}-postgres-worker"
```

Cluster CA Secret에는 자동 발급에 필요한 `ca.key`가 있어야 한다. key 이름만 확인하고 값을 decode하거나 출력하지 않는다. 기존 동명 PostgreSQL role이 있으면 attribute, membership, password 존재 여부와 object ownership을 먼저 확인한다. 선언과 다른 live role을 자동 adopt해도 된다는 근거가 없으면 sync하지 않는다.

## Render와 인증 규칙 확인

기본 render에서는 workload certificate volume/env가 없어야 하며 기존 password Secret과 direct endpoint가 유지돼야 한다. Certificate opt-in render에서는 선택한 역할의 URL, certificate Secret과 Cluster CA의 `ca.crt` projection만 해당 workload에 나타나야 한다. Cluster CA volume에 `ca.key` 또는 Secret 전체가 projection되면 적용하지 않는다.

API와 Worker는 각각 다음 값으로만 opt-in한다. URL은 password를 포함하지 않고 certificate CN과 같은 역할명 및 direct `<cluster>-rw` Service를 사용해야 한다. Certificate mode와 `passwordSecret`은 함께 설정할 수 없다.

```yaml
postgres:
  credentials:
    api:
      databaseUrl: postgres://kosmo_api@<release>-postgres-rw:5432/kosmo
      clientCertificate:
        enabled: true
    worker:
      databaseUrl: postgres://kosmo_worker@<release>-postgres-rw:5432/kosmo
      clientCertificate:
        enabled: true
```

한 역할만 준비할 때는 해당 block만 활성화한다. 이 값의 실제 환경 활성화와 non-owner principal cutover는 PROD-715/716이 소유하며, PROD-470은 어떤 environment values도 활성화하지 않는다.

`pg_hba`는 role별 `hostssl ... cert` 다음 `hostnossl ... reject` 순서여야 한다. CNPG 고정 replication/Pooler 규칙은 그대로 두고 user rule 뒤의 broad SCRAM fallback보다 먼저 적용한다. 인증 실패는 다음 HBA 줄로 fall through하지 않는다.

```sh
helm template "$RELEASE" apps/helm --namespace "$NAMESPACE" --set env=dev \
  | rg -n 'pg_hba|hostssl|hostnossl|DATABASE_URL|PGSSL|volumeMounts|secretName'
```

## 비운영 연결 검증

Git에 반영된 manifest를 GitOps로 적용한 뒤 다음 상태만 기록한다.

```sh
kubectl get databaserole -n "$NAMESPACE" \
  "${RELEASE}-postgres-api" "${RELEASE}-postgres-worker" \
  -o custom-columns=NAME:.metadata.name,APPLIED:.status.applied,EXPIRES:.status.clientCertificate.expiration
kubectl get secret -n "$NAMESPACE" \
  "${RELEASE}-postgres-api-client-cert" \
  "${RELEASE}-postgres-worker-client-cert" \
  -o json | jq -r '.items[] | [.metadata.name, (.data | keys | sort | join(","))] | @tsv'
```

`pg_hba_file_rules`에 두 역할의 `hostssl cert`와 `hostnossl reject`가 올바른 순서로 나타나는지 확인한다. 선택한 workload 안에서 새 connection의 `current_user`가 certificate CN 역할과 일치해야 한다. 다른 역할 certificate, certificate 없는 TLS, non-TLS와 일부만 설정된 certificate 입력은 성공해서는 안 된다. 검증용 SQL 결과는 역할명과 성공/실패만 기록한다.

## Certificate 갱신과 계획 재시작

CNPG는 DatabaseRole status의 expiration 전에 certificate Secret을 갱신한다. 기존 Postgres.js process와 pool은 파일을 자동으로 다시 읽지 않으므로 expiration과 Secret resource version을 관측하고 만료 전에 해당 consumer를 계획 재시작한다.

1. DatabaseRole의 새 expiration과 generated Secret 갱신을 확인한다.
2. API certificate 갱신이면 API Rollout과 Web BFF만, Worker certificate 갱신이면 Worker connection을 실제 소비하는 Web/Worker workload만 선택한다.
3. GitOps가 관리하는 workload의 restart annotation을 승인된 Git 변경으로 갱신하거나 승인된 Rollouts restart 절차를 사용한다. Secret data나 hash를 annotation에 복사하지 않는다.
4. 새 Pod readiness 뒤 새 connection의 CN과 `current_user`를 확인한다.
5. 기존 Pod가 모두 종료되기 전까지 generated Secret이나 DatabaseRole을 제거하지 않는다.

Production restart는 certificate apply와 별개 승인이다. 한 역할의 갱신을 이유로 migration, replication, Pooler 또는 인증서를 소비하지 않는 workload를 재시작하지 않는다.

## 독립 rollback

소비 뒤 DatabaseRole을 먼저 제거하면 generated Secret이 삭제되므로 workload rollback이 먼저다.

1. 해당 API 또는 Worker certificate selector를 이전 password/SCRAM 설정으로 되돌리는 Git commit을 배포한다.
2. 대상 workload가 Ready이고 새 connection이 기존 password 경계로 동작하는지 확인한다.
3. 다른 역할 consumer, migration, replication과 Pooler가 변하지 않았는지 확인한다.
4. 역할 provisioning 자체를 되돌려야 할 때만 별도 승인으로 DatabaseRole manifest를 revert/prune한다. `databaseRoleReclaimPolicy: retain`은 PostgreSQL role만 남기며 generated Secret은 CNPG owner-reference lifecycle에 따라 제거된다.

Argo CD/Helm 소유 리소스를 `kubectl delete`로 수동 제거하지 않는다. Production rollback sync/apply도 사용자의 별도 명시적 승인 뒤에만 수행한다.
