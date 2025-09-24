# Kosmo Infrastructure - Oracle Cloud (OKE) with Tailscale

Oracle Cloud Infrastructure에서 **보안이 강화된** Kubernetes 클러스터(OKE)를 생성하는 Terraform 설정입니다.

## 파일 구조

```
apps/infrastructure/
├── terraform.tf          # Provider 설정
├── variables.tf           # 변수 정의
├── data.tf               # Data sources (ADs, images, services)
├── network.tf            # VCN, subnets, gateways, routing
├── security.tf           # Network Security Groups
├── cluster.tf            # OKE cluster와 node pool
├── compute.tf            # Exit node 인스턴스
├── outputs.tf            # 출력값
├── user-data.sh          # Exit node 초기화 스크립트
└── terraform.tfvars      # 설정값
```

## 보안 아키텍처

🔒 **Private Kubernetes API**: API 서버는 프라이빗 네트워크에만 노출  
🌐 **Tailscale Exit Node**: 로컬에서 직접 프라이빗 API 접근  
🏗️ **Multi-AZ 배포**: 고가용성을 위한 다중 Availability Domain 구성

## 구성 요소

- **VCN (Virtual Cloud Network)**: `10.0.0.0/16`
- **Public Subnet**: `10.0.1.0/24` (로드 밸런서용)
- **Cluster Endpoint Subnet**: `10.0.2.0/24` (regional, 클러스터 API용)
- **Private Subnets**: `10.0.3.0/24`, `10.0.4.0/24`, `10.0.5.0/24` (각 AD별 워커 노드용)
- **OKE Cluster**: Kubernetes v1.33.1 (프라이빗 API, 다중 AD 배포)
- **Node Pool**: VM.Standard.A1.Flex 인스턴스
- **Exit Node**: Tailscale exit node (public subnet에 배치, NSG로 보안 관리)

## 사전 요구사항

1. **Terraform 설치** (>= 1.0)
2. **OCI CLI 설정** 또는 환경 변수 설정
3. **SSH 키 쌍** 생성
4. **Tailscale 계정** 및 Auth Key 준비

### OCI 인증 설정

다음 중 하나의 방법으로 OCI 인증을 설정하세요:

#### 환경 변수 사용

```bash
export OCI_TENANCY_OCID="ocid1.tenancy.oc1..aaaaaaaaXXXXXXXX"
export OCI_USER_OCID="ocid1.user.oc1..aaaaaaaaXXXXXXXX"
export OCI_FINGERPRINT="XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX"
export OCI_PRIVATE_KEY_PATH="~/.oci/oci_api_key.pem"
export OCI_REGION="ap-seoul-1"
```

#### OCI CLI 설정 파일 사용

```bash
oci setup config
```

## 사용 방법

### 1. 설정 파일 준비

```bash
# 변수 파일 복사 및 편집
cp terraform.tfvars.example terraform.tfvars
vi terraform.tfvars
```

`terraform.tfvars` 파일에서 다음 값들을 설정하세요:

```hcl
# 필수 변수
compartment_id = "ocid1.compartment.oc1..aaaaaaaaXXXXXXXX"
ssh_public_key = "ssh-rsa AAAAB3NzaC1yc2EAAA..."
tailscale_api_key = "tskey-api-XXXXXXXXX"

# 선택 변수 (필요에 따라 수정)
node_shape           = "VM.Standard.A1.Flex"
node_ocpus           = 2
node_memory_in_gbs   = 8
node_count           = 1
bastion_shape        = "VM.Standard.A1.Flex"
bastion_ocpus        = 1
bastion_memory_in_gbs = 2
```

### 2. SSH 키 생성 (없는 경우)

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/kosmo_oci
cat ~/.ssh/kosmo_oci.pub  # 이 내용을 terraform.tfvars의 ssh_public_key에 입력
```

### 3. Tailscale API Key 생성

1. [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)에 접속
2. **API keys** 탭으로 이동
3. **Generate API key** 클릭
4. 적절한 설명을 입력하고 키를 생성
5. 생성된 API 키를 `terraform.tfvars`의 `tailscale_api_key`에 입력

> 📝 **참고**: 기존 auth key를 수동 생성할 필요가 없습니다. Terraform이 자동으로 exit node용 auth key를 생성합니다.

### 3. Terraform 실행

```bash
# 초기화
terraform init

# 실행 계획 확인
terraform plan

# 인프라 배포
terraform apply
```

### 4. Tailscale Exit Node를 통한 클러스터 접근

#### 로컬 머신에 Tailscale 설치

```bash
# macOS
brew install tailscale

# Linux
curl -fsSL https://tailscale.com/install.sh | sh

