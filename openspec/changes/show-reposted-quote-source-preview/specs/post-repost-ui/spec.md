## ADDED Requirements

### Requirement: 순수 Repost에서 Source Quote의 인용 맥락 표시

공용 목록은 순수 Repost A의 direct Source Quote B와 B가 인용한 조회 가능한 C를 함께 표시해야 한다(SHALL).
C preview는 B를 기준으로 한 단계이며 C 아래 Source·placeholder·추가 CTA를 표시해서는 안 된다(MUST NOT).
이 사례 메모는 기존 canonical 계약을 요약하며 새로운 목록 후보나 저장 정책을 만들지 않는다.

**Source Context:** `docs/domain/objects/post.md`의 순수 Repost 표시 정책, `docs/domain/decisions/0027-repost-of-quote-source-presentation.md`, `docs/design/post-action-bar.md`의 “Source가 Quote인 순수 Repost”, Linear PROD-922.

#### Scenario: A가 Quote B를 Repost하고 B가 C를 인용한다

- **WHEN** 기존 Home·Profile 등 Repost를 제공하는 공용 목록에서 A→B→C를 렌더한다
- **THEN** A attribution, B의 표준 Author·생성 시각·Content, C preview, Action Bar 순서로 표시한다
- **AND** B를 별도 Source 카드로 감싸지 않으며 바깥 article·padding·row divider·Action Bar·Reaction Summary는 한 번만 둔다

#### Scenario: C도 Quote이다

- **WHEN** A→B→C→D 관계에서 B와 C가 모두 Quote이다
- **THEN** C preview에는 C의 Author·생성 시각·Content까지만 표시한다
- **AND** D·D의 placeholder·추가 CTA와 C의 Action Bar는 표시하지 않는다

#### Scenario: C가 반환되지 않는다

- **WHEN** B는 조회할 수 있지만 B의 nullable Source C가 반환되지 않는다
- **THEN** C 카드만 생략하고 B의 Content와 A의 Repost 항목은 유지한다
- **AND** 숨겨진 C를 클라이언트에서 우회 조회하지 않는다

#### Scenario: B가 조회 불가이다

- **WHEN** A의 direct Source B가 조회 불가이다
- **THEN** 기존 Eligibility에 따라 contentless Repost A를 목록에서 제외한다

#### Scenario: preview에 Content Warning이나 Media가 있다

- **WHEN** C의 Content에 Content Warning이나 Media가 있다
- **THEN** 기존 preview의 경고·펼침·Media 표현과 입력 동작을 보존한다

### Requirement: Repost한 Quote의 이동·동작 대상과 접근성 보존

표시 깊이가 늘어나도 direct Source B의 identity와 바깥 A의 Reply 정책을 보존해야 한다(SHALL).
전체 Post renderer·article·Link를 재귀 중첩해서는 안 된다(MUST NOT).

**Source Context:** `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, Linear PROD-922의 보존할 계약과 완료 조건.

#### Scenario: B와 C 및 각 Author로 이동한다

- **WHEN** B 또는 C의 본문·생성 시각이나 각 Author를 활성화한다
- **THEN** B 본문·생성 시각은 B 상세로, C 본문·생성 시각은 C 상세로, A/B/C Author는 각자의 Profile로 이동한다
- **AND** C body shortcut은 접근성 Link나 중복 focus를 추가하지 않고 생성 시각 Link로 keyboard 이동을 제공한다
- **AND** 외부 본문 Link는 외부 URL 이동만 실행하며 preview 전체와 빈 padding은 navigation Link가 아니다

#### Scenario: 목록의 action을 사용한다

- **WHEN** A 항목의 Repost·Reaction·Bookmark·More와 Reaction Summary를 사용하거나 확인한다
- **THEN** 대상은 direct Source B이며 C나 A로 바뀌지 않는다
- **AND** Reply는 바깥 contentless A의 binding과 disabled 상태를 유지한다

#### Scenario: 순수 Repost ID로 직접 진입한다

- **WHEN** A의 상세 URL로 진입한다
- **THEN** B 상세로 replace redirect하고 기존 Quote 상세와 C preview를 표시한다
- **AND** B 상세에 A attribution과 A의 disabled Reply 상태를 전달하지 않으며 B 자체의 Reply 정책을 적용한다

#### Scenario: 기존 소비 경로와 플랫폼을 검증한다

- **WHEN** Home·Profile 공용 목록, 기존 Bookmark 소비 fixture, Quote·Reply+Quote 목록·상세·thread를 검증한다
- **THEN** A→B→C의 결과와 기존 일반 Quote-of-Quote의 한 단계 cutoff를 함께 확인한다
- **AND** Web Light·Dark·대표 좁은/넓은 viewport·긴 Content/Author·keyboard/focus 결과를 기록한다
- **AND** Native touch·VoiceOver·TalkBack 실제 runtime 관찰은 Native 출시 gate로 구분하고 Web 통과로 대체하지 않는다
