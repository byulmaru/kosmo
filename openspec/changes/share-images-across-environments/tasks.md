## 1. PROD-833 SHA tag producer

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

Main Docker Build가 현재 단일 Kosmo image를 한 번 생성하고 `sha-<full SHA>` tag를 게시하며 triggering Trivy scan도 그 SHA tag를 사용한다. 별도 release manifest나 digest artifact는 생성하지 않는다.

**Guardrails**

- Runtime별 image map이나 manifest abstraction을 추가하지 않는다.
- Environment별 공개 설정 build input을 다시 추가하지 않는다.
- SHA tag 불변성 강제나 Dev/Production digest 동일성을 추가하지 않는다.

**Verification**

- Workflow static test, actionlint와 Docker build check로 build 1회, SHA tag 형식과 Trivy 소비를 확인한다.

- [x] 1.1 Docker Build가 `sha-<full SHA>` single-image tag를 게시하고 manifest/artifact를 추가하지 않는다.
- [x] 1.2 Canonical build만 Sentry release/source map을 생성하는지 정적 검증한다.

## 2. PROD-833 SHA tag digest consumers

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

Dev와 Production이 각자 재build하거나 moving `:main` tag를 사용하지 않고 SHA tag에서 조회한 digest를 Argo에 전달한다. 서로 다른 시점의 조회로 digest가 달라질 수 있다.

**Guardrails**

- Dev는 triggering `workflow_run.head_sha`를 사용한다.
- Production은 승인 전에 target SHA의 성공한 main push Docker Build run과 GHCR SHA tag digest를 고정한다.
- 승인 뒤에는 SHA tag/digest를 다시 조회하거나 preflight outputs를 다시 해석하지 않는다.

**Verification**

- Static test가 SHA tag·run ID·SHA·digest 조회와 두 Argo `imageDigest` 전달 경로를 함께 확인한다.
- Dev/prod Helm lint·template에서 exact digest image reference를 확인한다.

- [x] 2.1 Dev가 triggering `head_sha`의 GHCR SHA tag digest를 검증·고정하고 Argo dev에 전달한다.
- [x] 2.2 Production preflight가 target SHA의 성공한 main push run과 GHCR SHA tag digest를 승인 전에 검증·고정한다.
- [x] 2.3 승인된 Production job에서 build/push/Sentry upload와 SHA tag/digest 재조회를 제거하고 고정된 SHA/digest로 migration-gated sync한다.
- [x] 2.4 SHA tag producer→dev/prod 경로와 Dev/Production digest 차이 허용 경계를 workflow static test로 증명한다.

## 3. 문서와 전달

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

운영 문서와 PR evidence가 SHA tag 조회, 승인 전 digest 고정과 남은 live gate를 정확히 구분한다.

**Guardrails**

- 실제 dev/prod 배포, Environment 승인, Argo sync, Secret/Variable 변경을 수행하지 않는다.
- PR/CI 검증을 live deployment evidence로 표현하지 않는다.

**Verification**

- OpenSpec strict validation, Prettier, 관련 테스트와 diff review를 통과시킨다.

- [x] 3.1 Production release·migration·Sentry 문서를 SHA tag digest 조회·승격에 맞춘다.
- [x] 3.2 새 구현의 risk-proportional validation을 통과시키고 기존 Stack의 한국어 Ready PR을 갱신한다.
- [ ] 3.3 별도 운영 승인 뒤 dev/prod build run·SHA·digest·migration·health를 확인한다.
- [ ] 3.4 Live evidence가 확보된 뒤 delta spec sync와 archive를 완료한다.
