## Context

이 기록은 PROD-719 Issue Gate에서 확정한 namespace provisioning 책임, 환경별 값, provider, Terraform runner 접속 경계와 PROD-730 분리를 반영한다. 제품 도메인 동작을 추가하지 않고 self-hosted Temporal의 application-owned desired state를 구현하는 선택만 기록한다.

## Decision Records

### Application Terraform이 logical namespace를 소유한다 (Superseded)

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-695`, `PROD-719`, `PROD-730`
- Status: Superseded
- Context / Problem: Temporal Server platform resource와 application namespace·Worker runtime의 생명주기를 구분해야 한다.
- Decision Outcome: Shared Temporal Server는 PROD-695 platform 경계에 남기고, `kosmo-dev`와 `kosmo-prod` logical namespace는 Kosmo application Terraform이 소유한다. Worker runtime은 PROD-730이 별도로 소유한다.
- Alternatives Considered: Platform Terraform이 application namespace까지 소유하는 방식은 application retention과 rollout 책임을 platform 변경에 결합해 제외했다. Argo CD hook은 지속적인 desired-state 수렴을 제공하지 않아 제외했다.
- Consequences: `apps/terraform`은 namespace resource를 가지지만 Helm이나 Worker package는 이 change에서 바뀌지 않는다.
- Confirmation / Follow-up: PROD-719 apply/no-op 검증 뒤 PROD-730 blocker를 해제한다.

### self-hosted namespace provider를 정확히 고정한다 (Superseded)

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-719`
- Status: Superseded
- Context / Problem: 공식 Temporal Cloud provider는 self-hosted frontend namespace를 관리하지 않으며 provider 변화가 namespace lifecycle에 직접 영향을 준다.
- Decision Outcome: `platacard/temporal` provider `0.19.0`을 exact version으로 고정한다.
- Alternatives Considered: `temporalio/temporalcloud`는 대상이 달라 제외했다. CLI 명령을 Terraform/Argo hook에서 실행하는 방식은 선언적 resource와 drift를 제공하지 않아 제외했다. 새 provider 개발은 현재 범위에 비해 과도해 제외했다.
- Consequences: Third-party provider의 호환성과 공급망을 dev에서 먼저 검증하고 dependency lock을 리뷰해야 한다.
- Confirmation / Follow-up: `terraform init`, `validate`, dev plan/apply/read와 subsequent no-op plan으로 확인한다.

### 환경별 namespace 값과 owner를 고정한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-719`
- Status: Active
- Context / Problem: Worker history 보존과 운영 소유권을 환경별로 명확히 해야 한다.
- Decision Outcome: `kosmo-dev` retention은 3일, `kosmo-prod`는 30일로 두고 두 namespace의 owner email은 `dev@byulmaru.co`로 통일한다.
- Alternatives Considered: `platform@byulmaru.co`와 환경별 owner 분리는 선택하지 않았다. retention을 Temporal CLI 기본값에 맡기는 방식은 drift 검토가 불가능해 제외했다.
- Consequences: retention과 owner 변경은 Helm values와 rendered Job diff에서 환경별로 명시되며 reviewed change가 된다.
- Confirmation / Follow-up: Argo CD sync 뒤 live namespace describe 결과와 선언을 비교한다.

### Provisioning 접속과 runtime 인가를 분리한다 (Superseded)

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-719`, `PROD-704`
- Status: Superseded
- Context / Problem: Terraform이 namespace를 관리하려면 frontend gRPC 접속과 관리자 인증이 필요하지만 Worker의 dev/prod namespace 접근 인가 정책과는 책임이 다르다.
- Decision Outcome: Terraform runner의 최소 private network 경로와 namespace 관리자 credential 주입은 PROD-719가 소유한다. Worker runtime의 namespace 인증·인가는 PROD-704에 남긴다.
- Alternatives Considered: 접속 선행 이슈를 새로 만드는 방식과 PROD-704에 provisioning 전체를 위임하는 방식은 namespace apply 결과를 불필요하게 분리하므로 선택하지 않았다.
- Consequences: 719 구현은 application repository 밖의 network/credential 설정 변경이 필요할 수 있지만 runtime authorization 정책을 확장해서는 안 된다.
- Confirmation / Follow-up: 실제 plan/apply runner에서 DNS·TCP·TLS/auth preflight와 namespace read를 검증한다.

### Namespace lifecycle은 Terraform만 소유하고 일반 삭제를 차단한다 (Superseded)

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-719`
- Status: Superseded
- Context / Problem: Namespace lifecycle을 여러 도구가 함께 소유하면 desired state와 실제 상태가 갈라지고 일반 destroy가 영속 History를 제거할 수 있다.
- Decision Outcome: Namespace 생성과 owner·retention 변경은 application Terraform만 소유한다. Namespace resource에는 lifecycle 삭제 보호를 적용한다.
- Alternatives Considered: Temporal CLI와 Argo CD hook을 함께 사용하는 방식은 중복 소유권을 만들므로 제외했다.
- Consequences: Terraform 밖에서 namespace를 생성·갱신하지 않으며 의도적인 namespace 폐기는 별도 운영 결정과 보호 해제 없이는 실행할 수 없다.
- Confirmation / Follow-up: plan/apply 외 생성·변경 경로가 없는지 검토하고 destroy 계획이 보호에 의해 실패하는지 검증한다.

