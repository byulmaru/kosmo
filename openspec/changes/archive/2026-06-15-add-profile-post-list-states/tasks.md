# Tasks: add-profile-post-list-states

## 1. PostList 컴포넌트

- [x] 1.1 `lib/components/PostList.svelte`를 추가한다. `HTMLAttributes` + `loading?: boolean` props를 받는 fragment 없는 프레젠테이션 컴포넌트로 시작하고, PROD-124에서 목록 fragment가 추가될 자리임을 주석으로 남긴다
- [x] 1.2 로딩 스켈레톤을 구현한다: 게시글 디테일 로딩 마크업(좌측 `w-10` 아바타 원형 거터 + 우측 `TextSkeleton` 이름 2줄·본문 3줄)을 아이템 3개로 반복하고, `aria-hidden` + `sr-only role="status"` 로딩 안내를 둔다
- [x] 1.3 게시글 없음 빈 상태를 구현한다: 인라인 빈 상태 패턴(`px-4 py-12 text-center`)으로 "아직 게시글이 없어요" 제목과 "첫 게시글이 올라오면 여기에 표시돼요." 보조 설명을 표시한다

## 2. 프로필 페이지 연결

- [x] 2.1 `(tabs)/@[handle]/+page.svelte`의 placeholder 문구를 제거하고 `PostList`를 렌더한다
- [x] 2.2 미래 목록 query 결과와 같은 모양의 더미 상수(기본 loading)를 한 곳에 두고, `TODO(PROD-124)` 주석으로 `createQuery` 1:1 교체 지점과 빈 상태 분기의 선제 구현임을 명시한다

## 3. Storybook

- [x] 3.1 `lib/components/PostList.stories.svelte`를 추가한다(`KOSMO/PostList`): `Playground`(loading 컨트롤)와 `States`(로딩·빈 상태 동시 표시) 스토리

## 4. 검증

- [x] 4.1 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [x] 4.2 `pnpm lint:eslint`, `pnpm lint:prettier`, `pnpm --filter @kosmo/web build-storybook` 통과를 확인한다 (lint:prettier 루트 스크립트의 `'**/*'` 글롭은 Windows 셸에서 동작하지 않아, 변경 파일은 pre-commit lint-staged의 `prettier --write`로 검증)
- [x] 4.3 `openspec validate add-profile-post-list-states --strict` 통과를 확인한다

## 5. PROD-124 실데이터 연결

- [x] 5.1 더미 상수 → 프로필별 게시글 목록 `createQuery`로 교체하고 목록 아이템·오류 상태를 렌더한다 — PROD-124 (PROD-120 의존)

## 6. PROD-111 디테일 이동 링크

- [x] 6.1 목록 아이템 → 게시글 디테일 이동 링크를 추가한다 — PROD-111

## 7. 후속 (이 체인지 범위 밖 · 별도 서브이슈)

- [ ] 7.1 페이지네이션/더 불러오기를 추가한다 — PROD-134
- [ ] 7.2 게시글 작성 후 프로필 게시글 목록 cache를 갱신한다 — PROD-135
