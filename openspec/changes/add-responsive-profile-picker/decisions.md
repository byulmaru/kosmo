## Context

이 기록은 `docs/design/breakpoints.md`, `docs/design/figma.md`와 최신 `PROD-238` 계약에서 확정된 Web profile picker surface, dismissal과 scroll ownership을 구현 전에 분리해 보존한다.

## Decision Records

### Web breakpoint별 picker surface를 분리한다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, `PROD-238`
- Status: Superseded
- Context / Problem: full sidebar와 compact icon rail은 trigger와 가용 폭이 다르며 하나의 absolute dropdown 표현이 두 구조를 모두 안전하게 만족하지 못한다.
- Decision Outcome: `full` 이상 Web에서는 프로필 이름 trigger 아래 inline picker를 사용하고, `compact` 이상 `full` 미만 Web에서는 아바타 trigger 오른쪽 비모달 overlay drawer를 사용한다. Android/iOS와 mobile Web drawer는 이 재설계에서 제외한다.
- Alternatives Considered: 모든 Web 구간에서 같은 overlay를 사용하는 방식은 full sidebar의 정보 구조를 활용하지 못한다. compact rail 자체를 확장하는 방식은 중앙 피드 폭과 breakpoint layout을 흔든다.
- Consequences: shell surface 정보를 `compact` boolean과 별개로 구분해야 한다. `SidebarNavigation`이 full summary render seam을 소유하고 `ProfileSwitcher`가 그 260px summary와 picker를 별도 flow siblings로 배치해야 한다.
- Confirmation / Follow-up: full·compact Storybook surface와 768·1024·1279·1280·1440px 시각 검증으로 확인한다.

### Full picker도 navigation을 밀지 않는 비모달 overlay로 표시한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/figma.md`, `PROD-238`
- Status: Active
- Context / Problem: full inline picker는 긴 프로필 목록 높이만큼 sidebar navigation을 아래로 밀어 주요 메뉴를
  viewport 밖으로 보낼 수 있고, 프로필 전환을 일시적인 picker가 아니라 sidebar 구조 확장처럼 보이게 한다.
- Decision Outcome: `full` 이상 Web에서는 프로필 이름 trigger와 닫힌 260px summary를 유지하고, picker의 시각적
  wrapper를 프로필 이름 trigger 바로 아래에 anchored absolute overlay로 표시한다. picker는 trigger 아래의
  프로필 상세와 navigation 위에 paint되지만 navigation의 layout 위치와 sidebar·중앙 피드 폭을 바꾸지 않는다.
  backdrop과 focus trap을 사용하지 않으며 같은 trigger 재실행,
  바깥 pointer close, `Escape`, 프로필 선택 성공으로 닫는다. 바깥 pointer close는 이벤트 기본 동작을 막지 않아
  pointer 대상의 기본 focus를 따르며, 명시적 close로 `open=false`, `creating=false`, 빈 handle과 오류 없음으로
  초기화한다. `compact` drawer와 mobile Web/native surface는 유지한다.
- Alternatives Considered: 기존 inline flow는 navigation 접근성과 정보 구조를 흔든다. full sidebar 전체 폭을
  확장하거나 modal을 사용하면 layout 또는 background interaction을 불필요하게 바꾼다.
- Consequences: full Web render는 flow 높이에 참여하지 않는 absolute layer를 사용하고, 이름 trigger의 고정
  geometry와 함께 움직이는 anchor 및 outside interaction containment와 transient reset을 compact와 함께 지원해야
  한다. full sidebar parent의 stacking과 1280·1440px paint order를 직접 확인해야 한다.
- Confirmation / Follow-up: Storybook에서 picker top이 이름 trigger bottom에 인접하고 open 전후 navigation top이
  같으며 overlay가 navigation 위에 표시되는지, same trigger·outside·`Escape`·선택 성공 dismissal과 장목록 고정
  footer를 확인한다.

### Compact drawer는 layout을 바꾸지 않는 비모달 surface다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: compact picker가 본문 위에 보여야 하지만 modal backdrop·focus trap이나 rail width 확장은 desktop 셸 interaction을 불필요하게 차단하거나 중앙 피드를 이동시킨다.
- Decision Outcome: compact drawer는 본문보다 높은 overlay layer에 표시하되 backdrop과 focus trap을 사용하지 않고 rail·center column의 실제 width를 유지한다. 아바타 trigger 재실행, 바깥 클릭, `Escape`, 프로필 선택 성공으로 닫는다.
- Alternatives Considered: modal drawer는 배경 interaction을 차단하고, inline rail 확장은 layout 폭을 변경한다. 기존 작은 popover는 profile picker의 긴 목록과 생성 footer를 안정적으로 수용하지 못한다.
- Consequences: Web 전용 outside interaction과 keyboard dismissal lifecycle이 필요하고, drawer가 ancestor overflow에 잘리지 않는 layer 경계를 선택해야 한다.
- Confirmation / Follow-up: compact interaction test와 1024px 실제 paint order·dismissal 수동 검증으로 확인한다.

