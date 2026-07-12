## Context

현재 `scripts/test-db.mjs reset`은 공유 Postgres 컨테이너와 볼륨을 제거한 뒤 다시 만들고, Fedify와 Playwright 테스트는 고정된 `kosmo_test` 데이터베이스를 truncate한다. 이 구조는 단일 실행에서는 결정적이지만 같은 self-hosted runner 머신에서 여러 workflow run을 동시에 처리할 수 없다.

Postgres 서버는 기존 Docker Compose 서비스 하나를 계속 사용한다. 테스트 명령을 감싸는 Node 스크립트가 실행 식별자로 고유 데이터베이스 URL과 포트 offset을 만들고, 컨테이너 내부의 `createdb`/`dropdb`를 사용해 데이터베이스만 준비·정리한다. 자식 명령은 해당 URL과 offset을 환경변수로 받아 기존 Drizzle, Fedify, Playwright 경로를 그대로 사용한다.

## Goals / Non-Goals

**Goals:**

- 동일한 Postgres 서버에서 여러 테스트 실행의 schema와 데이터를 분리한다.
- 테스트 실패 시에도 실행 소유 데이터베이스를 정리하고 원래 종료 코드를 보존한다.
- 로컬 기본 명령은 추가 설정 없이 계속 동작한다.
- 외부 의존성이나 원격 DB 없이 현재 self-hosted runner 자원을 병렬 활용한다.
- 동시에 실행된 Web E2E의 API, web, OIDC mock 서버 포트와 origin을 분리한다.
- 파괴적 작업은 로컬 `kosmo_test` 네임스페이스에만 허용한다.

**Non-Goals:**

- Playwright spec 자체의 `workers: 1` 제한을 해제하지 않는다.
- Postgres 서버를 실행별 컨테이너나 원격 Neon branch로 분리하지 않는다.
- 테스트 스키마 적용 방식을 Drizzle migration으로 변경하지 않는다.
- runner 인스턴스 설치나 머신 수준 자원 제한을 자동화하지 않는다.

## Risks / Trade-offs

- [동시에 실행된 테스트가 Postgres CPU와 I/O를 공유함] → 우선 workflow 간 DB 충돌만 제거하고 runner 슬롯 수는 머신 측정 결과에 따라 제한한다.
- [취소나 강제 종료로 데이터베이스가 남을 수 있음] → 실행 이름을 `GITHUB_RUN_ID`와 `GITHUB_RUN_ATTEMPT`에서 결정하고 workflow의 `always()` cleanup에서 같은 이름을 다시 삭제한다.
- [잘못된 URL로 운영 DB를 삭제할 수 있음] → 호스트가 loopback이고 데이터베이스 이름이 `kosmo_test` 네임스페이스인지 생성, truncate, drop 전에 검증한다.
- [기존 `.env.test`가 명시적 환경변수를 덮어씀] → 환경파일은 누락된 값만 채우고 schema push와 Playwright도 명시적 `DATABASE_URL`을 우선한다.
- [고유 DB를 사용해도 고정된 E2E 서버 포트가 충돌함] → wrapper가 실행 식별자에서 포트 offset을 만들고 Playwright 및 fixture가 해당 origin을 사용한다. 필요하면 `KOSMO_TEST_PORT_OFFSET`으로 명시적으로 재정의한다.
- [기존 `reset` 사용자가 컨테이너 재생성을 기대함] → `reset`은 기본 테스트 데이터베이스만 drop/create하도록 바꾸고 전체 서버 제거는 명시적 `down --volumes`로 유지한다.

## Migration Plan

1. 테스트 DB 스크립트에 실행별 database 생성, 자식 명령 실행, 정리 동작을 추가한다.
2. 루트 테스트 script와 DB 소비자가 전달받은 `DATABASE_URL`을 사용하게 한다.
3. Playwright의 로컬 서버와 fixture가 실행별 포트 offset으로 만든 origin을 사용하게 한다.
4. Fedify와 Web E2E를 각각 새 wrapper로 실행하고 실제 Docker Postgres에서 검증한다.
5. 두 Web E2E 실행을 동시에 수행해 데이터베이스와 포트 충돌이 없는지 검증한다.
6. workflow의 전역 concurrency group을 제거하고 database cleanup만 남긴다.

롤백 시 workflow 직렬화와 기존 `reset` 기반 package script를 복원하면 된다. 데이터베이스는 테스트 전용 Docker 볼륨에만 존재하므로 데이터 마이그레이션은 필요 없다.

## Open Questions

없음.
