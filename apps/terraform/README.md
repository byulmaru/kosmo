# kosmo Terraform

이 디렉터리는 AWS EKS 전환을 위한 Terraform root다. PROD-201 범위에서는 EKS worker node를 private subnet에 배치할 수 있는 2 AZ VPC, public/private subnet, 단일 NAT Gateway, route table, EKS용 security group을 준비한다.

## 범위

- 포함: Terraform CLI/provider 버전 고정, AWS provider 설정, S3 backend partial configuration, 변수/출력 구조, VPC, subnet, NAT Gateway, route table, EKS cluster/node security group, init/plan 절차.
- 제외: EKS cluster, node group, CSI driver, Kubernetes/Helm provider, Argo CD bootstrap.
- 제외된 리소스는 각각 PROD-204, PROD-205, PROD-210, PROD-212에서 추가한다.

## 기본 결정

- AWS region 기본값은 `ap-northeast-2`다.
- Terraform root는 환경별로 나누지 않고 단일 kosmo 클러스터만 관리한다.
- cluster name은 `kosmo`로 고정한다. cluster name 변경은 replacement 성격이 강하므로 외부 변수로 열어 두지 않는다.
- AWS resource name prefix는 cluster name에서 파생한다. 별도 변수로 열면 같은 cluster의 이름 체계가 갈라질 수 있고 prefix 변경도 replacement 성격이 강하므로 입력값으로 받지 않는다.
- Kubernetes version 기본값은 `1.36`이다. 이 값은 스캐폴딩 기본값이며 EKS cluster를 실제 생성하는 PROD-204에서 AWS EKS 지원 상태와 add-on 호환성을 다시 확인한다.
- node group 설정은 외부 변수로 열어 두지 않는다. 여러 node group의 구성, On-Demand/Spot 비율, instance type, min/desired/max size는 PROD-205에서 실제 Terraform 코드로 정의한다.
- VPC CIDR은 `10.40.0.0/16`으로 고정한다. AWS VPC의 단일 IPv4 CIDR block은 `/16`이 가장 넓은 범위다.
- public subnet은 NAT Gateway와 load balancer 배치를 위한 공간이므로 `10.40.0.0/24`, `10.40.1.0/24`를 사용한다.
- private subnet은 worker node와 AWS load balancer/NAT 경로가 소비하는 cloud network 주소 공간으로 보고 `10.40.10.0/24`, `10.40.11.0/24`를 사용한다.
- Kubernetes pod/service IP는 AWS subnet 주소 공간과 분리하는 것을 목표로 한다. AWS ENI 기반 pod IP 할당은 pod가 subnet IP를 직접 소비해 cloud portability를 낮추므로 기본 전제로 두지 않는다. Cilium 같은 CNI를 쓰더라도 cluster-pool/overlay 등 Kubernetes 내부 pod CIDR을 별도로 관리하는 모드를 우선 검토한다.
- CIDR 변경은 route, subnet, EKS node placement에 직접 영향을 주므로 일반 입력 변수로 열지 않는다. `/16`보다 큰 IPv4 공간이 필요하면 VPC secondary CIDR block, VPC CNI custom networking, 또는 IPv6 적용을 별도 이슈로 설계한다.
- AZ는 현재 AWS 계정과 region에서 opt-in 없이 사용할 수 있는 availability zone 중 앞의 2개를 사용한다.
- EKS worker node는 private subnet에 배치한다. public subnet은 NAT Gateway와 이후 public load balancer가 필요할 때만 사용한다.

## 네트워크 구성

Terraform plan은 다음 네트워크 리소스를 생성한다.

- VPC 1개, DNS support/hostname 활성화.
- public subnet 2개, private subnet 2개. 각 subnet은 EKS와 AWS load balancer discovery용 Kubernetes tag를 가진다.
- Internet Gateway 1개와 public route table 1개.
- Elastic IP 1개와 NAT Gateway 1개. NAT Gateway는 첫 번째 public subnet에 둔다.
- private route table은 private subnet마다 1개씩 만들지만, 현재는 둘 다 동일한 NAT Gateway로 `0.0.0.0/0`을 보낸다. 이후 AZ별 NAT Gateway로 바꿀 때 각 route table의 NAT 대상만 나눌 수 있게 하기 위해서다.
- EKS cluster security group 1개와 worker node security group 1개.

## NAT Gateway trade-off

현재 구성은 비용을 줄이기 위해 NAT Gateway를 1개만 둔다. 장점은 시간당 NAT Gateway 비용과 Elastic IP 수가 최소화된다는 점이다. 단점은 NAT Gateway가 위치한 AZ 또는 해당 public subnet 경로에 장애가 나면 다른 AZ의 private subnet도 outbound 인터넷/AWS API 접근에 영향을 받을 수 있고, 다른 AZ의 private subnet에서 NAT Gateway로 나가는 트래픽은 cross-AZ 데이터 전송 비용이 발생할 수 있다는 점이다.

운영 가용성을 우선하면 AZ마다 NAT Gateway를 1개씩 두고, 각 private route table이 같은 AZ의 NAT Gateway를 바라보게 바꾼다. 이 대안은 NAT Gateway 시간당 비용과 처리 비용이 AZ 수만큼 늘지만, AZ 단위 장애와 cross-AZ NAT 트래픽 비용을 줄인다. kosmo의 초기 EKS 전환은 비용 민감도가 높고 트래픽 규모가 작다는 전제로 단일 NAT Gateway를 선택한다.

## Security group 경계

`kosmo-eks-cluster` security group은 후속 EKS cluster control plane ENI에 연결할 그룹이다. worker node security group에서 Kubernetes API HTTPS 트래픽을 받을 수 있고, worker node의 HTTPS webhook과 kubelet `10250`으로 나갈 수 있다.

