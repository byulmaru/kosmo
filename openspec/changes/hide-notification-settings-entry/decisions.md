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
- Status: Superseded
- Context / Problem: `SidebarNavigation`에는 준비되지 않은 `프로필 설정` nav row와 현재 필요한 feedback footer가 별도 진입점으로 공존한다. 둘을 하나의 sidebar 설정 표면으로 취급하면 설정을 계속 노출하거나 피드백까지 숨기게 된다.
- Decision Outcome: full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정` nav row를 제거한다. PROD-487과 PR #390의 `피드백 보내기` label·icon·link와 `/feedback`, 기존 `프로필`·`팔로워 요청`·로그아웃은 유지한다.
- Alternatives Considered: sidebar 전체 유지, sidebar footer까지 제거, `/menu` route 또는 같은 route를 쓰는 다른 메뉴까지 제거.
- Consequences: PROD-541은 `SidebarNavigation`을 변경하므로 PR #390이 미병합인 동안 그 위에 stack한다. 설정 복원은 별도 Linear·OpenSpec이 필요하다.
- Confirmation / Follow-up: 2026-07-30 받은 팔로우 요청 UI가 없다는 사실과 개인 메시지에서 확인한 임시 비노출 방향을 PROD-541에 기록하면서, `팔로워 요청`과 generic `/menu`도 함께 제거하는 아래 Derived Contract로 대체됐다.

### 준비되지 않은 설정·팔로워 요청 진입점과 generic menu placeholder를 제거한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-566`, `PROD-487`
- Status: Superseded
- Context / Problem: `SidebarNavigation`의 `프로필 설정`은 실제 설정 화면이 없고, `팔로워 요청`은 pending domain/API가 존재하지만 받은 요청 관리 UI 대신 generic `/menu` 소개 화면으로 이동한다. 준비되지 않은 두 진입점을 유지하면 사용자가 실행 가능한 기능으로 오인한다. 반면 feedback, 실제 Profile navigation, Bookmark와 logout은 현재 동작한다.
- Decision Outcome: full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정`과 `팔로워 요청` row를 시각·접근성 트리에서 제거하고, 남은 user-facing 소비자가 없는 generic `/menu` placeholder route와 positive route smoke를 제거한다. `프로필`은 선택한 Profile의 canonical route만 사용한다. PROD-487과 PR #390의 `피드백 보내기`와 `/feedback`, `프로필`, `북마크`, 로그아웃은 유지한다. 팔로우 요청의 pending 모델/API와 보낸 요청의 `요청됨`·취소는 변경하지 않는다.
- Alternatives Considered: 두 row와 `/menu` 유지, 받은 요청 UI를 PROD-541에서 즉시 구현, 승인제 팔로우를 제품에서 제거, navigation item을 literal source comment로 남김.
- Consequences: 현재 App에서 잘못된 진입점은 사라지지만 받은 요청을 App에서 확인·처리하는 UI는 계속 없다. 해당 UI와 진입점 복원은 PROD-566이 별도로 소유하며 기존 Lucide `UserRoundPlus` 아이콘 이름을 보존한다. `/menu` 직접 접근에 새 redirect나 전용 404 화면을 추가하지 않는다.
- Confirmation / Follow-up: Shell Storybook의 full·compact·mobile drawer에서 두 진입점 부재와 유지 대상을 검증하고, Web auth route의 positive `/menu` smoke를 제거한다. 2026-07-30 PROD-541에 ProfileSwitcher 중심 정렬과 feedback `Mail` glyph가 추가되어 아래 Derived Contract로 대체됐다.

### 준비되지 않은 진입점을 제거하고 ProfileSwitcher 정렬과 feedback glyph를 명확화한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-566`, `PROD-487`
- Status: Active
- Context / Problem: 준비되지 않은 `프로필 설정`·`팔로워 요청`과 `/menu`를 제거한 뒤에도 full/mobile ProfileSwitcher nickname은 trigger 중심보다 6px 아래로 보정돼 있다. 실제 feedback footer는 유지되지만 `Settings` glyph가 노출돼 준비되지 않은 설정 기능으로 오인될 수 있다.
- Decision Outcome: 기존 비노출·route 제거 계약을 유지하면서 full Web sidebar와 mobile drawer의 nickname 하향 보정을 제거해 nickname·chevron을 trigger 수직 중심에 놓고 compact avatar geometry는 유지한다. `피드백 보내기`는 Lucide `Mail` glyph를 사용하되 label, `/feedback` destination, active·drawer close·접근성 semantics와 전달 동작은 유지한다.
- Alternatives Considered: nickname의 6px 보정 유지, feedback `Settings` 유지, 댓글에서 이미 사용하는 `MessageCircle`, 텍스트 피드백을 강조하는 `MessageSquareText`.
- Consequences: profile trigger의 수직 정렬이 중앙으로 복원되고 feedback이 설정이나 댓글이 아닌 별도 전달 action으로 구분된다. feedback route/API, compact rail geometry와 navigation semantics는 바뀌지 않는다.
- Confirmation / Follow-up: 사용자가 `Mail` 선택과 중심 정렬 복원을 승인했다. 기존 Shell Storybook의 full/mobile geometry assertion을 중심 기준으로 먼저 변경해 RED를 확인하고, 세 responsive surface에서 feedback link 의미와 glyph를 시각 검증한다.

