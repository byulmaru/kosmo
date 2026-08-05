## Context

`/profile-edit` route와 nullable `selectedProfileForEdit` 권한 query는 이미 production에 존재한다. 공개 Profile의
Owner 전용 편집 button도 같은 field의 id 일치로 노출되지만, shared responsive navigation에는 이 route로
이동하는 항목이 없다. PROD-541은 실제 화면이 없던 generic `/menu`의 `프로필 설정` placeholder를 제거했고,
PROD-660은 준비된 route에 대한 실제 진입점만 복원한다.

`SidebarNavigation`은 Query fragment 하나로 full Web sidebar, compact Web icon rail과 mobile drawer를 모두
렌더링한다. mobile bottom tab은 별도 컴포넌트다. route item은 `GuardedLink`를 통해 navigation guard,
document scroll reset과 drawer `onNavigate` close를 재사용하고 `usePathname`의 exact match로 active state를
표시한다.

## Goals / Non-Goals

**Goals:**

- `selectedProfileForEdit`이 있는 인증 사용자에게 세 responsive navigation surface의 `/profile-edit` 진입점을
  제공한다.
- 기존 item geometry, link semantics, active state와 drawer close 흐름을 재사용한다.
- 권한 없는 상태의 미노출과 eligible 상태의 label·icon·순서·destination을 자동화로 직접 검증한다.
- `add-local-profile-edit`와 `add-incoming-follow-request-management`의 구현·archive 생명주기를 이전하거나
  덮어쓰지 않는다.

**Non-Goals:**

- Profile edit form, API, DB, mutation, Media와 직접 진입 fallback을 변경하지 않는다.
- mobile bottom tab, 우측 레일, ProfileSwitcher 전용 action, generic `/menu`, Settings 정보 구조와 팔로워 요청
  진입점을 변경하지 않는다.
- 새 Profile 권한 정책, client-side Owner 판정, 새 breakpoint·modal·navigation wrapper를 만들지 않는다.
- Web 자동화나 source mapping을 Android·iOS 실제 runtime QA 완료로 일반화하지 않는다.

## Implementation Guidance

### Current Constraints

- `SidebarNavigation`의 Relay fragment는 Query를 소유하지만 현재 `currentSession.selectedProfile`만 읽으며
  `selectedProfileForEdit`을 선택하지 않는다.
- `selectedProfileForEdit`은 top-level nullable Query field다. selected Profile id 또는 Local instance만으로는
  Owner Membership을 증명할 수 없다.
- full, compact와 drawer는 같은 navigation component를 사용한다. surface별 item을 별도로 추가하면 순서,
  eligibility, 접근성과 drawer close가 쉽게 어긋난다.
- `add-incoming-follow-request-management`가 canonical `준비되지 않은 sidebar 진입점 비노출` 요구사항을 별도로
  수정 중이다. 이 change는 같은 요구사항을 다시 수정하지 않고 독립 requirement를 추가해야 archive 순서
  충돌을 줄일 수 있다.
- `add-local-profile-edit`의 통합·canonical sync·archive는 PROD-490이 소유하며 미완료다. PROD-660은 그
  change를 archive하거나 ownership을 가져오지 않는다.

### Recommended Approach

`SidebarNavigation`의 기존 Query fragment에서 `selectedProfileForEdit`의 identity만 선택하고, 결과가 있을
때만 기존 navigation 목록의 `프로필` 항목 바로 다음에 `/profile-edit` route item을 포함한다. 항목은 기존
item rendering과 `GuardedLink`를 그대로 사용해 `UserRoundPen`, `프로필 편집`, exact active state와 drawer
close를 얻는다. 별도 `UniversalShell` state나 callback은 추가하지 않는다.

Shell Storybook의 Relay fixture에 eligible 응답을 제공해 full·compact·drawer의 href, 순서, icon, active state와
bottom tab 비노출을 검증하고, `selectedProfileForEdit: null` fixture로 시각·접근성 tree 미노출을 검증한다.
기존 navigation Web E2E에는 local Owner session으로 full·compact·mobile drawer에서 canonical route 이동,
active state와 drawer close만 추가한다. Profile edit form E2E는 직접 route 저장 계약을 계속 소유하므로
중복하지 않는다.

### Allowed Alternatives

Relay fragment composition상 필요하면 parent shell query가 nullable field를 선택해 명시적인 eligibility 값으로
전달할 수 있다. 다만 같은 server-authoritative field를 사용하고 세 surface가 하나의 rendering 경계를
공유해야 하며, 새 client 권한 helper·추가 network query·store lifecycle을 만들지 않아야 한다.

### Known Traps

- `currentSession.selectedProfile`, id 비교 또는 `Profile.instance.kind`만으로 진입점을 노출하지 않는다.
- link를 항상 노출하고 route의 `이 프로필을 수정할 수 없어요` fallback에 권한 처리를 떠넘기지 않는다.
- item을 disabled placeholder로 남기거나 compact·drawer에서만 다른 조건을 사용하지 않는다.
- `GuardedLink`를 우회해 mobile drawer close, dirty navigation guard 또는 primary scroll reset을 잃지 않는다.
- 기존 `프로필 설정` `/menu` row, mobile bottom tab item이나 별도 modal을 복원하지 않는다.
- 이 change에서 `add-local-profile-edit` 또는 `add-incoming-follow-request-management`를 archive하지 않는다.

## Risks / Trade-offs

- [Relay mock에 새 nullable field가 누락되어 eligible/ineligible story가 실제 계약을 증명하지 못할 수 있음] →
  두 상태를 명시적으로 fixture에 넣고 role 기반 assertion으로 rendered tree를 확인한다.
- [새 item이 기존 팔로워 요청·북마크 순서와 compact geometry를 회귀시킬 수 있음] → 기존 항목 순서 assertion과
  compact/full item geometry 검증을 유지하면서 `프로필` 다음 위치만 추가로 확인한다.
- [공용 drawer 변경이 Native에도 노출되지만 실제 기기 QA는 현재 실행하지 못할 수 있음] → 공용 source와
  platform target 계약을 보존하고, 자동화·Web runtime·Native runtime 증거를 최종 보고에서 분리한다.

## Migration Plan

schema·data migration은 없다. canonical 문서와 delta spec을 먼저 정렬하고, shared navigation·Relay artifact·
Storybook·Web E2E를 같은 구현 slice에서 적용한다. 회귀 시 `/profile-edit` route와 권한 field는 유지한 채
conditional navigation item만 제거할 수 있다.

## Open Questions

없음.
