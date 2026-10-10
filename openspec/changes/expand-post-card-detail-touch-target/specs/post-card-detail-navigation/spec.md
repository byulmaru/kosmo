## ADDED Requirements

### Requirement: 독립 액션 밖의 카드 영역에서 상세로 진입한다

iOS 타임라인의 프로필 아래 빈 영역과 카드 여백에서는 CW 상태와 무관하게 표시 대상의 canonical 상세로 한 번 이동해야 한다(SHALL). 기존 독립 입력과 비대화형 Source·attribution 경계는 보존해야 한다(MUST).

**Source Context:** PROD-1075 문제·기대 결과와 범위·완료 기준. 이동 대상은 `docs/design/post-action-bar.md`의 기존 일반·Quote·순수 Repost 계약을 따른다. 이 문서는 검증 예시이며 추가 제품 권위가 아니다.

#### Scenario: 일반 게시글의 여백 단일 탭

- **WHEN** 정지한 iOS 타임라인에서 일반 게시글의 Avatar 아래 빈 공간 또는 카드 padding을 한 번 탭한다
- **THEN** 해당 Post의 상세로 한 번 이동한다
- **AND** Profile 이동·다른 action이 함께 실행되지 않는다

#### Scenario: Quote와 순수 Repost의 기존 대상

- **WHEN** Quote의 바깥 카드 여백 또는 순수 Repost의 바깥 카드 여백을 탭한다
- **THEN** Quote는 own Post, 순수 Repost는 표시한 direct Source의 상세로 각각 한 번 이동한다
- **AND** Source preview의 기존 작성자·시각·본문 이동 대상과 비대화형 여백을 변경하지 않는다

### Requirement: 상세 진입과 CW 공개 상태를 분리한다

CW가 접힌 Post도 카드 여백에서 상세로 진입할 수 있어야 한다(SHALL). 상세 진입은 공개 상태를 변경해서는 안 된다(MUST NOT). CW 버튼은 해당 Post의 공개·다시 가리기만 실행해야 한다(MUST).

**Source Context:** PROD-1075의 CW 접힘 진입·비공개 유지 기준, `docs/design/figma.md`의 canonical `Post.id`별 공유 reveal state 계약.

#### Scenario: 접힌 CW에서 상세와 Back

- **WHEN** CW가 접힌 Post의 독립 target 밖 여백을 탭해 상세로 진입한 뒤 Back으로 돌아온다
- **THEN** 상세와 목록에서 숨겨진 본문·Media가 이동만으로 공개되지 않는다
- **AND** CW는 해당 Post의 기존 접힘 상태를 유지한다

#### Scenario: 공개한 CW와 독립 disclosure

- **WHEN** CW 버튼으로 내용을 공개하거나 다시 가린다
- **THEN** 같은 canonical `Post.id`의 기존 공유 공개 상태만 전환한다
- **AND** 상세 이동을 함께 실행하지 않으며 Quote와 Source의 공개 상태를 합치지 않는다

### Requirement: 독립 액션과 접근성 진입점을 보존한다

Profile·외부 Link·Mention·Media·CW·게시글 action은 기존 결과를 유지해야 한다(MUST). 하나의 입력으로 해당 action과 카드 상세 이동을 함께 실행해서는 안 된다(MUST NOT). 기존 상세 Link와 독립 action의 접근성 경계를 유지해야 한다(MUST).

**Source Context:** PROD-1075 독립 동작·중복 navigation 완료 기준, `docs/domain/objects/post-content.md`의 Mention 전파 분리, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`.

#### Scenario: 중첩 링크와 이미지

- **WHEN** 카드 안의 Profile·외부 Link·Mention·이미지를 각각 활성화한다
- **THEN** 해당 Profile·URL로 이동하거나 기존 MediaViewer만 연다
- **AND** 카드 상세 navigation이 추가로 실행되지 않는다

#### Scenario: Action Bar와 차단된 action

- **WHEN** Reply·Repost·Reaction·Bookmark·More 또는 Reaction Summary를 활성화하거나 pending·disabled target을 탭한다
- **THEN** 각 action의 기존 실행·입력 차단 결과를 유지한다
- **AND** 상세 진입으로 입력이 새지 않는다

#### Scenario: 보조 기술과 keyboard

- **WHEN** VoiceOver 또는 Web keyboard로 기존 상세 Link와 자식 action을 탐색·활성화한다
- **THEN** 기존 role·name·state와 독립 실행 결과를 유지한다
- **AND** 여백 shortcut이 자식 전체를 묶거나 중복 상세 focus stop을 추가하지 않는다

### Requirement: 세로 스크롤과 취소를 상세 탭으로 처리하지 않는다

목록의 세로 스크롤과 취소된 입력은 상세 이동을 실행해서는 안 된다(MUST NOT). 취소 후 pressed feedback은 기존 resting 상태로 돌아와야 한다(MUST).

**Source Context:** PROD-1075의 iOS 정지 탭·세로 스크롤 구분 완료 기준, `docs/design/post-action-bar.md`의 cancel 뒤 feedback 복귀 계약.

#### Scenario: 카드에서 시작한 세로 drag

- **WHEN** 카드 여백 또는 본문에서 시작한 세로 drag를 목록이 스크롤로 처리한다
- **THEN** 목록만 스크롤하고 상세로 이동하지 않는다
- **AND** 입력 종료 후 pressed 표시가 남지 않는다

#### Scenario: 취소 후 정상 탭

- **WHEN** 카드 press가 취소된 뒤 정지 상태의 같은 여백을 새로 탭한다
- **THEN** 취소된 입력은 이동을 실행하지 않고 새 탭은 상세로 한 번 이동한다
