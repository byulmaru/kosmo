## Session Work

후속 구현자가 현재 canonical·Linear와 실제 PROD-1029 결과를 다시 확인한 뒤 수행할 작업이다.
파일·함수 배치와 세부 순서는 바꿀 수 있는 작업 메모이며, 이번 스펙 PR에서 구현 완료를 표시하지 않는다.

- [ ] 1.1 PROD-1048 담당자가 PROD-1029의 Rule 관리·권한·Scope·활성/만료 결과를 인수하고 실제 생성 경로 목록을 갱신한다. 미구현 선행 결과는 이 이슈에서 대체하지 않는다.
- [ ] 1.2 PROD-1048 담당자가 제공 중인 생성 경로에 Recipient Rule과 Related Profile Tag의 canonical identity 일치를 연결한다. 일반 생성과 Quote·Reply 최초 판단을 모두 포함하고 기존 억제·권한·중복 경계를 유지한다.
- [ ] 1.3 실제 생성 서비스 테스트로 6종의 일치/불일치, Exclude/Collapse, 태그 없음·여러 태그, bio만 일치, 게시물 태그 없음, 미선택 Scope·만료·해제, Local/Remote 저장 관계와 Recipient 격리를 검증한다. 미구현 Type은 새로 만들지 않는다.
- [ ] 1.4 생성 전 태그 변경과 생성 후 Rule·Tag 변경을 실행해 새 원인의 결과와 기존 알림 ID·Read State·최초 읽음 시각을 확인한다. 새 predicate가 Query visibility·cleanup에 섞이지 않았는지 필요한 실제 조회로 검증한다.
- [ ] 1.5 Quote Author/Source Author 분리, 최초 억제 후 해제·만료·태그 제거·반복 처리, Reply를 겸한 Quote, 기존 대표 알림·rollout·승인 경계를 실제 경로에서 검증한다.
- [ ] 1.6 실제 정책 조회 오류와 재시도를 검증한다. 오류가 억제/불일치 성공으로 처리되지 않고, commit된 원인 행동은 유지되며 Quote transaction 실패가 판단 완료로 남지 않는지 확인한다.
- [ ] 1.7 focused 서비스·필요한 API/Worker 검증과 해당 구현 HEAD의 CI 결과를 PR에 남긴다. PROD-1031의 OR 조합 검증은 그 기반이 제공될 때 연결하며 그 완료를 PROD-1048 선행 Block으로 만들지 않는다.

## Verification Evidence

- Result: pending. 구현·runtime 테스트는 이번 스펙 세션에서 수행하지 않는다.
- Checks: `packages/core/services/notification.test.ts`, `packages/core/services/quote-notification.test.ts`의
  실제 생성·DB 테스트를 확장하는 접근을 우선 검토한다. 실행 기준은 `pnpm --filter @kosmo/core test:services`다.
- Limits: PROD-1029 결과가 필요하다. 기준 commit의 Mention·Followee Post와 Remote Quote 생성 기반은 미완성이며 신규 구현 범위가 아니다.

## Progress

- Status: Active
- Completed: Linear 범위·의존성, canonical과 실제 생성 경로 조사 및 스펙 초안 작성.
- Next: 스펙 전달 후 PROD-1029 결과를 인수해 별도 구현 세션에서 1.1부터 진행한다.
- Last updated: 2026-10-02
