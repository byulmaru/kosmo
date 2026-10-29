## Session Context

PROD-1232의 확정 범위와 이번 세션에서 제안하는 구현 방향을 구분한다. 이 파일은 승인 기록이나 ADR이 아니다.

## Choice Notes

### 모바일 guest 루트만 변경한다

- Date: 2026-10-27
- Upstream context: [PROD-1232](https://linear.app/byulmaru/issue/PROD-1232), `docs/domain/policies/public-content-onboarding.md`.
- Choice: 비로그인 Web의 `/`와 기존 모바일 breakpoint에만 탭 제거·안내 전체 하단 고정을 적용한다. 작은 viewport의 기존 flow 예외도 이 범위에서만 바꾼다.
- Reason: 이슈가 로그인 상태·데스크톱·다른 route·Native의 회귀 방지를 명시했다.
- Alternatives: 모든 guest 공개 route의 탭 제거와 안내 배치 통일은 이번 범위를 넓히므로 제외한다.
- Consequences: 이슈가 정한 예외를 관련 디자인 문서에 반영하고 나머지 route의 배치를 보존한다.

### 같은 안내 컴포넌트와 실제 높이를 재사용한다

- Date: 2026-10-27
- Upstream context: PROD-1232의 컴포넌트 전체 고정·safe area·마지막 콘텐츠 접근 조건.
- Choice: 셸에서 route·session·layout 조건을 파생하고 기존 안내에 배치를 전달하는 방향을 제안한다. safe area를 포함해 측정한 전체 높이로 콘텐츠 여백을 계산한다.
- Reason: CTA 복제와 배치·예약 높이 계산의 불일치를 피할 수 있다.
- Alternatives: 버튼만 고정하거나 안내 높이를 상수로 가정하면 이슈의 전체 고정·콘텐츠 접근 조건을 충족하기 어렵다.
- Consequences: 구현 수단은 비구속 제안이다. 같은 결과를 더 작은 변경으로 구현할 수 있으면 이 메모를 수정한다.

## Unresolved Questions

- 없음. 새 제품·보안·롤아웃 결정을 추가하지 않는다.
