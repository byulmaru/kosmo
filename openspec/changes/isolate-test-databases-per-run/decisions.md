## Context

이 결정 기록은 공유 테스트 Postgres에서 workflow run별 데이터베이스를 격리하고, 기존 Drizzle/Fedify/Playwright 경로를 유지하면서 저장소 전역 직렬화를 제거하기 위한 proposal, spec, design을 반영한다.

## Decision Records

### Postgres 서버는 공유하고 database를 실행별로 분리한다

- Status: Accepted
- Context / Problem: 고정된 `kosmo_test` 데이터베이스와 컨테이너 reset이 동시 테스트 실행을 충돌시킨다.
- Decision Outcome: 기존 Docker Compose Postgres 서버 하나를 유지하고 각 실행이 `kosmo_test` 네임스페이스의 고유 database를 생성해 사용한다.
- Alternatives Considered: 실행별 Postgres 컨테이너는 포트와 볼륨 관리가 추가되고, schema 분리는 현재 `public` 기준 truncate와 search path를 바꿔야 하며, Neon은 싱가포르 네트워크 지연과 외부 의존성을 추가하므로 선택하지 않았다.
- Consequences: 테스트 실행은 Postgres CPU와 I/O를 공유하지만 schema와 데이터 및 파괴적 reset은 격리된다.
- Confirmation / Follow-up: 두 루트 테스트 명령을 동시에 실행해 서로 다른 database를 사용하고 모두 성공하는지 확인한다.

### Node wrapper가 database 수명 주기와 환경 전달을 소유한다

- Status: Accepted
- Context / Problem: 자식 프로세스가 부모 shell의 환경을 변경할 수 없으므로 create 명령과 기존 package script를 단순 연결하는 것만으로는 실행별 URL을 전체 테스트 프로세스에 전달할 수 없다.
- Decision Outcome: `scripts/test-db.mjs run -- <command>`가 database를 생성하고 `DATABASE_URL`을 설정한 자식 명령을 동기 실행한 뒤 database를 정리한다.
- Alternatives Considered: 임시 env 파일은 동시 실행 시 파일 격리와 정리가 필요하고, 새 라이브러리 도입은 표준 `child_process`와 컨테이너의 PostgreSQL CLI로 해결 가능한 문제에 불필요하다.
- Consequences: 루트 테스트 명령은 내부 database 전용 명령을 wrapper로 호출하며 명시적 `DATABASE_URL`은 기본값보다 우선한다.
- Confirmation / Follow-up: 성공 및 실패 자식 명령에서 종료 코드와 database cleanup을 확인한다.

### 파괴적 작업은 loopback 테스트 database로 제한한다

- Status: Accepted
- Context / Problem: 실행별 URL을 동적으로 처리하면 잘못된 환경변수로 다른 데이터베이스를 truncate하거나 drop할 위험이 있다.
- Decision Outcome: 대상 host가 `localhost`, `127.0.0.1`, `::1` 중 하나이고 database 이름이 `kosmo_test` 네임스페이스일 때만 reset, truncate, drop을 허용한다.
- Alternatives Considered: database 이름만 검증하면 원격 서버의 동명 database를 삭제할 수 있고, 별도 확인 플래그는 CI 설정 실수로 우회될 수 있어 선택하지 않았다.
- Consequences: 원격 테스트 DB는 이 도구의 지원 범위가 아니며 필요하면 별도 설계가 필요하다.
- Confirmation / Follow-up: 허용되지 않은 host와 database 이름에 대해 명령이 Docker 작업 전에 실패하는지 확인한다.

### Playwright spec 병렬화는 유지하지 않는다

- Status: Accepted
- Context / Problem: workflow run 간 충돌과 한 run 내부 spec 간 fixture 충돌은 서로 다른 문제다.
- Decision Outcome: workflow run은 database 단위로 병렬화하되 각 Playwright run의 `workers: 1` 설정은 유지한다.
- Alternatives Considered: spec별 database 또는 transaction fixture는 현재 변경 범위를 크게 늘리므로 선택하지 않았다.
- Consequences: 한 workflow 안의 E2E 시간은 그대로지만 여러 workflow의 대기열을 줄일 수 있다.
- Confirmation / Follow-up: 없음.

### Web E2E 서버 포트도 실행별로 격리한다

- Status: Accepted
- Context / Problem: database만 분리해도 Playwright가 시작하는 API, web, OIDC mock 서버가 고정 포트를 공유하면 여러 workflow run이 같은 머신에서 동시에 실행될 수 없다.
- Decision Outcome: test DB wrapper가 database 이름에서 포트 offset을 계산해 전달하고 Playwright가 세 서버의 base port에 동일한 offset을 적용한다. 호출자는 `KOSMO_TEST_PORT_OFFSET`으로 값을 재정의할 수 있다.
- Alternatives Considered: runner별 고정 포트를 머신 설정에만 두면 저장소 명령을 그대로 병렬 실행할 수 없고, 실행별 컨테이너 네트워크는 현재 규모에 비해 복잡해 선택하지 않았다.
- Consequences: 테스트 fixture와 OIDC 요청도 계산된 web/OIDC origin을 사용해야 하며 Playwright 내부 worker 수는 그대로 유지된다.
- Confirmation / Follow-up: 두 Web E2E 루트 명령을 동시에 실행해 bind 충돌 없이 완료되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
