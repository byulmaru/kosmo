# kosmo Terraform

이 디렉터리는 AWS EKS 전환을 위한 Terraform root다. PROD-198 범위에서는 실제 AWS 리소스를 만들지 않고, 이후 VPC/EKS/node group/CSI/Argo CD 이슈가 채울 수 있는 root, backend, provider, 변수, 출력 인터페이스만 준비한다.

## 범위

- 포함: Terraform CLI/provider 버전 고정, AWS provider 설정, S3 backend partial configuration, 변수/출력 구조, init/plan 절차.
- 제외: VPC, subnet, NAT Gateway, security group, EKS cluster, node group, CSI driver, Kubernetes/Helm provider, Argo CD bootstrap.
- 제외된 리소스는 각각 PROD-201, PROD-204, PROD-205, PROD-210, PROD-212에서 추가한다.

## 기본 결정

- AWS region 기본값은 `ap-northeast-2`다.
- Terraform root는 환경별로 나누지 않고 단일 kosmo 클러스터만 관리한다.
- cluster name은 `kosmo`로 고정한다. cluster name 변경은 replacement 성격이 강하므로 외부 변수로 열어 두지 않는다.
- Kubernetes version 기본값은 `1.36`이다. 이 값은 스캐폴딩 기본값이며 EKS cluster를 실제 생성하는 PROD-204에서 AWS EKS 지원 상태와 add-on 호환성을 다시 확인한다.
- node group 설정은 외부 변수로 열어 두지 않는다. 여러 node group의 구성, On-Demand/Spot 비율, instance type, min/desired/max size는 PROD-205에서 실제 Terraform 코드로 정의한다.

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

기본 checkout 상태에서는 backend를 활성화하지 않는다. 이렇게 해야 조직 공용 S3 bucket 값이 없어도 `terraform init -backend=false`, `terraform validate`, `terraform plan`으로 스캐폴딩을 검증할 수 있다. S3 backend를 쓸 때는 `backend.s3.tf.example`을 커밋하지 않는 `backend.s3.tf`로 복사한다.

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

현재 root에는 실제 리소스가 없으므로 `terraform.tfvars` 없이도 validate와 plan이 가능해야 한다.

## 검증

```sh
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -input=false -lock=false
```

현재 plan은 실제 AWS 리소스 생성을 포함하지 않는다. 후속 이슈에서 리소스가 추가되면 plan 결과에 비용 발생 리소스와 운영 trade-off를 함께 문서화한다.
