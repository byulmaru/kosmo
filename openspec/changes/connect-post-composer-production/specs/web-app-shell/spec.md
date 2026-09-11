## ADDED Requirements

### Requirement: 반응형 shell의 Post Composer 진입과 surface

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/accessibility.md`, `docs/design/icons.md`, DSN-43, PROD-797 — 유니버설 앱 shell은 platform과 기존 `compact`·`full` breakpoint에 따라 일반 Post 작성 진입을 Full Web Rail, desktop modal Overlay 또는 모바일 전체 화면으로 MUST 제공한다. shell과 route는 같은 Production composer host를 MUST 사용하며, 중앙 timeline inline composer나 별도 `/compose` 작성 구현을 canonical presentation으로 만들지 MUST NOT 한다.

#### Scenario: Full Web Rail에서 작성

- **WHEN** Web viewport가 `full` 이상이고 일반 app route를 표시한다
- **THEN** shell은 우측 Rail에 공용 Post Composer의 `Surface=Rail` presentation을 표시한다
- **AND** 별도 큰 글쓰기 CTA를 표시하지 않는다
- **AND** Rail의 Expand action은 같은 draft를 desktop modal Overlay로 연다

#### Scenario: compact Web에서 작성

- **WHEN** Web viewport가 `compact` 이상 `full` 미만이다
- **THEN** compact icon rail의 글쓰기 trigger가 desktop modal Overlay를 연다
- **AND** 우측 Rail 또는 중앙 timeline inline composer를 표시하지 않는다

#### Scenario: 모바일 shell에서 작성

- **WHEN** mobile Web의 viewport가 `compact` 미만이거나 Android·iOS에서 사용자가 하단 글쓰기 탭을 실행한다
- **THEN** 하단 글쓰기 탭은 모바일 전체 화면 composer를 연다
- **AND** mobile drawer에 중복 글쓰기 진입점을 표시하지 않는다
- **AND** Android·iOS는 화면 폭과 무관하게 모바일 surface를 유지한다

#### Scenario: `/compose` 호환 route

- **WHEN** 사용자가 기존 `/compose` URL에 직접 접근한다
- **THEN** route는 현재 platform과 breakpoint의 같은 Production composer host에 위임한다
- **AND** 본문 입력, 공개 범위, Media upload, 작성 상태 또는 mutation 제출 로직을 복제하지 않는다
- **AND** canonical `/compose` URL과 기존 protected-route session guard를 유지한다

#### Scenario: `/compose` composer 닫기

- **WHEN** 사용자가 `/compose` 호환 진입에서 제출하지 않고 composer를 닫는다
- **THEN** navigation history에 이전 화면이 있으면 그 화면으로 돌아간다
- **AND** 이전 화면이 없으면 Home으로 이동한다

#### Scenario: Profile이 없을 때 진입 차단

- **WHEN** 로그인했지만 selected Profile이 없는 사용자가 shell 글쓰기 진입점 또는 `/compose` route를 실행한다
- **THEN** 시스템은 기존 composer usage boundary에 따라 작성 surface를 열거나 `createPost`를 호출하지 않는다
- **AND** Home에서 Profile을 만들거나 선택하도록 안내한다
