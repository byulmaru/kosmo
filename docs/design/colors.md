# KOSMO 컬러 토큰 계약

KOSMO의 프로덕션 컬러는 Figma의 `KOSMO Primitive Color`와 `KOSMO Semantic Color` 컬렉션을 기준으로 한다. 새 디자인과 이관 완료 후 코드는 primitive 값이나 raw hex를 직접 소비하지 않고 semantic token을 사용한다.

- Figma: [`01 Color System · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1661-254)
- 컴포넌트 적용표: [`08 Component Usage Mapping`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1684-254)
- 적용 이슈: [DSN-4](https://linear.app/byulmaru/issue/DSN-4/kosmo-%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EC%83%89%EC%83%81-%ED%86%A0%ED%81%B0%ED%85%8C%EB%A7%88-%EB%94%94%EC%9E%90%EC%9D%B8-%EA%B3%84%EC%95%BD-%EC%A0%95%EB%8F%88)

## 계층과 이름

```text
Primitive Color
  -> Semantic Color (Light / Dark)
  -> Component state mapping
```

- `KOSMO Primitive Color`는 실제 색상 값과 alpha만 소유한다. UI에서 직접 선택하지 않는다.
- `KOSMO Semantic Color`는 배경, 전경, 경계, action, feedback, state와 overlay의 의미를 소유한다.
- 컴포넌트는 semantic token을 조합한다. 컴포넌트마다 같은 값을 다시 정의하지 않으며, 반복되는 고유 계약이 확인될 때만 component token을 추가한다.
- Light와 Dark는 동일한 semantic 이름을 사용하고 primitive alias만 교체한다.
- 모든 semantic variable은 Light/Dark 값을 모두 가지며 literal 값 없이 primitive를 alias한다.

## Primitive 팔레트 단계 수

Primitive 팔레트는 색상별 단계 수를 기계적으로 맞추지 않는다. 각 hue는 실제 semantic role, interaction state와 Light/Dark 대비 조합에 필요한 단계만 소유한다. 팔레트 열의 길이가 같은지는 품질 기준이 아니며, 사용처가 없는 보간 색상을 다른 hue와 개수를 맞추기 위해 추가하지 않는다.

- 새 단계는 연결할 semantic token과 실제 consumer, 목표 대비 조합이 함께 확인된 경우에만 추가한다.
- 기존 단계는 semantic alias와 활성 consumer가 없고 대비 검증에도 필요하지 않을 때만 제거한다.
- 같은 값이 여러 역할에 필요하면 primitive를 중복하지 않고 semantic token이 하나의 primitive를 alias한다.
- 제품 UI는 팔레트 단계 수와 관계없이 semantic token만 소비한다.
- Figma `01 Foundations`는 색상별 현재 단계와 용도를 그대로 보여주고, 단계 수 차이를 오류처럼 채우거나 숨기지 않는다.

Figma variable의 code syntax가 개발 target 이름이다.

| 플랫폼  | 형식                   | 예시                             |
| ------- | ---------------------- | -------------------------------- |
| Web     | CSS custom property    | `var(--color-background-canvas)` |
| Android | `KosmoColors` property | `KosmoColors.backgroundCanvas`   |
| iOS     | `KosmoColor` property  | `KosmoColor.backgroundCanvas`    |

## 브랜드 역할

- Yellow는 KOSMO의 유일한 Primary다. CTA, 핵심 선택과 primary action에 사용한다.
- Purple은 로고와 Info feedback에만 사용한다. Primary action이나 일반 링크에 재사용하지 않는다.
- Indigo는 본문 Link와 keyboard Focus에 사용한다.
- Ink `#1A1A1A`는 Yellow, Purple과 Tangerine의 `on-base` 전경이다.
- Success는 Green, Warning은 Tangerine, Danger는 Red를 사용한다.

## Light / Dark core tokens

| Semantic token               | Light     | Dark      | 용도                        |
| ---------------------------- | --------- | --------- | --------------------------- |
| `color/background/canvas`    | `#FFFFFF` | `#000000` | 앱의 최하단 배경            |
| `color/background/surface`   | `#FAFAFB` | `#141414` | 기본 제품 surface           |
| `color/background/elevated`  | `#FFFFFF` | `#262626` | modal, card 등 상승 표면    |
| `color/background/inverse`   | `#1A1A1A` | `#FAFAFB` | tooltip, badge 등 역상 표면 |
| `color/foreground/primary`   | `#1A1A1A` | `#E0E0E0` | 본문과 핵심 아이콘          |
| `color/foreground/secondary` | `#64646F` | `#A3A3A3` | 설명과 메타데이터           |
| `color/foreground/muted`     | `#71717A` | `#969696` | 비핵심 보조 정보            |
| `color/foreground/disabled`  | `#A5A5AF` | `#64646F` | 비활성 전경                 |
| `color/foreground/inverse`   | `#FAFAFB` | `#1A1A1A` | inverse 표면 위 전경        |
| `color/border/subtle`        | `#ECECF0` | `#303030` | divider와 약한 구분         |
| `color/border/default`       | `#DFDFE5` | `#383838` | 카드와 입력의 기본 경계     |
| `color/border/strong`        | `#A5A5AF` | `#71717A` | 분명한 구조 경계            |
| `color/border/focus`         | `#4F46E5` | `#A5B4FC` | keyboard focus 경계         |
| `color/border/disabled`      | `#F4F4F5` | `#262626` | 비활성 경계                 |

Dark `color/border/subtle`은 `background/elevated #262626` 위 divider가 표면과 같아지지 않도록 `ink/750 #303030`으로 분리한다.

Light의 route canvas는 순백색을 사용한다. 기본 입력과 내부 preview는 `neutral/0`을 참조하는 `background/surface`로 구분하고, 독립 modal·card·menu는 같은 순백색 위에 border 또는 elevation을 함께 사용한다. `fixed/white`는 Success/Danger `on-base`, fullscreen media와 mask처럼 테마 비종속 흰색이 필요한 경우에만 사용한다.

## Action tokens

### Primary Yellow

| Token                              | Light     | Dark      |
| ---------------------------------- | --------- | --------- |
| `color/action/primary/base`        | `#FFE597` | `#FFE597` |
| `color/action/primary/on-base`     | `#1A1A1A` | `#1A1A1A` |
| `color/action/primary/hover`       | `#F3C745` | `#F3C745` |
| `color/action/primary/pressed`     | `#DFAA17` | `#DFAA17` |
| `color/action/primary/subtle`      | `#FFF9E6` | `#3A331A` |
| `color/action/primary/on-subtle`   | `#1A1A1A` | `#FFE597` |
| `color/action/primary/disabled`    | `#F4F4F5` | `#262626` |
| `color/action/primary/on-disabled` | `#A5A5AF` | `#64646F` |

### Secondary action

Secondary Button은 중립 surface 역할을 직접 소비하지 않고 아래 action 역할을 사용한다. Light의 hover/pressed는 공용 state 값을 재사용하지만, Dark의 hover/pressed는 Button의 fill 교체 구현을 위해 opaque하게 미리 합성한 값을 사용한다. 공용 `color/state/hover`, `color/state/pressed`는 다른 중립 surface 위에 얹는 overlay layer로 유지한다.

| Token                            | 같은 값을 사용하는 기존 역할                           | 용도                       |
| -------------------------------- | ------------------------------------------------------ | -------------------------- |
| `color/action/secondary/base`    | `color/background/surface`                             | 기본 Secondary action 표면 |
| `color/action/secondary/on-base` | `color/foreground/primary`                             | label과 icon               |
| `color/action/secondary/border`  | `color/border/default`                                 | 기본 경계                  |
| `color/action/secondary/hover`   | `color/state/hover` (Light); opaque `#262626` (Dark)   | Button hover fill          |
| `color/action/secondary/pressed` | `color/state/pressed` (Light); opaque `#303030` (Dark) | Button pressed fill        |

Focus와 Disabled는 Secondary 전용 색상을 추가하지 않고 공용 `color/state/focus-ring`, `color/state/disabled-*`, `color/border/disabled`를 사용한다.

### Post action

| Token                        | Light               | Dark                | 용도                    |
| ---------------------------- | ------------------- | ------------------- | ----------------------- |
| `color/action/repost/base`   | `green/600 #16794A` | `green/500 #409667` | Repost hover와 selected |
| `color/action/reaction/base` | `#F97066`           | `#F97066`           | Reaction active와 hover |

Repost는 미선택 default에서 중립 `color/foreground/secondary`를 사용하고, hover glyph·background와
selected glyph·count에서 제품 action 의미색을 사용한다. 전역 `color/feedback/success/base`와 분리하며 Dark의
`green/500 #409667`은 canvas `#000000`에서 `5.78:1`, surface `#141414`에서 `5.07:1` 대비를
유지한다. 전역 Success는 Light·Dark 모두 기존 `green/600 #16794A`를 유지한다.

### Link Indigo

| Token                       | Light     | Dark      |
| --------------------------- | --------- | --------- |
| `color/action/link/base`    | `#4F46E5` | `#A5B4FC` |
| `color/action/link/hover`   | `#4338CA` | `#C7D2FE` |
| `color/action/link/pressed` | `#3730A3` | `#818CF8` |

클릭 가능한 본문 텍스트만 Link token을 사용한다. Info Purple은 정보 상태를 나타내며 링크처럼 보이게 사용하지 않는다.

## Feedback tokens

각 feedback 역할은 `base/on-base`와 `subtle/on-subtle/border`를 한 세트로 사용한다.

| 역할    | Base / on-base        | Light subtle / on-subtle | Dark subtle / on-subtle | Border Light / Dark   |
| ------- | --------------------- | ------------------------ | ----------------------- | --------------------- |
| Info    | `#8B7DEA` / `#1A1A1A` | `#F1EEFF` / `#4C3AAE`    | `#2F2858` / `#CFC8FF`   | `#8477DE` / `#CFC8FF` |
| Success | `#16794A` / `#FFFFFF` | `#DCFCE7` / `#14532D`    | `#123D26` / `#A6F4C5`   | `#16794A` / `#A6F4C5` |
| Warning | `#E97B35` / `#1A1A1A` | `#FFF2E8` / `#743405`    | `#4A280D` / `#FFD0A3`   | `#CF6D2F` / `#FFD0A3` |
| Danger  | `#B42318` / `#FFFFFF` | `#FEE4E2` / `#7A271A`    | `#4A1714` / `#FECDCA`   | `#B42318` / `#FECDCA` |

Light Info와 Warning border는 base 색을 그대로 재사용하지 않는다. 각각 `purple/600`과 `tangerine/600`을 사용해 paired subtle 및 기본 surface와 `3:1` 이상 대비를 유지한다.

## Interaction state와 overlay

| Token                             | Light     | Dark      | 규칙                                              |
| --------------------------------- | --------- | --------- | ------------------------------------------------- |
| `color/state/hover`               | black 4%  | white 8%  | 중립 surface 위에 얹는 공용 hover overlay layer   |
| `color/state/pressed`             | black 8%  | white 12% | 중립 surface 위에 얹는 공용 pressed overlay layer |
| `color/state/selected-surface`    | `#FFF9E6` | `#3A331A` | 선택된 행과 option 표면                           |
| `color/state/selected-border`     | `#AE8512` | `#FFE597` | 선택 상태 경계                                    |
| `color/state/focus-ring`          | `#4F46E5` | `#A5B4FC` | keyboard focus ring                               |
| `color/state/disabled-surface`    | `#F4F4F5` | `#262626` | 공용 disabled surface                             |
| `color/state/disabled-foreground` | `#A5A5AF` | `#64646F` | 공용 disabled foreground                          |
| `color/overlay/scrim`             | black 45% | black 45% | modal, sheet와 action menu의 표준 scrim           |

Secondary action의 Dark hover/pressed처럼 Button fill을 교체하는 opaque action token과, 공용 중립 surface 위에 얹는 state overlay를 서로 대체하지 않는다. Focus와 Selected도 서로 대체하지 않는다. 두 상태가 동시에 존재하면 독립적으로 표현하며 `focused`, `selected`, `disabled` 같은 접근성 state를 색상과 함께 제공한다.

## 대비 계약

- 일반 크기 본문과 Link는 WCAG AA `4.5:1` 이상을 유지한다.
- focus ring과 정보를 전달하는 control boundary는 인접 표면과 `3:1` 이상을 유지한다.
- `border/default`와 `border/subtle`은 장식적 구분선이며 상태나 클릭 가능성을 단독으로 전달하지 않는다.
- Disabled는 색상만으로 상태를 전달하지 않는다.

| 조합                            |      대비 |
| ------------------------------- | --------: |
| Primary Yellow / Ink            | `14.01:1` |
| Info Purple / Ink               |  `5.15:1` |
| Success Green / White           |  `5.43:1` |
| Warning Tangerine / Ink         |  `6.09:1` |
| Danger Red / White              |  `6.57:1` |
| Link Light / Surface            |  `6.03:1` |
| Link Dark / Canvas              | `10.53:1` |
| Light Muted / Canvas            |  `4.83:1` |
| Dark Muted / Elevated           |  `5.12:1` |
| Dark Focus / Elevated           |  `7.59:1` |
| Dark Strong Border / Surface    |  `3.81:1` |
| Dark Primary / Canvas           | `15.91:1` |
| Light Selected Border / Surface |  `3.24:1` |
| Light Info Border / Subtle      |  `3.24:1` |
| Light Warning Border / Subtle   |  `3.25:1` |
| Light Warning Border / Surface  |  `3.42:1` |
| Dark Repost / Canvas            |  `5.78:1` |
| Dark Repost / Surface           |  `5.07:1` |

## Component usage mapping

Figma의 [`08 Component Usage Mapping`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1684-254)이 화면과 공용 컴포넌트의 적용 source다.

- Button은 `action/primary/*`, `action/secondary/*`, feedback `base/on-base`, disabled pair를 사용한다. Focus는 fill을 교체하지 않고 tone별 현재 fill을 유지한 채 `state/focus-ring`을 추가한다.
- TextField는 `background/surface`, foreground hierarchy, `border/default/focus`와 feedback border를 사용한다.
- route body와 loading·empty state host는 `background/canvas` 하나의 기본 평면으로 본다. `PageHeader` 같은 공통 header chrome도 같은 canvas를 사용하고 `border/subtle`, sticky 위치와 필요할 때의 elevation effect로만 구조를 구분한다. Header가 있다는 이유로 아래 본문이나 state를 `background/surface`로 올리지 않는다.
- 연속 피드와 목록도 같은 canvas 평면을 이어 쓴다. 목록 container가 canvas를 소유하고 `PostListItem`·`PostLayout` 같은 post row root는 별도 fill 없이 상속하며 `border/subtle`로 구분한다. 각 row에 `background/surface`나 `background/elevated`를 반복 적용하지 않는다.
- post 내부의 일반 link preview처럼 resting surface가 필요한 영역은 `background/surface`, modal·menu·독립 floating card는 `background/elevated`를 사용한다. direct Quote Source preview는 예외적으로 resting fill 없이 주변 Post background를 그대로 보이고 semantic border로만 경계를 구분한다. Web의 interactive Quote Source preview만 pointer hover 동안 root 전체에 `state/hover` overlay를 사용하며, Native와 `interactive=false` preview에는 이 hover 표현을 투영하지 않는다.
- Modal, Sheet와 Menu는 `background/elevated`, `border/default`, `overlay/scrim`을 사용한다. Fullscreen media는 이 표준 scrim에서 제외한다.
- Toast는 Info/Success/Warning/Danger 중 의미에 맞는 tone을 반드시 명시한다. 각 tone은 semantic feedback `subtle`·`on-subtle` pair와 `base`를 사용해 4px left rail을 둔다. [PROD-877](https://linear.app/byulmaru/issue/PROD-877)은 [PROD-775](https://linear.app/byulmaru/issue/PROD-775)의 Default inverse 부분을 대체하므로 tone 없는 fallback은 제공하지 않는다.
- StateView root는 fill을 갖지 않고 host 평면을 상속한다. Route loading·empty·retry는 canvas 위에 두고, alert만 feedback subtle block을 사용할 수 있다. 이미 경계가 있는 component 내부 StateView는 그 component의 surface를 상속하되 스스로 surface를 선택하지 않는다.
- StateView의 action은 현재 state에서 제공하는 단일 retry·복귀 행동이므로 Button의 primary tone을 사용한다. 저장·생성 같은 화면별 action은 StateView 밖에서 해당 consumer가 소유한다.
- Loading은 별도 의미색을 만들지 않고 현재 surface의 foreground 또는 action의 `on-base`를 사용한다. 진행 상태는 색상 외 접근성 정보로 함께 제공한다.

## Legacy와 개발 token 이관

기존 Figma Components/Screens는 `[Legacy] Color`에 바인딩돼 있다. DSN-4에서는 아래 대응과 분기 규칙을 고정한다. 실제 Figma 재바인딩은 DSN-13, `tokens.ts`·`ThemeProvider`·공용 primitive는 DSN-19, route·shell·domain consumer의 개별 이관 slice는 DSN-21 또는 이미 연결된 Product 이슈가 소유한다. PROD-812는 이 결과와 남은 inventory를 인수해 프로덕션 전체 Dark 활성화 gate와 통합 검증을 닫는다.

| Legacy Figma / 현재 코드             | Production semantic                                                      | 이관 규칙                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `bg` / `background`                  | `color/background/canvas`                                                | 앱·route·header·state·feed의 기본 평면                                 |
| `surface`                            | `color/background/surface`                                               | 입력·preview 등 명시적 경계 내부                                       |
| `card`                               | `color/background/surface` 또는 `color/background/elevated`              | 연속 post row 제외; surface/elevated 문맥 분리                         |
| `textPrimary` / `text`               | `color/foreground/primary`                                               | 핵심 텍스트와 아이콘                                                   |
| `textSecondary`                      | `color/foreground/secondary` 또는 `color/foreground/muted`               | 설명과 비핵심 정보를 분리                                              |
| `border`                             | `color/border/default`, `color/border/subtle` 또는 `color/border/strong` | 역할별 강도를 분리                                                     |
| `divider`                            | `color/border/subtle`                                                    | 이어지는 콘텐츠 구분                                                   |
| `primary`                            | `color/action/primary/base`                                              | focus와 selected 역할을 분리                                           |
| `primaryHover`                       | `color/action/primary/hover`                                             | Primary hover에만 사용                                                 |
| `primarySubtle`                      | `color/action/primary/subtle`                                            | 낮은 강조 surface                                                      |
| `selectedSurface` / `selectedBorder` | `color/state/selected-*`                                                 | 선택 상태 pair                                                         |
| `focus`                              | `color/border/focus`, `color/state/focus-ring`                           | 경계와 ring을 component 계약에 따라 사용                               |
| `danger`                             | `color/feedback/danger/*`                                                | base, foreground, border와 subtle pair로 분리                          |
| `accent`                             | 직접 대응 없음                                                           | Toast와 transient state를 실제 Info/Success/Warning/Danger 의미로 분리 |
| `more` / `More`                      | `color/action/link/base`                                                 | 실제 클릭 가능한 본문 링크일 때만 이관                                 |
| raw modal backdrop                   | `color/overlay/scrim`                                                    | fullscreen media는 예외 유지                                           |

Repost는 `color/action/repost/base`, Reaction은 `color/action/reaction/base`로 승인되었다. Bookmark, Medal과 profile gradient는 제품 의미가 승인될 때까지 기존 표현을 유지하고 component contract 후보로 기록한다.

### 이관 소유권

- **DSN-19:** production semantic token 코드, runtime theme selector와 Button·TextField·ModalSheet·ActionMenu·ToastProvider·StateView 등 공용 primitive를 이관한다.
- **DSN-21 / 연결된 Product 이슈:** route·shell·domain call-site가 공용 token과 primitive를 소비하도록 이관하고, 화면별 예외를 닫는다. 별도 제품 의미 결정이 필요한 consumer는 연결된 Product 이슈로 분리하되, 이슈가 연결되기 전까지 DSN-21 inventory에 남긴다.
- **PROD-812:** DSN-19와 DSN-21/연결 Product 이슈의 완료 결과를 재사용하고, 남은 consumer 이관·예외 종결과 지원 플랫폼의 대표 Light/Dark 화면·주요 interaction state 통합 검증을 소유한다. 이 범위가 완료되기 전에는 System/Dark 사용자 선택을 활성화하지 않는다.
- **DSN-13:** DSN-19와 DSN-21/Product 구현이 확정된 뒤 Figma Components/Screens를 Production Semantic Color로 재바인딩하고 최종 mapping evidence를 갱신한다.

### 현재 raw·legacy consumer inventory

아래 목록은 `apps/app/src`의 활성 코드와 Native system theme에 영향을 주는 `apps/app/app.config.ts`에서 확인한 migration 입력이다. 테스트 fixture와 Storybook assertion의 예시 색상값은 구현 결과에 맞춰 해당 이슈에서 갱신하며 이 표의 별도 consumer로 세지 않는다.

- **DSN-21 feed plane slice:** `shell/UniversalShell.tsx` root·center plane, `PageHeader.tsx`, `bookmark/BookmarkList.tsx`, `post/PostList.tsx`, `post/PostListItem.tsx`, `post/PostLayout.tsx`, `post/PostThreadLayout.tsx`, `post/PostSourcePresentationView.tsx`의 legacy background·card·border·divider를 분리한다. Route·header·loading·empty host와 연속 feed는 canvas, post·thread row는 no fill/inherit + `border/subtle`, 내부 preview는 `background/surface` + `border/default`를 사용하며 feed·row에는 elevated를 사용하지 않는다.

| Consumer                                                                                                                                                                         | 현재 표현                                                                                      | 판정            | 목표 token·규칙                                                                              | 후속 소유                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `theme/tokens.ts`, `ThemeProvider.tsx`                                                                                                                                           | Production semantic Light/Dark와 명시적 selector API; 앱 기본값은 Light                        | 완료·호환       | legacy flat key는 DSN-21 consumer 이관 동안만 compatibility alias로 유지                     | DSN-19 완료, alias 제거는 DSN-21 이후       |
| `apps/app/app.config.ts`                                                                                                                                                         | Expo `userInterfaceStyle: 'light'` 고정                                                        | 후속            | `automatic`으로 이관하고 Native rebuild 후 OS Light/Dark의 `시스템` 전환 검증                | PROD-812                                    |
| `theme/tokens.ts`의 공용 `shadow`                                                                                                                                                | named Light/Dark elevation과 deprecated raw fallback                                           | 완료·호환       | 공용 primitive는 named elevation을 사용하고 기존 route/domain import만 fallback 유지         | DSN-19 완료, fallback 제거는 DSN-21 이후    |
| `ui/Button.tsx`                                                                                                                                                                  | Danger `base/on-base`와 disabled pair                                                          | 완료            | `color/feedback/danger/*`, `color/state/disabled-*`                                          | DSN-19                                      |
| `ui/ModalSheet.tsx`, `ui/ActionMenu.tsx`                                                                                                                                         | semantic elevated surface, border와 표준 scrim                                                 | 완료            | `color/background/elevated`, `color/border/default`, `color/overlay/scrim`                   | DSN-19                                      |
| `shell/UniversalShell.tsx`                                                                                                                                                       | `theme.overlayScrim` backdrop + named elevation                                                | 완료            | `color/overlay/scrim` + `elevation.overlay`                                                  | DSN-21                                      |
| `feedback/FeedbackOverlay.tsx`, `post/ReplyComposerSurface.tsx`                                                                                                                  | `theme.overlayScrim` backdrop                                                                  | 완료            | `color/overlay/scrim`                                                                        | PROD-750                                    |
| `post/PostComposer.tsx`, `post/PostDeletionAction.tsx`, `profile/ProfileEditDiscardDialog.tsx`, `reaction/ReactionProfilesModal.tsx`, `shell/ProfileSwitcher.tsx`                | `theme.overlayScrim` backdrop                                                                  | 완료            | `color/overlay/scrim`                                                                        | PROD-750                                    |
| `shell/SidebarNavigation.tsx`, `shell/shellLayout.ts`                                                                                                                            | Primary icon과 ProfileSwitcher 편집 action foreground `#111111`                                | 교체            | `color/action/primary/on-base`                                                               | DSN-21                                      |
| `post/PostMediaViewer.tsx`                                                                                                                                                       | fixed black/white, black 55%·92% overlay, retry border `#777777`                               | 예외            | Fullscreen fixed-black surface의 고정색·overlay와 theme 비종속 retry boundary 유지           | DSN-21 예외 검증                            |
| `post/PostComposerMediaControls.tsx`, `profile/ProfileEditImageFields.tsx`                                                                                                       | `colors.light/dark` 직접 참조로 media mask 전경·배경 구성                                      | 예외            | theme 전환과 무관한 fixed black/white를 유지하고 직접 Light/Dark theme 참조는 제거           | DSN-21                                      |
| `shell/ProfileSwitcher.tsx`                                                                                                                                                      | raw neutral profile gradient                                                                   | 후속            | 제품 의미 승인 전 유지, profile component token 후보                                         | DSN-21 또는 연결된 Product 이슈             |
| `post/PostComposer.tsx`, `post/PostDeletionAction.tsx`, `feedback/FeedbackOverlay.tsx`, `post/ReplyComposerSurface.tsx`, `post/ReactionPopover.tsx`, `shell/ProfileSwitcher.tsx` | `elevation.floating` / `elevation.overlay`                                                     | 완료 (PROD-750) | Anchored Web menu·popover는 `elevation.floating`, modal·Native surface는 `elevation.overlay` | PROD-750                                    |
| `ui/ToastProvider.tsx`                                                                                                                                                           | Info/Success/Warning/Danger tone 필수, feedback subtle/on-subtle pair와 4px feedback base rail | 완료            | 호출부가 의미에 맞는 tone을 명시하고 semantic feedback pair와 feedback base rail 사용        | PROD-877 (PROD-775 Default inverse 대체)    |
| `shell/UnreadDot.tsx`, `notification/NotificationListItem.tsx`                                                                                                                   | `accent`, Primary와 Primary Subtle을 unread 의미로 재사용                                      | 후속            | unread 전용 semantic 역할 승인 전 legacy 표현 유지                                           | DSN-21; 제품 의미 결정 시 Product 이슈 연결 |
| `post/PostActionBar.tsx`                                                                                                                                                         | Repost·Reaction 등 제품 action 의미색                                                          | 부분 완료       | Repost는 `color/action/repost/base`, Reaction은 `color/action/reaction/base`; Bookmark 후속  | PROD-866; Bookmark는 연결된 Product 이슈    |

PROD-750 scrim migration 대상은 `theme.overlayScrim`을 공통 backdrop으로 사용한다. Named elevation migration 대상은 기존 raw·legacy shadow가 있던 `PostComposer`, `PostDeletionAction`, `FeedbackOverlay`, `ReplyComposerSurface`, `ReactionPopover`, `ProfileSwitcher`이며, anchored Web menu·popover는 `elevation.floating`, modal·Native surface는 `elevation.overlay`를 사용한다. `ProfileEditDiscardDialog`와 `ReactionProfilesModal`은 기존 raw shadow가 없어 scrim만 이관했다. `UniversalShell`의 drawer는 DSN-21에서 이미 `theme.overlayScrim`과 `elevation.overlay`를 사용한다. `shell/ProfileSwitcher.tsx`의 `avatarShadow`는 프로필 이미지의 깊이 표현이므로 유지하고, `post/PostMediaViewer.tsx`의 fixed black/white와 fullscreen overlay는 테마 종속 표준 scrim·elevation에서 제외되는 예외다.

- Scrim 적용 대상: `post/PostDeletionAction.tsx`, `post/PostComposer.tsx`, `profile/ProfileEditDiscardDialog.tsx`, `feedback/FeedbackOverlay.tsx`, `post/ReplyComposerSurface.tsx`, `reaction/ReactionProfilesModal.tsx`, `shell/ProfileSwitcher.tsx`.
- Elevation 적용 대상: `post/PostComposer.tsx`, `post/PostDeletionAction.tsx`, `feedback/FeedbackOverlay.tsx`, `post/ReplyComposerSurface.tsx`, `post/ReactionPopover.tsx`, `shell/ProfileSwitcher.tsx`.

## Runtime theme 전략

Figma와 semantic contract는 Light/Dark를 모두 production 값으로 제공한다. `ThemeProvider`는 명시적 Light/Dark selector API를 제공하고 공용 primitive는 선택된 semantic mode를 소비한다. 앱의 `AppProviders`는 아직 Light를 명시적으로 공급한다. 프로덕션 전체 Dark 활성화 gate는 PROD-812가 DSN-21 또는 연결된 Product 이슈의 남은 route·shell·domain consumer를 semantic token으로 이관하거나 위 inventory의 예외로 닫고, 지원 플랫폼의 대표 화면과 주요 interaction state 검증까지 완료한 뒤 닫는다.

- 공용 primitive가 semantic foreground pair와 interaction state를 소비한다.
- DSN-19의 공용 primitive raw 값과 DSN-21/Product의 route·shell·domain raw 값이 각각 이관되거나 위 inventory의 예외로 남는다.
- DSN-19 Storybook의 공용 primitive Light/Dark·핵심 state와 DSN-21/Product의 기존 route·shell consumer 이관 증거를 재사용하고, PROD-812가 남은 inventory 종결과 지원 플랫폼의 대표 theme 전환을 통합 검증한다.
- PROD-812는 resolved theme를 Native `StatusBar` foreground style과 Web `theme-color`에도 반영하고, Light OS에서 명시적 Dark, Dark OS에서 명시적 Light, `시스템` 선택 중 OS mode 전환을 지원 플랫폼별로 검증한다.
- PROD-812는 Expo `userInterfaceStyle`을 `automatic`으로 이관한 Native rebuild에서 Android/iOS OS Light/Dark 전환이 `시스템` resolved theme에 반영되는지 검증한다.
- Web 자동 대비와 실제 Android/iOS runtime QA를 서로 다른 증거로 기록한다.

## 예외와 금지

- Fullscreen media의 fixed black/white는 허용한다.
- Fullscreen media overlay `0.55–0.92`는 표준 scrim으로 강제 통일하지 않는다.
- Repost와 Reaction은 승인된 action semantic을 사용한다. Bookmark 의미색은 제품 의미 승인 전 변경하지 않는다.
- Medal과 profile gradient는 component token 후보이며 raw gradient의 일반 사용 근거가 아니다.
- 신규 raw color, gradient와 backdrop 추가는 금지한다. semantic token이 없으면 계약을 먼저 갱신하거나 예외를 문서화한다.
- `[Legacy] Color`에 새 binding을 추가하지 않는다.