### 프로필 목록만 internal scroll owner로 둔다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: 프로필과 생성 진입을 하나의 무제한 container에 렌더하면 10개 이상 목록에서 footer와 생성 폼이 viewport 밖으로 밀린다.
- Decision Outcome: picker root 높이를 viewport 안으로 제한하고 프로필 목록만 scroll container로 둔다. 새 프로필 추가 액션 또는 생성 폼은 divider 아래의 고정 footer에 유지하며 생성 폼이 열리면 목록이 남은 높이에 맞게 줄어든다.
- Alternatives Considered: picker 전체를 스크롤하면 생성 진입과 폼이 사라질 수 있고, sidebar navigation scroller를 재사용하면 picker scroll ownership과 document scroll 계약이 섞인다.
- Consequences: list container는 축소 가능한 높이와 overflow 경계를 가져야 하며 footer는 list 밖에 있어야 한다.
- Confirmation / Follow-up: 10개 이상 typed fixture에서 목록 스크롤과 footer·생성 폼 접근성을 검증한다.

### Web profile option은 menu keyboard model을 따른다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: 현재 Web profile item은 `menuitemradio` semantics를 사용하지만 명시적인 focus 이동이 없어 긴 목록의 keyboard 탐색과 focus 가시성을 보장하지 못한다.
- Decision Outcome: full·compact Web picker open 시 선택 항목 또는 첫 항목으로 focus를 이동한다. `ArrowUp`·`ArrowDown`·`Home`·`End`로 프로필 항목을 이동하고 focus 항목을 list viewport 안에 유지한다. `Escape`는 picker를 닫고 trigger로 focus를 복원하며 `Tab`은 가로채지 않는다.
- Alternatives Considered: Tab 순회만 유지하면 현재 menu semantics와 긴 목록 탐색 계약을 충분히 설명하지 못한다. focus trap은 compact 비모달 계약과 충돌한다.
- Consequences: full·compact Web open lifecycle에서 item collection과 trigger reference를 관리해야 하지만 mobile Web drawer와 native focus 동작은 바꾸지 않는다.
- Confirmation / Follow-up: 10개 이상 typed fixture에서 선택 항목 초기 focus, `End` 이동 뒤 focus 가시성, `Escape` focus 복원을 검증한다.

### 시각적 picker wrapper와 semantic menu 경계를 분리한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: bounded picker의 고정 footer 전체를 Web `menu` descendant로 두면 create `form`과 operation error `alert`가 ARIA menu의 required-owned-element 규칙을 위반해 Storybook axe `aria-required-children` 오류가 발생한다.
- Decision Outcome: 시각적 picker wrapper가 bounds, border와 overflow를 소유한다. 그 안의 semantic `menu` region은 profile list의 `menuitemradio`, separator와 add `menuitem`까지 소유하고, create form과 operation error alert는 동일한 고정 footer 위치를 유지하는 `menu` sibling으로 렌더한다.
- Alternatives Considered: footer 전체를 outer `menu` 안에 두는 방식과 중간 `group` wrapper는 form·alert descendant 오류를 해소하지 못한다. a11y rule 예외는 실제 접근성 트리 결함을 숨기므로 사용하지 않는다.
- Consequences: 기존 `menu`·add `menuitem` selector와 profile option keyboard model은 유지하면서 form·alert을 유효한 semantic sibling으로 노출한다. visual layout과 scroll ownership은 바뀌지 않는다.
- Confirmation / Follow-up: Shell Storybook a11y, create failure 유지·close reset interaction과 기존 profile-switcher E2E로 검증한다.

### Compact overlay는 현재 shell hierarchy의 absolute layer를 사용한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: compact drawer가 80px rail 밖에서 본문 위에 표시돼야 하지만 새 portal은 platform 경계와 테스트 표면을 늘린다.
- Decision Outcome: `ProfileSwitcher`의 Web absolute layer를 rail 오른쪽에 두고 `UniversalShell`이 open 상태의 compact sidebar stacking을 본문보다 높인다. rail과 center column width는 바꾸지 않는다.
- Alternatives Considered: rail width 확장은 layout 계약을 위반한다. Web portal/layer host는 clipping이 실제로 확인될 때 사용할 수 있지만 현재 범위에는 추가하지 않는다.
- Consequences: 768·1024·1279px paint 검증이 필수다. ancestor clipping 또는 sibling stacking 실패가 확인되면 구현을 중단하고 portal 대안을 다시 승인받는다.
- Confirmation / Follow-up: exact-width Storybook에서 drawer left edge, center width, paint order와 document scroll을 확인한다.

