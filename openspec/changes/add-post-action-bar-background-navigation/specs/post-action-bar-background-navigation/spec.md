이 문서는 PROD-1168에 이미 정해진 결과를 검증할 때 사용할 세션 예시다. 새로운 제품 계약이나 영구 spec을 만들지 않는다.

## ADDED Requirements

### Requirement: 비버튼 여백은 행의 상세 대상으로 이동한다

대상 Action Bar는 실제 개별 버튼 입력 영역을 제외한 아이콘 사이·slot의 빈 부분·위쪽 내부 여백을 클릭·탭하면 행의 기존 상세 대상으로 한 번 이동해야 한다(SHALL). 타래의 현재 Post ID로 다른 행의 대상을 바꾸어서는 안 된다(MUST NOT).

**Source Context:** [PROD-1168](https://linear.app/byulmaru/issue/PROD-1168)의 범위와 완료 기준, `docs/design/post-action-bar.md`의 일반 Post·Quote·순수 Repost 이동 대상.

#### Scenario: 일반 Post와 Quote의 여백

- **WHEN** 타임라인 일반 Post 또는 Quote에서 실제 버튼 target 밖의 세 종류 여백을 각각 클릭한다
- **THEN** 각 입력은 해당 Post 또는 Quote 자체의 상세를 한 번 연다
- **AND** Quote의 nested Source 상세로 대신 이동하지 않는다

#### Scenario: 순수 Repost의 여백

- **WHEN** 순수 Repost의 Action Bar 비버튼 여백을 클릭한다
- **THEN** direct Source의 상세로 한 번 이동한다
- **AND** Source가 Quote여도 그 Quote의 nested Source로 평탄화하지 않는다

#### Scenario: 타래의 조상·현재·하위 행

- **WHEN** 타래의 조상·현재·하위 행에서 각각 Action Bar 비버튼 여백을 클릭한다
- **THEN** 각 행의 상세 이동을 한 번 요청한다
- **AND** 현재 행은 현재 Post의 canonical 상세를 대상으로 하며 기존 router·history·scroll 처리를 유지한다

### Requirement: 개별 액션의 실제 입력 영역은 독립적으로 동작한다

각 개별 버튼과 숫자를 포함한 실제 입력 영역은 기존 액션만 실행해야 한다(SHALL). disabled/pending target을 배경 상세 이동으로 처리해서는 안 된다(MUST NOT). 전체 toolbar를 하나의 Link/Pressable로 감싸서는 안 된다(MUST NOT).

**Source Context:** PROD-1168의 버튼·숫자·disabled/pending 입력 조건, `docs/design/post-action-bar.md`와 `docs/design/accessibility.md`의 플랫폼별 target·sibling 계약.

#### Scenario: 버튼·숫자와 확장 target

- **WHEN** 답글·재게시·반응·북마크·더 보기의 glyph, 숫자 또는 실제 버튼 내부의 투명 부분을 입력한다
- **THEN** 해당 버튼의 기존 액션만 실행하고 상세 이동을 함께 실행하지 않는다
- **AND** Web visual row 밖으로 확장된 버튼 영역과 Native target 안의 glyph 주변도 같은 버튼 입력으로 처리한다

#### Scenario: 차단된 버튼과 slot 빈 부분

- **WHEN** disabled/pending 버튼의 실제 입력 영역을 입력한다
- **THEN** 차단된 액션을 실행하지 않고 상세로도 이동하지 않는다
- **AND** 해당 버튼 밖에 실제 비버튼 slot 여백이 존재하면 그 여백은 행의 상세 이동 범위를 유지한다

#### Scenario: 메뉴와 독립 콘텐츠 입력

- **WHEN** 기존 메뉴를 열거나 항목을 선택·닫고, CW·미디어·본문 링크를 조작한다
- **THEN** 기존 대상·포커스·닫힘 동작을 유지하고 Action Bar 배경 이동이 함께 발생하지 않는다

### Requirement: 취소된 입력과 기존 표시 경계를 유지한다

새 여백 이동 영역은 Web pointer 커서를 제공해야 한다(SHALL). 드래그·영역 밖 release·스크롤을 상세 진입 클릭·탭으로 처리해서는 안 된다(MUST NOT). 공용 UI를 바꾸면 기존 Native 버튼 입력과 스크롤 양보를 유지해야 한다(SHALL).

**Source Context:** PROD-1168의 Web pointer, 드래그·영역 밖 release·스크롤과 공용 Native 회귀 조건, `docs/design/post-thread.md`의 row 경계.

#### Scenario: 이동·영역 이탈·스크롤 취소

- **WHEN** 여백에서 입력을 시작한 뒤 드래그하거나 영역 밖에서 release하거나 스크롤로 전환한다
- **THEN** 상세 이동을 실행하지 않고 배경 pressed feedback을 해제한다
- **AND** 다음 정상적인 클릭·탭은 한 번 동작한다

#### Scenario: Web cursor와 기존 geometry

- **WHEN** 포인터가 새 이동 여백 위에 있고 Action Bar가 렌더링된다
- **THEN** 여백에 pointer 커서를 표시하고 기존 버튼 target·toolbar 역할·배치와 별도 콘텐츠 링크를 유지한다
- **AND** Native에서는 기존 target 비중첩·버튼 동작·스크롤 양보를 유지한다
