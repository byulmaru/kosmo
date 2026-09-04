## 1. PROD-833 canonical digest producer

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

Main Docker Build가 현재 단일 Kosmo image와 Sentry artifact를 한 번 생성하고 exact digest manifest를 같은 run에 게시하며 triggering Trivy scan도 그 manifest를 사용한다.

**Guardrails**

- Runtime별 image map이나 manifest abstraction을 추가하지 않는다.
- Environment별 공개 설정 build input을 다시 추가하지 않는다.

**Verification**

- Workflow static test, actionlint와 Docker build check로 build 1회, digest 형식, 단일 artifact 게시와 Trivy 소비를 확인한다.

- [x] 1.1 Docker Build output digest를 single-image manifest artifact로 게시한다.
- [x] 1.2 Canonical build만 Sentry release/source map을 생성하는지 정적 검증한다.

## 2. PROD-833 exact digest consumers

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

Dev와 Production이 각자 재build하거나 moving tag를 사용하지 않고 같은 canonical run의 exact digest를 Argo에 전달한다.

**Guardrails**

- Dev는 triggering `workflow_run.id`와 `head_sha`를 사용한다.
- Production은 승인 전에 target SHA의 성공한 main push Docker Build run 하나와 digest를 고정한다.
- 승인 뒤에는 preflight outputs를 다시 해석하지 않는다.

**Verification**

- Static test가 artifact name·run ID·SHA·digest field와 두 Argo `imageDigest` 전달 경로를 함께 확인한다.
- Dev/prod Helm lint·template에서 exact digest image reference를 확인한다.

- [x] 2.1 Dev가 triggering run의 manifest digest를 검증·고정하고 Argo dev에 전달한다.
- [x] 2.2 Production preflight가 target SHA의 canonical run과 manifest digest를 승인 전에 검증·고정한다.
- [x] 2.3 승인된 Production job에서 build/push/Sentry upload를 제거하고 같은 SHA/digest로 migration-gated sync한다.
- [x] 2.4 Exact digest producer→dev/prod 경로를 workflow static test로 증명한다.

## 3. 문서와 전달

**Authority / Provenance**

- [PROD-833](https://linear.app/byulmaru/issue/PROD-833)

**Deliverable**

운영 문서와 PR evidence가 canonical build, dev/prod same-digest 소비와 남은 live gate를 정확히 구분한다.

**Guardrails**

- 실제 dev/prod 배포, Environment 승인, Argo sync, Secret/Variable 변경을 수행하지 않는다.
- PR/CI 검증을 live deployment evidence로 표현하지 않는다.

**Verification**

- OpenSpec strict validation, Prettier, 관련 테스트와 diff review를 통과시킨다.

- [x] 3.1 Production release·migration·Sentry 문서를 canonical digest 승격에 맞춘다.
- [ ] 3.2 Risk-proportional validation을 통과시키고 최신 main 기반 one-layer Stack의 한국어 Ready PR을 제출한다.
- [ ] 3.3 별도 운영 승인 뒤 dev/prod build run·SHA·digest·migration·health를 확인한다.
- [ ] 3.4 Live evidence가 확보된 뒤 delta spec sync와 archive를 완료한다.
