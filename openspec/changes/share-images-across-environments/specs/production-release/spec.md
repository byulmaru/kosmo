## MODIFIED Requirements

### Requirement: Main push는 canonical image를 한 번 build해 dev에 exact digest로 배포한다

**Authority / Provenance:** [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-891](https://linear.app/byulmaru/issue/PROD-891), [PROD-783](https://linear.app/byulmaru/issue/PROD-783) — 시스템은 `main` push의 immutable full SHA에서 현재 단일 Kosmo runtime image를 한 번 build·push하고 exact digest manifest를 같은 Docker Build run의 artifact로 게시해야 한다(MUST). Dev deploy는 자신을 시작한 성공한 Docker Build run의 head SHA와 manifest digest를 검증하고, mutable tag가 아니라 그 digest를 Argo CD `imageDigest` parameter로 전달해야 한다(MUST).

Git tag, `production` 브랜치와 일반 branch push는 canonical build를 시작해서는 안 된다(MUST NOT). Canonical build 실패나 유효한 digest 부재 시 dev deploy는 실행되어서는 안 된다(MUST NOT).

#### Scenario: Main push canonical build와 dev deploy

- **WHEN** commit이 `main`에 push되고 Docker Build가 성공한다
- **THEN** 시스템은 image와 Sentry artifact를 한 번 생성하고, Dev는 triggering run의 full SHA와 exact digest를 Argo revision, version과 imageDigest로 설정한 뒤 sync한다

#### Scenario: Canonical build 실패

- **WHEN** main Docker Build가 실패하거나 valid digest manifest를 게시하지 못한다
- **THEN** Dev는 mutable `:main` tag 또는 다른 run의 digest로 fallback하지 않고 배포를 시작하지 않는다

### Requirement: 수동 production release는 target SHA의 canonical digest를 승인 전에 고정한다

**Authority / Provenance:** [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-783](https://linear.app/byulmaru/issue/PROD-783) — 운영자는 main에 저장된 workflow를 수동 실행해 repository에 존재하는 exact 40-character commit SHA를 target으로 선택하거나 입력을 비워 최신 main SHA를 선택할 수 있어야 한다(MUST). Production preflight는 target SHA에 대응하는 성공한 main push `Docker Build` run과 그 run의 valid digest manifest를 승인 전에 검증하고 run ID, target SHA와 image digest를 immutable outputs로 고정해야 한다(MUST).

Target SHA의 canonical run이나 artifact가 없거나 모호하거나 digest가 invalid이면 시스템은 mutable tag, 다른 SHA 또는 production rebuild로 fallback하지 않고 production credential 접근과 상태 변경 전에 실패해야 한다(MUST).

#### Scenario: Canonical artifact가 있는 target

- **WHEN** target SHA에 대응하는 성공한 main Docker Build run과 valid digest artifact가 하나 존재한다
- **THEN** preflight는 target commit URL, SHA, canonical run ID와 exact image digest를 approval 정보로 고정한다

#### Scenario: Canonical artifact가 없는 target

- **WHEN** target SHA의 성공한 canonical run이나 valid digest artifact를 찾을 수 없다
- **THEN** preflight는 다른 identity를 선택하지 않고 `prod` Environment approval, production credential과 Argo mutation 전에 실패한다

### Requirement: 승인된 production은 canonical digest를 재build 없이 배포한다

**Authority / Provenance:** [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-783](https://linear.app/byulmaru/issue/PROD-783), [PROD-564](https://linear.app/byulmaru/issue/PROD-564) — `prod` Environment 승인 뒤 production job은 preflight가 고정한 target SHA와 exact image digest를 migration Job과 모든 활성화 workload에 전달해야 한다(MUST). Production job은 target code checkout, Docker build/login/push, Sentry release/source-map 생성 또는 artifact 재검색을 수행해서는 안 된다(MUST NOT).

Dev와 production은 같은 target SHA에 대해 같은 canonical Docker Build run의 exact image digest를 사용해야 한다(MUST). `ENVIRONMENT`, server Secret과 `/channel.js` 공개 설정 channel은 각 environment의 기존 runtime 주입을 유지해야 한다(MUST).

#### Scenario: 승인된 canonical release

- **WHEN** valid preflight가 `prod` Environment 승인을 받는다
- **THEN** production job은 고정된 SHA와 digest로 Argo source revision, version, imageDigest와 migration barrier를 적용하고 새 image나 Sentry artifact를 만들지 않는다

#### Scenario: 승인 대기 중 main 이동

- **WHEN** approval 대기 중 더 새로운 commit이 main에 merge된다
- **THEN** 기존 release의 target SHA, canonical run과 image digest는 preflight outputs에서 바뀌지 않는다

### Requirement: Production 배포 결과를 canonical identity로 감사할 수 있다

**Authority / Provenance:** [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-783](https://linear.app/byulmaru/issue/PROD-783) — Production release 기록은 requester, main workflow definition ref, target full SHA, canonical Docker Build run ID, exact image digest, Argo source revision과 결과를 포함해야 한다(MUST). Canonical build, Dev deploy와 Production approval/deploy evidence는 구분해야 하며(MUST), PR/CI 결과만으로 live deployment를 완료했다고 기록해서는 안 된다(MUST NOT).

#### Scenario: Production release 종료

- **WHEN** manual production release가 성공하거나 실패하며 종료된다
- **THEN** 시스템은 preflight가 고정한 canonical build run, SHA와 digest 및 실제 Argo 결과를 workflow summary에 기록한다
