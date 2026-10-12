# PROD-924 현재 구현 방향

제품 계약은 canonical Post와 ADR0029를 따른다. 이 문서는 세션 메모이며 별도 요구사항을 만들지 않는다.

- 공통 consent 두 컬럼과 기존 `repostSourceId`를 재사용한다. 조회 가능한 identity·Request URI·revision은 중복 저장하지 않는다.
- Quote ID별 단일 owner가 명령을 FIFO 처리한다. Source 삭제는 공유 잠금 규칙을 지키는 원자적 다중 자원 transaction이다.
- 원격 승인 proof 조회, Source materialize, fenced CAS write, drain, 외부 effect를 분리한다.
- 동일 URI 재승인 뒤 모호한 Delete는 issuer current-state를 재검증한다. 일시적 실패로 기존 승인을 철회하지 않는다.
- 신규 명령이 이전 내부 재검증을 supersede한다. 정상 종료/CAN과 강제 Terminate의 보장을 구분한다.
- 구현 경계·검증·한계는 `docs/architecture/decisions/0030-quote-consent-owner.md`와 `docs/testing/prod-924-owner-validation.md`에 기록한다.
- 원격 push·리뷰 답글·resolve·merge·배포는 이번 단계에서 보류한다.
