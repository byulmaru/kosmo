## Context

PROD-91에서 웹 프로필 페이지를 구현했고, 본 문서는 그 과정에서 내린 기술 결정을 기록한다(backfill). 백엔드 `profileByHandle`는 이미 존재하므로 이 변경은 순수 프론트엔드(`apps/web`, SvelteKit + mearie GraphQL + Tailwind 시맨틱 토큰)다. 디자인 기준은 Figma `Profile / Mine`·`Profile / Other`(모바일)이며 데스크톱 전용 디자인은 없다.

## Goals / Non-Goals

**Goals:**

- 핸들 URL로 프로필 페이지에 직접 접근하고 기본 정보를 표시한다.
- 정적 엔드포인트 라우트와 충돌하지 않는 라우팅.
- 공유 셸을 건드리지 않고 프로필만 피드형 컬럼으로 렌더링.
- 헤더를 재사용 가능한 컴포넌트로 분리(향후 편집/디자인 보강 대비).

**Non-Goals:**

- 데스크톱 3분할 셸과 오른쪽 컬럼(검색/글쓰기/트렌드) — 차후 웹 레이아웃 이슈.
- 팔로우/편집 버튼(PROD-96), 게시글 목록·ProfileTabs(PROD-88).
- 스키마 미보유 요소(태그칩·ProfileMeta·아바타 이미지).

## Decisions

- **라우트 형식 `/@{handle}` (Mastodon식)**: 대안으로 `/{handle}`(Twitter식, 예약어 목록 필요)과 `/profile/{handle}`(Bluesky식)을 검토했다. `/{handle}` 루트 직속은 정적 엔드포인트(`/login` 등)를 클라이언트 라우터가 가로채는 충돌이 있어 예약어 목록 유지가 필요했다. `@` 프리픽스는 구조적으로 충돌을 없애고, 연합 핸들(`@user@domain`) 표기·디자인과도 일치해 채택했다.
- **layout으로 조회**: 프로필 정보가 하위 탭(게시물/답글 등)에서 공유되므로 `+layout.svelte`에서 `profileByHandle`를 조회한다(이슈 명시).
- **공유 셸 비침습 컬럼 정렬**: 프로필 라우트만 `self-start` + 음수 마진(`-mx-6 -mt-8 w-[calc(100%+3rem)]`)으로 공유 main의 `px-6 py-8`를 상쇄해 모바일 풀블리드를, 데스크톱은 폭 고정 + `mx-auto` + `border-x`로 가운데 컬럼을 만든다. 공유 main을 바꾸면 모든 탭 페이지에 영향이 가므로 프로필 파일 안에 격리했다.
- **ProfileHero 컴포넌트 + 공용 유틸**: 헤더를 `ProfileHero.svelte`(프레젠테이션, profile/loading prop)로 분리하고 Storybook 스토리를 추가했다. 아바타 이니셜·카운트 compact 포맷은 `lib/utils/profile.ts` 공용 유틸로 통일해 사이드바와 중복·불일치를 제거했다.

## Risks / Trade-offs

- **레이아웃 매직 오프셋 결합** → 음수 마진 값이 공유 main의 `px-6 py-8`에 하드 의존한다. 주석으로 의존성을 명시했고, 데스크톱 3분할 셸 작업 때 정식 컬럼 구조로 대체할 예정.
- **데스크톱 디자인 부재** → Figma는 모바일 전용이라 데스크톱 컬럼 폭/구분선은 Twitter 관행 기준 임시값이다. 차후 디자인 확정 시 조정.
- **사이드바 변경의 머지 충돌** → 동일 파일을 PROD-98(핸들 검증)도 수정해 머지 충돌이 발생했고, main을 끌어와 한 파일을 수동 해결했다(양쪽 변경 모두 보존).

## Migration Plan

데이터 마이그레이션 없음(프론트엔드 표시 기능). 롤백은 라우트/컴포넌트 제거로 충분하며 백엔드 영향 없음.

## Open Questions

- 데스크톱 3분할 셸과 오른쪽 컬럼, 인앱 진입점 IA(하단탭 메뉴→프로필 등)는 차후 웹 레이아웃/IA 스프린트로 이연.
