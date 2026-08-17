## Context

이 기록은 PROD-724의 historical GraphQL-only RLS 경계, 두 legacy 역할의 공통 application object
DML 계약, 기존 migration owner 경계와 production 운영 분리를 기록한다. 현재 application workload
principal은 PROD-780의 `kosmo_runtime LOGIN NOBYPASSRLS`이며, 이 문서의 `kosmo_api`·`kosmo_worker`
workload 분류는 superseded되었다. 두 legacy role의 ACL/default ACL 보존은 API PROD-781과 Worker
PROD-782가 각각 후속 cleanup할 때까지 유효하다.

## Decision Records

### Historical RLS와 object ACL의 책임을 분리했던 경계를 기록한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: PROD-724, PROD-713, PROD-369
- Status: Superseded by PROD-780 on 2026-08-16
- Context / Problem: 역할 이름과 workload 배포 단위를 기준으로 RLS 대상을 넓히면 원래 목표인 GraphQL 행 권한 전환이 Worker/Fedify/Temporal 경로까지 확장된다.
- Decision Outcome: PROD-724 당시 RLS는 GraphQL Query/Mutation의 `kosmo_api`에만 적용하는 것으로
  기록했고, `kosmo_worker`는 비GraphQL trusted workload의 `BYPASSRLS` 역할로 기록했다. 두
  legacy role은 PROD-724의 공통 object ACL을 소비한다. 이 workload 분류와 GraphQL RLS 방향은
  PROD-780 및 ADR 0024로 superseded되었으며 현재 가시성 정책의 권위가 아니다.
- Alternatives Considered: Worker에도 RLS policy를 추가하는 방식, API 배포 단위 전체를 RLS principal로 보는 방식은 현재 Linear 계약과 맞지 않아 제외한다.
- Consequences: historical PROD-724는 table 행 policy를 만들지 않았고, 이 change는 broad object
  ACL의 범위만 기록한다. 현재 GraphQL 가시성·owner policy는 application policy 계층이 소유하며,
  RLS를 현재 구현의 전제로 삼지 않는다.
- Confirmation / Follow-up: PROD-713의 historical policy 검증과 PROD-715/716의 historical
  principal transition 기록은 각 이슈의 당시 범위로만 보존한다. 현재 runtime 전환과 legacy ACL
  cleanup은 PROD-780/PROD-781/PROD-782가 소유한다.

### 두 legacy 역할의 current table DML 집합을 동일하게 유지한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: PROD-724
- Status: Active
- Context / Problem: historical callsite만으로 legacy role별 table allowlist를 만들면 미래 Worker
  Activity와 GraphQL 도메인 변경이 ACL migration에 결합되고, 사용자가 승인한 trusted boundary보다
  좁은 별도 정책 체계를 만든다.
- Decision Outcome: legacy `kosmo_api`와 `kosmo_worker` 모두 현재 `public` application table
  전체에 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 갖는다. 현재 workload인 `kosmo_runtime`의 ACL은
  PROD-780이 별도로 소유한다.
- Alternatives Considered: 현재 사용 중인 table만 열거하는 방식, API와 Worker의 DML 집합을 다르게 하는 방식은 역할별 최소권한 matrix를 만들지 않는 계약 때문에 제외한다.
- Consequences: legacy table-level 세분화를 추가하지 않고, DDL·ownership·grant option·비CRUD
  권한을 엄격히 제외한다. historical RLS를 현재 행 범위의 근거로 해석하지 않는다.
- Confirmation / Follow-up: catalog에서 두 legacy 역할의 application table DML 집합이 동일한지
  전수 비교한다. API/Worker legacy ACL 제거는 각각 PROD-781/PROD-782가 별도로 검증한다.

### schema-wide current grant와 owner-scoped default privileges를 사용한다

- Decision Date: 2026-08-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, PROD-724, PROD-616
- Status: Active
- Context / Problem: 현재 table과 future table에 같은 계약을 적용하면서 `drizzle` history와 다른 schema/owner를 제외해야 한다.
- Decision Outcome: current object에는 `ON ALL TABLES IN SCHEMA public`을 사용하고, future object에는 `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public ... ON TABLES`를 사용한다.
- Alternatives Considered: current table 이름을 모두 명시하는 방식도 규격을 만족하지만 schema 변화 때 누락 가능성이 커 기본 경로로 선택하지 않는다. database-wide grant와 `ALL PRIVILEGES`는 범위가 넓어 제외한다.
- Consequences: migration 적용 시점의 모든 `public` table이 포함된다. `drizzle` schema는 제외되고 future ACL은 owner `kosmo`가 만든 table에만 적용된다.
- Confirmation / Follow-up: 빈 database replay 뒤 `public` table 목록, owner, ACL과 `pg_default_acl`을 함께 검증한다.

