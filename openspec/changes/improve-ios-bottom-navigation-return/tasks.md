## Session Work

이 목록은 PROD-1079의 현재 전달 결과를 위한 mutable checklist다. Owner는 해당 phase 담당자이며,
구현 방식이나 파일 목록이 달라지면 실제 결과를 유지한 채 수정한다.

- [ ] 1.1 Implement: 최신 Linear·디자인 문서·branch/HEAD를 다시 확인하고, 설치된 router로 탭별 마지막 상세와 root 상태를 보존할 최소 topology를 정한다.
- [ ] 1.2 Implement: iOS 하단 switch·상세 push·현재 탭 표시를 연결하고, 다른 탭에서 목적지의 마지막 상세 계층으로 복귀하게 한다. 1.1 이후 수행한다.
- [ ] 1.3 Implement: 상세에서는 root 복귀만, root에서는 최상단 이동을 연결한다. Home/Local은 선택 유지와 기존 refresh를 함께 실행하며 연속 입력으로 중복 전환·refresh를 시작하지 않는다. 1.2 이후 수행한다.
- [ ] 1.4 Implement: 검색어·결과 유형·목록·offset, active header/handler·알림 bridge, 작성기·이탈 guard·actor reset과 deep link를 기존 경계에 맞춘다. 1.2~1.3과 함께 검증한다.
- [ ] 1.5 Implement: 실제 navigation·scroll·Relay를 실행하는 focused 회귀 테스트를 작성한다. router 호출 spy만으로 stack 보존이나 Native runtime 완료를 대신하지 않는다.
- [ ] 2.1 Test: 실제 PR 최신 head의 필수 GitHub CI와 관련 app check·unit·Storybook 검증 결과를 확인하고, 이 변경으로 생긴 실패를 수정한다. 수정 뒤 새 head를 다시 검증한다.
- [ ] 2.2 Runtime owner: 인증된 iOS에서 네 탭 왕복·상세 복원·두 단계 재선택·연속 입력·refresh 실패/재시도·header back·edge gesture·작성기를 관찰한다. 실제 build·revision·결과를 기록한다.
- [ ] 2.3 Test / Runtime owner: 변경한 공용 경로의 Web URL·link·document scroll·history와 Android의 기존 switch·push·OS back을 검증한다. UI mock 결과와 플랫폼 runtime 결과를 구분한다.

## Verification Evidence

- Result: 제품 구현·동작 검증은 pending.
- Checks: Spec 문서의 윤문·계약 대조·strict validation 결과는 portable handoff에 기록한다.
- Limits: Spec 세션은 제품 코드와 테스트 코드를 작성하거나 제품 테스트·CI를 실행하지 않는다. PROD-1051 오류 키 수정과 PROD-1015 swipe는 별도 이슈다.

## Progress

- Status: Active
- Completed: 현행 코드와 권위 조사, 사용자 선택 두 건 확정, Linear·디자인 문서 정렬.
- Next: 다음 Implement 세션에서 1.1~1.5 수행. Test와 Native runtime 검증은 해당 phase가 책임진다.
- Last updated: 2026-10-10
