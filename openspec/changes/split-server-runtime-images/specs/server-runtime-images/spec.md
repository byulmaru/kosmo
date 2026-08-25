## ADDED Requirements

### Requirement: 서버 runtime별 사전 생성 JavaScript artifact

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-831`. 시스템은 Web/BFF, API, Temporal Worker, Fedify consumer와 database migration의 실제 production 실행 graph를 build 단계에서 사전 생성한 JavaScript artifact로 만들어야 한다(MUST). Runtime은 TypeScript source를 직접 해석하거나 `tsx`를 통해 시작해서는 안 되며(MUST NOT), Worker host와 Temporal Workflow bundle도 Worker image가 시작되기 전에 생성되어야 한다(MUST).

#### Scenario: 다섯 runtime artifact 생성

- **WHEN** 승인된 source SHA에 대해 production runtime build를 실행한다
- **THEN** 시스템은 Web/BFF, API, Temporal Worker host·Workflow, Fedify consumer와 migration command가 각각 소비할 수 있는 JavaScript artifact를 생성한다
- **AND** artifact 생성은 final image를 만들기 전에 완료된다

#### Scenario: 생성 artifact로 runtime 시작

- **WHEN** Web/BFF, API, Worker, Fedify consumer 또는 migration runtime을 해당 final image에서 시작한다
- **THEN** process는 사전 생성된 JavaScript entry/artifact를 실행한다
- **AND** TypeScript source를 직접 실행하거나 `tsx` CLI를 resolution하는 경로가 없다

### Requirement: runtime별 전용 final image와 dependency 경계

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-831`. 시스템은 Web, API, Temporal Worker, Fedify consumer와 migration을 서로 분리된 다섯 final image로 제공해야 한다(MUST). 각 image는 해당 runtime의 사전 생성 artifact와 production 실행에 필요한 dependency만 포함해야 하며(MUST), 다른 runtime의 source, 범용 workspace `node_modules` 또는 development dependency를 포함해서는 안 된다(MUST NOT).

각 artifact의 third-party runtime dependency는 build graph의 external import에서 자동 도출한 manifest로 설치해야 한다(MUST). Dockerfile이나 검증 코드가 현재 package 이름의 수동 allowlist를 runtime 계약으로 가져서는 안 된다(MUST NOT).

#### Scenario: runtime image 선택

- **WHEN** release build가 다섯 server runtime image를 생성한다
- **THEN** Web, API, Worker, Fedify consumer와 migration은 각자의 final image와 명시적 boot command를 가진다
- **AND** 한 runtime을 실행하기 위해 다른 runtime image의 source나 package tree를 복사하지 않는다

#### Scenario: production dependency 경계

- **WHEN** final image의 filesystem과 production dependency graph를 검사한다
- **THEN** image에는 해당 runtime artifact, 필요한 production dependency와 target runtime 파일만 남는다
- **AND** TypeScript source, `tsx`, workspace 전체 `node_modules`와 development dependency는 final image에 존재하지 않는다

#### Scenario: runtime import 변경이 manifest에 반영된다

- **WHEN** API를 포함한 어느 runtime의 workspace code가 새로운 third-party package를 production 경로에서 import하거나 기존 import를 제거한다
- **THEN** artifact build가 해당 runtime manifest를 build graph에 맞게 자동으로 갱신한다
- **AND** 다른 runtime의 manifest, Dockerfile package 목록 또는 exact dependency allowlist test를 수동으로 동기화할 필요가 없다

### Requirement: Worker target platform과 최소 native/runtime dependency

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-831`. Temporal Worker artifact와 Worker final image는 release target인 Linux/ARM64에서 실행 가능하도록 build되어야 한다(MUST). Worker image는 host·Workflow 실행에 실제 필요한 Temporal native/runtime artifact만 target ABI에 맞게 포함해야 하며(MUST), build 환경의 다른 architecture용 native binary나 사용하지 않는 범용 dependency를 배포해서는 안 된다(MUST NOT).

#### Scenario: Linux/ARM64 Worker build

- **WHEN** Linux/ARM64 target으로 Worker artifact와 final image를 build한다
- **THEN** host와 Workflow bundle이 target Node runtime에서 load되고 Worker process가 시작된다
- **AND** native module은 Linux/ARM64 ABI와 일치한다

#### Scenario: native dependency 검증 실패

- **WHEN** Worker final image의 native/runtime dependency가 target ABI와 일치하지 않거나 host·Workflow 실행에 필요한 artifact가 누락된다
- **THEN** Worker image build 또는 boot 검증은 실패한다
- **AND** 해당 image digest는 release runtime image set에 포함되지 않는다

### Requirement: runtime artifact build·boot·dependency·size gate

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-831`. 시스템은 다섯 runtime image 각각에 대해 artifact 생성, production dependency, target boot과 image size를 검증하는 gate를 제공해야 한다(MUST). 동일 Linux/ARM64 조건에서 각 final image의 compressed size는 현재 single runtime image보다 작아야 하며(MUST), 감소 원인을 포함·제외 dependency와 layer로 설명할 수 있어야 한다(MUST). 모든 runtime image가 같은 source SHA와 승인된 build run에서 생성되고 각 gate를 통과하기 전에는 Helm 또는 release workflow가 runtime별 image digest set으로 전환되어서는 안 된다(MUST NOT).

#### Scenario: 전체 runtime gate 통과

- **WHEN** 다섯 runtime image의 artifact, dependency, Linux/ARM64 boot과 size 검증이 모두 성공한다
- **THEN** 시스템은 source SHA와 build run을 식별하는 runtime image digest set을 release workflow와 Helm 입력으로 전달할 수 있다
- **AND** 다섯 final image 각각의 compressed/uncompressed size와 주요 layer가 current single-image baseline과 함께 기록되고 각 compressed size가 baseline보다 작다

#### Scenario: runtime gate 실패

- **WHEN** 하나 이상의 runtime image에서 artifact 생성, dependency, boot 또는 size gate가 실패한다
- **THEN** build는 실패하고 불완전한 runtime image digest set을 release workflow와 Helm에 전달하지 않는다
- **AND** 다른 runtime image가 개별적으로 성공했다는 이유로 해당 release를 활성화하지 않는다

#### Scenario: image size 감소 실패

- **WHEN** 같은 Linux/ARM64 조건에서 하나 이상의 final image compressed size가 current single-image baseline 이상이거나 size 차이를 dependency와 layer로 설명할 수 없다
- **THEN** artifact gate는 실패한다
- **AND** Helm과 release workflow의 runtime image set 전환을 시작하지 않는다

### Requirement: server source map과 upload credential의 final image 제외

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-831`. 서버 JavaScript artifact의 source map은 같은 release identity로 Sentry에 연결·업로드할 수 있어야 한다(MUST). Upload credential은 build secret 경계로만 전달해야 하며(MUST), source map과 upload credential은 production final image와 runtime environment에 포함되어서는 안 된다(MUST NOT).

#### Scenario: source map upload

- **WHEN** API 또는 Web/BFF server artifact를 build하고 Sentry source map upload를 활성화한다
- **THEN** 시스템은 해당 release identity로 source map을 업로드한다
- **AND** upload credential은 image layer, build argument 또는 runtime environment에 기록하지 않는다

#### Scenario: source map final image 검사

- **WHEN** API와 Web/BFF final image를 source map 및 credential 노출 여부로 검사한다
- **THEN** runtime JavaScript artifact는 source map reference 없이 실행 가능하다
- **AND** source map 파일과 Sentry upload credential은 final image filesystem과 runtime environment에서 발견되지 않는다
