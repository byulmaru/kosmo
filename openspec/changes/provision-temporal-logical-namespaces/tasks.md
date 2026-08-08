## 1. PROD-719 Helm namespace provisioning

**Authority / Provenance**

- `PROD-695`
- `PROD-719`

**Deliverable**

Dev/prod Helm render에 환경별 Temporal namespace name, owner, retention과 고정 CLI image를 사용하는 독립 PreSync Job이 나타난다.

**Guardrails**

- `kosmo-dev`는 3일, `kosmo-prod`는 30일 retention을 사용한다.
- 두 namespace의 owner email은 `dev@byulmaru.co`이다.
- Job은 `temporalio/admin-tools:1.31.2`의 검증된 multi-architecture digest를 사용한다.
- Job은 cluster-internal frontend와 `--tls=false`를 명시한다.
- Terraform provider/resource, Tailscale endpoint, 외부 port-forward와 Worker runtime을 포함하지 않는다.

**Verification**

- Dev/prod Helm render에서 환경별 값, hook annotation, image digest, address와 timeout을 검토한다.
- Helm template과 repository formatting 검증을 통과한다.
- Render 결과에 Terraform/Tailscale/Worker resource가 추가되지 않았는지 확인한다.

- [x] 1.1 환경별 namespace name·owner·retention과 고정 CLI image values를 추가한다.
- [x] 1.2 Bounded timeout/backoff와 안전한 Pod security context를 가진 PreSync Job을 구현한다.
- [x] 1.3 Dev/prod Helm render와 정적 검증을 통과시킨다.

## 2. PROD-719 멱등 create/update와 실패 전파

**Authority / Provenance**

- `PROD-719`

**Deliverable**

PreSync Job이 namespace 최초 생성과 기존 owner·retention 수렴을 멱등 수행하고, 최종 create/update 실패를 Argo CD sync 실패로 전달한다.

**Guardrails**

- Create 성공 또는 update 성공 없이 Job을 성공 처리하지 않는다.
- CLI error text 파싱에 namespace 존재 판정을 결합하지 않는다.
- Namespace delete 명령이나 자동 폐기 경로를 포함하지 않는다.
- Failed Job의 원인을 log에서 확인할 수 있어야 한다.

**Verification**

- 고정 image가 linux/amd64·linux/arm64와 create/update `--email`·`--retention` flags를 제공하는지 확인한다.
- Create 성공, already-exists 후 update 성공, drift update와 unreachable endpoint 실패를 검증한다.
- Rendered command에 namespace delete와 오류 무시 경계가 없는지 확인한다.

- [x] 2.1 고정 CLI image의 architecture와 필요한 namespace flags를 검증한다.
- [x] 2.2 Create 성공과 create 실패 후 update 성공 경로를 검증한다.
- [x] 2.3 Create와 update가 모두 실패할 때 Job이 실패하는지 검증한다.
- [x] 2.4 Namespace delete와 오류 무시 경계가 없음을 검증한다.

## 3. PROD-719 Live dev/prod sync

**Authority / Provenance**

- `PROD-695`
- `PROD-719`

**Deliverable**

실제 dev/prod Argo CD sync가 각 Temporal namespace를 선언값으로 수렴시키고 재동기화에도 성공한다.

**Guardrails**

- Prod sync는 dev create·rerun·drift·failure 검증 뒤에 수행한다.
- Rollback은 생성된 Temporal namespace를 삭제하지 않는다.
- Provisioning 실패 시 후속 workload sync를 진행하지 않는다.

**Verification**

- Dev create, rerun, retention drift update와 unreachable frontend 실패를 확인한다.
- Dev 증거 뒤 prod create, rerun과 retention drift update를 확인한다.
- Job 상태·log와 Argo CD sync gate를 확인한다.

- [ ] 3.1 Dev sync에서 `kosmo-dev` create·rerun·drift·failure gate를 검증한다.
- [ ] 3.2 Prod sync에서 `kosmo-prod` create·rerun·drift를 검증한다.
- [ ] 3.3 Job 관측과 비파괴 rollback 절차를 검증·문서화한다.

## 4. PROD-719 완료 정합성 및 archive

**Authority / Provenance**

- `PROD-719`

**Deliverable**

PROD-719의 구현·운영 검증 증거와 OpenSpec delta가 일치하고, PROD-730이 namespace readiness를 선행 조건으로 사용할 수 있다.

**Guardrails**

- Worker runtime 구현이나 downstream Workflow 구현을 완료 증거로 요구하지 않는다.
- Live dev/prod 수렴 전에는 change를 archive하거나 PROD-730 blocker를 해제하지 않는다.

**Verification**

- 모든 task와 PROD-719 완료 조건을 구현·CI·live evidence에 대조한다.
- Delta spec 동기화와 strict validation을 확인한다.
- PROD-730 blocker 해제 가능 여부를 검토한다.

- [ ] 4.1 구현·CI·live evidence를 PROD-719와 각 requirement에 연결해 최종 검토한다.
- [x] 4.2 OpenSpec strict validation과 delta spec 정합성을 확인한다.
- [ ] 4.3 전체 scope가 완료된 경우 canonical spec을 동기화하고 change를 archive한다.