### application sequence 권한은 필요를 도입하는 migration이 소유한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: PROD-724, PROD-616
- Status: Active
- Context / Problem: 현재 application table은 UUID 기본값을 사용하고 유일한 `SERIAL`은 runtime 범위 밖의 migration history다.
- Decision Outcome: PROD-724는 sequence ACL을 추가하지 않는다. 후속 migration이 sequence 또는
  identity를 도입하면 해당 migration이 소비하는 application principal에 필요한 ACL을 같은
  migration에서 선언한다.
- Alternatives Considered: 미래 사용을 예상해 `ALL SEQUENCES IN SCHEMA public`과 default sequence ACL을 미리 부여하는 방식은 현재 필요가 없어 제외한다.
- Consequences: 현재 권한 범위가 불필요하게 넓어지지 않으며 future sequence 도입자는 ACL 호환성을 직접 책임진다.
- Confirmation / Follow-up: 현재 replay 결과에 application sequence grant가 없고 `drizzle` history 접근이 생기지 않는지 확인한다.

### 구현 완료와 production 운영 승인을 분리한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, PROD-724
- Status: Active
- Context / Problem: production preflight·apply·live 증거를 OpenSpec task로 두면 구현 완료와 운영 권한이 결합된다.
- Decision Outcome: local/disposable replay와 비운영 catalog·DML 검증을 이 변경의 완료 증거로 삼는다. Production preflight, sync/apply, cutover와 post-apply live 검증은 별도 명시 승인과 운영 절차로 분리한다.
- Alternatives Considered: production 적용을 OpenSpec archive 조건으로 두는 방식은 승인 경계를 흐리므로 제외한다.
- Consequences: PR merge, 이슈 Done과 archive는 production 작업을 승인하지 않으며, production 작업 부재가 이 OpenSpec 완료를 막지 않는다.
- Confirmation / Follow-up: tasks에 production 실행 항목을 만들지 않고 문서에는 비승인 guardrail만 유지한다.

### disposable legacy role bootstrap과 application migration을 분리한다

- Decision Date: 2026-08-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, PROD-724, PROD-369
- Status: Active
- Context / Problem: 현재 disposable database harness는 database만 재생성하고 `kosmo_api`·`kosmo_worker` legacy cluster role을 만들지 않아, 새 GRANT migration은 role 부재로 full replay에 실패한다.
- Decision Outcome: disposable 검증 bootstrap이 PROD-369과 동등한 비소유 legacy fixture 역할을
  migration 전에 만든다. Application migration은 역할 생성, 속성 변경과 credential을 포함하지
  않는다. 현재 `kosmo_runtime` fixture와 ACL은 PROD-780이 소유한다.
- Alternatives Considered: migration 안에서 `CREATE ROLE`을 실행하는 방식은 CNPG DatabaseRole/Vault provisioning을 중복하고 production ownership 경계를 침범하므로 제외한다. replay를 생략하는 방식은 migration 재현성 gate를 잃으므로 제외한다.
- Consequences: local migration smoke와 legacy ACL 검증은 cluster role fixture를 선행 조건으로
  갖지만, production role lifecycle은 계속 PROD-369/CNPG가 소유한다.
- Confirmation / Follow-up: fixture 역할의 attribute를 PROD-369 계약과 비교하고 migration SQL에
  role DDL·credential이 없는지 검사한다. `kosmo_runtime` current workload evidence는 이 change의
  검증 결과로 사용하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- API/Fedify 또는 역할별 최소 table·sequence·function grant를 하나의 공통 matrix로 설계하던 과거 방향은 2026-08-11 PROD-724·713·368 정렬로 대체되었다. 당시 계약은 GraphQL-only RLS, 비GraphQL `kosmo_worker` `BYPASSRLS`, 두 역할의 동일한 broad application CRUD DML ACL이었으며 runtime 분류는 이후 PROD-780이 다시 대체했다.
- 취소된 PROD-710의 명시적 Worker/Fedify DB handle을 PROD-724의 권한 설계 선행 조건으로 보던 방향은 대체되었다. PROD-724는 callsite handle이나 principal cutover를 소유하지 않는다.
- GraphQL-only `kosmo_api` runtime과 비GraphQL `kosmo_worker BYPASSRLS`의 workload 분류는 2026-08-17 PROD-780의 새 `kosmo_runtime LOGIN NOBYPASSRLS` application runtime 계약으로 대체되었다. 기존 `kosmo_api`와 `kosmo_worker BYPASSRLS`의 object ACL/default ACL은 각각 PROD-781/PROD-782까지 rollback-compatible하게 유지된다.
