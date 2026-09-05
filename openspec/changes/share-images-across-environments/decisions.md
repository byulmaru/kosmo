## Context

이 기록은 PROD-891로 가능해진 환경 중립 Web image를 현재 단일 Kosmo runtime topology에서 Git SHA tag digest로 dev·prod에 배포하는 구현 경계를 고정한다.

## Decision Records

### Main Docker Build가 full SHA tag를 게시한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833)
- Status: Active
- Context / Problem: Source SHA를 기준으로 배포하더라도 mutable `:main` tag와 승인 뒤 production rebuild는 배포 대상을 모호하게 만든다.
- Decision Outcome: Main push의 성공한 `Docker Build` run이 현재 단일 Kosmo image를 한 번 build·push하고 `sha-<full 40-character Git SHA>` tag를 게시한다. Sentry release/source map도 이 canonical build에서 한 번 생성·업로드한다.
- Alternatives Considered: Release manifest/artifact retention, mutable `:main`/`stable` tag, 승인 뒤 production rebuild. 현재 SHA tag 조회 계약에 필요하지 않거나 production 재생성을 유발하므로 선택하지 않았다.
- Consequences: SHA tag는 재빌드로 덮어쓸 수 있으며, tag 조회 시점에 따라 Dev와 Production의 digest가 달라질 수 있다. Docker Build run 성공 자체는 최종 digest를 증명하지 않는다.
- Confirmation / Follow-up: 정적 workflow test와 별도 live 배포 evidence에서 run ID·SHA·GHCR tag 조회·digest를 구분해 확인한다.

### Dev와 Production은 GHCR SHA tag digest를 조회한다

- Decision Date: 2026-09-05
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833)의 현재 single-image 범위와 사용자 지시
- Status: Active
- Context / Problem: 현재 Web, API, Admin, Worker, Fedify Consumer와 migration은 하나의 image와 하나의 `imageDigest` Helm parameter를 공유하지만, GHCR tag가 가리키는 digest는 재빌드로 바뀔 수 있다.
- Decision Outcome: Dev는 triggering Docker Build의 `head_sha`로 `sha-<head_sha>` tag digest를 조회·검증한다. Production preflight는 target SHA의 성공한 main push Docker Build run을 확인한 뒤 같은 SHA tag digest를 조회·검증하고 승인 전에 outputs로 고정한다.
- Alternatives Considered: JSON manifest upload/download, run output digest를 cross-environment identity로 강제, mutable `:main` tag. 새 artifact retention 의존성이나 현재 권위가 요구하지 않는 동일 run 보장을 추가하므로 선택하지 않았다.
- Consequences: Dev와 Production이 같은 SHA tag를 다른 시점에 조회하면 digest가 달라질 수 있다. 이는 허용된 운영 경계이며 Production approval 이후에는 preflight digest를 다시 조회하지 않는다.
- Confirmation / Follow-up: Static test가 SHA tag 구성, GHCR digest validation과 두 Argo `imageDigest` 전달 경로를 확인한다.

### Production 승인은 고정된 digest의 mutation만 gate한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-783](https://linear.app/byulmaru/issue/PROD-783)
- Status: Active
- Context / Problem: 기존 production job은 승인 뒤 target code를 checkout하고 image와 Sentry artifact를 다시 생성했다.
- Decision Outcome: Preflight가 target SHA의 성공한 main push Docker Build run과 GHCR SHA tag digest를 승인 전에 고정하고, `prod` Environment 승인 뒤에는 해당 SHA/digest의 Argo mutation, migration과 workload sync만 수행한다.
- Alternatives Considered: 승인 뒤 rebuild, 승인 전 Argo credential 취득, 승인 뒤 SHA tag/digest 재조회. 승인 identity 고정을 깨므로 선택하지 않았다.
- Consequences: SHA tag는 승인 대기 중 덮어쓸 수 있지만 production은 preflight outputs의 digest를 유지한다. Production secret과 mutation은 계속 승인 뒤에만 접근한다.
- Confirmation / Follow-up: Production job에서 checkout, Docker build/push/login, Sentry upload와 tag/digest 재조회가 없고 preflight outputs만 사용하는지 검증한다.

### 공개 설정과 server secret은 기존 runtime 경계를 유지한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891), [PROD-833](https://linear.app/byulmaru/issue/PROD-833)
- Status: Active
- Context / Problem: 과거 PROD-833은 browser runtime config JSON을 도입했지만 현재 main에는 더 작은 channel selection 계약이 구현돼 있다.
- Decision Outcome: Web 공개 설정은 `/channel.js`의 `dev`/`prod` 선택을 유지하고, `ENVIRONMENT`와 server Secret은 Helm runtime 주입을 유지한다. 이 변경은 client/runtime config code를 수정하지 않는다.
- Alternatives Considered: 과거 `/runtime-config.json` 재도입, packaged asset 치환, environment build args 복구. 현재 계약과 최소 범위를 해치므로 선택하지 않았다.
- Consequences: 공개 설정 변경은 PROD-891의 코드 설정표와 client release 경계를 따르며 image promotion workflow와 분리된다.
- Confirmation / Follow-up: Diff와 workflow test에서 config code/build args가 추가되지 않았는지 확인한다.

### Sentry release/source map은 canonical build에서 한 번 생성한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-833](https://linear.app/byulmaru/issue/PROD-833), [PROD-493](https://linear.app/byulmaru/issue/PROD-493)
- Status: Active
- Context / Problem: Production rebuild가 같은 release의 source map upload를 다시 수행한다.
- Decision Outcome: Main Docker Build만 `kosmo@<full SHA>` release와 source map을 생성·업로드하며 Dev와 Production은 해당 SHA tag에서 조회한 image digest를 사용한다.
- Alternatives Considered: Production 승인 뒤 재업로드, deploy-time source map upload. Canonical build에서 source map을 한 번 보장하므로 선택하지 않았다.
- Consequences: Sentry upload 실패는 canonical build 실패이며 downstream deploy가 시작되지 않는다. SHA tag 재빌드로 Dev와 Production digest가 달라질 수 있다.
- Confirmation / Follow-up: Production workflow에서 Sentry build inputs가 제거되고 Docker Build에만 남는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `deploy-production-from-main-or-sha`의 승인 뒤 production image 별도 build 결정은 이 change의 SHA tag 조회·승인 전 digest 고정으로 대체된다.
- 2026-09-04 이 change의 run manifest 기반 동일 digest 결정은 현재 SHA tag 재조회와 승인 전 digest 고정으로 대체된다.
- 과거 `share-images-across-environments` 제안의 browser runtime config와 multi-runtime digest map 결정은 현재 PROD-891 channel 설정과 single-image 범위로 대체된다.
