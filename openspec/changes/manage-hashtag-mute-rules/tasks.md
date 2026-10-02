## Session Work

아래 미완료 항목은 PROD-1029 구현 세션이 맡는다. 현재 Spec 세션은 코드와 테스트를 구현하지 않는다.
이 목록은 현재 요구를 실행하기 위한 가변 메모이며 sibling 기능을 포함하지 않는다.

- [x] 1.1 최신 PROD-1029·canonical·branch/HEAD를 재검증하고, 이번 변경의 Local Scope 문서 정렬을 확인한다.
- [ ] 1.2 Scope·Decision·만료·Owner/Hashtag 관계를 저장하는 additive schema와 migration을 구현한다.
      pair 중복과 만료 후 재생성을 DB constraint·원자적 write로 처리하고 기존 데이터와 구버전 호환을 확인한다.
- [ ] 1.3 생성·변경·해제를 구현한다. selected Profile의 canonical 권한과 Local 생성 조건을 적용하고,
      부분 변경도 기존 값과 합친 최종 상태를 검증한다. Worker Activity의 commit·retry 경계에서
      중복·응답 유실·실패·해제 후 재생성을 처리한다.
- [ ] 1.4 Hashtag viewer 관계, Owner 규칙 조회와 Rule Node를 구현한다. 단건·목록·Node 경로의 Profile 격리,
      만료 기준 유효성과 요청에 명시한 Scope별 적용 여부, mutation의 확정 결과와 삭제 ID를 맞추고 SDL을 동기화한다.
- [ ] 1.5 실제 GraphQL·DB 테스트로 Member/Owner 허용, 비인증·비회원·다른 selected Profile 거절,
      비활성·정지·Remote 생성 거절, 잘못된 Node type·빈 Scope·잘못된 만료의 무변경 실패를 검증한다.
      만료를 생략한 부분 변경은 유효한 규칙에서 기존 만료를 유지하고 만료된 규칙에서는 무변경으로 실패하며,
      미래 만료나 영구를 명시한 변경은 유효한 최종 상태로 저장되는지 확인한다. 유효한 Home 전용 규칙은
      Home에만 적용되고 Search에는 적용되지 않으며, 만료 경계에서는 Home에도 적용되지 않는 조회 결과를 검증한다.
- [ ] 1.6 실제 DB·Worker 테스트로 동시 생성의 유일성, Scope/Decision 변경, 영구↔미래 만료,
      만료 경계·재생성·해제 및 retry의 결과를 검증한다. 새 Worker 테스트를 실제 실행 suite에 연결한다.
- [ ] 1.7 focused API integration·Worker database/workflow 검증, Worker build, API schema/type 검증과 문서
      format/link 검증을 완료한다. migration·rollback의 실제 증거와 미검증 항목을 구현 PR에 기록한다.

## Verification Evidence

- Result: 구현·검증 코드 작성 완료, GitHub CI 검증 pending.
- Checks: 실제 GraphQL 요청과 DB 상태 변화가 검증 대상이다. 소스 문구 검색은 구현 조사의 근거일 뿐 테스트가 아니다.
- Limits: 현재는 Spec 작성 단계다. 실제 DB, Temporal, CI, 배포 검증은 실행하지 않았다.
- 실행 후보: `pnpm --filter @kosmo/api test:integration`, `pnpm --filter @kosmo/worker test:database`,
  `pnpm --filter @kosmo/worker test:workflow`, `pnpm --filter @kosmo/worker build`,
  `pnpm --filter @kosmo/api lint:schema`, `pnpm --filter @kosmo/api lint:tsc`.
  목적별 workflow의 실행 환경과 실제 CI job을 재확인하고 현재 head의 결과를 기록한다.
- 완료 결과: 규칙 관리 계약과 필요한 문서·focused validation을 마치면 PROD-1029 범위가 완료된다.
  UI·목록·알림의 별도 통합 결과나 OpenSpec archive를 추가 완료 gate로 삼지 않는다.

## Progress

- Status: Active
- Completed: Linear 범위·관계·댓글 조회, canonical·현재 코드 조사, 전용 1-layer Stack 확보, Local Scope 문서 정렬,
  Cross-artifact Findings 2건의 부분 변경·Scope별 조회 검증 보완.
- Next: 코드·테스트·additive migration·SDL 작성 완료. 최신 main rebase와 원격 Draft PR 전달 후 GitHub CI의 API/Core/Worker 결과를 확인한다. 미체크 task는 해당 실행 검증을 기다린다.
- Last updated: 2026-10-02

## Implement Checkpoint

- 2026-10-02 사용자의 Implement 호출에 따라 규칙 schema·명령 receipt·Worker Workflow/Activity·GraphQL 관리/조회와 실행 검증 코드를 작성했다.
- 로컬 타입 검사, ESLint, SDL 동기화 검사와 format/diff 검증을 수행한다. DB·Temporal 실행 테스트는 GitHub CI에 맡긴다.
- `Test (API)`는 실제 인증 context와 production Worker를 거치는 GraphQL integration을, `Test (Worker)`는 실제 DB Activity와 production Workflow registry 검증을 실행한다. `Test (Core)`는 migration runner/smoke를 실행한다.
- 기존 PROD-1048의 알림 정책 문서 변경은 이번 구현에서 수정하지 않았고 commit에 포함하지 않는다. 이 변경을 보관·복원하는 rebase 절차의 사용자 결정은 pending이다.
- OpenSpec task checkbox는 CI 성공의 대용이 아니다. 런타임·migration·구버전 rollback 호환성 실행 결과는 아직 미확인이다.
