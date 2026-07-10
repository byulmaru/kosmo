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

## Expo/React Native 구현 (`apps/app`)

- 두 폰트는 **npm 패키지로 관리**한다(`pretendard`, `@sun-typeface/suit`, 둘 다 Variable). `apps/app/src/app/_layout.tsx`가 package의 Variable TTF를 `expo-font` `useFonts`로 로드하므로 Android/iOS/Web이 같은 asset을 bundle한다. 외부 CDN 런타임 의존과 git에 복제한 폰트 binary는 두지 않는다.
- app에서 사용하는 family name은 `SUIT`와 `Pretendard`다. package 경로나 내부 font filename을 component style에 직접 사용하지 않는다.
- React Native `Text`/`TextInput`은 CSS font 상속에 의존하지 않는다. 공용 primitive와 각 text style은 용도에 맞는 `fontFamily`를 명시한다.
  - UI, 버튼, 내비게이션, 라벨, heading: `fontFamily: 'SUIT'`
  - 포스트 본문, 긴 글 입력: `fontFamily: 'Pretendard'`
- font size/line height는 `apps/app/src/theme/tokens.ts`의 `typography` token을 사용한다. 화면에서 같은 Foundation 값을 raw number로 반복하지 않는다.
- React Native Web Storybook은 app과 같은 font loader/decorator를 사용해 production family name과 asset을 그대로 검증한다.
