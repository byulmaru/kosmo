## Context

PROD-660과 승인된 canonical Profile edit·breakpoint 디자인을 바탕으로, 준비된 `/profile-edit` route를 shared
responsive navigation에 복원할 때 유지할 권한·presentation·OpenSpec 생명주기 결정을 기록한다.

## Decision Records

### server-authoritative selected Profile 편집 권한으로 진입점을 노출한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/design/profile-edit.md`, PROD-660
- Status: Active
- Context / Problem: shell은 selected Profile identity를 알고 있지만 그 정보만으로 Account가 Owner인지 또는
  Profile이 편집 가능한 상태인지 판정할 수 없다.
- Decision Outcome: nullable top-level `selectedProfileForEdit`이 반환될 때만 진입점을 표시하고, `null`이면
  disabled placeholder 없이 시각 화면과 접근성 트리에서 모두 숨긴다.
- Alternatives Considered: selected Profile 존재·id·Local instance로 client 판정하는 방식은 Owner 권한을
  증명하지 못한다. link를 항상 표시하고 route fallback에 맡기는 방식은 권한 없는 상태에서 잘못된 진입점을
  노출한다.
- Consequences: shell query는 기존 eligibility field를 소비해야 하며 별도 권한 helper나 새 API·schema를 만들지
  않는다. stale direct URL의 StateView는 route가 계속 소유한다.
- Confirmation / Follow-up: eligible/ineligible Relay fixture와 rendered accessibility tree assertion으로 직접
  검증한다.

### 실제 Profile 편집 항목을 세 responsive navigation surface에 복원한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/profile-edit.md`,
  `docs/design/accessibility.md`, PROD-660
- Status: Active
- Context / Problem: PROD-541에서 제거한 항목은 준비되지 않은 `/menu`의 `프로필 설정` placeholder였고,
  production `/profile-edit` route가 준비된 뒤에도 shared navigation 공백이 남았다.
- Decision Outcome: full Web sidebar, compact Web icon rail과 shared mobile drawer에서 selected Profile의
  `프로필` 항목 바로 다음에 `UserRoundPen`·`프로필 편집`·`/profile-edit` 항목을 표시한다. exact route에서
  page-current active state를 제공하고 mobile drawer navigation 후 닫는다. mobile bottom tab과 우측 레일에는
  추가하지 않는다.
- Alternatives Considered: 이전 `Settings` 아이콘과 navigation 마지막 위치를 그대로 복원하면 실제 편집
  action을 generic 설정 구조로 오해하게 한다. ProfileSwitcher 옆 전용 action은 shared 주요 navigation 계약과
  surface geometry를 불필요하게 바꾼다.
- Consequences: 세 surface는 같은 항목과 순서를 공유하며 기존 `/menu` placeholder는 돌아오지 않는다. 공용
  drawer source가 Native에도 적용되지만 Web 자동화는 Native 실제 runtime 완료 증거가 아니다.
- Confirmation / Follow-up: Shell Storybook과 Web E2E에서 full·compact·drawer의 href·순서·icon·active·close,
  bottom tab 비노출과 기존 항목 보존을 검증한다.

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
- Alternatives Considered: 기존 change 확장은 PROD-660의 독립 delivery를 PROD-490의 미완료 통합 gate에
  결합하고 기존 owner 범위를 바꾼다. OpenSpec 없이 코드와 canonical만 변경하면 새 `web-app-shell` 행동
  계약과 검증·archive 책임이 추적되지 않는다.
- Consequences: 두 active change는 서로 다른 requirements와 archive 책임을 유지한다. 이 change는
  `add-incoming-follow-request-management`가 수정 중인 기존 requirement를 복제하지 않고 additive requirement만
  소유한다.
- Confirmation / Follow-up: 구현·archive 전 두 active change의 delta spec과 최신 Linear owner를 다시 대조한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
