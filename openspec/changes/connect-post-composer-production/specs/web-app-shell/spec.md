## ADDED Requirements

### Requirement: 반응형 shell의 Post Composer 진입과 surface

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/accessibility.md`, `docs/design/icons.md`, `docs/domain/objects/profile.md`, DSN-43, PROD-797 — 유니버설 앱 shell은 platform과 기존 `compact`·`full` breakpoint에 따라 일반 Post 작성 진입을 Full Web Rail, desktop modal Overlay 또는 모바일 전체 화면으로 MUST 제공한다. shell trigger는 같은 Production composer host를 MUST 사용하며, 중앙 timeline inline composer나 direct `/compose` compatibility entry를 canonical presentation으로 만들지 MUST NOT 한다. retired `/compose`의 직접 접근은 404가 될 수 있고(MAY), bare `compose`는 Local Profile System Reserved Handle로 유지해야 한다(MUST).

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

#### Scenario: Direct `/compose` access has no compatibility entry

- **WHEN** 사용자가 retired `/compose` URL에 직접 접근한다
- **THEN** 시스템은 해당 URL에서 Production composer host를 렌더링하거나 열지 않는다
- **AND** 직접 접근은 404가 될 수 있다
- **AND** 지원되는 작성 진입은 Full·compact·mobile shell trigger로 한정한다

#### Scenario: Preserve bare `compose` as a Local Profile reserved handle

- **WHEN** 로그인한 계정이 bare `compose` 또는 대소문자만 다른 값을 Local Profile handle로 제출한다
- **THEN** 시스템은 Profile을 생성하지 않고 기존 System Reserved Handle 정책의 `handle` field 오류를 반환한다
- **AND** Remote Profile의 원격 handle에는 이 Local Profile 예약 정책을 적용하지 않는다

#### Scenario: Profile이 없을 때 진입 차단

- **WHEN** 로그인했지만 selected Profile이 없는 사용자가 shell 글쓰기 진입점을 실행한다
- **THEN** 시스템은 기존 composer usage boundary에 따라 작성 surface를 열거나 `createPost`를 호출하지 않는다
- **AND** Home에서 Profile을 만들거나 선택하도록 안내한다
