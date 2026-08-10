## Context

`/profile-edit` route와 `Profile.viewerState.membership` 기반 편집 eligibility는 이미 production에 존재한다.
공개 Profile의 Owner 전용 편집 button도 같은 projection으로 노출한다. PROD-660의 최초 구현은 이를 shared navigation
항목으로 추가했지만, 제품 owner가 확인한 Figma 의도는 `WebSidebar`의 selected Profile 요약 안에서 향후
멀티프로필 전환 cluster 아래에 예약된 좌표에 작은 노란 `편집` action을 배치하는 것이다. 현재 production에는
그 thumbnail visual이 없으므로 PROD-660은 action만 복원하고 cluster visual·data·interaction은 추가하지 않는다.

`ProfileSwitcher`는 full Web sidebar와 shared mobile drawer의 expanded Profile 요약을 함께 렌더링한다. compact
Web icon rail에서는 avatar trigger만 렌더링하므로 이 action의 surface가 아니다. `SidebarNavigation`은 주요
navigation row를 소유하되 이 편집 action을 소유하지 않는다.

## Goals / Non-Goals

**Goals:**

- Local selected Profile에 대한 Owner Membership이 있는 인증 사용자의 full Web sidebar와 mobile drawer
  Profile 요약에 `/profile-edit` action을 제공한다.
- Figma가 정한 위치와 `72x32` primary/sm 시각 geometry를 보존하고 platform별 최소 input target을 충족한다.
- 기존 guarded navigation, page-current semantics와 drawer close를 재사용한다.
- 권한 없는 상태의 미노출, compact rail·bottom tab·주요 navigation row 비노출을 자동화로 직접 검증한다.
- `add-local-profile-edit`와 실제 멀티프로필 전환의 구현·archive 생명주기를 이전하거나 덮어쓰지 않는다.

**Non-Goals:**

- Profile edit form, API, DB, mutation, Media와 공개 ProfileHero 편집 button을 변경하지 않는다.
- compact Web icon rail, mobile bottom tab, 우측 레일과 주요 navigation에 별도 편집 진입점을 추가하지 않는다.
- mini-profile thumbnail visual이나 데이터·선택·전환 동작을 구현하지 않는다.
- 새 Profile 권한 정책, client-side Owner 판정, 새 breakpoint·modal·navigation wrapper를 만들지 않는다.
- Web 자동화나 공용 source mapping을 Android·iOS 실제 runtime QA 완료로 일반화하지 않는다.

## Implementation Guidance

### Current Constraints

- `ProfileSwitcher`는 Query fragment로 selected Profile 요약을 이미 소유하며 PROD-705가 추가한
  `viewerState.membership`을 같은 selected Profile에서 선택할 수 있다. 최초 구현은 제거된 top-level query를
  `SidebarNavigation`에서 읽어 navigation row eligibility에 사용했다.
- selected Profile id, Local instance 또는 Membership role 하나만으로는 전체 편집 eligibility를 증명할 수 없다.
- full sidebar와 mobile drawer는 같은 non-compact `ProfileSwitcher` rendering 경계를 사용한다. compact surface는
  별도 avatar-only trigger이므로 편집 action을 조건부로 렌더링하지 않아야 한다.
- Figma `UserInfo` Profile 요약은 320px 폭, large selected avatar와 오른쪽 mini-profile 이미지 묶음을 갖는다.
  현재 production에는 오른쪽 묶음이 없으므로 action만 그 아래의 예약 좌표인 우측 20px에 정렬하며 Profile
  name·handle과 겹치지 않아야 한다.
- 공용 `Button` primary는 기본 최소 폭·높이가 이 action보다 크다. 공용 primitive 계약을 전역 변경하지 않고
  feature-local style로 정확한 시각 geometry와 platform별 input slot을 제공해야 한다.
- `add-local-profile-edit`의 통합·canonical sync·archive는 PROD-490이 소유하며 미완료다. PROD-660은 그 change를
  archive하거나 ownership을 가져오지 않는다.

### Recommended Approach

