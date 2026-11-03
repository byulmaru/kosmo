## Session Context

이 메모는 `proposal.md`의 현재 사용자 결정을 요약한다. 별도 승인 문서나 영구 구현 결정은 아니다.

## Choice Notes

### 상단 현재 탭 재선택은 스크롤만 수행한다

- Date: 2026-10-22
- Decision Date: 2026-10-22
- Decision Class: user-behavior
- Status: settled-in-upstream
- Authority / Provenance: 현재 Spec 대화의 “새로고침 말고 맨 위로 스크롤만 해”; 반영 후 재조회한 [PROD-1162](https://linear.app/byulmaru/issue/PROD-1162).
- Upstream context: `docs/design/local-timeline.md`에 같은 사용자 결정을 반영한다.
- Choice: Web·iOS·Android의 상단 홈·로컬 현재 탭 재선택은 현재 타임라인 맨 위로 이동하며 추가 navigation이나 데이터 재조회를 시작하지 않는다.
- Reason: 사용자가 초기 새로고침 요청과 앞서 선택한 스크롤 유지·새로고침을 이 동작으로 정정했다.
- Alternatives: 스크롤 유지·새로고침, 맨 위 이동·새로고침은 이번 전달 범위에서 제외한다.
- Consequences: Local 상단 탭의 기존 새로고침 연결을 스크롤로 바꾼다. 비활성 탭 진입, 하단 내비게이션·브랜드 마크 재선택과 Native pull-to-refresh는 기존 계약을 유지한다.

## Unresolved Questions

- 없음.
