## 1. 테스트 데이터베이스 수명 주기

- [x] 1.1 테스트 DB 스크립트에 loopback 및 `kosmo_test` 네임스페이스 검증을 추가한다.
- [x] 1.2 공유 Postgres에서 실행별 database를 생성하고 자식 명령 종료 후 삭제하는 `run` 흐름을 구현한다.
- [x] 1.3 기본 `reset`을 서버 재생성 대신 기본 테스트 database 재생성으로 변경하고 명시적 cleanup 명령을 제공한다.

## 2. 테스트 명령과 CI 연결

- [x] 2.1 루트 package script가 실행별 wrapper 안에서 schema push와 Fedify/Web E2E를 실행하도록 변경한다.
- [x] 2.2 Fedify와 Playwright가 명시적 `DATABASE_URL`을 우선 사용하고 동일한 안전 조건을 검증하도록 변경한다.
- [x] 2.3 Web E2E workflow의 전역 concurrency 제한과 공유 Postgres 종료 cleanup을 실행별 database cleanup으로 교체한다.
- [x] 2.4 README의 로컬 테스트 DB 및 병렬 실행 설명을 새 수명 주기에 맞게 갱신한다.
- [x] 2.5 테스트 DB wrapper와 Playwright에 실행별 포트 offset을 연결하고 fixture origin을 일치시킨다.

## 3. 검증

- [x] 3.1 허용되지 않은 database URL 거부와 성공·실패 자식 명령의 database cleanup 및 종료 코드 보존을 검증한다.
- [x] 3.2 Fedify와 Web E2E 루트 명령을 실제 Docker Postgres에서 실행한다.
- [x] 3.3 두 Web E2E 루트 명령을 동시에 실행해 database와 로컬 서버 포트 충돌 없이 완료되는지 확인한다.
- [x] 3.4 OpenSpec 및 변경 파일 formatting 검증을 실행한다.