기존 `ProfileSwitcher_query` fragment에서 selected Profile의 `instance.kind`와
`viewerState.membership.role`을 선택한다. non-compact Profile summary에서 Local·Owner 조건을 함께 충족할 때만
action slot을 렌더한다. slot은 Figma
`UserInfo`의 future cluster 아래 좌표인 `top: 158`, `right: 20`에 정렬하고, name·handle 영역이 침범하지 않도록
Profile copy의 사용 가능 폭을 제한한다. production에 없는 cluster target 자체는 만들지 않는다.

action은 기존 guarded link 경계를 사용해 `/profile-edit` navigation guard, document scroll reset과 drawer
`onNavigate` close를 재사용한다. 시각 button은 `72x32`, primary background, `radius.sm`, SUIT 14px bold `편집`
label을 사용한다. Web target은 `72x32`; iOS·Android는 각각 44pt·48dp 높이의 투명 slot 중앙에 같은 시각
button을 배치한다. accessible name은 `프로필 편집`, exact `/profile-edit`에서는 page-current semantics를
제공한다.

Shell Storybook Relay fixture에서 eligible과 ineligible 응답을 명시하고 full·drawer의 role/name/href/current,
geometry와 compact·main navigation·bottom tab 비노출을 검증한다. navigation Web E2E에는 local Owner session으로
full sidebar와 mobile drawer의 canonical route 이동·drawer close, compact rail 비노출만 추가한다. Profile edit
form E2E가 소유한 저장 계약은 중복하지 않는다.

### Allowed Alternatives

Relay fragment composition상 필요하면 parent shell query가 같은 selected Profile의 viewer-relative 관계를
선택해 명시적인 eligibility 값으로 전달할 수 있다. 다만 full sidebar와 drawer가 하나의 ProfileSwitcher
rendering 경계를 공유해야 하며, 새 client 권한 helper·추가 network query·store lifecycle을 만들지 않아야 한다.

### Known Traps

- `currentSession.selectedProfile`, id 비교 또는 `Profile.instance.kind`만으로 action을 노출하지 않는다.
- link를 항상 노출하고 route의 `이 프로필을 수정할 수 없어요` fallback에 권한 처리를 떠넘기지 않는다.
- `UserRoundPen` navigation row, compact rail icon 또는 generic `/menu`의 `프로필 설정` placeholder를 남기지 않는다.
- production에 없는 mini-profile thumbnail visual이나 switching data·state·interaction을 추가하지 않는다.
- 공용 Button의 최소 크기나 다른 ProfileHero button geometry를 전역 변경하지 않는다.
- `GuardedLink`를 우회해 mobile drawer close, dirty navigation guard 또는 primary scroll reset을 잃지 않는다.
- 이 change에서 `add-local-profile-edit` 또는 다른 OpenSpec change를 archive하지 않는다.

## Risks / Trade-offs

- [절대 위치 action이 name·handle과 겹치거나 future cluster 좌표에서 벗어날 수 있음] → Figma 기준 offset과
  copy 폭을 Storybook geometry assertion 및 320px summary visual review로 확인한다.
- [32px 시각 button을 그대로 Native input target으로 사용해 최소 target을 어길 수 있음] → 시각 영역과 입력
  slot을 분리하고 Web 32px, iOS 44pt, Android 48dp 계약을 platform별 style assertion으로 검증한다.
- [Relay mock에 nullable Membership이 빠져 권한 상태를 증명하지 못할 수 있음] → eligible/ineligible fixture
  모두에 값을 명시하고 rendered accessibility tree assertion을 둔다.
- [공용 drawer source가 Native에도 적용되지만 실제 기기 QA는 실행하지 못할 수 있음] → 공용 source와 platform
  target 계약, Web runtime, Native runtime 증거를 최종 보고에서 분리한다.

## Migration Plan

schema·data migration은 없다. canonical 문서와 active delta spec을 먼저 정렬한 뒤 잘못된 navigation row를
제거하고 ProfileSwitcher action·Relay artifact·Storybook·Web E2E를 같은 구현 slice에서 적용한다. 회귀 시
`/profile-edit` route와 권한 field는 유지한 채 conditional ProfileSwitcher action만 제거할 수 있다.

## Open Questions

없음.
