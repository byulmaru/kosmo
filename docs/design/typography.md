# 폰트 사용 규칙

| 용도                                 | 폰트                    |
| ------------------------------------ | ----------------------- |
| UI — 버튼, 네비게이션, 라벨, 헤딩 등 | **SUIT**                |
| 본문 — 포스트 내용, 긴 텍스트        | **Pretendard Variable** |

- 공식 브랜드 폰트로 지정된 것은 아니며 실사용 컨벤션이다.
- 새 컴포넌트/화면을 디자인하거나 구현할 때 텍스트 용도에 따라 위 규칙대로 폰트를 선택한다.
- `KOSMO Typography` 컬렉션의 `Production` mode는 SUIT/Pretendard, `MCP Preview` mode는 IBM Plex Sans KR/Noto Sans KR 대응을 사용한다.
- 역할별 size, weight, line-height와 12px 사용 경계는 [foundations.md](./foundations.md)를 따른다.

## Figma MCP 작업 환경에서의 폰트 대치

**SUIT**(UI)와 **Pretendard Variable**(본문)은 현재 MCP 자동 편집 환경에서 직접 로드할 수 없다. MCP로 텍스트를 생성·수정하거나 스크린샷을 확인할 때는 한글 글리프와 폭을 우선해 다음 Preview 폰트로 대치한다.

| 용도 | Production 폰트     | MCP Preview 폰트     |
| ---- | ------------------- | -------------------- |
| UI   | SUIT                | **IBM Plex Sans KR** |
| 본문 | Pretendard Variable | **Noto Sans KR**     |

- MCP가 만든 새 화면/컴포넌트와 MCP 편집 중인 텍스트는 위 Preview 폰트를 사용한다.
- UI의 IBM Plex Sans KR은 100~600을 가능한 동일 weight로 대응하고, SUIT 700 이상은 IBM Plex Sans KR Bold로 축소한다.
- 본문의 Noto Sans KR은 Thin, Light, DemiLight, Regular, Medium, Bold, Black 중 가장 가까운 weight로 대응한다.
- 대치 과정에서는 font size, line-height, letter spacing token을 바꾸지 않는다.
- 이는 **MCP 작업 환경 한정 대치**다. 코드·실서비스와 Production 검수는 그대로 SUIT·Pretendard Variable을 사용한다.
- 로고처럼 SUIT로 지정하려던 임시 text node도 MCP에서는 IBM Plex Sans KR로 표기한다(로고 에셋 확정 전까지는 대문자 "K").

## Expo/React Native 구현 (`apps/app`)

- 두 폰트는 **npm 패키지로 관리**한다(`pretendard`, `@sun-typeface/suit`, 둘 다 Variable). `apps/app/src/app/_layout.tsx`가 package의 Variable TTF를 `expo-font` `useFonts`로 로드하므로 Android/iOS/Web이 같은 asset을 bundle한다. 외부 CDN 런타임 의존과 git에 복제한 폰트 binary는 두지 않는다.
- app에서 사용하는 family name은 `SUIT`와 `Pretendard`다. package 경로나 내부 font filename을 component style에 직접 사용하지 않는다.
- React Native `Text`/`TextInput`은 CSS font 상속에 의존하지 않는다. 공용 primitive와 각 text style은 용도에 맞는 `fontFamily`를 명시한다.
  - UI, 버튼, 내비게이션, 라벨, heading: `fontFamily: 'SUIT'`
  - 포스트 본문, 긴 글 입력: `fontFamily: 'Pretendard'`
- 새 구현은 `apps/app/src/theme/tokens.ts`의 역할 기반 `textStyles`를 사용한다. 기존 consumer는 DSN-21 이관 완료 전까지 deprecated `typography` 호환 alias를 사용할 수 있으며, 화면에서 같은 Foundation 값을 raw number로 반복하지 않는다.
- React Native Web Storybook은 전용 `@font-face` 설정으로 같은 npm package의 Variable WOFF2 asset을
  `SUIT`와 `Pretendard` family로 등록한다. Expo runtime의 `useFonts` loader는 사용하지 않지만,
  component의 production family name과 asset은 동일하게 유지한다.
