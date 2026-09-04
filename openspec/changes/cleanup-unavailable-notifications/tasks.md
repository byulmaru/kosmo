## 1. 공통 availability 계약

- [x] 1.1 viewer-independent source·Related availability SQL을 core 경계로 공통화한다.
- [x] 1.2 API connection, count, Node와 Read가 기존 결과를 유지하는지 검증한다.
- [x] 1.3 Recipient 자체 inactive/suspended는 API에서 숨기되 cleanup 대상에서 제외한다.

## 2. Bounded cleanup 실행 (#665)

- [x] 2.1 Activity가 unavailable candidate를 한 bounded batch만 선택한다.
- [x] 2.2 같은 transaction의 delete 조건에서 ID와 unavailable을 다시 확인한다.
- [x] 2.3 Workflow는 cleanup Activity를 한 번만 호출한다.
- [x] 2.4 source missing·mismatch·Related unavailable 삭제와 available·Recipient inactive 보존을 DB test로 검증한다.
- [x] 2.5 cursor, checkpoint, loop, rate limit, custom metrics와 관련 테스트를 제거한다.

## 3. Schedule 연결 (#666)

- [x] 3.1 missing Schedule을 24시간 기본 interval과 `SKIP` overlap으로 활성 생성한다.
- [x] 3.2 existing Schedule은 아무것도 변경하지 않는다.
- [x] 3.3 namespace 뒤 실행되는 bounded PreSync Job과 환경별 deterministic ID를 유지한다.
- [x] 3.4 pause/enabled reconciliation, Worker metrics endpoint와 Helm metrics metadata를 제거한다.
- [x] 3.5 create와 already-exists 경계만 의미 있는 test로 검증한다.

## 4. 검증과 완료

- [ ] 4.1 focused Worker/DB/Schedule/Helm 검증과 workspace 필수 검증을 실행한다.
- [ ] 4.2 dev에서 API 즉시 비노출과 cleanup 삭제, available row 보존을 확인한다.
- [ ] 4.3 dev에서 active Schedule 생성과 Workflow 실행 상태를 확인한다.
- [x] 4.4 최신 Linear 계약과 OpenSpec artifacts를 동기화한다.
- [ ] 4.5 전체 범위 완료 뒤 strict validation과 canonical sync를 확인하고 change를 archive한다.