### 명시적 close는 picker transient form state를 모두 초기화한다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: 기존 close effect는 create mode와 error만 지우고 입력 handle을 보존해, 닫았다 다시 열 때 이전 생성 폼 상태가 일부 남는다.
- Decision Outcome: full·compact Web에서 trigger 재실행, full·compact 바깥 pointer close 또는 `Escape`처럼 사용자가 picker를 명시적으로 닫으면 `open=false`, `creating=false`, 빈 handle과 오류 없음으로 초기화한다. 바깥 pointer close는 이벤트 기본 동작을 막지 않아 pointer 대상의 기본 focus를 따르고, `Escape`는 trigger focus를 복원한다. 선택·생성 실패는 picker와 실패 시점의 입력·오류를 유지한다. mobile Web drawer와 native의 기존 close state 동작은 유지한다.
- Alternatives Considered: handle을 보존하면 명시적 close 뒤 새 session처럼 다시 연다는 계약과 맞지 않는다.
- Consequences: 성공·실패·close reason별 `open`·`creating`·`handle`·`error`·focus 기대값을 가장 가까운 Storybook interaction에서 확인해야 한다.
- Confirmation / Follow-up: 생성 실패 input 보존과 명시적 close 후 빈 input·오류 제거를 함께 검증한다.

### Full·Compact picker의 최대 높이를 430px로 제한한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: 560px 높이는 기본 상태에서 프로필 행을 필요 이상으로 많이 노출해 picker가 sidebar와
  viewport에서 차지하는 시각적 비중이 크다.
- Decision Outcome: full·compact Web picker는 기존 surface별 viewport 여백 계산을 유지하면서 wrapper의 최대
  높이를 430px로 제한한다. 기본 상태에서 약 7개 프로필 행을 표시하되 정확한 행 수보다 목록 내부 스크롤과
  고정 add/create footer 접근성을 우선한다.
- Alternatives Considered: 560px를 유지하면 모바일에 가까운 viewport에서 picker의 시각적 비중이 크고, 정확히
  7개 행 높이를 동적으로 계산하면 runtime measurement와 별도 layout 상태가 필요하다.
- Consequences: compact와 full bounds 상수를 함께 변경하고 12개 fixture에서 wrapper 높이, list overflow와 footer
  접근성을 검증해야 한다.
- Confirmation / Follow-up: Full·Compact Storybook interaction과 직접 시각 확인에서 430px cap과 고정 footer를 확인한다.

### Mobile Web drawer trigger만 2px 광학 보정한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Active
- Context / Problem: mobile Web drawer의 42px trigger 안에서 text·icon box는 수학적으로 중앙이지만 SUIT glyph와
  16px chevron의 시각적 무게가 위로 치우쳐 보이고, 열린 상태에도 chevron이 아래 방향으로 남는다.
- Decision Outcome: `Platform.OS === 'web' && surface === 'drawer'`인 경우 이름·chevron 내부 content만 아래로
  2px 광학 보정하고 닫힘은 아래, 열림은 위 chevron을 사용한다. trigger root, picker anchor와 navigation geometry는
  이동하지 않으며 Android/iOS에는 적용하지 않는다.
- Alternatives Considered: `alignItems: center` 재적용은 이미 일치하는 box center를 바꾸지 않는다. 3–4px 이동은
  실제 기하학적 중심보다 아래로 처져 보일 수 있고, line-height 변경은 full/native text layout까지 넓게 영향을 준다.
- Consequences: mobile drawer trigger 내부 content 경계가 필요하고 mobile Storybook에서 chevron 상태와 2px visual
  center를 검증해야 한다. 기존 drawer picker content와 close lifecycle은 유지한다.
- Confirmation / Follow-up: Universal Mobile story와 직접 시각 확인에서 닫힘/열림 chevron, 2px 위치와 navigation
  불변을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### 이전 compact popover 문구

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-238`
- Status: Superseded
- Context / Problem: active `add-shell-responsive-breakpoints` change는 compact picker를 작은 dropdown/popover로 표현하지만 최신 canonical과 PROD-238은 긴 목록과 고정 footer를 수용하는 비모달 overlay drawer로 확정했다.
- Decision Outcome: PROD-238 구현에는 drawer 계약을 적용하고 이전 popover 문구를 구현 authority로 사용하지 않는다. 기존 change 자체는 PROD-238 범위에 흡수하거나 수정하지 않는다.
- Alternatives Considered: 기존 change를 재사용하면 Linear·OpenSpec ownership을 혼합한다.
- Consequences: 최종 active spec sync와 archive 전에 두 change의 적용 순서 및 최종 drawer 문구를 확인해야 한다.
- Confirmation / Follow-up: archive 전 active `web-app-shell` spec에서 compact drawer 계약이 하나의 최신 requirement로 남았는지 검증한다.
