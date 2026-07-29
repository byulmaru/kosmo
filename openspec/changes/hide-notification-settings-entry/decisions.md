## Context

이 기록은 PROD-541의 현재 Linear 계약, `docs/design/accessibility.md`, `docs/design/breakpoints.md`와 notification delta spec이 확정한 설정 진입점 비노출 및 사이드바 피드백 소유권 경계를 반영한다.

## Decision Records

### 44px disabled 알림 설정 placeholder를 표시한다

- Decision Date: 2026-07-19
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-277`
- Status: Superseded
- Context / Problem: 알림 목록 UI를 처음 제공할 때 설정 route는 없었지만 header의 향후 action 위치와 geometry를 정해야 했다.
- Decision Outcome: `알림` 제목 옆에 44px `알림 설정 (준비 중)` disabled placeholder를 표시하고 navigation이나 안내 action은 실행하지 않는다.
- Alternatives Considered: 설정 control 숨김, active 준비 중 안내 action, 기존 `KOSMO` eyebrow와 `모두` section heading 유지.
- Consequences: 작동하지 않는 설정 affordance가 시각·접근성 트리에 남았고 Storybook이 그 존재를 고정했다. 단일 목록, Follow item 표현, 탭·section heading 부재와 다른 PROD-277 결과는 이 선택과 독립적으로 유지된다.
- Confirmation / Follow-up: 2026-07-29 PROD-541의 `설정 공개 전에는 알림 header의 설정 control 전체를 노출하지 않는다` Derived Contract가 placeholder 선택만 대체한다.

### 설정 공개 전에는 알림 header의 설정 control 전체를 노출하지 않는다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-541`
- Status: Active
- Context / Problem: 기존 header는 설정 route가 없어도 `알림 설정 (준비 중)` disabled button과 Settings glyph를 노출해 준비되지 않은 진입점을 기대하게 한다. glyph만 제거하면 interactive accessibility control은 남는다.
- Decision Outcome: 설정 공개 범위와 시점이 확정되기 전에는 header의 설정 glyph와 interactive control 전체를 시각·접근성 트리에서 제거한다. `알림` 제목과 기존 header geometry는 유지한다.
- Alternatives Considered: glyph만 숨기고 disabled button 유지, disabled placeholder 유지, 준비 중 안내 action 추가.
- Consequences: active notification requirement의 placeholder scenario가 비노출 scenario로 교체되고 Notifications Storybook도 button 부재를 검증한다. 설정 진입점 복원은 별도 Linear·OpenSpec이 필요하다.
- Confirmation / Follow-up: mobile/Web 공용 component와 Storybook에서 설정 button 부재, heading 표시와 header layout을 검증한다.

### 사이드바 전체를 설정 비노출 범위에서 제외한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-541`, `PROD-487`
- Status: Superseded
- Context / Problem: 기존 사이드바의 `설정 & 지원` 영역은 PROD-487이 소유하는 실제 `/feedback` 진입점으로 교체되므로 설정 기능의 준비 상태와 같은 대상으로 숨기면 안 된다.
- Decision Outcome: PROD-541은 sidebar navigation, `피드백 보내기` label·icon·link와 `/feedback` route를 변경하지 않는다.
- Alternatives Considered: PROD-541에서 sidebar footer도 제거, 피드백을 향후 `설정 & 지원` dropdown까지 숨김.
- Consequences: 이 change는 notification header만 수정하며 PROD-487과 독립적으로 구현·검증할 수 있다. 향후 dropdown 구성은 별도 제품 결정이 소유한다.
- Confirmation / Follow-up: 2026-07-30 PROD-541 범위 재확인에서 `프로필 설정` nav row도 비노출 대상임이 확인되어, sidebar 전체 제외 대신 feedback footer만 제외하는 아래 Derived Contract로 대체됐다.

### 사이드바의 프로필 설정은 숨기고 피드백 진입점은 유지한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-541`, `PROD-487`
- Status: Active
- Context / Problem: `SidebarNavigation`에는 준비되지 않은 `프로필 설정` nav row와 현재 필요한 feedback footer가 별도 진입점으로 공존한다. 둘을 하나의 sidebar 설정 표면으로 취급하면 설정을 계속 노출하거나 피드백까지 숨기게 된다.
- Decision Outcome: full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정` nav row를 제거한다. PROD-487과 PR #390의 `피드백 보내기` label·icon·link와 `/feedback`, 기존 `프로필`·`팔로워 요청`·로그아웃은 유지한다.
- Alternatives Considered: sidebar 전체 유지, sidebar footer까지 제거, `/menu` route 또는 같은 route를 쓰는 다른 메뉴까지 제거.
- Consequences: PROD-541은 `SidebarNavigation`을 변경하므로 PR #390이 미병합인 동안 그 위에 stack한다. 설정 복원은 별도 Linear·OpenSpec이 필요하다.
- Confirmation / Follow-up: Shell Storybook의 full·compact·mobile drawer에서 `프로필 설정` link 부재와 유지 대상 진입점을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 위 `44px disabled 알림 설정 placeholder를 표시한다` Implementation Choice는 PROD-541의 Active Derived Contract로 대체됐다. archived `2026-07-27-add-in-app-notifications`의 같은 기록에 포함된 단일 목록, Follow item 표현, 탭·section heading 부재와 나머지 결과는 유지한다.
- 위 `사이드바 전체를 설정 비노출 범위에서 제외한다` Derived Contract는 `프로필 설정`과 feedback footer를 같은 표면으로 잘못 묶어 2026-07-30의 새 Derived Contract로 대체됐다.
