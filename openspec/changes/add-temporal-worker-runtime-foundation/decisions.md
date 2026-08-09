## Context

이 기록은 PROD-730에서 확정한 Worker foundation 범위와 `docs/architecture/core-services.md`의 worker 진입점 의존 방향을 구현 선택으로 내린다. business Workflow/Activity, 실제 task queue와 live rollout은 첫 capability로 남기고, 이번 변경은 독립 package·image·health lifecycle·기본 비활성 Helm component까지만 준비한다.

## Decision Records

### Worker를 독립 workspace 애플리케이션으로 둔다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-730
- Status: Active
- Context / Problem: Worker를 API/Web process에 결합하면 배포·scaling·shutdown lifecycle이 서로 다른 책임에 묶인다.
- Decision Outcome: Worker를 API/Web와 분리된 `apps/*` workspace 애플리케이션과 공통 image의 별도 command로 제공한다.
- Alternatives Considered: API process 내부에서 Worker 실행; Web BFF와 결합. 둘 다 독립 배포와 lifecycle 조건을 깨뜨려 제외했다.
- Consequences: package, Docker runtime install/copy, entrypoint와 CI가 Worker를 명시적으로 인식해야 한다.
- Confirmation / Follow-up: Worker package 단독 build/test와 image command 검증으로 확인한다.

### 실제 capability가 없으면 외부 연결 전에 실패한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-730
- Status: Active
- Context / Problem: Workflow/Activity가 없는 foundation을 실행 가능하게 만들기 위해 smoke나 예약 queue를 추가하면 실제 책임이 없는 poller가 생긴다.
- Decision Outcome: business Worker registration이 비어 있으면 Temporal과 DB connection 및 health-only 대기를 시작하지 않고 설명 가능한 구성 오류로 즉시 종료한다.
- Alternatives Considered: smoke Workflow/Activity 등록; 빈 task queue poll; health process만 대기. 모두 사용되지 않는 runtime 또는 검증 전용 행동을 production에 남겨 제외했다.
- Consequences: foundation의 Worker command는 단독 성공 실행이 아니라 명확한 fail-fast 경계를 제공한다. 실제 성공 startup은 첫 business capability가 검증한다.
- Confirmation / Follow-up: package test와 image entrypoint 실행에서 non-zero 종료 및 connection 미호출을 확인한다.

### Worker component는 기본 비활성으로 전달한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-730
- Status: Active
- Context / Problem: fail-fast entrypoint를 현재 dev/prod에 배포하면 의도적으로 실패하는 Pod와 불필요한 운영 경보가 생긴다.
- Decision Outcome: Helm Worker component는 기본 비활성으로 두고 manifest contract만 render 가능하게 한다. 첫 business capability가 registration·task queue와 함께 활성화, restart wiring과 live 검증을 소유한다.
- Alternatives Considered: PROD-730에서 dev/prod 활성화; namespace provisioning 완료 뒤 자동 활성화. 실제 consumer가 없어 모두 제외했다.
- Consequences: PROD-730 완료는 live Worker readiness를 증명하지 않으며, PROD-719와 PROD-730은 실제 capability rollout의 병렬 선행 조건으로 남는다.
- Confirmation / Follow-up: dev/prod 기본 render에 Worker resource가 없고 enabled override render에만 나타나는지 확인한다.

### 활성화 manifest는 dev 1, prod 2 replica와 HTTP probe를 사용한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-730
- Status: Active
- Context / Problem: 후속 capability가 Worker를 활성화할 때 replica와 health contract를 다시 결정하지 않도록 기본 운영 형태가 필요하다.
- Decision Outcome: enabled Worker Deployment의 replica 기본은 dev 1, prod 2로 두고 HTTP liveness/readiness를 사용한다. readiness는 polling 준비와 graceful shutdown 상태를 반영한다.
- Alternatives Considered: exec probe; TCP probe; prod 1 replica. process lifecycle을 직접 표현하지 못하거나 기본 가용성 선택과 맞지 않아 제외했다.
- Consequences: lifecycle host는 별도 HTTP health port를 열고 SIGTERM 시 readiness를 먼저 내려야 한다. Kubernetes Service는 필요하지 않다.
- Confirmation / Follow-up: lifecycle package test와 dev/prod Helm render로 확인한다.

