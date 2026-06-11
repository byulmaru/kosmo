## Why

현재 메인 화면(`(tabs)` 레이아웃)은 데스크톱에서 "사이드바 + 단일 콘텐츠 영역" 2컬럼 구조라, 트위터/X류 SNS의 표준인 좌측 내비게이션 · 중앙 콘텐츠 · 우측 레일 3분할 레이아웃이 없다. 우측 레일에 들어갈 글쓰기 위젯 등 후속 작업(PROD-113)을 진행하려면 먼저 컬럼 자리를 확보한 레이아웃 셸 골격이 필요하다. (Linear PROD-112)

## What Changes

- `(tabs)` 레이아웃의 데스크톱(`lg` 이상) 그리드를 2컬럼에서 3컬럼으로 확장한다: 좌측 내비 `20rem` | 중앙 콘텐츠 `minmax(0,600px)` | 우측 레일 `minmax(290px,350px)`(X 스타일 가변폭).
- 3컬럼 묶음을 `justify-center`로 가운데 정렬해, Figma 05 Web처럼 남는 폭이 양옆 여백으로 배분되게 한다.
- 우측 컬럼은 빈 placeholder 컨테이너로 자리만 확보한다. 실제 레일 위젯은 후속 서브이슈(PROD-113)에서 채운다.
- 프로필·게시글 디테일 라우트의 `lg:w-[600px]` 고정 폭을 제거해, 중앙 트랙이 600px보다 좁아지는 구간에서 콘텐츠가 우측 레일 트랙을 침범하지 않게 한다.
- 기존 사이드바(PROD-77)·모바일 drawer·하단 탭 바 동작은 변경하지 않는다. `lg` 미만에서는 그리드가 적용되지 않으므로 기존 모바일 레이아웃이 그대로 유지된다.
- (범위 외) 우측 레일 실제 위젯·sticky 처리(PROD-113), `lg` 미만/이상 구간별 반응형 세부 정리(PROD-114), 다단계 브레이크포인트(PROD-118).

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-app-shell`: 데스크톱 탭 셸에 3컬럼(좌측 내비 · 중앙 콘텐츠 · 우측 레일 자리) 중앙 정렬 레이아웃 요구사항이 추가된다.

## Impact

- `apps/web/src/routes/(tabs)/+layout.svelte` — 그리드 컬럼 정의 변경과 우측 placeholder 컬럼 추가
- `apps/web/src/routes/(tabs)/@[handle]/+layout.svelte`, `apps/web/src/routes/(tabs)/@[handle]/[postId]/+page@(tabs).svelte` — 고정 폭 `lg:w-[600px]` 제거 (중앙 트랙 폭을 따라가게)
- API, 데이터 모델에는 영향 없음