`kosmo-eks-nodes` security group은 private subnet의 worker node에 연결할 그룹이다. 같은 node group 내부 통신은 허용하고, control plane에서 들어오는 HTTPS와 kubelet 트래픽만 명시적으로 허용한다. outbound는 private node가 NAT Gateway를 통해 AWS API, container registry, OS package repository에 접근해야 하므로 IPv4 전체 egress를 허용한다. pod-to-pod 정책은 이 security group 대신 Kubernetes NetworkPolicy 또는 CNI 정책으로 다룬다.

## EKS endpoint 운영

PROD-204에서 EKS cluster를 만들 때 초기값은 public endpoint를 켜는 구성이 현실적이다. 아직 VPN, bastion, private admin path가 없기 때문에 private-only endpoint로 시작하면 장애 대응과 배포 경로가 막힐 수 있다. public endpoint를 쓰더라도 cluster API 접근 CIDR은 운영자 고정 IP 또는 CI egress IP로 좁히는 것을 기본으로 한다.

private-only endpoint 전환은 다음 조건이 갖춰진 뒤에 한다.

- 운영자가 VPC 내부 경로로 Kubernetes API에 접근할 수 있다.
- CI/CD가 VPC 내부 runner, VPN, 또는 승인된 network path를 통해 cluster API에 접근할 수 있다.
- Argo CD bootstrap 이후에도 emergency kubectl 접근 절차가 문서화되어 있다.

## OKE 복귀 영향

이 Terraform root는 AWS 전용 VPC, NAT Gateway, EKS security group을 만든다. OKE로 복귀할 경우 애플리케이션 Kubernetes manifest와 container image는 재사용할 수 있지만, 네트워크 IaC는 OCI VCN/subnet/NAT gateway/security list 또는 NSG 구성으로 다시 매핑해야 한다. AWS Load Balancer Controller용 subnet tag와 EKS security group 경계는 OKE에 직접 대응하지 않으므로, 복귀 계획에서는 Kubernetes 계층과 cloud network 계층을 분리해서 폐기 순서를 잡는다.

Kubernetes 위에서 운영하는 ingress, service mesh, network policy, workload manifest는 cloud network subnet CIDR에 의존하지 않게 유지한다. CNI는 가능한 한 pod CIDR을 AWS ENI/subnet에 직접 묶지 않는 구성을 우선 검토하고, cloud-specific load balancer와 storage integration은 교체 가능한 경계로 둔다.

## State backend

장기 state는 조직 공용 S3 bucket에 저장한다. bucket은 이 root에서 만들지 않으며, 이미 존재하거나 별도 운영 절차로 준비되어 있어야 한다. Terraform root는 환경별로 갈라지지 않으므로 S3 object key는 kosmo 프로젝트 단위로만 구분한다.

예시:

```hcl
bucket       = "byulmaru-terraform-state"
key          = "kosmo/terraform.tfstate"
region       = "ap-northeast-2"
use_lockfile = true
```

`use_lockfile = true`로 S3 native lockfile을 사용한다. DynamoDB 기반 locking은 쓰지 않는다.

기본 checkout 상태에서는 backend를 활성화하지 않는다. 이렇게 해야 조직 공용 S3 bucket 값이 없어도 `terraform init -backend=false`와 `terraform validate`를 실행할 수 있다. `terraform plan`은 실제 AWS availability zone 조회와 리소스 계획을 포함하므로 AWS 인증이 필요하다. S3 backend를 쓸 때는 `backend.s3.tf.example`을 커밋하지 않는 `backend.s3.tf`로 복사한다.

## 민감 값 규칙

커밋하지 않는 파일:

- `backend.hcl`
- `backend.s3.tf`
- `*.tfvars`
- `*.tfstate`, `*.tfstate.*`
- `*.tfplan`
- `.terraform/`
- AWS credential, kubeconfig, Argo CD secret

AWS 인증은 `AWS_PROFILE` 또는 표준 AWS 환경 변수(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`)로만 주입한다. credential 값을 Terraform 변수, backend config, plan 파일에 넣지 않는다.

## 초기화

provider lockfile을 만들거나 backend 없이 정적 검증만 할 때:

```sh
terraform init -backend=false
```

S3 backend로 실제 초기화할 때:

```sh
cp backend.s3.tf.example backend.s3.tf
cp backend.hcl.example backend.hcl
$EDITOR backend.hcl
AWS_PROFILE=<profile> terraform init -backend-config=backend.hcl
```

`backend.hcl`에는 실제 조직 공용 state bucket 이름을 넣는다. bucket 이름은 전역 유일한 AWS 리소스 이름이므로 예시 값을 그대로 사용하지 않는다.

## 변수 예시

```sh
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
```

네트워크 CIDR은 코드에서 고정하므로 `terraform.tfvars` 없이도 validate가 가능하다. plan은 availability zone 조회와 AWS 리소스 계획을 위해 AWS 인증이 필요하다.

## Toolchain

Terraform CLI는 이 디렉터리의 `mise.toml`에서만 고정한다. repo root의 `mise.toml`에는 Terraform을 넣지 않아 web/api 작업에서 불필요하게 Terraform을 설치하지 않게 한다.

```sh
cd apps/terraform
mise trust --all
mise install
```

## 검증

```sh
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -input=false -lock=false
```

현재 plan은 VPC, subnet, Elastic IP, NAT Gateway, route, security group 생성을 포함한다. NAT Gateway와 Elastic IP는 비용 발생 리소스이므로 실제 apply 전에 단일 NAT Gateway 비용/가용성 trade-off가 현재 운영 기대와 맞는지 다시 확인한다.
