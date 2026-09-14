## Why

PROD-852에서 확정한 `SidebarNavigation`, `BottomTabBar`, `SearchToolbar` 시각·interaction 계약은 공용 UI와 Storybook에만 반영되어 있고 Production은 이전 표현을 렌더링한다. 실제 route, Relay, drawer, 검색 focus·query와 logout 생명주기를 유지하면서 공용 표현을 Production에 연결해야 한다.

## What Changes

- 기존 shell `SidebarNavigation`과 `BottomTabBar`를 route·Relay·drawer·ProfileSwitcher·logout을 유지하는 Production adapter로 남기고 공용 UI 표현을 렌더링한다.
- Web 검색 route의 인라인 toolbar 표현만 공용 `SearchToolbar`로 교체하고 기존 `q`·`tab`, focus, drawer와 최근 검색·결과 동작을 유지한다.
- Web의 활성 Home 진입점과 compact·full 브랜드 마크가 `/home`과 `/local` 중 현재 타임라인을 최상단으로 이동하고 한 번 다시 요청하게 한다. 실제 link 대상은 `/home`으로 유지해 modifier·새 탭 동작을 보존한다.
- 모바일 Web·Android·iOS의 브랜드 마크는 비상호작용 요소로 유지하고 Native 하단 navigation 재선택·scroll 계약은 확장하지 않는다.
- full·compact·drawer의 로그아웃 진행·실패·재시도 상태와 navigation guard를 보존한다.
- 공용 컴포넌트 Storybook과 실제 shell·검색 screen story/test를 함께 정렬하고 Web Light/Dark·반응형 동작을 검증한다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/icons.md`, `docs/design/page-header.md`, `docs/design/local-timeline.md`, `docs/design/accessibility.md`
- Linear Contract: `DSN-41`, `PROD-796`
- Linear Implementations: `PROD-796`; 공용 UI 선행 구현 `PROD-852`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: navigation chrome의 Production 표현, 기존 route·상태·접근성 보존, Web Home/Local 재선택과 모바일 브랜드 마크 비상호작용 계약을 정렬한다.

## Impact

- `apps/app/src/components/ui`의 navigation chrome 공용 UI와 component Storybook
- `apps/app/src/components/shell`의 Production navigation adapter, `UniversalShell`과 shell Storybook·tests
- `apps/app/src/app/(tabs)/(protected)/search.tsx`의 route 소유 toolbar와 검색 screen Storybook·tests
- `openspec/specs/web-app-shell/spec.md`의 Home/Local 재선택 및 navigation chrome 요구사항
- GraphQL schema, API, database, 새 dependency, 검색·logout 정책 자체는 변경하지 않는다.
