## Session Work

아래는 다음 구현 세션의 작업 목록이다. 구현 방법과 파일 배치는 현재 계약을 만족하는 범위에서 조정할 수 있다. 모든 항목의 owner는 PROD-1147이며, 첫 Profile 입력·저장 자체는 PROD-1146의 선행 결과를 사용한다.

- [ ] 1.1 PROD-1146 PR #1254의 최신 head·병합·계약과 현재 main을 다시 확인하고 첫 Profile 완료 연결부를 확보한다. 기존 writer의 변경을 복제하거나 덮어쓰지 않는다.
- [ ] 1.2 생성·선택한 첫 Profile의 저장된 Hashtag identity를 읽어 태그가 있으면 사람 찾기로, 없으면 후속 흐름으로 연결한다. 미저장·실패 초안을 사용하거나 완료 시 저장을 추가하지 않는다.
- [ ] 1.3 여러 저장 태그의 선택과 기존 관련 Profile 목록·pagination·팔로우 action을 연결한다. 태그 맥락·기존 목록·오류 재시도를 제공하고, 행동 없이 진행할 수 있게 한다.
- [ ] 1.4 실제 Relay 조합에서 동일 Profile의 Follow·Request 성공/실패/취소, 태그 전환 중 pending·중복 실행, actor 변경·늦은 응답을 검증하고 필요한 범위만 수정한다.
- [ ] 1.5 단계별 저장 성공/생략/실패와 이전 저장값, 태그 없음/빈 결과/무팔로우, 초기·페이지 조회 실패와 재시도, 기존 Profile 보유자·공개 읽기 경계를 실행 테스트로 검증한다. Web E2E는 실제 API·DB의 저장 태그와 관계 결과를 확인한다.
- [ ] 1.6 Web과 iOS·Android에서 태그 선택·목록·팔로우/요청·나중에 진행·오류 표시와 접근성을 확인하고 증거를 플랫폼별로 기록한다. 필수 focused validation과 변경에 필요한 문서 작성을 마친 뒤 scoped PR readiness를 판단한다.

## Verification Evidence

- Result: 구현·테스트 미실행. Spec 조사와 문서 검증만 수행한다.
- Checks: 기존 API integration, Hashtag 목록·FollowButton Storybook, PROD-1146 Relay·Web E2E를 읽었다. 다중 태그 조합의 실제 동작은 신규 검증 대상이다.
- Limits: PROD-1146은 조사 시 미병합이다. PROD-1148의 Coachmark와 PROD-1149 알림은 구현하지 않는다. 해당 기능이 아직 없으면 기존 홈 진행을 유지하고 전체 단계 통합 책임은 PROD-681에 남긴다. 문서·CI·Web 증거를 Native·실기기·운영 통과로 확장하지 않는다.

## Progress

- Status: Active
- Completed: Linear·canonical·기존 API/UI·PR #1254 리뷰 및 반영 코드 조사, 대상 사용자 선택 반영.
- Next: 인계 시 최신 선행 상태를 재검증한 뒤 위 구현·검증을 수행한다.
- Last updated: 2026-10-23
