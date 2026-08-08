## 1. PROD-708 계약 정정

- [x] 1.1 Linear 범위와 의존성을 operation context/DB handle seam, PROD-728 PgBouncer, PROD-726 operation DB session 구조로 정렬한다.
- [x] 1.2 active `api-platform` spec에서 operation transaction, transaction-local actor와 AsyncIterable transaction lifecycle 계약을 제거한다.
- [x] 1.3 proposal/design/decisions에 request identity 공유와 operation cache/handle 격리 경계를 기록한다.

## 2. PROD-708 구현 축소

- [x] 2.1 operation별 session snapshot, Pothos/DataLoader registry와 `ctx.db` 기본 handle을 유지한다.
- [x] 2.2 dormant operation transaction plugin, actor setting과 AsyncIterable bridge를 제거한다.
- [x] 2.3 transaction seam 전용 unit/integration test와 더 이상 필요한 이유가 없는 error helper surface를 제거한다.

## 3. 검증과 전달

- [x] 3.1 operation context/cache 격리 회귀 테스트와 API unit/integration test를 통과시킨다.
- [x] 3.2 API type/schema/lint/prettier와 OpenSpec strict validation을 통과시킨다.
- [x] 3.3 self-review를 완료하고 Linear 근거와 PR 범위·rollback·downstream blocker 갱신 내용을 준비한다.