### 로컬 실행은 명시적 opt-in command로만 제공한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-730
- Status: Active
- Context / Problem: root dev는 workspace의 `dev` script를 재귀 실행하므로 Worker가 일반 `dev` script를 가지면 모든 로컬 개발이 Temporal 설정을 요구하게 된다.
- Decision Outcome: root 기본 dev에 참여하는 package `dev` script를 만들지 않고 Worker 전용 명시 command를 제공한다.
- Alternatives Considered: root dev에서 항상 실행; missing config일 때 조용히 skip. 전자는 기존 개발을 깨뜨리고 후자는 구성 오류를 숨겨 제외했다.
- Consequences: 개발자와 CI는 Worker 검증 command를 의도적으로 선택해야 한다.
- Confirmation / Follow-up: root dev script graph와 Worker package manifest를 정적으로 검증한다.

### Worker DB Secret/env 입력 seam을 foundation에 포함한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-730, PROD-709, PROD-715
- Status: Active
- Context / Problem: 첫 Notification/Fedify Activity가 Worker chart를 활성화할 때 역할별 DB 입력 구조까지 다시 추가하지 않도록 manifest seam을 미리 둘지 결정해야 했다.
- Decision Outcome: enabled Deployment에 기존 API와 Fedify 역할의 완전한 credential trio를 각 URL/password 환경 변수로 투영한다. foundation process는 값을 소비하거나 DB connection을 열지 않는다.
- Alternatives Considered: 첫 DB consumer에서 전체 seam 추가; Worker 전용 새 DB role 생성. 사용자는 seam 선반영을 선택했고 새 role·권한은 이번 범위를 넘어 제외했다.
- Consequences: 미사용 env가 manifest에 존재하지만 credential 생성·권한·DB client 전환과 live connectivity는 PROD-709/715 및 실제 capability가 소유한다.
- Confirmation / Follow-up: complete/partial credential Helm render와 foundation startup의 DB connection 미호출을 검증한다.

### 정적 composition과 최소 lifecycle host를 사용한다

- Decision Date: 2026-08-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-730
- Status: Active
- Context / Problem: 후속 capability가 Worker를 등록할 seam은 필요하지만 현재 production caller 없이 plugin system이나 범용 port를 설계하면 과도한 public contract가 된다.
- Decision Outcome: repository build에 포함되는 정적 business registration과 최소 lifecycle host를 사용한다. health는 Node 표준 HTTP 기능을 우선하고 dynamic plugin loader를 만들지 않는다.
- Alternatives Considered: runtime plugin discovery; generic dependency-injection container; 별도 health framework. 현재 caller와 요구보다 큰 추상화라 제외했다.
- Consequences: 첫 capability가 구체 registration 형태를 완성할 수 있도록 내부 구현은 좁게 유지하며, 여러 queue 지원을 이번 변경에서 선제 일반화하지 않는다.
- Confirmation / Follow-up: 구현 diff에서 동적 loader, smoke registration과 새 HTTP framework dependency가 없는지 검토한다.

### Temporal SDK transitive build script 권한을 최소화한다

- Decision Date: 2026-08-09
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-730
- Status: Active
- Context / Problem: Temporal Worker SDK 설치가 `@swc/core`와 `protobufjs`의 transitive build script 승인을 요구하며, repository supply-chain policy는 package별 명시 결정을 요구한다.
- Decision Outcome: Worker workflow bundling의 native binding 선택에 필요한 `@swc/core` build script만 허용하고, runtime artifact 생성에 필요하지 않은 `protobufjs` postinstall은 차단한다.
- Alternatives Considered: 두 script 모두 허용; 두 script 모두 차단. 전자는 불필요한 설치 권한을 늘리고 후자는 Worker workflow bundling을 깨뜨릴 수 있어 제외했다.
- Consequences: `pnpm-workspace.yaml`의 allowBuilds가 두 transitive package에 대한 명시 정책을 가진다. Temporal SDK upgrade 시 package와 script 필요성을 다시 검토해야 한다.
- Confirmation / Follow-up: frozen install, Worker package load와 production image build에서 native module 호환성을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
