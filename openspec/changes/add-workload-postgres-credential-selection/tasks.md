## 1. PROD-709 역할별 PostgreSQL credential 선택

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `PROD-709`
- `PROD-369`
- `PROD-706`

**Deliverable**

기존 Helm values와 workload 동작을 유지하면서 API Rollout과 Web BFF가 하나의 API credential source를 공유해 선택할 수 있고, Web 프로세스의 federation/system 전용 DB connection credential source를 별도 입력으로 받을 수 있다. Migration credential은 기존 고정 경계를 유지하며 실제 Secret, role, 두 번째 DB connection/client 또는 credential 전환을 생성하지 않는다.

**Guardrails**

- API와 Web BFF에 서로 다른 DB 인증 source를 만들지 않는다.
- System source는 Web 전용 별도 환경 입력이며 API Rollout이나 Web 기본 `DATABASE_URL`을 바꾸지 않는다.
- URL과 password Secret name/key는 역할별 atomic opt-in이며 partial 설정은 render를 실패시킨다.
- 비활성 기본값의 dev/prod manifest와 runtime 연결을 유지한다.
- Production/dev migration Job의 기존 credential, role 전환과 실행 순서를 바꾸지 않는다.
- Secret value, role/grant/RLS, PKI resource/file mount, federation/system 전용 DB connection/client와 downstream transition을 포함하지 않는다.

**Verification**

- Helm lint와 dev/prod default render가 통과하고 변경 전 manifest와 동일함을 확인한다.
- API source가 API와 Web 기본 env에 동일하게 렌더되고 system source가 Web 전용 별도 env에만 렌더됨을 확인한다.
- API-only, system-only, 양쪽 활성화, 각 selector rollback과 partial 입력 실패를 검증한다.
- 모든 조합에서 migration Job env/Secret refs가 baseline과 동일하고 새 Secret/role/PKI/DB client source가 없음을 확인한다.
- OpenSpec strict validation과 repository formatting/static checks를 통과한다.

- [x] 1.1 역할별 URL과 password Secret reference의 비활성 기본값, atomic validation 및 owner fallback을 제공한다.
- [x] 1.2 API source를 API Rollout과 Web BFF 기본 DB 환경에 공통 적용하고 system source를 Web 전용 별도 환경으로만 렌더한다.
- [x] 1.3 Default 동일성, API/system 조합, partial 입력 거부, rollback과 migration 비침범을 실행 가능한 Helm render 회귀로 검증한다.
- [x] 1.4 관련 정적 검증과 self-review를 통과하고 구현 결과를 OpenSpec task 및 Linear evidence에 반영한다.
