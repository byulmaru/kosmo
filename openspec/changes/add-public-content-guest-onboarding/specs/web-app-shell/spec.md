## ADDED Requirements

### Requirement: Public content guest onboarding

**Source Context:** `docs/domain/policies/public-content-onboarding.md`, `docs/design/public-content-onboarding.md`, PROD-836·PROD-681, 2026-10-14·2026-10-16 안내 구성과 2026-10-19 범위 조정. The app SHALL 비로그인 공개 Profile·Post에 로그인 상태, 가능한 공개 조회와 Profile 참여의 차이를 안내하며 기존 공개 조회를 유지한다.

#### Scenario: Full Web guest

- **WHEN** guest가 full Web에서 공개 Profile 또는 Post를 연다
- **THEN** 홈(`/`)을 여는 `KOSMO에서 계속하기` 하단 CTA와 좌측 `가입하기`·`로그인` 버튼을 제공하고 보호 메뉴·로그아웃·직접 Profile 생성 진입을 숨긴다
- **AND** 콘텐츠·focus를 가리지 않으며 우측 레일에는 중복 `가입하기`·`로그인` 버튼과 별도의 가입·소개 안내 카드를 표시하지 않는다

#### Scenario: Bottom invitation across Web widths

- **WHEN** guest가 full, compact 또는 mobile Web에서 두 공개 route 중 하나를 연다
- **THEN** 닫을 수 있는 하단 안내에 홈(`/`)을 여는 `KOSMO에서 계속하기` 버튼을 표시한다
- **AND** 버튼 아래에 `https://byulmaru.co/about-us`를 여는 `팀 별마루 소개`와 `/privacy`를 여는 `개인정보처리방침` 링크를 `·` 구분자 없이 표시한다
- **AND** 콘텐츠·focus·하단 탭을 가리지 않는다

#### Scenario: Guest sidebar authentication controls

- **WHEN** guest가 공개 Profile·Post의 좌측 사이드바 또는 mobile drawer를 연다
- **THEN** 보호 메뉴 대신 홈(`/`)을 여는 `가입하기`와 `/login`을 여는 `로그인`을 별도의 action으로 제공한다

#### Scenario: Dismiss bottom invitation

- **WHEN** 방문자가 하단 가입 안내를 닫고 같은 탭에서 다른 공개 콘텐츠로 이동한다
- **THEN** 하단 안내는 닫힘을 유지하며 좌측 가입·로그인 진입은 사용할 수 있다

#### Scenario: Mobile drawer access after dismissal

- **WHEN** mobile Web의 공개 Profile·Post에서 하단 안내를 닫은 방문자가 pointer 또는 keyboard로 헤더의 `메뉴 열기`를 실행한다
- **THEN** 왼쪽 햄버거 메뉴 버튼으로 drawer의 `가입하기`·`로그인`에 접근할 수 있다
- **AND** 이 guest 헤더에 별도의 뒤로가기나 오른쪽 메뉴 버튼을 추가하지 않는다

#### Scenario: Existing authenticated user

- **WHEN** 유효한 Session이 있거나 그 Session에 선택 Profile만 없다
- **THEN** guest 안내를 표시하지 않고 기존 navigation·Profile 준비 흐름을 유지한다
