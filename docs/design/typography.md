# 폰트 사용 규칙

| 용도                                 | 폰트                    |
| ------------------------------------ | ----------------------- |
| UI — 버튼, 네비게이션, 라벨, 헤딩 등 | **SUIT**                |
| 본문 — 포스트 내용, 긴 텍스트        | **Pretendard Variable** |

- 공식 브랜드 폰트로 지정된 것은 아니며 실사용 컨벤션이다.
- 새 컴포넌트/화면을 디자인하거나 구현할 때 텍스트 용도에 따라 위 규칙대로 폰트를 선택한다.
- `KOSMO Typography` 컬렉션의 `Production` mode는 SUIT/Pretendard, `MCP Preview` mode는 IBM Plex Sans KR/Noto Sans KR 대응을 사용한다.
- 역할별 size, weight, line-height와 12px 사용 경계는 [foundations.md](./foundations.md)를 따른다.

## Profile identity

`ProfileNameBlock`은 이름과 `relativeHandle`만 소유하고, 소비처는 아래 규격을 명시적으로 선택한다.
화면 폭에 따라 typography를 자동 축소하지 않는다.

| variant   | 이름                         | 핸들                      | 소비처                                        |
| --------- | ---------------------------- | ------------------------- | --------------------------------------------- |
| `default` | `UI/Label/L` — 16/24/600     | `UI/Copy/M` — 14/20/400   | 게시물·작성기·원문 출처·프로필 공개 범위 설정 |
| `compact` | `UI/Label/M` — 14/20/600     | `UI/Copy/S` — 12/15.6/400 | `ProfileListItem`, `FollowRequestListItem`    |
| `hero`    | `UI/Heading/M` — 24/27.6/700 | `UI/Copy/M` — 14/20/400   | `ProfileHero`                                 |

- `default`와 `compact`는 이름·핸들을 각각 한 줄로 말줄임하며, 필요한 경우 `href`로 identity 전체를 링크로 만든다.
- `hero`는 이름을 접근성 제목으로 노출하고 이름·핸들의 줄바꿈을 허용한다. identity 자체의 `href`는 받지 않는다.
- 모든 규격은 이름에 `foregroundPrimary`, 핸들에 `foregroundSecondary`를 사용한다. 게시물·작성기 등
  `default` 소비처와 FollowRequest도 legacy text 색상에서 semantic 색상으로 함께 전환한다.
- Avatar, bio, Follow action, 목록 전체의 링크 영역과 배치는 소비처가 계속 소유한다. 부모는 자식의 Relay fragment를
  spread하고 fragment ref를 그대로 전달한다.
- 이 세 규격의 코드 공용화는 소비처별 Figma typography를 유지하기 위한 계약이다. Figma의 NameBlock source는
  `default`에 대응하며, ListItem·FollowRequest·Hero의 identity는 별도 프레임·텍스트다. Figma에 세 variant가
  구성되었거나 해당 소비처가 NameBlock 인스턴스로 교체되었다는 뜻은 아니다.

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
- 이는 **MCP 작업 환경 한정 대치**다. 코드·실서비스와 Production 검수는 플랫폼별 runtime 로딩 규칙에 따라 SUIT·Pretendard family를 사용한다(아래 Expo/React Native 구현 참조).
- 로고처럼 SUIT로 지정하려던 임시 text node도 MCP에서는 IBM Plex Sans KR로 표기한다(로고 에셋 확정 전까지는 대문자 "K").

## Expo/React Native 구현 (`apps/app`)

- 두 폰트는 **npm 패키지로 관리**한다(`pretendard`, `@sun-typeface/suit`). `apps/app/src/app/_layout.tsx`는 iOS에서 필요한 static face만 `expo-font` `useFonts`로 로드하고, Android/Web에서는 package의 Variable TTF를 기존 consumer family name으로 로드한다. 외부 CDN 런타임 의존과 git에 복제한 폰트 binary는 두지 않는다.
- iOS loader의 static face key(`SUIT-Regular`, `SUIT-SemiBold`, `SUIT-Bold`, `SUIT-ExtraBold`, `Pretendard-Regular`)는 등록용 namespace이며 component가 사용하는 family name이 아니다. iOS의 `fontFamily`는 Android/Web과 동일하게 `SUIT` 또는 `Pretendard`를 사용한다. 필요한 weight만 static face로 등록해 iOS의 family/weight 선택을 보존한다.
- app에서 사용하는 family name은 `SUIT`와 `Pretendard`다. package 경로나 내부 font filename을 component style에 직접 사용하지 않는다.
- React Native `Text`/`TextInput`은 CSS font 상속에 의존하지 않는다. 공용 primitive와 각 text style은 용도에 맞는 `fontFamily`를 명시한다.
  - UI, 버튼, 내비게이션, 라벨, heading: `fontFamily: 'SUIT'`
  - 포스트 본문, 긴 글 입력: `fontFamily: 'Pretendard'`
- 새 구현은 `apps/app/src/theme/tokens.ts`의 역할 기반 `textStyles`를 사용한다. 기존 consumer는 DSN-21 이관 완료 전까지 deprecated `typography` 호환 alias를 사용할 수 있으며, 화면에서 같은 Foundation 값을 raw number로 반복하지 않는다.
- React Native Web Storybook은 전용 `@font-face` 설정으로 같은 npm package의 Variable WOFF2 asset을
  `SUIT`와 `Pretendard` family로 등록한다. Expo runtime의 `useFonts` loader는 사용하지 않지만,
  component의 production family name과 asset은 동일하게 유지한다.
