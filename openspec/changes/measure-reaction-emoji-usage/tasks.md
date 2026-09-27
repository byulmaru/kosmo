## Session Work

- [ ] 1.1 PROD-942의 최종 허용 Type과 공통 controller interface를 재확인하고, 기존 두 Reaction 성공 이벤트에 검증된 종류 property를 추가한다. 선행 기능의 범위는 유지한다.
- [ ] 1.2 허용 집합 전체의 key 대응·충돌 없음, 복합 시퀀스와 변형 구분, 미매핑 값의 property 생략을 실행 테스트로 확인한다.
- [ ] 1.3 성공·실패·payload 부재·늦은 응답·Account 전환·SDK 장애의 event와 제품 결과를 실제 동작으로 검증한다.
- [ ] 1.4 사용 Account 수·추가/제거 횟수·반복 사용 분포의 계산식과 관측 기간·timezone·제외 적용 여부를 문서화하고 최소 Insight 또는 재현 가능한 쿼리를 준비한다.
- [ ] 1.5 PostHog event allowlist와 개인정보 고지 정합성을 확인하고, 새로 수집되는 종류 정보 및 Web·과거 데이터 한계를 운영 문서에 반영한다.
- [ ] 1.6 선행 PR 병합 뒤 최신 main에 Stack을 정렬해 의존 interface와 해당 검증을 다시 확인한다. PROD-986 자체 범위가 완료되면 Ready 조건을 검토한다.

## Verification Evidence

- Result: Spec 작성 단계. 구현·실행 테스트·운영 수집 검증은 아직 수행하지 않았다.
- Checks: 선행 PR #1023·#1025의 최신 HEAD와 Stack 순서를 확인했다. OpenSpec strict validation 결과는 Spec 종료 시 기록한다.
- Limits: 선행 PR은 Draft·미병합이다. 내부·테스트 Account 제외 목록과 봇 분류 근거는 현재 자료에서 확인되지 않았다.

## Progress

- Status: Active
- Completed: 선행 책임과 PROD-986 analytics delta의 범위를 분리했다.
- Next: 구현 세션에서 위 작업과 실행 검증을 수행한다.
- Last updated: 2026-09-27
