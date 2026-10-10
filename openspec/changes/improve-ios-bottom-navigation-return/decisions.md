## Session Context

PROD-1079의 iOS 하단 내비게이션 동작을 구현 세션에 전달한다. 이 문서는 선택 이유를 남긴 session note이며
권위나 영구 구현 결정을 만들지 않는다.

## Choice Notes

### 탭 복귀는 마지막 상세 계층까지 복원

- Decision Date: 2026-10-10
- Decision Class: User behavior
- Status: Settled upstream
- Authority / Provenance: 현재 대화의 첫 선택 답변, PROD-1079 `확정한 복귀·재선택 동작`, `docs/design/breakpoints.md`.
- Choice: 같은 Session·선택 Profile에서 각 탭의 마지막 상세 화면과 탐색 계층을 복원한다. 검색어·결과 유형·목록·스크롤과 Home/Local 선택을 유지한다.
- Reason: 화면을 오가도 진행 중이던 탐색으로 돌아가려는 사용자 기대에 맞는다.
- Alternatives: 탭 root의 상태만 유지하고 상세 계층은 폐기하는 안.
- Consequences: 상세에서 현재 탭을 다시 누르는 입력을 단순 switch와 구분해야 한다. 앱 종료 뒤 영속 저장은 추가하지 않는다.

### 상세 재선택과 root 재선택은 두 단계로 구분

- Decision Date: 2026-10-10
- Decision Class: User behavior
- Status: Settled upstream
- Authority / Provenance: 현재 대화의 두 번째 선택 답변, PROD-1079 `확정한 복귀·재선택 동작`, `docs/design/breakpoints.md`.
- Choice: 상세에서 같은 탭을 누르면 root로만 돌아간다. root의 Home/Local은 선택 유지·최상단 이동·새로고침, 검색·알림·프로필은 최상단 이동만 수행한다.
- Reason: 탐색 복귀와 최신 콘텐츠 확인을 분리하고 검색 맥락을 불필요하게 초기화하지 않는다.
- Alternatives: 모든 root에서 최상단 이동만 수행하거나, 모든 root에 새로고침을 추가하는 안.
- Consequences: 검색어 삭제·자동 키보드 열기와 검색·알림·프로필의 명시적 재조회를 추가하지 않는다. 기존 자동 갱신·실패·재시도 동작은 유지한다.

### framework navigation을 우선 검토

- Decision Date: 2026-10-10
- Decision Class: Implementation working note
- Status: Suggested approach
- Authority / Provenance: `memory/frontend/route-platform.md`, 현재 코드 조사, `design.md`의 공식 API 근거.
- Choice: 탭별 navigator state와 상세 stack을 framework에 맡기는 접근을 우선 검토한다. 특정 navigator나 파일 배치는 고정하지 않는다.
- Reason: 별도 history 계층을 만들지 않고 기존 back·link·actor 경계를 재사용할 수 있다.
- Alternatives: 단일 Stack의 이동 방식만 교체하거나 root state를 수동 저장하는 접근.
- Consequences: 설치 버전과 route topology를 확인한 뒤 최소 구현을 정한다. 이 메모 자체를 제품 요구사항이나 승인으로 취급하지 않는다.

## Unresolved Questions

- 없음. iOS 대상 행동과 제외 범위는 확정됐으며 구현 방식은 변경 가능한 working note다.
