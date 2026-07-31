## MODIFIED Requirements

### Requirement: Root path onboarding for guests

**Authority / Provenance:** [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글 — 루트 `/`는 비로그인 사용자에게 앱 셸 없이 독립된 Welcome을 표시하고, 승인된 제품 소개·오픈 베타·계정 안내와 로그인 진입점을 제공해야 한다(MUST). Welcome은 full logo와 Hero를 하나의 왼쪽 정렬 column에 배치하고 공용 Web breakpoint에 따라 여백을 조정해야 한다(MUST). 기존 세션 판정과 로그인 이동은 유지해야 한다(MUST).

#### Scenario: Show approved Welcome content to a logged-out user

- **WHEN** 비로그인 사용자가 `/`에 접근한다
- **THEN** 시스템은 full logo, `동인 창작 문화 향유자를 위한 차세대 연합우주 SNS` heading, 오픈 베타 안내, `시작하기` CTA, 별마루 계정·이메일 인증 안내와 개인정보 처리방침 link를 표시한다
- **AND** `(tabs)` 앱 셸과 중복 `KOSMO` eyebrow를 표시하지 않는다

#### Scenario: Keep the Welcome logo in the Hero hierarchy

- **WHEN** Welcome을 렌더링한다
- **THEN** 시스템은 full logo를 `160×101px` box로 표시하고 화면 상단에서 44px 여백을 둔다
- **AND** 별도의 84px logo header를 만들지 않는다

#### Scenario: Apply three Web spacing stages

- **WHEN** viewport가 768px 미만, 768~1279px 또는 1280px 이상이다
- **THEN** 시스템은 각각 24px, 48px 또는 128px 가로 여백을 적용한다
- **AND** 공용 `compact=768`, `full=1280` breakpoint를 사용한다

#### Scenario: Start login from onboarding

- **WHEN** 사용자가 `시작하기`를 선택한다
- **THEN** Web은 기존 `/login` 문서 이동을 유지한다

#### Scenario: Preserve session routing

- **WHEN** 유효한 세션 또는 세션 확인 오류가 있는 사용자가 `/`에 접근한다
- **THEN** 유효한 세션은 `/home`으로 이동한다
- **AND** 세션 확인 오류는 Welcome과 `/login` CTA를 유지한다
