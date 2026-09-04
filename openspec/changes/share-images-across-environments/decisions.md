## Context

이 기록은 PROD-891로 가능해진 환경 중립 Web image를 현재 단일 Kosmo runtime topology에서 dev·prod 동일 digest로 승격하는 구현 경계를 고정한다.

## Decision Records

### Main Docker Build run이 canonical artifact identity를 소유한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833)
- Status: Active
- Context / Problem: Source SHA만 같고 환경별로 다시 build하면 실제 image bytes와 digest가 달라질 수 있다.
- Decision Outcome: Main push의 성공한 `Docker Build` run이 source SHA의 유일한 deployable Kosmo image producer이며, 그 run이 게시한 exact digest를 dev와 prod가 함께 사용한다.
- Alternatives Considered: Dev/prod 별도 build, mutable `:main`/`stable` tag, release 시 rebuild. Exact artifact 승격을 증명하지 못하므로 선택하지 않았다.
- Consequences: Canonical build나 artifact가 없으면 해당 SHA는 배포할 수 없고 preflight가 실패한다.
- Confirmation / Follow-up: 정적 workflow test와 별도 live 배포 evidence에서 run ID·SHA·digest 일치를 확인한다.

### Manifest는 단일 image digest만 기록한다

- Decision Date: 2026-09-04
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833)의 현재 single-image 범위와 사용자 지시
- Status: Active
- Context / Problem: 현재 Web, API, Admin, Worker, Fedify Consumer와 migration은 하나의 image와 하나의 `imageDigest` Helm parameter를 공유한다.
- Decision Outcome: Canonical artifact의 JSON manifest는 `imageDigest` 하나만 기록한다.
- Alternatives Considered: Runtime 이름→digest map, versioned manifest schema, reusable release-manifest action. 현재 consumer나 topology가 요구하지 않아 선택하지 않았다.
- Consequences: Runtime image 분리가 실제로 승인되면 그 변경이 새 manifest contract를 별도로 설계해야 한다.
- Confirmation / Follow-up: Static test가 producer와 두 consumer가 같은 field를 사용하는지 확인한다.

### Production 승인은 고정된 digest의 mutation만 gate한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-783](https://linear.app/byulmaru/issue/PROD-783)
- Status: Active
- Context / Problem: 기존 production job은 승인 뒤 target code를 checkout하고 image와 Sentry artifact를 다시 생성했다.
- Decision Outcome: Preflight가 target SHA의 canonical build run과 digest를 승인 전에 고정하고, `prod` Environment 승인 뒤에는 해당 SHA/digest의 Argo mutation, migration과 workload sync만 수행한다.
- Alternatives Considered: 승인 뒤 rebuild, 승인 전 Argo credential 취득, 승인 뒤 artifact 재검색. 동일 artifact 보장 또는 승인 identity 고정을 깨므로 선택하지 않았다.
- Consequences: Canonical image 자체는 승인 전에 GHCR과 run artifact에 존재할 수 있지만 production secret과 mutation은 계속 승인 뒤에만 접근한다.
- Confirmation / Follow-up: Production job에서 checkout, Docker build/push/login과 Sentry upload가 없고 preflight outputs만 사용하는지 검증한다.

### 공개 설정과 server secret은 기존 runtime 경계를 유지한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891), [PROD-833](https://linear.app/byulmaru/issue/PROD-833)
- Status: Active
- Context / Problem: 과거 PROD-833은 browser runtime config JSON을 도입했지만 현재 main에는 더 작은 channel selection 계약이 구현돼 있다.
- Decision Outcome: Web 공개 설정은 `/channel.js`의 `dev`/`prod` 선택을 유지하고, `ENVIRONMENT`와 server Secret은 Helm runtime 주입을 유지한다. 이 변경은 client/runtime config code를 수정하지 않는다.
- Alternatives Considered: 과거 `/runtime-config.json` 재도입, packaged asset 치환, environment build args 복구. 현재 계약과 최소 범위를 해치므로 선택하지 않았다.
- Consequences: 공개 설정 변경은 PROD-891의 코드 설정표와 client release 경계를 따르며 image promotion workflow와 분리된다.
- Confirmation / Follow-up: Diff와 workflow test에서 config code/build args가 추가되지 않았는지 확인한다.

### Sentry release/source map은 canonical build에서 한 번 생성한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-493](https://linear.app/byulmaru/issue/PROD-493)
- Status: Active
- Context / Problem: Production rebuild가 같은 release의 source map upload를 다시 수행한다.
- Decision Outcome: Main Docker Build만 `kosmo@<full SHA>` release와 source map을 생성·업로드하며 dev와 prod는 해당 build image를 재사용한다.
- Alternatives Considered: Production 승인 뒤 재업로드, deploy-time source map upload. Canonical artifact 생성이 중복되므로 선택하지 않았다.
- Consequences: Sentry upload 실패는 canonical build 실패이며 downstream deploy가 시작되지 않는다.
- Confirmation / Follow-up: Production workflow에서 Sentry build inputs가 제거되고 Docker Build에만 남는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `deploy-production-from-main-or-sha`의 승인 뒤 production image 별도 build와 dev/prod digest 비동일 허용 결정은 이 change의 canonical digest 승격으로 대체된다.
- 과거 `share-images-across-environments` 제안의 browser runtime config와 multi-runtime digest map 결정은 현재 PROD-891 channel 설정과 single-image 범위로 대체된다.
