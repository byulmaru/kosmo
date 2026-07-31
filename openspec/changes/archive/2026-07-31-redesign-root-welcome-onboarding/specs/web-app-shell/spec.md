## MODIFIED Requirements

### Requirement: Root path onboarding for guests

**Authority / Provenance:** [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문, 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글과 이를 대체하는 `PR #477 리뷰 반영 — 최종 Welcome 배치 계약 정정` 댓글 — 루트 `/`는 비로그인 사용자에게 앱 셸 없이 독립된 Welcome을 표시하고, 승인된 제품 소개·오픈 베타·계정 안내와 로그인 진입점을 제공해야 한다(MUST). Welcome은 full logo와 Hero를 하나의 왼쪽 정렬 column에 배치하고 공용 Web breakpoint에 따라 여백과 수직 정렬을 조정해야 한다(MUST). 기존 세션 판정과 로그인 이동은 유지해야 한다(MUST).

#### Scenario: Show approved Welcome content to a logged-out user

- **WHEN** 비로그인 사용자가 `/`에 접근한다
- **THEN** 시스템은 full logo, `동인 창작 문화 향유자를 위한 차세대 연합우주 SNS` heading, 오픈 베타 안내, `시작하기` CTA, 별마루 계정·이메일 인증 안내와 개인정보 처리방침 link를 표시한다
- **AND** `(tabs)` 앱 셸과 중복 `KOSMO` eyebrow를 표시하지 않는다

#### Scenario: Keep the Welcome logo in the Hero hierarchy

- **WHEN** Welcome을 렌더링한다
- **THEN** 시스템은 full logo를 `160×101px` box로 표시한다
- **AND** 모바일 Web은 화면 상단에서 44px 여백을 둔다
- **AND** compact/full Web은 logo부터 개인정보 처리방침까지의 Hero 묶음을 viewport 수직 중앙에 둔다
- **AND** 별도의 84px logo header를 만들지 않는다

#### Scenario: Apply three Web spacing stages

- **WHEN** viewport가 768px 미만, 768~1279px 또는 1280px 이상이다
- **THEN** 시스템은 각각 24px, 128px 또는 256px 가로 여백을 적용한다
- **AND** 공용 `compact=768`, `full=1280` breakpoint를 사용한다

#### Scenario: Keep the mobile heading at word boundaries

- **WHEN** 모바일 Web에서 Welcome heading이 여러 줄로 표시된다
- **THEN** 시스템은 한글 음절 중간보다 공백으로 구분된 단어 경계에서 줄바꿈을 우선한다

#### Scenario: Start login from onboarding

- **WHEN** 사용자가 `시작하기`를 선택한다
- **THEN** Web은 기존 `/login` 문서 이동을 유지한다

#### Scenario: Preserve session routing

- **WHEN** 유효한 세션 또는 세션 확인 오류가 있는 사용자가 `/`에 접근한다
- **THEN** 유효한 세션은 `/home`으로 이동한다
- **AND** 세션 확인 오류는 Welcome과 `/login` CTA를 유지한다
