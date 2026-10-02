## Session Work

- [x] 1.1 PROD-735·PROD-1029의 최신 범위·관계와 canonical·기존 UI·코드 경계를 조사한다.
- [x] 1.2 알림 전용 영구 뮤트 결정을 canonical·디자인 문서와 Linear에 반영하고 기존 확인 UI 재사용 경계를 정리한다.
- [x] 1.3 확정된 범위의 스펙을 윤문하고 계약·구조 대조, strict validation, Prettier, diff 검사를 수행한다.
- [x] 1.4 구현 handoff와 스펙 Stack PR의 범위·검증 설명을 준비한다. 미구현·미검증 항목은 그대로 표시한다.

## Verification Evidence

- Result: 스펙 문서 검증 통과. 제품 구현·runtime 검증은 미실행.
- Checks: `openspec validate connect-profile-tag-hashtag-mute-ui --strict`, 변경 문서 Prettier, `git diff --check`와 한국어 윤문 전후 계약·구조 대조가 통과했다. Linear 본문·관계·PROD-735 댓글, `main`의 `a890cc8766c1350ef5f5cc10c6b236c966bafb09`, 기존 TagChip navigation·Profile Mute UI·Relay actor 지침을 확인했다.
- Limits: 현재 세션은 스펙 작성이다. 제품 코드·테스트는 실행하지 않았으며 선행 API의 실제 결과 확인과 구현 검증이 남아 있다.

## Implementation Handoff

아래는 다음 구현 세션의 current issue 작업 후보이며 현재 세션의 구현 승인이 아니다. 현재 계약을 다시 확인한 뒤 필요한 항목만 수행한다.

- [ ] 2.1 PROD-1029의 실제 API·payload·권한·적용 상태 조회와 canonical 정렬을 확인한다. Hashtag identity와 selected Profile을 연결하는 client read를 작성한다.
- [ ] 2.2 태그 맥락에 기존 확인 presentation을 조합해 Notification 전용 영구 생성·해제와 서버 확정 상태를 연결한다. 기존 관련 Profile 탐색을 보존한다.
- [ ] 2.3 요청 중 중복 입력, 조회·mutation 오류와 재시도, 응답 유실 후 재조회, 성공 후 상태 수렴을 검증한다.
- [ ] 2.4 actor A→B·Account 전환·태그 target 전환과 이전 요청의 늦은 성공·실패를 실행해 상태·Toast·focus 격리를 검증한다.
- [ ] 2.5 Web 키보드·focus 복귀·보조 기술 이름, 좁은 폭·긴 태그·Light/Dark와 기존 navigation 회귀를 검증한다.
- [ ] 2.6 실제 API·DB를 사용해 Profile Tag → 생성 → 새 조회 → 해제 → 새 조회를 실행하고 다른 selected Profile의 격리를 확인한다. mock만으로 완료하지 않는다.

검증 경로 후보는 현재 `package.json`의 `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/app test:unit`, `pnpm --filter @kosmo/app test:storybook`, `pnpm test:e2e`다. 후속 Test 세션에서는 해당 workflow의 GitHub CI 실행 계약을 따른다.

## Progress

- Status: Complete
- Completed: 알림 전용 영구 뮤트 범위 확인, canonical·디자인·Linear 정렬, 스펙 작성·윤문·검증과 구현 인계 준비.
- Next: 문서 검토 후 별도 구현 세션에서 PROD-1029의 실제 결과를 확인하고 필요한 구현·검증을 진행한다.
- Last updated: 2026-10-02
