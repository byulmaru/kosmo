## Why

`docs/design/typography.md`는 UI=SUIT, 본문=Pretendard Variable 규칙을 문서화했지만, 웹 코드베이스에는 두 폰트가 로드돼 있지 않다. 루트 레이아웃이 전역 `font-sans`(Tailwind 기본 = 시스템 폰트)만 사용해, 모든 화면이 규칙과 다르게 시스템 폰트로 렌더된다. 루트 온보딩(PROD-142) 등 신규 화면을 디자인대로 구현하려면 폰트 적용이 선행돼야 한다.

## What Changes

- SUIT·Pretendard Variable을 **npm 패키지로 관리**한다(`@sun-typeface/suit`, `pretendard`). 각 패키지가 제공하는 `@font-face` CSS를 `+layout.svelte`와 `.storybook/preview.ts`에서 import하면 Vite가 woff2를 번들해 자체 origin에서 제공한다(외부 CDN 런타임 의존 없음, 폰트 바이너리를 repo에 커밋하지 않음).
- Tailwind `@theme`에 `--font-sans`(=SUIT, UI 기본)·`--font-body`(=Pretendard, 본문) 토큰을 추가한다. 루트 레이아웃이 `font-sans`를 쓰므로 모든 UI 텍스트가 SUIT를 상속한다.
- 게시글 본문 렌더러/입력(`PostBody`, `TipTapRenderer`, `TipTapEditor`, `PostListItem`)에 Pretendard(`font-body`/`var(--font-body)`)를 적용한다.
- `docs/design/typography.md`에 구현 방식을 반영한다.

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-platform`: 웹 런타임이 UI=SUIT, 본문=Pretendard Variable 타이포그래피 폰트를 자체 origin에서 제공한다(npm 패키지 번들).

## Impact

- `apps/web/package.json` devDependencies에 `@sun-typeface/suit`·`pretendard` 추가 (`pnpm-lock.yaml` 갱신)
- `apps/web/src/routes/+layout.svelte`, `apps/web/.storybook/preview.ts` (패키지 `@font-face` CSS import)
- `apps/web/src/routes/layout.css` (`--font-sans`·`--font-body` 토큰)
- `apps/web/src/lib/components/PostBody.svelte`, `TipTapRenderer.svelte`, `TipTapEditor.svelte`, `PostListItem.svelte` (본문 Pretendard 적용)
- `docs/design/typography.md` (구현 방식 반영)
- API·데이터 모델 영향 없음
