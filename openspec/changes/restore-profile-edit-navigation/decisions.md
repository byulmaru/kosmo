## Context

PROD-660과 canonical Profile edit·breakpoint 디자인, 제품 owner가 확인한 Figma `WebSidebar` 의도를 바탕으로
준비된 `/profile-edit` route를 sidebar Profile 요약에 복원할 때 유지할 권한·presentation·OpenSpec 생명주기
결정을 기록한다. 최초 구현의 responsive navigation row 결정은 요구 해석 오류로 폐기한다.

## Decision Records

### server-authoritative selected Profile 편집 권한으로 진입점을 노출한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/design/profile-edit.md`, PROD-660
- Status: Active
- Context / Problem: shell은 selected Profile identity를 알고 있지만 그 정보만으로 Account가 Owner인지 또는
  Profile이 편집 가능한 상태인지 판정할 수 없다.
- Decision Outcome: nullable top-level `selectedProfileForEdit`이 반환될 때만 action을 표시하고, `null`이면
  disabled placeholder 없이 시각 화면과 접근성 트리에서 모두 숨긴다.
- Alternatives Considered: selected Profile 존재·id·Local instance로 client 판정하는 방식은 Owner 권한을
  증명하지 못한다. action을 항상 표시하고 route fallback에 맡기는 방식은 권한 없는 상태에 잘못된 진입점을
  노출한다.
- Consequences: ProfileSwitcher query는 기존 eligibility field를 소비해야 하며 별도 권한 helper나 새 API·schema를
  만들지 않는다. stale direct URL의 StateView는 route가 계속 소유한다.
- Confirmation / Follow-up: eligible/ineligible Relay fixture와 rendered accessibility tree assertion으로 직접
  검증한다.

### expanded Profile 요약의 mini-profile 묶음 아래에 편집 action을 둔다

- Decision Date: 2026-08-06
- Decision Class: Owner-confirmed Product Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/profile-edit.md`, Figma `WebSidebar` node
  `901:610`, `ProfileHero` edit button node `560:453`, `Button` primary/sm node `271:3`, PROD-660
- Status: Active
- Context / Problem: 최초 구현은 복원할 진입점을 주요 navigation row로 잘못 해석했다. 제품 의도는 future
  multi-profile switching cluster와 같은 Profile summary 문맥에 편집 action을 두는 것이다.
- Decision Outcome: full Web sidebar와 shared mobile drawer의 non-compact ProfileSwitcher에서 오른쪽
  mini-profile 이미지 묶음 바로 아래에 우측 정렬한 작은 노란 `편집` action을 표시한다. 시각 geometry는
  `72x32`, primary, `radius.sm`, SUIT 14px bold다. Web target은 `72x32`; iOS·Android는 각각 최소
  `44pt`·`48dp` 높이의 투명 slot을 사용한다. compact rail, mobile bottom tab, 우측 레일과 주요 navigation에는
  추가하지 않는다.
- Alternatives Considered: `프로필` row 다음의 `UserRoundPen` navigation item은 Profile summary 문맥과 Figma
  위치를 잃고 compact rail까지 불필요하게 확장한다. mini-profile 이미지에 edit affordance를 합치면 향후
  switching target과 역할·accessible name이 충돌한다.
- Consequences: `ProfileSwitcher`가 eligibility와 action rendering을 소유하며 `SidebarNavigation`의 별도 row와
  관련 테스트는 제거된다. 실제 mini-profile switching 구현은 이 change 범위 밖이다.
- Confirmation / Follow-up: Shell Storybook에서 full·drawer 위치·geometry와 compact·main navigation 비노출을
  검증하고, 제품 owner가 correction screenshot을 확인하기 전에는 PR을 Ready로 전환하지 않는다.

### PROD-660은 기존 Profile edit change와 분리된 OpenSpec 생명주기를 가진다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/issue-openspec-workflow.md`, PROD-660, PROD-490
- Status: Active
- Context / Problem: `add-local-profile-edit`는 PROD-490이 route·form·저장 slice의 최종 통합과 archive를 소유한
  active change다. PROD-660은 이미 준비된 route에 독립적으로 전달 가능한 shell 진입점을 추가한다.
- Decision Outcome: `restore-profile-edit-navigation`을 별도 change로 구현·검증·정합화하고, 이 change의 전체
  tasks와 canonical sync가 완료되면 자체 archive한다. `add-local-profile-edit`의 tasks나 PROD-490 archive
  책임을 이전하거나 완료 처리하지 않는다.
- Alternatives Considered: 기존 change 확장은 PROD-660 delivery를 PROD-490의 미완료 통합 gate에 결합하고 기존
  owner 범위를 바꾼다. OpenSpec 없이 코드와 canonical만 변경하면 새 `web-app-shell` 행동 계약과 검증·archive
  책임이 추적되지 않는다.
- Consequences: 두 change는 서로 다른 requirements와 archive 책임을 유지한다. 현재 canonical의 잘못된
  navigation requirement는 이 active change의 MODIFIED requirement로 대체한 뒤 archive 때 동기화한다.
- Confirmation / Follow-up: 구현·archive 전 두 active change의 delta spec과 최신 Linear owner를 다시 대조한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### 실제 Profile 편집 항목을 세 responsive navigation surface에 복원한다

- Original Decision Date: 2026-08-06
- Superseded Date: 2026-08-06
- Status: Superseded
- Original Outcome: full Web sidebar, compact Web icon rail과 mobile drawer에서 `프로필` row 다음에
  `UserRoundPen`·`프로필 편집` navigation item을 표시한다.
- Superseded By: `expanded Profile 요약의 mini-profile 묶음 아래에 편집 action을 둔다`
- Reason: 제품 owner가 Figma sidebar component를 기준으로 복원 대상은 주요 navigation row가 아니라 향후
  multi-profile cluster 아래의 작은 노란 edit action임을 확인했다.