### Parent feedback change를 먼저 archive한 뒤 child에서 menu 보존 scenario를 제거한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-487`, `PROD-541`, PR #390, PR #412
- Status: Active
- Context / Problem: Parent `add-web-feedback-slack-delivery`는 parent head의 기존 `/menu` 소비자를 보호하기 위해 `Universal shell feedback navigation` requirement에서 `/menu` 보존을 요구한다. Child PROD-541은 그 소비자를 제거한 뒤 같은 requirement의 최종 내용을 바꾼다. Active change 간 의미적 적용 순서는 strict validation만으로 보장되지 않는다.
- Decision Outcome: Parent #390과 `add-web-feedback-slack-delivery`는 parent slice의 `/menu` 보존 계약을 유지한다. Parent change를 먼저 archive해 requirement를 canonical에 반영하고, child archive 직전에 canonical requirement 전체를 다시 복사·대조한 뒤 `/menu` 보존 scenario만 제거한 MODIFIED requirement를 적용한다. Child는 parent active artifact를 직접 수정하지 않는다.
- Alternatives Considered: Parent에서 보존 계약을 먼저 철회, child에서 parent active 파일 직접 수정, child 문구로만 supersede하고 archive 순서를 확인하지 않음.
- Consequences: 각 stack 단계의 코드와 계약이 일치하고 issue ownership이 섞이지 않는다. Parent archive 전에는 child archive가 blocked되며, child delta는 feedback navigation의 나머지 scenario를 빠뜨리지 않도록 requirement 전체를 포함해야 한다.
- Confirmation / Follow-up: Parent archive 여부와 canonical requirement 내용을 child archive stop gate에서 재확인하고 archive 후 strict validation을 수행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 위 `44px disabled 알림 설정 placeholder를 표시한다` Implementation Choice는 PROD-541의 Active Derived Contract로 대체됐다. archived `2026-07-27-add-in-app-notifications`의 같은 기록에 포함된 단일 목록, Follow item 표현, 탭·section heading 부재와 나머지 결과는 유지한다.
- 위 `사이드바 전체를 설정 비노출 범위에서 제외한다` Derived Contract는 `프로필 설정`과 feedback footer를 같은 표면으로 잘못 묶어 2026-07-30의 새 Derived Contract로 대체됐다.
- 위 `사이드바의 프로필 설정은 숨기고 피드백 진입점은 유지한다` Derived Contract는 받은 요청 UI가 없는 `팔로워 요청`과 generic `/menu`를 유지해 최신 PROD-541 범위와 어긋나므로, 같은 날의 `준비되지 않은 설정·팔로워 요청 진입점과 generic menu placeholder를 제거한다` Derived Contract로 대체됐다.
- 위 `준비되지 않은 설정·팔로워 요청 진입점과 generic menu placeholder를 제거한다` Derived Contract는 비노출·route 제거 결과를 유지하되 최신 PROD-541의 ProfileSwitcher 중심 정렬과 feedback `Mail` glyph를 포함하는 Derived Contract로 대체됐다.