# Windows
# https://tailscale.com/download/windows 에서 다운로드
```

#### 1단계: Tailscale 네트워크 조인

```bash
# 로컬 머신에서 tailnet에 조인
tailscale up
```

#### 2단계: Exit Node 활성화

1. [Tailscale Admin Console](https://login.tailscale.com/admin/machines) 접속
2. `kosmo-exit-node` 찾기
3. **"Use as exit node"** 활성화

#### 3단계: Exit Node 사용 및 클러스터 접근

```bash
# Exit node를 통해 트래픽 라우팅
tailscale up --exit-node=kosmo-exit-node

# kubeconfig 설정 (로컬 머신에서)
terraform output -raw kubeconfig > ~/.kube/config-kosmo
export KUBECONFIG=~/.kube/config-kosmo

# 이제 로컬에서 직접 private API에 접근 가능!
kubectl get nodes
kubectl get pods -A
```

## 출력값

배포 완료 후 다음 정보들을 확인할 수 있습니다:

```bash
# 클러스터 정보
terraform output cluster_id
terraform output cluster_name
terraform output cluster_endpoint  # 이제 private IP

# Exit Node 정보
terraform output exit_node_public_ip
terraform output exit_node_private_ip
terraform output tailscale_setup_instructions

# 네트워크 정보
terraform output vcn_id
terraform output public_subnet_id
terraform output cluster_endpoint_subnet_id
terraform output private_subnet_ids
terraform output private_subnet_details

# kubeconfig (로컬에서 사용)
terraform output -raw kubeconfig > ~/.kube/config-kosmo
```

## 리소스 정리

```bash
terraform destroy
```

## 보안 장점

✅ **Zero Trust 접근**: Kubernetes API가 인터넷에 노출되지 않음  
✅ **VPN 암호화**: Tailscale을 통한 안전한 네트워크 접근  
✅ **최소 권한**: 필요한 포트만 허용하는 보안 그룹  
✅ **네트워크 분리**: Private subnet에서 격리된 워커 노드  
✅ **감사 로그**: Tailscale에서 접근 로그 제공

## 비용 최적화

- **개발 환경**: `node_count = 1`, `node_ocpus = 1`, `node_memory_in_gbs = 8`
- **프로덕션 환경**: `node_count = 3` 이상, 적절한 인스턴스 크기 설정
- **Exit Node 최적화**: 초소형 인스턴스 사용 (1 OCPU, 2GB RAM)

## 트러블슈팅

### 공통 오류

1. **인증 오류**: OCI 자격 증명 확인
2. **Compartment 권한**: 해당 compartment에 대한 권한 확인
3. **Service Limit**: OCI 콘솔에서 service limit 확인

### 도움이 되는 명령어

```bash
# Terraform 상태 확인
terraform state list

# 특정 리소스 정보 확인
terraform state show oci_containerengine_cluster.kosmo_oke_cluster

# Exit node 상태 확인
ssh opc@$(terraform output -raw exit_node_public_ip)
./tailscale-status.sh

# 로컬 Tailscale 상태 확인
tailscale status

# Terraform 로그 활성화
export TF_LOG=DEBUG
terraform apply
```

## Tailscale 관리

### Exit Node 재시작 후

Exit node 인스턴스가 재시작되면 Tailscale이 자동으로 재연결됩니다. 하지만 필요시 수동으로 재연결할 수 있습니다:

```bash
# Exit node에 SSH 접속 후
sudo tailscale up --advertise-exit-node --advertise-routes=10.0.0.0/16

# 상태 확인
./tailscale-status.sh
```

### Exit Node 끄기/켜기

클러스터에 접근하지 않을 때는 exit node를 비활성화할 수 있습니다:

```bash
# Exit node 비활성화 (로컬에서)
tailscale up --reset

# Exit node 다시 활성화
tailscale up --exit-node=kosmo-exit-node
```

### Tailnet 멤버 관리

1. [Tailscale Admin Console](https://login.tailscale.com/admin/machines)에서 기기 관리
2. Exit node 권한 설정 및 ACL 구성
3. 기기 삭제 및 재인증

### 추가 보안 설정

```json
# ACL 예제 (Tailscale Admin Console > Access Controls)
{
  "hosts": {
    "kosmo-exit-node": "100.x.x.x"
  },
  "acls": [
    {
      "action": "accept",
      "src": ["group:admin"],
      "dst": ["kosmo-exit-node:*"]
    }
  ]
}
```

## 작동 원리

1. **Exit Node**: `kosmo-exit-node`가 OCI 네트워크(`10.0.0.0/16`)의 모든 라우팅을 담당
2. **로컬 연결**: 로컬 머신이 exit node를 통해 OCI 네트워크에 접근
3. **Private API**: Kubernetes API(`10.0.2.x:6443`)에 직접 연결 (regional subnet에 위치)
4. **암호화**: 모든 트래픽이 Tailscale WireGuard를 통해 암호화

## 장점

✅ **단순함**: 로컬에서 kubectl 직접 사용  
✅ **성능**: SSH 터널링 없이 직접 연결  
✅ **보안**: WireGuard 암호화 + Private API  
✅ **효율성**: Exit node는 최소 리소스만 사용
