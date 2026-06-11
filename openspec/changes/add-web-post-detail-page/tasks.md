## 1. 라우트 · 레이아웃

- [ ] 1.1 `(tabs)/@[handle]/[postId]/+page@(tabs).svelte`를 추가해 `/@{handle}/{postId}` 접근을 가능하게 한다
- [ ] 1.2 `+page@(tabs)` 레이아웃 리셋으로 `@[handle]/+layout.svelte`의 `ProfileHero`를 건너뛰고 `(tabs)` 셸만 유지함을 확인한다

## 2. 게시글 표시 (더미)

- [ ] 2.1 PR #67의 `Post`/`PostContent` shape에 맞춘 로컬 더미 타입·상수를 한 곳에 정의한다
- [ ] 2.2 Plain Text 본문(`content.bodyText`)을 줄바꿈 보존으로 렌더하고 `content` null을 가드한다
- [ ] 2.3 작성자 placeholder(`getProfileInitial` 이니셜 + 표시 이름 + `@handle`)를 `/@{handle}`로 링크한다
- [ ] 2.4 작성 시각(`createdAt`)과 공개 범위(`visibility`) 메타라인을 표시한다
- [ ] 2.5 상단에 이전 화면으로 돌아가는 back 컨트롤을 둔다

## 3. 상태 처리

- [ ] 3.1 로딩 스켈레톤 + 스크린리더 안내를 표시한다
- [ ] 3.2 조회 오류 시 안내 + 다시 시도 동작을 제공한다
- [ ] 3.3 없는 게시글 시 인라인 빈 상태를 표시한다
- [ ] 3.4 삭제된 게시글(`state = DELETED`) 안내를 표시한다. 모든 상태에서 `(tabs)` 셸을 유지한다
- [ ] 3.5 분기 조건을 향후 `createQuery`의 `loading`/`error`/데이터 null/`state`에 1:1 매핑되도록 작성한다

## 4. 후속 교체 (같은 prod-89 브랜치, 블로커 머지 후)

- [ ] 4.1 더미 상수 → `post` 단건 조회 `createQuery`로 교체한다 (PROD-93 머지 후)
- [ ] 4.2 작성자 placeholder → `PostAuthorProfile` + `PostAuthorProfile_profile` fragment로 교체한다 (PROD-97 머지 후)
- [ ] 4.3 실데이터로 HEAD가 동작하면 Draft → Ready로 전환한다

## 5. 검증

- [ ] 5.1 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [ ] 5.2 `pnpm lint:eslint`, `pnpm lint:prettier` 통과를 확인한다
- [ ] 5.3 `openspec validate add-web-post-detail-page --strict` 통과를 확인한다
