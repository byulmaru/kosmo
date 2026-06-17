# 폰트 사용 규칙

| 용도                                 | 폰트                    |
| ------------------------------------ | ----------------------- |
| UI — 버튼, 네비게이션, 라벨, 헤딩 등 | **SUIT**                |
| 본문 — 포스트 내용, 긴 텍스트        | **Pretendard Variable** |

- 공식 브랜드 폰트로 지정된 것은 아니며 실사용 컨벤션이다.
- 새 컴포넌트/화면을 디자인하거나 구현할 때 텍스트 용도에 따라 위 규칙대로 폰트를 선택한다.
- Foundation 변수 컬렉션에 폰트 패밀리 변수가 없으므로 Figma에서는 폰트를 직접 지정한다.
- Figma에서는 SUIT/Pretendard 미설치로 각각 Inter / Noto Sans KR로 대치 표기한다. 구현 시에는 Inter→SUIT, Noto Sans KR→Pretendard로 매핑한다.

## Figma 작업 환경에서의 폰트 대치

브랜드 폰트인 **SUIT**(UI)와 **Pretendard Variable**(본문)은 현재 Figma 작업 환경에 설치되어 있지 않다. 해당 패밀리로 지정된 텍스트는 편집 시 "폰트를 불러올 수 없음" 오류가 난다. 그래서 Figma 디자인 작업에서는 다음 폰트로 대치한다.

| 용도 | 브랜드 폰트(스펙)   | Figma 작업 대치 폰트 |
| ---- | ------------------- | -------------------- |
| UI   | SUIT                | **Inter**            |
| 본문 | Pretendard Variable | **Noto Sans KR**     |

- 새 Figma 화면/컴포넌트는 위 대치 폰트로 만든다. 기존 화면도 대부분 Inter / Noto Sans KR로 작업돼 있다.
- 이는 **Figma 작업 환경 한정 대치**다. 코드·실서비스는 그대로 SUIT·Pretendard Variable을 사용하며 브랜드 결정은 바뀌지 않는다.
- 로고처럼 SUIT로 지정하려던 요소도 Figma에서는 Inter로 표기한다(로고 에셋 확정 전까지는 대문자 "K").

## 웹 구현 (apps/web)

- 두 폰트는 **npm 패키지로 관리**한다(`pretendard`, `@sun-typeface/suit`, 둘 다 Variable). 각 패키지가 제공하는 `@font-face` CSS를 `+layout.svelte`(앱)와 `.storybook/preview.ts`(Storybook)에서 import하면 Vite가 woff2를 번들해 자체 origin에서 제공한다(외부 CDN 런타임 의존 없음, git에 폰트 바이너리 미커밋). 패키지 버전은 `package.json`으로 관리한다.
- Tailwind v4 `@theme` 토큰:
  - `--font-sans` = `SUIT Variable` → 유틸 `font-sans`. 루트 레이아웃(`+layout.svelte`)이 `font-sans`를 쓰므로 **모든 UI 텍스트가 SUIT를 상속**한다(화면별 지정 불필요).
  - `--font-body` = `Pretendard Variable` → 유틸 `font-body` + CSS 변수 `var(--font-body)`.
- **본문에만 Pretendard를 적용**한다: `PostBody`는 `font-body` 유틸, `TipTapRenderer`·`TipTapEditor`는 `<style>`에서 `font-family: var(--font-body)`.
