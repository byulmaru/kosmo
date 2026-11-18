# PROD-792 진행

현재 구현·리뷰 대응의 직접 근거는 [robin-maki의 #961 리뷰](https://github.com/byulmaru/kosmo/pull/961#issuecomment-5969879335)다.
이 체크리스트는 제품 요구나 별도 승인 gate를 추가하지 않는다.

- [x] #1094 공통 consent와 기존 Source 노출 정책에 연결
- [x] 중복 AP Quote runtime schema와 revision 제거
- [x] 검증 전 snapshot CAS와 current issuer proof 기반 재승인/철회 구현
- [x] 미해결 target/format/candidate 및 retry를 Workflow 입력으로 보존
- [x] 늦은 signal과 재시도 한도에서 새 입력을 보존하는 실행 테스트 추가
- [ ] 최종 parent/child HEAD의 전체 CI 결과 확인 및 실패 수정
- [ ] 최종 PR 설명·handoff에 검증 결과와 rollout 제한 기록

운영 DB의 과거 migration 적용 여부와 실행 중인 구 Workflow 유무는 미확인이다. 배포 전에 확인해야 하며,
PR 구현 완료와 production acceptance를 합치지 않는다.
