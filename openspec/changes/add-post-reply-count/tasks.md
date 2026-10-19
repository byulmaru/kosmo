## Session Work

아래는 PROD-1152 구현 세션의 수정 가능한 체크리스트다. 제품 계약은 canonical과 Linear가 소유한다.

- [x] 1.1 현재 Linear·canonical과 branch/HEAD를 재검증하고 직접 Reply의 batch 집계·Post field·SDL을 구현한다.
- [x] 1.2 DB/GraphQL fixture로 여러 Parent, 직접/손자, Reply+Quote·pure Repost, linked/unlinked Remote, viewer Visibility·Eligibility, inactive Profile·suspended Instance와 페이지 크기와 무관한 count를 확인한다. 조회는 기존 non-null `reply_parent_id` partial index를 활용하는 grouped batch query다. Production query plan·비용은 측정하지 않았다.
- [x] 1.3 목록·상세·Thread·Media Viewer Reply 액션을 연결하고 0 생략·compact count·접근성 이름·expanded/disabled 상태를 검증한다.
- [x] 1.4 작성·삭제 성공 응답에서 직접 Parent의 서버 수치를 요청 actor Store에 반영하고 count 부분 오류와 미커밋 응답 처리를 검증한다.
- [ ] 1.5 UI/Relay 실행으로 전체 적용 화면, 작성·삭제 성공/실패·재시도, 페이지 추가 로딩, actor A→B 전환과 늦은 응답을 검증한다. 무관한 Post와 기존 Composer·Viewer 동작도 확인한다.
- [x] 1.6 SDL validator, Relay compiler, API/App 타입 검사, 집중 실행 테스트, ESLint·Prettier를 완료하고 Native 미검증 범위를 구분한다.
- [ ] 1.7 실제 diff·검증·제한을 PR/다음 phase handoff에 남기고 canonical과 최종 결과를 대조한다. OpenSpec 정리는 필요할 때 `--skip-specs`를 사용하며 제품 완료 조건을 추가하지 않는다.

## Verification Evidence

- Result: implementation checks passed; Draft PR and Test handoff are pending.
- Checks: API Reply count GraphQL execution 4/4; app action/count tests 19/19; API SDL validator, API TypeScript,
  Relay compiler + App TypeScript, changed-file ESLint, Prettier, and `git diff --check` passed. DB tests used
  `scripts/test-db.mjs` with an isolated database. No source-text assertion substitutes for runtime behavior.
- Limits: Native UI end-to-end behavior, iOS/Android touch·VoiceOver·TalkBack, production query plan and cost,
  and remote CI are not yet verified.

## Progress

- Status: Implementation complete; Draft PR/Test handoff pending.
- Completed: 코드·권위 조사, 제품 선택의 canonical·Linear 반영, direct count 집계·화면·mutation cache 동기화와 집중 검증.
- Next: Draft PR readback, CI state 확인, Test phase handoff.
- Last updated: 2026-10-19
