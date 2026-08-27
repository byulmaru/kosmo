## ADDED Requirements

### Requirement: 독립 Admin Console runtime

**Authority / Provenance:** `docs/architecture/admin-console.md`, `PROD-689`, `PROD-690`. 시스템은 공개 Web·API와 분리된 `apps/admin` runtime을 제공해야 한다(MUST). runtime은 workload probe용 `GET /healthz`와 읽기 전용 Admin Console shell만 제공하고, 정의되지 않은 endpoint는 기본 거부해야 한다(MUST).

#### Scenario: workload 상태 확인

- **WHEN** cluster workload probe가 `GET /healthz`를 호출한다
- **THEN** 성공 상태를 반환한다

#### Scenario: 정의되지 않은 endpoint 거부

- **WHEN** 요청이 `GET /healthz`나 허용된 Admin Console shell route가 아닌 endpoint를 호출한다
- **THEN** runtime은 요청을 거부하고 Admin data나 내부 오류 정보를 반환하지 않는다

### Requirement: 단일 Admin Console Viewer 접근

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-690`. Admin Console은 Tailscale 접근 정책을 통과한 Admin Console Viewer에게 shell 접근을 허용해야 하며(MUST), 별도의 App Capability나 객체별 action을 요구해서는 안 된다(MUST NOT). 후속 v1 Account, Profile, Account-Profile Membership projection은 모두 같은 Viewer admission을 사용해야 한다(MUST).

#### Scenario: 허용된 Viewer의 shell 접근

- **WHEN** Tailscale 접근 정책에서 허용된 Viewer가 지정된 tailnet hostname으로 shell을 요청한다
- **THEN** Admin Console은 별도의 action 검사 없이 읽기 전용 shell을 반환한다

#### Scenario: v1 읽기 범위의 단일 admission

- **WHEN** 허용된 Viewer가 후속 Account, Profile 또는 Account-Profile Membership projection을 요청한다
- **THEN** 각 projection은 같은 Viewer admission을 사용하고 application-level action으로 접근을 나누지 않는다

#### Scenario: Identity를 인가에 사용하지 않음

- **WHEN** identity header가 없거나 임의의 login·display name이 제공된다
- **THEN** runtime은 해당 값을 admission, Account 매핑 또는 `Account.Operator` 판정에 사용하지 않는다

### Requirement: 선택적 Admin Console Viewer 표시

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-690`. Admin Console은 trusted proxy가 제공한 login과 display name만 현재 Viewer의 선택적 표시 metadata로 사용해야 하며(MUST), identity 누락이나 정규화 실패가 admission 결과를 바꾸게 해서는 안 된다(MUST NOT). profile picture header를 사용해서는 안 된다(MUST NOT).

#### Scenario: Identity header가 없는 허용 요청

- **WHEN** 허용된 Viewer의 login과 display name이 제공되지 않는다
- **THEN** shell은 접근을 유지하고 `식별 정보 없는 Admin Console Viewer`를 표시한다

#### Scenario: Identity 정규화 실패

- **WHEN** 선택적 identity metadata를 정상 문자열로 정규화할 수 없다
- **THEN** runtime은 해당 metadata를 누락으로 취급하고 Viewer의 접근 결과를 유지한다

### Requirement: Trusted Tailscale Operator Ingress와 network isolation

**Authority / Provenance:** `docs/architecture/admin-console.md`, `PROD-689`, `PROD-690`. Admin Console 요청은 Tailscale Operator Ingress에서 ClusterIP Admin Service를 거쳐 Admin workload에 도달해야 한다(MUST). NetworkPolicy는 해당 Operator proxy와 필요한 workload probe만 application port에 허용해야 하며(MUST), ClusterIP·Pod IP·public Gateway·Funnel·application LoadBalancer를 통한 우회 entry를 허용해서는 안 된다(MUST NOT).

#### Scenario: 허용되지 않은 tailnet 주체 차단

- **WHEN** Tailscale 접근 정책에서 허용되지 않은 주체가 Admin Console hostname을 요청한다
- **THEN** 요청은 Admin runtime에 도달하지 않는다

#### Scenario: Service 또는 Pod 직접 접근 차단

- **WHEN** 임의의 cluster Pod나 VPC 경로에서 ClusterIP 또는 Admin Pod IP에 직접 접근한다
- **THEN** NetworkPolicy는 application 연결을 허용하지 않는다

#### Scenario: Caller 주입 header로 우회할 수 없음

- **WHEN** caller가 identity나 proxy 관련 header를 직접 주입해 Service 또는 Pod에 접근한다
- **THEN** header 값과 무관하게 network 경계를 우회할 수 없다

#### Scenario: 공개 인터넷 비노출

- **WHEN** tailnet 밖 또는 공개 인터넷에서 Admin Console hostname이나 backend 주소에 접근한다
- **THEN** Admin Console shell과 backend endpoint에 연결할 수 없다

### Requirement: Admin-specific 로깅 제외

**Authority / Provenance:** `docs/domain/policies/admin-console-read.md`, `docs/domain/decisions/0026-admin-console-tailscale-access-boundary.md`, `docs/architecture/admin-console.md`, `PROD-689`, `PROD-690`. 이 변경은 Admin-specific logging, audit, security event, identity snapshot과 별도 보존 정책을 추가해서는 안 된다(MUST NOT).

#### Scenario: 접근 성공과 실패 처리

- **WHEN** Admin Console 요청이 성공하거나 Tailscale 접근 거부·proxy 우회로 차단된다
- **THEN** runtime은 해당 사건을 위한 Admin-specific log, audit record, security event 또는 snapshot을 생성하지
  않는다
