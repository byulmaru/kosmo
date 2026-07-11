## Why

현재 테스트 실행은 하나의 `kosmo_test` 데이터베이스와 Postgres 컨테이너 수명 주기를 공유하므로 동시에 실행하면 reset, schema push, truncate가 서로 충돌한다. self-hosted runner의 여유 자원을 활용해 테스트를 병렬 실행하려면 각 실행이 독립적인 데이터베이스를 사용해야 한다.

## What Changes

- 하나의 로컬 Postgres 서버를 여러 테스트 실행이 공유한다.
- 각 테스트 실행은 고유한 이름의 데이터베이스를 생성하고 해당 데이터베이스에만 스키마와 fixture를 적용한다.
- 테스트 성공·실패와 관계없이 실행이 소유한 데이터베이스를 정리한다.
- 외부에서 전달한 테스트 `DATABASE_URL`을 Fedify와 Web E2E 전체에 일관되게 전달한다.
- Web E2E의 API, web, OIDC mock 포트도 실행별 offset으로 격리한다.
- 데이터베이스 격리가 완료되면 Web E2E workflow의 저장소 전역 직렬화 제한을 제거한다.

## Capabilities

### New Capabilities

- `isolated-test-database`: 공유 Postgres 서버에서 실행별 테스트 데이터베이스를 안전하게 생성, 사용, 정리하는 동작을 정의한다.

### Modified Capabilities

없음.

## Impact

- 루트 테스트 DB 스크립트와 package script
- Docker Compose 테스트 Postgres 수명 주기
- Fedify 및 Playwright 테스트의 `DATABASE_URL` 처리와 삭제 안전장치
- Playwright가 관리하는 로컬 서버의 포트와 origin 설정
- Web E2E GitHub Actions concurrency 및 cleanup 단계
- 로컬 테스트 실행 안내 문서
- 새 런타임 의존성은 추가하지 않는다.
