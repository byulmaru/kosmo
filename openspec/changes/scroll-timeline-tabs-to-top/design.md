## Current Constraints

조사 기준은 `94571e29f6a1967943ff548b99325429a44fac8a`다. 아래는 구현 방향을 정리한 메모다. 제품 계약의 근거는 현재 사용자 결정과 PROD-1162다.

- `TimelineTabs.tsx`는 `RouteTabList`에 재선택 callback을 전달한다. `RouteTabList.tsx`는 현재 값이면 callback만 호출하고, 비활성 탭이면 Web에서 route를 교체하거나 Native에서 `timeline` 파라미터를 바꾼다.
- `HomeTimelineScreen.tsx`의 상단 `TimelineTabs`에는 재선택 callback이 없다. 기존 Home 재선택 handler에는 Web 스크롤과 데이터 새로고침이 함께 들어 있다.
- `LocalTimelineScreen.tsx`의 상단 탭은 현재 `refresh`를 호출한다. 같은 새로고침 경로는 shell 재선택과 Native pull-to-refresh에서도 사용한다.
- Native의 `InfiniteList.tsx`는 실제 `FlatList`를 맨 위로 이동하는 handler를 shell에 등록한다. Home·Local 목록은 `PostList.tsx`에서 같은 `home` 목적지로 등록한다. 외부 `PaginationScrollView`가 있는 경우에는 그 scroll owner가 등록한다.
- `UniversalShell.tsx`의 `reselectTab('home')`은 Native에서 등록된 scroll handler를 실행하지만 Web에서는 아무 동작도 하지 않는다. Web은 document scroll을 직접 처리하는 기존 경로가 필요하다.

비활성 탭으로 전환할 때 Home은 `store-or-network`로 읽고, 진입 당시 cache가 있으면 기존 명시적 새로고침으로 재검증한다. Local은 `store-and-network`로 읽는다. 이 조사는 진입 갱신이 이미 있다는 코드 근거이며, 새로운 갱신 정책을 제안하는 것은 아니다.

## Practical Approach

- 공용 상단 탭의 재선택 지점에서 스크롤만 실행하도록 연결하는 방향을 권장한다. Web에서는 document를, Native에서는 현재 목록이 등록한 scroll handler를 사용한다.
- Local의 상단 탭에만 연결된 새로고침 callback을 제거하고 Home에도 같은 스크롤 동작을 제공한다. shell·브랜드 마크·pull-to-refresh의 기존 새로고침 호출은 유지한다.
- 파일·callback 배치는 구현자가 현재 코드에 맞춰 정한다. 기존 scroll owner를 재사용할 수 있으므로 별도 registry나 요청 조정 상태를 추가할 필요는 보이지 않는다.

## Alternatives and Traps

- `reselectHome`이나 기존 Home 재선택 handler를 그대로 연결하면 데이터 조회까지 실행하므로 이번 계약과 맞지 않는다.
- Web에서 `reselectTab('home')`만 호출하면 스크롤하지 않는다. Native와 Web의 실제 스크롤 대상을 각각 확인해야 한다.
- 현재 route로 다시 이동하거나 `fetchKey`를 바꾸는 방식은 navigation·재조회를 만들 수 있다. 스크롤을 위해 화면을 재마운트하지 않는다.
- 기존 `TimelineRefresh.test.ts`와 `TimelineRefresh.relay.test.ts`는 `TimelineTabs`를 mock한다. 그 검증만으로는 실제 상단 탭의 연결과 추가 요청이 없는 동작을 증명할 수 없다.

## Risks / Limits

- 상단 탭을 고치면서 공유 `refresh` 함수를 제거하면 별도 새로고침 진입점이 깨질 수 있다.
- 실제 Web document와 Native 목록의 스크롤 결과를 소스나 callback 호출 횟수로 대체하지 않는다. 제품 테스트와 runtime 검증은 다음 세션에 남아 있다.
- API·DB 변경이나 migration은 필요하지 않은 것으로 조사됐다. UI 배포·rollback은 기존 앱 배포 경로를 따른다.

## Open Questions

- 미정인 제품·보안·롤아웃 결정은 없다. 최초 제보 환경과 실제 runtime 결과는 아직 확인하지 않았다.