### In-cluster PreSync Job이 namespace provisioning을 소유한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-695`, `PROD-719`, 2026-08-08 사용자 결정
- Status: Active
- Context / Problem: Third-party Terraform provider는 외부 Mac runner에서 ClusterIP frontend에 도달하기 위해 Tailscale endpoint, EKS port-forward 또는 별도 runner 기반까지 요구했다.
- Decision Outcome: Terraform 관리를 포기하고 각 Kosmo 환경 내부의 Argo CD PreSync Job이 자신의 logical namespace를 생성·갱신한다.
- Alternatives Considered: Tailnet-only frontend는 낮은 사용 빈도에 비해 영구 endpoint가 과도해 제외했다. EKS API port-forward는 별도 access/RBAC와 tunnel lifecycle이 필요해 제외했다. 전용 in-cluster runner는 가장 큰 새 기반이라 제외했다. 수동 1회 생성과 Worker startup bootstrap은 각각 drift와 책임 결합 때문에 제외했다.
- Consequences: Namespace 준비는 application sync의 선행 조건이 되고 Temporal 장애 시 해당 sync가 실패한다. Application Terraform과 외부 접속 경계는 변경하지 않는다.
- Confirmation / Follow-up: dev/prod Helm render와 live PreSync create/re-run/drift/failure cases로 확인한다.

### Platform과 같은 admin-tools image digest를 사용한다

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-695`, `PROD-719`
- Status: Active
- Context / Problem: Floating CLI image는 server 호환성과 target architecture를 배포마다 바꿀 수 있다.
- Decision Outcome: Platform과 같은 `temporalio/admin-tools:1.31.2`의 multi-architecture digest `sha256:dbc5fcd6ee8f0f4d808bf765af9a87dea9d8a283abfdcfbd2fc148496ba66107`를 Job image로 사용한다.
- Alternatives Considered: Tag-only reference와 latest는 공급망 재현성이 낮아 제외했다. Kosmo runtime image에 Temporal CLI를 추가하면 Worker/API와 bootstrap dependency가 결합되어 제외했다.
- Consequences: amd64와 arm64에서 같은 image index를 사용하며 image 갱신은 명시적 reviewed change가 된다.
- Confirmation / Follow-up: OCI manifest의 amd64/arm64 항목과 실제 image의 create/update `--email`·`--retention` flags를 확인했다.

### Create 후 update fallback으로 최종 상태를 검증한다

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-719`
- Status: Active
- Context / Problem: Namespace 최초 생성과 기존 namespace 수렴을 멱등 처리하면서 CLI error text에 의존하지 않아야 한다.
- Decision Outcome: Job은 create를 먼저 실행하고 성공하면 종료한다. Create가 성공하지 않으면 동일 owner·retention으로 update를 실행하며 update도 실패하면 Job을 실패시킨다. Namespace delete 명령은 포함하지 않는다.
- Alternatives Considered: Describe error text를 파싱해 not-found를 구분하는 방식은 CLI 출력 결합이 커 제외했다. `create || true`는 실제 연결 실패를 숨겨 제외했다.
- Consequences: 기존 namespace 재실행 시 create의 already-exists 출력이 남을 수 있지만 update 성공으로 desired state를 검증한다. Connection 실패는 create와 update 모두 실패해 PreSync를 차단한다.
- Confirmation / Follow-up: create, existing, drift와 unreachable endpoint cases를 고정 image로 검증한다.

### 현재 무인증 frontend 경계를 유지한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-695`, `PROD-704`, `PROD-719`
- Status: Active
- Context / Problem: 현재 frontend는 dev/prod를 같은 trust boundary로 수용하며 인증·인가는 아직 구현되지 않았다.
- Decision Outcome: PreSync Job은 cluster-internal address와 `--tls=false`를 명시해 현재 runtime에 연결한다. 외부 endpoint를 추가하지 않고 인증 전환은 PROD-704가 소유한다.
- Alternatives Considered: PROD-704 완료까지 namespace provisioning을 차단하거나 719에서 인증을 구현하는 방식은 현재 rollout을 지연하거나 책임을 중복시켜 제외했다.
- Consequences: Job은 해당 Kubernetes namespace의 NetworkPolicy 경계에 의존한다. PROD-704 구현 시 CLI client 설정을 함께 전환해야 한다.
- Confirmation / Follow-up: 각 환경 내부 Job의 frontend 연결과 외부 노출 부재를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `Application Terraform이 logical namespace를 소유한다`는 `In-cluster PreSync Job이 namespace provisioning을 소유한다`로 대체됐다. Third-party provider를 쓰기 위한 외부 접속 우회가 결과에 비해 과도했기 때문이다.
- `self-hosted namespace provider를 정확히 고정한다`는 provider 미도입과 고정 admin-tools image 결정으로 대체됐다.
- `Provisioning 접속과 runtime 인가를 분리한다`의 외부 Terraform 접속 책임은 제거됐고, 현재 runtime 인증 경계는 in-cluster Job 결정에 반영됐다.
- `Namespace lifecycle은 Terraform만 소유하고 일반 삭제를 차단한다`는 PreSync create/update와 namespace delete 제외 계약으로 대체됐다.
