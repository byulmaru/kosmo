## Context

`add-shell-responsive-breakpoints`의 proposal, web-app-shell delta spec, design에 기록된 압축형 셸 브레이크포인트 결정을 ADR 형식으로 정리한다.

## Decision Records

### Tailwind 기본 md/xl 브레이크포인트로 압축형 셸을 구성한다

- Status: Accepted
- Context / Problem: 기존 `lg` 단일 전환은 1024~1280px 구간에서 3컬럼을 비좁게 누른다.
- Decision Outcome: `<md`는 모바일, `md`~`xl`은 아이콘 레일+중앙 피드, `xl` 이상은 풀 사이드바 3분할로 전환한다.
- Alternatives Considered: custom breakpoint token을 추가하거나 `lg` 경계를 유지할 수 있지만, 이번 범위에서는 Tailwind 기본값으로 충분하고 `lg`는 중간 폭 눌림을 해결하지 못한다.
- Consequences: 하단 탭 바, drawer, sidebar 표시 기준이 `lg`에서 `md`로 내려간다.
- Confirmation / Follow-up: `docs/design/breakpoints.md`와 web-app-shell delta spec, viewport별 UI 확인으로 검증한다.

### 아이콘 레일은 SidebarNavigation 내부 두 분기로 구현한다

- Status: Accepted
- Context / Problem: 기존 `SidebarNavigation`은 절대 위치와 고정 폭 중심이라 CSS만으로 안정적인 5rem 레일로 접기 어렵다.
- Decision Outcome: 풀 분기와 아이콘 레일 분기를 한 컴포넌트 안에서 렌더하고 `xl` 가시성으로 전환한다.
- Alternatives Considered: 단일 마크업을 CSS로 접을 수 있지만 프로필 스위처, 글쓰기 버튼, drawer surface 상태가 얽혀 layout shift와 접근성 처리가 커진다.
- Consequences: 데스크톱 surface에는 두 분기가 DOM에 존재하므로 form id 충돌을 피해야 한다.
- Confirmation / Follow-up: surface별 suffix와 `display:none` 분기 동작을 확인한다.

### 글쓰기 진입은 우측 레일 없는 단계에만 sidebar 버튼으로 제공한다

- Status: Accepted
- Context / Problem: `md`~`xl` 아이콘 레일 단계에는 우측 컴포저와 하단 탭이 없어 글쓰기 진입점이 사라질 수 있다.
- Decision Outcome: 아이콘 레일 단계에는 `/compose` 글쓰기 버튼을 두고, `xl` 이상은 우측 레일 컴포저가 담당하므로 풀 사이드바 글쓰기 버튼은 데스크톱에서 숨긴다.
- Alternatives Considered: 모든 데스크톱 단계에 sidebar 글쓰기 버튼을 유지할 수 있지만 `xl` 이상에서는 우측 레일 컴포저와 중복된다.
- Consequences: drawer surface에서는 풀 사이드바 글쓰기 버튼을 유지해야 한다.
- Confirmation / Follow-up: `md`~`xl`, `xl` 이상, 모바일 drawer surface별 진입점 표시를 확인한다.

## Remaining Decisions

- 아이콘 레일 hover tooltip과 Figma 모바일/아이콘 단계 프레임은 후속 범위로 남긴다.
- 기존 풀 분기의 raw hex 색상은 후속 토큰 마이그레이션에서 다룬다.

## Superseded Decisions

- 없음.
