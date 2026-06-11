## 1. 라우트 · 레이아웃

- [x] 1.1 `(tabs)/@[handle]/[postId]/+page@(tabs).svelte`를 추가해 `/@{handle}/{postId}` 접근을 가능하게 한다
- [x] 1.2 `+page@(tabs)` 레이아웃 리셋으로 `@[handle]/+layout.svelte`의 `ProfileHero`를 건너뛰고 `(tabs)` 셸만 유지함을 확인한다

## 2. 게시글 표시

- [x] 2.1 PR #67의 `Post`/`PostContent` shape에 맞춘 본문 더미 타입·상수를 한 곳에 정의한다 (작성자는 실쿼리로 분리)
- [x] 2.2 Plain Text 본문(`content.bodyText`)을 줄바꿈 보존으로 렌더하고 `content` null을 가드한다
- [x] 2.3 작성자 영역을 `/@{handle}`로 링크한다 (초기 placeholder, `4.1`에서 컴포넌트로 교체됨)
- [x] 2.4 작성 시각(`createdAt`)과 공개 범위(`visibility`) 메타라인을 표시한다
- [x] 2.5 상단에 이전 화면으로 돌아가는 back 컨트롤을 둔다
- [x] 2.6 본문·메타라인을 `PostBody` fragment 컴포넌트(`PostBody_post` on `Post`)로 분리하고, Storybook 스토리(`KOSMO/PostBody`: 본문 variant·공개 범위·빈 본문·작성자 조립)를 추가한다
- [x] 2.7 Foundation `font/size` 토큰(`--text-xsm` 12, `--text-md` 16)을 `@theme`에 추가하고, PostBody·PostAuthorProfile의 하드코딩 크기(`text-[17px]`, `text-xs`)를 토큰 유틸리티로 교체한다 (본문·이름은 Foundation 스케일에 맞춰 17→16)
- [x] 2.8 Figma `Post Detail / No Thread`(659:5727) 디자인 반영: `PostAuthorProfile`을 좌측 40px 거터(아바타 md, 이후 스레드 라인 자리) + 우측 콘텐츠 컬럼 구조로 바꾸고 본문·메타를 콘텐츠 컬럼에 배치한다. 메타라인은 우측 정렬 `오후 9:14 · 2026. 04. 27 · 공개 범위` 형식으로 바꾼다. 헤더·게시물 더보기 버튼과 액션바는 이번 범위에서 제외한다

## 3. 상태 처리

- [x] 3.1 로딩 스켈레톤 + 스크린리더 안내를 표시한다
- [x] 3.2 조회 오류 시 안내 + 다시 시도 동작을 제공한다 (`authorQuery.refetch()`)
- [x] 3.3 없는 게시글 시 인라인 빈 상태를 표시한다
- [x] 3.4 삭제된 게시글(`state = DELETED`) 안내를 표시한다. 모든 상태에서 `(tabs)` 셸을 유지한다
- [x] 3.5 분기 조건을 `createQuery`의 `loading`/`error`/데이터 null/`state`에 1:1 매핑되도록 작성한다

## 4. 작성자 실데이터 연결 (PROD-97 머지 후)

- [x] 4.1 작성자 영역 → `PostAuthorProfile` + `PostAuthorProfile_profile` fragment로 연결한다. 작성자 데이터는 라우트 핸들 기준 `profileByHandle` 실쿼리에서 가져오고, 로딩/오류/없음 상태도 이 query에 매핑한다

## 5. 검증

- [x] 5.1 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [x] 5.2 `pnpm lint:eslint`, `pnpm lint:prettier`, `pnpm --filter @kosmo/web build-storybook` 통과를 확인한다
- [x] 5.3 `openspec validate add-web-post-detail-page --strict` 통과를 확인한다

## 6. 후속 (이 체인지 범위 밖 · 별도 서브이슈)

- [ ] 6.1 본문 더미(`PostBody_post` fragment ref) → `post` 단건 조회 `createQuery`로 교체한다(`post { state profile { ...PostAuthorProfile_profile } ...PostBody_post }`) — PROD-110 (PROD-93 의존)
- [ ] 6.2 프로필 게시글 목록 → 게시글 디테일 이동 링크를 추가한다 — PROD-111
