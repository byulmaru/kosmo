## Context

웹은 Tailwind CSS v4(CSS 기반, `@import 'tailwindcss'` + `@theme`)를 쓴다. 루트 레이아웃(`+layout.svelte`)은 `class="… font-sans"`만 적용하고, `apps/web`에 `@font-face`/font-family 정의가 없어 `font-sans`가 시스템 폰트로 떨어진다. 본문은 `PostBody`(plain text `<p>`), `PostListItem`(목록 본문 미리보기 `<p>`), `TipTapRenderer`/`TipTapEditor`가 담당한다. Storybook `preview.ts`는 `layout.css`를 import한다.

SUIT는 `@sun-typeface/suit`(Variable, family `SUIT Variable`), Pretendard는 `pretendard`(Variable, family `Pretendard Variable`)로 npm에 배포되며, 각 패키지가 `@font-face` CSS와 woff2를 함께 제공한다.

## Goals / Non-Goals

**Goals:**

- UI 텍스트(헤딩·라벨·버튼·내비 등)를 SUIT로, 게시글 본문을 Pretendard Variable로 렌더한다.
- 외부 CDN 런타임 의존 없이, 폰트 바이너리를 repo에 커밋하지 않고 제공한다.

**Non-Goals:**

- 폰트 크기/행간 토큰 정비(별도), 개별 화면의 폰트 외 리디자인.
- 동적 서브셋팅(추후 필요 시).

## Decisions

- **npm 패키지로 관리(static vendoring 대신)**: `@sun-typeface/suit`·`pretendard`를 devDependency로 추가하고 패키지의 `@font-face` CSS를 import한다. Vite가 woff2를 해시 자산으로 번들해 자체 origin에서 제공하므로 self-host 이점(런타임 CDN 비의존)을 유지하면서, 버전은 `package.json`으로 관리하고 폰트 바이너리는 git에 커밋하지 않는다. (두 폰트 모두 npm에 있어 메커니즘이 일관된다.)
- **import 위치**: 앱은 `+layout.svelte`, Storybook은 `preview.ts`에서 패키지 CSS를 import한다. 패키지 CSS의 상대 `url()`은 각 CSS 파일 기준으로 Vite가 정확히 rebase하므로 JS import 경로가 `@import` 인라인보다 안전하다.
- **`font-sans`→SUIT 전역 상속, 본문만 override**: `@theme`의 `--font-sans`를 SUIT로 두면 Tailwind v4 preflight의 `html { font-family: var(--default-font-family) }`(→ `--font-sans`)를 통해 포털 포함 문서 전체가 SUIT를 상속한다. 본문 컴포넌트에만 `font-body`(=Pretendard)를 적용해 예외를 둔다.

## Risks / Trade-offs

- [FOUT] → 패키지 `@font-face`의 `font-display: swap`으로 텍스트 즉시 표시 후 스왑.
- [패키지 CSS 경로 변동] → Variable CSS 경로(`pretendard/dist/web/variable/pretendardvariable.css`, `@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css`)는 메이저 버전 내 안정적이며 버전 핀으로 고정한다.

## Open Questions

(없음)
