## Context

PROD-595와 `docs/design/post-action-bar.md`가 확정한 Web hover target 표현, 현재 공통
`PostActionControl`·theme 경계, PROD-432 위 stack과 사용자가 선택한 dark runtime 제외 범위를 기록한다.

## Decision Records

### Hover는 glyph 중심 원형과 Reaction like tint를 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, PROD-595
- Status: Active
- Context / Problem: 전체 50×28 target 배경은 click 영역 표시가 강하고 compact social action의 icon 반응보다
  넓게 보였다. 시각 검토에서 Twitter-inspired action bar처럼 icon 중심 반응과 더 가벼운 selected Reaction
  색이 필요하다고 결정했다.
- Decision Outcome: 모든 hover visual은 16×16 glyph 중심의 28×28 원형을 사용한다. Reply, Repost,
  Bookmark와 More는 `surface`, Reaction은 `like`를 사용한다. selected Reaction heart의 stroke와 fill도
  hover 여부와 관계없이 `like`를 사용한다. click target geometry는 유지한다.
- Alternatives Considered: 모든 action별 tint는 장기 방향이지만 이 PR에서는 semantic token과 action mapping
  범위가 커져 제외했다. Reaction의 기존 `primary` 노랑 유지안은 heart 의미가 덜 분명해 선택하지 않았다.
- Consequences: 공통 control에는 icon visual layer와 optional color override만 추가하고 action 기능이나 layout은
  바꾸지 않는다.
- Confirmation / Follow-up: light Web Storybook에서 원형 geometry, Reaction `like`, pressed·blocked와 click
  target 불변을 검증한다. 다른 action tint는 후속 계약으로 다룬다.

### Hover는 중립 surface와 기존 전체 target geometry를 사용한다 (Superseded)

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, PROD-595
- Status: Superseded
- Context / Problem: 아이콘만 보이는 Web Action Bar에서 실제 클릭 가능한 target 범위를 hover 시 드러내야 한다.
- Decision Outcome: 현재 theme의 `surface` background를 사용하고 50×28 social action은 pill, 28×28 More는
  원형으로 표시한다. 기존 active·pressed·blocked 표현과 target geometry를 보존한다.
- Alternatives Considered: action별 semantic 색상은 새 token과 action별 prop을 요구하고 현재 승인 범위를
  넓히므로 선택하지 않았다. `primaryHover`는 selected·pressed 의미와 충돌해 사용하지 않는다.
- Consequences: 최초 구현과 검증 기록은 이력으로 유지하지만 현재 완료 계약으로 사용하지 않는다.
- Confirmation / Follow-up: 위 glyph 중심 원형 결정이 이 결정을 대체한다.

### PROD-595는 theme provider를 확장하지 않는다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/colors.md`, `docs/design/post-action-bar.md`, PROD-595
- Status: Active
- Context / Problem: light·dark `surface`와 `like` token은 존재하지만 현재 `ThemeProvider`가 light만 공급해
  dark runtime 상태는 도달할 수 없다.
- Decision Outcome: hover 구현은 `useTheme()`의 semantic `surface`와 `like`를 소비하지만 `ThemeProvider`,
  production dark 전환과 Storybook theme 선택 기반은 변경하지 않는다.
- Alternatives Considered: `ThemeProvider`에 optional theme 선택을 추가해 dark Storybook을 렌더링하는 안은
  사용자가 제외했다. 고정 light 색상 사용은 dual-mode token 정책을 위반하므로 허용하지 않는다.
- Consequences: 현재 light Web만 자동·수동 검증하며 dark runtime은 완료 증거 없이 미검증으로 남는다.
- Confirmation / Follow-up: 코드가 고정 색상 대신 semantic `surface`와 `like`를 사용함을 확인하고 최종
  보고와 PR에 dark runtime 미검증을 명시한다.

### 기존 Action Bar change와 archive 생명주기를 분리한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, PROD-595, PROD-432
- Status: Active
- Context / Problem: `add-post-action-bar`는 PROD-432가 선행 action 통합 뒤 archive하는 active change이고,
  PROD-595는 PROD-432 뒤에 merge되는 별도 구현 slice다.
- Decision Outcome: PROD-595는 `visualize-post-action-hover-target` change를 소유하고 `add-post-action-bar`의
  task 또는 archive gate를 변경하지 않는다.
- Alternatives Considered: 기존 change에 PROD-595를 추가하면 PROD-432 archive와 PROD-595의 blocked stack
  사이에 순환 생명주기가 생기므로 선택하지 않았다. OpenSpec을 생략하면 새 hover 상태 계약과 검증 경계가
  durable spec에 남지 않아 선택하지 않았다.
- Consequences: PROD-595 PR은 PROD-432 위에 stack하되 자체 spec·tasks·검증과 이후 archive 책임을 가진다.
- Confirmation / Follow-up: PR base를 `prod-432`로 유지하고 이 change만 strict validation한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `Hover는 중립 surface와 기존 전체 target geometry를 사용한다`는 2026-07-31 시각 검토와 승인된
  `Hover는 glyph 중심 원형과 Reaction like tint를 사용한다` 결정으로 대체됐다.
