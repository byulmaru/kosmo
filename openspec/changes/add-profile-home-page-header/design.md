## Context

현재 공개 Profile layout은 활성 프로필에서 `ProfileHero`와 nested route만 렌더하고, 프로필이 없으면 container 밖에 `StateView`만 렌더한다. 공용 `PageHeader`의 text 제목은 가용 폭에서 여러 줄로 감싸지며, 모바일 Web 셸은 `/search`만 route-owned header로 분류한다. 승인된 Figma `TextEllipsis` variant와 PROD-949는 Profile Home에만 한 줄 동적 제목과 missing chrome을 요구하며, P1 보정은 최상위 Profile Home의 loading·query error에도 같은 빈 제목 chrome을 유지한다.

## Goals / Non-Goals

**Goals:**

- 기존 공용 PageHeader와 route container를 재사용해 resolved·missing Profile Home의 상단 위계를 맞춘다.
- Profile `displayName`을 같은 layout query에서 읽고 시각적으로만 한 줄 tail ellipsis를 적용한다.
- 최상위 Profile Home에서는 PageHeader만 `displayName`의 semantic heading이 되게 하고 ProfileHero의 같은 시각 typography는 유지한다. PageHeader가 없는 관계 route는 기존 ProfileHero heading을 유지한다.
- 모바일 Web의 중복 셸 헤더를 막고 기존 Hero·게시물·loading skeleton·query-error retry 상태를 보존한다.

**Non-Goals:**

- ProfileHero, Follow action, 게시물 query·pagination 또는 관계 목록 route를 바꾸지 않는다.
- loading·query error의 skeleton·StateView retry 본문과 query lifecycle을 바꾸지 않는다.
- 새 header wrapper, query, dependency, Storybook fixture 또는 navigation lifecycle을 만들지 않는다.

## Implementation Guidance

### Current Constraints

- Profile layout query는 Hero와 FollowButton fragment를 이미 소유하지만 PageHeader 제목에 필요한 scalar를 읽지 않는다.
- Native에서는 같은 `PaginationScrollView`가 Profile layout 전체를 소유하므로 PageHeader도 기존 route container 안에 있어야 한다.
- 일반 PageHeader 소비처는 긴 정적 제목의 여러 줄 reflow에 의존한다. Profile의 한 줄 정책을 공용 기본값으로 바꾸면 회귀한다.
- missing 분기는 현재 route container 밖에 있어 PageHeader와 Native scroll ownership을 공유하지 않는다.
- loading은 기존 `ProfileRouteContainer` 안의 `ProfileHero` skeleton을, query error는 RouteBoundary의 retry `StateView`를 사용한다. 최상위 Profile Home에서는 두 fallback 앞에만 PageHeader를 추가해야 한다.

### Recommended Approach

1. 공용 PageHeader의 text variant에 한 줄 tail ellipsis를 명시적으로 선택하는 좁은 선택지를 추가하고 기본값은 그대로 둔다.
2. 기존 Profile layout query에서 `displayName` scalar를 함께 읽는다.
3. 기존 게시글 상세와 같은 공용 IconButton·Chevron·`router.back()` 조합을 재사용한다.
4. resolved 분기는 `PageHeader → ProfileHero → Slot`, missing 분기는 같은 route container 안의 `빈 제목 PageHeader → StateView`로 조립한다.
5. 최상위 Profile Home의 loading·query error fallback은 `빈 제목 PageHeader → 기존 fallback body`로 조립하고, 관계 route는 기존 fallback을 유지한다.
6. resolved 최상위 Profile Home만 `ProfileHero`의 heading semantics를 끄고, PageHeader가 없는 followers/following route는 기본 Hero heading을 유지한다.
7. 모바일 Web route-owned header 판정에 최상위 공개 Profile handle 경로만 추가하고 nested post·followers·following은 포함하지 않는다.

### Allowed Alternatives

없음.

### Known Traps

- 모든 text PageHeader를 한 줄로 바꾸면 설정 등 긴 정적 제목의 접근성 reflow 계약이 깨진다.
- pathname의 모든 단일 segment를 Profile로 취급하면 `/home`, `/local`, `/bookmarks` 같은 shell route도 잘못 분류된다.
- missing 상태만 container 밖에 두면 Native scroll·safe-area ownership이 resolved 상태와 달라진다.
- 관계 route나 non-top-level fallback까지 header를 확장하면 PROD-949의 소유권 범위를 넘는다.

## Risks / Trade-offs

- [긴 표시 이름의 일부가 시각적으로 생략됨] → 전체 문자열을 heading의 접근성 값으로 유지하고 Figma 한 줄 계약을 따르며 실제 좁은 Web viewport에서 확인한다.
- [Profile 경로 판정이 다른 route와 충돌할 수 있음] → canonical `@` handle을 가진 최상위 경로만 행동 테스트로 고정한다.
- [공용 PageHeader 변경이 다른 소비처에 영향을 줄 수 있음] → opt-in 속성으로 제한하고 기본 text variant가 줄 수를 지정하지 않는 기존 테스트를 유지한다.

## Migration Plan

1. canonical 문서와 OpenSpec을 PROD-949에 맞춘다.
2. 공용 PageHeader opt-in, Profile layout 조립, 모바일 Web 소유권을 최소 변경하고 Relay artifact를 갱신한다.
3. 공용 component·Profile route·shell layout targeted test와 app type/Relay 검증, OpenSpec strict validation을 실행한다.
4. Web 390·768·1280px에서 resolved·긴 이름·missing 상태를 확인한다. Android/iOS runtime을 실행하지 못하면 미확인으로 남긴다.
5. 문제가 있으면 이 변경의 presentation·query scalar·문서만 되돌린다. data migration은 없다.

## Open Questions

없음.
