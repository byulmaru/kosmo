## 1. 폰트 패키지 추가

- [x] 1.1 `pnpm --filter @kosmo/web add -D @sun-typeface/suit pretendard` (Variable 폰트, `package.json`·`pnpm-lock.yaml` 갱신).

## 2. 폰트 로딩 + @theme (layout.css / +layout.svelte / preview.ts)

- [x] 2.1 `+layout.svelte`·`.storybook/preview.ts`에서 패키지 `@font-face` CSS import (`pretendard/dist/web/variable/pretendardvariable.css`, `@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css`).
- [x] 2.2 `layout.css` `@theme`에 `--font-sans`(=`SUIT Variable`)·`--font-body`(=`Pretendard Variable`) 토큰 + 폴백 스택.

## 3. 본문 Pretendard 적용

- [x] 3.1 `PostBody.svelte` 본문 `<p>`에 `font-body`.
- [x] 3.2 `PostListItem.svelte` 본문 미리보기 `<p>`에 `font-body`.
- [x] 3.3 `TipTapRenderer.svelte`·`TipTapEditor.svelte`에 `font-family: var(--font-body)`.

## 4. 문서

- [x] 4.1 `docs/design/typography.md`에 구현 방식(npm 패키지, import 위치, `font-sans`=SUIT, `font-body`=Pretendard) 반영.

## 5. 검증

- [x] 5.1 `pnpm --filter @kosmo/web check`·`build` 통과.
- [x] 5.2 빌드 산출물에 woff2가 번들되고(자체 origin) UI=SUIT·본문=Pretendard 렌더 확인.
- [x] 5.3 `pnpm exec openspec validate add-app-typography-fonts --strict` 통과.
