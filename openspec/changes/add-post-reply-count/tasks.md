## Session Work

아래는 PROD-1152 구현 세션에서 사용할 수정 가능한 체크리스트다. Spec 세션에서는 제품 구현이나 실행 테스트를 수행하지 않는다.

- [ ] 1.1 현재 Linear·canonical과 branch/HEAD를 재검증하고 직접 Reply의 batch 집계·Post field·SDL을 구현한다.
- [ ] 1.2 DB/GraphQL 실행 fixture로 0·1·다수, 직접/손자, Reply+Quote·Quote·pure Repost, Local/Remote·미연결 Parent와 viewer별 Visibility·Eligibility를 검증한다. 여러 Parent의 결과와 쿼리 수·계획도 확인한다.
- [ ] 1.3 Reply 소유 fragment와 목록·상세·Viewer의 실제 config를 연결하고 0 생략·locale compact·접근성·기존 disabled/expanded·인증 위임을 유지한다.
- [ ] 1.4 작성·삭제 성공 응답에서 직접 Parent의 서버 수치를 요청 actor Store에 반영하고 실패·부분 응답을 기존 성공/오류 경계에 맞춘다.
- [ ] 1.5 UI/Relay 실행으로 전체 적용 화면, 작성·삭제 성공/실패·재시도, 페이지 추가 로딩, actor A→B 전환과 늦은 응답을 검증한다. 무관한 Post와 기존 Composer·Viewer 동작도 확인한다.
- [ ] 1.6 SDL validator, Relay compiler, API/App 타입 검사와 변경에 필요한 집중 테스트·표준 lint를 완료하고 Native 미검증 범위를 구분한다.
- [ ] 1.7 실제 diff·검증·제한을 PR/다음 phase handoff에 남기고 canonical과 최종 결과를 대조한다. OpenSpec 정리는 필요할 때 `--skip-specs`를 사용하며 제품 완료 조건을 추가하지 않는다.

## Verification Evidence

- Result: pending — 구현·실행 테스트는 다음 세션 범위다.
- Checks: API는 `post-repost-count.test.ts`·`post.test.ts`의 DB fixture를 참고한 Reply 수 실행 검증,
  UI는 `PostActionBar.test.ts`·`PostActionControl.test.ts`·`PostComposer.test.ts`·`PostDeletionAction.test.ts`와
  `PostMediaViewerHost.test.ts`·`PostMediaViewerIntegration.test.ts`의 실제 API/Store 연결 검증을 보강한다.
- Checks: 다음 세션에서 `pnpm --filter @kosmo/api lint:schema`, `pnpm --filter @kosmo/api lint:tsc`,
  `pnpm --filter @kosmo/app relay`, `pnpm --filter @kosmo/app check`와 영향받은 실행 테스트를 수행한다.
  DB 테스트는 저장소의 `scripts/test-db.mjs` wrapper를 사용한다. 소스 문자열 검사로 집계·캐시 동작을 대신하지 않는다.
- Limits: DB 비용·production 동작과 iOS/Android 실제 touch·VoiceOver/TalkBack은 아직 검증하지 않았다.

## Progress

- Status: Active
- Completed: 코드·권위 조사, 네 제품 선택 확정과 canonical·Linear 정리.
- Next: Humanize·문서 검증·handoff 완료 뒤 별도 구현 세션에서 1.1부터 진행한다.
- Last updated: 2026-10-19
