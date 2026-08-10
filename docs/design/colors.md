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
| `color/background/canvas`    | `#F7F7F8` | `#18181B` | 앱의 최하단 배경            |
| `color/background/surface`   | `#F8F8FA` | `#222226` | 기본 제품 surface           |
| `color/background/elevated`  | `#FAFAFB` | `#2B2B31` | modal, card 등 상승 표면    |
| `color/background/inverse`   | `#1A1A1A` | `#FAFAFB` | tooltip, badge 등 역상 표면 |
| `color/foreground/primary`   | `#1A1A1A` | `#F4F4F5` | 본문과 핵심 아이콘          |
| `color/foreground/secondary` | `#64646F` | `#A5A5AF` | 설명과 메타데이터           |
| `color/foreground/muted`     | `#71717A` | `#9898A2` | 비핵심 보조 정보            |
| `color/foreground/disabled`  | `#A5A5AF` | `#64646F` | 비활성 전경                 |
| `color/foreground/inverse`   | `#FAFAFB` | `#1A1A1A` | inverse 표면 위 전경        |
| `color/border/subtle`        | `#ECECF0` | `#34343A` | divider와 약한 구분         |
| `color/border/default`       | `#DFDFE5` | `#44444C` | 카드와 입력의 기본 경계     |
| `color/border/strong`        | `#A5A5AF` | `#71717A` | 분명한 구조 경계            |
| `color/border/focus`         | `#4F46E5` | `#A5B4FC` | keyboard focus 경계         |
| `color/border/disabled`      | `#F4F4F5` | `#2B2B31` | 비활성 경계                 |

Light의 넓은 UI surface에는 순백색을 사용하지 않는다. `fixed/white`의 `#FFFFFF`는 Success/Danger `on-base`, fullscreen media와 mask처럼 테마 비종속 흰색이 필요한 경우에만 사용한다.

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
| `color/action/primary/disabled`    | `#F4F4F5` | `#2B2B31` |
| `color/action/primary/on-disabled` | `#A5A5AF` | `#64646F` |

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

| Token                             | Light     | Dark      | 규칙                                    |
| --------------------------------- | --------- | --------- | --------------------------------------- |
| `color/state/hover`               | black 4%  | white 8%  | 중립 surface hover layer                |
| `color/state/pressed`             | black 8%  | white 12% | 중립 surface pressed layer              |
| `color/state/selected-surface`    | `#FFF9E6` | `#3A331A` | 선택된 행과 option 표면                 |
| `color/state/selected-border`     | `#AE8512` | `#FFE597` | 선택 상태 경계                          |
| `color/state/focus-ring`          | `#4F46E5` | `#A5B4FC` | keyboard focus ring                     |
| `color/state/disabled-surface`    | `#F4F4F5` | `#2B2B31` | 공용 disabled surface                   |
| `color/state/disabled-foreground` | `#A5A5AF` | `#64646F` | 공용 disabled foreground                |
| `color/overlay/scrim`             | black 45% | black 45% | modal, sheet와 action menu의 표준 scrim |

Focus와 Selected를 서로 대체하지 않는다. 두 상태가 동시에 존재하면 독립적으로 표현하며 `focused`, `selected`, `disabled` 같은 접근성 state를 색상과 함께 제공한다.

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
| Link Light / Surface            |  `5.93:1` |
| Link Dark / Canvas              |  `8.89:1` |
| Light Muted / Canvas            |  `4.51:1` |
| Dark Muted / Elevated           |  `4.92:1` |
| Dark Focus / Elevated           |  `7.06:1` |
| Dark Strong Border / Surface    |  `3.28:1` |
| Dark Primary / Canvas           | `14.26:1` |
| Light Selected Border / Surface |  `3.24:1` |
| Light Info Border / Subtle      |  `3.24:1` |
| Light Warning Border / Subtle   |  `3.25:1` |
| Light Warning Border / Surface  |  `3.37:1` |

## Component usage mapping

Figma의 [`08 Component Usage Mapping`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1684-254)이 화면과 공용 컴포넌트의 적용 source다.

- Button은 `action/primary/*`, feedback `base/on-base`, disabled pair를 사용한다.
- TextField는 `background/surface`, foreground hierarchy, `border/default/focus`와 feedback border를 사용한다.
- Modal, Sheet와 Menu는 `background/elevated`, `border/default`, `overlay/scrim`을 사용한다. Fullscreen media는 이 표준 scrim에서 제외한다.
- Toast와 inline feedback은 Info/Success/Warning/Danger pair 중 실제 의미를 선택한다.
- StateView는 canvas 또는 surface, foreground hierarchy, action과 feedback pair를 조합한다.
- Loading은 별도 의미색을 만들지 않고 현재 surface의 foreground 또는 action의 `on-base`를 사용한다. 진행 상태는 색상 외 접근성 정보로 함께 제공한다.

## Legacy와 개발 token 이관

기존 Figma Components/Screens는 `[Legacy] Color`에 바인딩돼 있다. DSN-4에서는 아래 대응과 분기 규칙을 고정한다. 실제 Figma 재바인딩은 DSN-13, `tokens.ts`·`ThemeProvider`·공용 primitive는 DSN-19, route·shell·domain consumer는 DSN-21 또는 이미 연결된 Product 이슈가 소유한다.

| Legacy Figma / 현재 코드             | Production semantic                                                      | 이관 규칙                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `bg` / `background`                  | `color/background/canvas`                                                | 앱 최하단 배경                                                         |
| `surface`                            | `color/background/surface`                                               | 기본 product surface                                                   |
| `card`                               | `color/background/surface` 또는 `color/background/elevated`              | 입력 내부와 독립 카드를 문맥별로 분리                                  |
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

`like`, Repost, Bookmark, Medal과 profile gradient는 제품 의미가 승인될 때까지 기존 표현을 유지하고 component contract 후보로 기록한다.

### 이관 소유권

- **DSN-19:** production semantic token 코드, runtime theme selector와 Button·TextField·ModalSheet·ActionMenu·ToastProvider·StateView 등 공용 primitive를 이관한다.
- **DSN-21 / 연결된 Product 이슈:** route·shell·domain call-site가 공용 token과 primitive를 소비하도록 이관하고, 화면별 예외를 닫는다. 별도 제품 의미 결정이 필요한 consumer는 연결된 Product 이슈로 분리하되, 이슈가 연결되기 전까지 DSN-21 inventory에 남긴다.
- **DSN-13:** DSN-19와 DSN-21/Product 구현이 확정된 뒤 Figma Components/Screens를 Production Semantic Color로 재바인딩하고 최종 mapping evidence를 갱신한다.

### 현재 raw·legacy consumer inventory

아래 목록은 `apps/app/src`의 활성 코드에서 확인한 migration 입력이다. 테스트 fixture와 Storybook assertion의 예시 색상값은 구현 결과에 맞춰 해당 이슈에서 갱신하며 이 표의 별도 consumer로 세지 않는다.

| Consumer                                                                                                                                                          | 현재 표현                                                 | 판정 | 목표 token·규칙                                                                            | 후속 소유                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `theme/tokens.ts`, `ThemeProvider.tsx`                                                                                                                            | flat Light/Dark 값, runtime은 Light 고정                  | 교체 | Production semantic token과 runtime selector API                                           | DSN-19                                      |
| `ui/Button.tsx`                                                                                                                                                   | Danger foreground `#ffffff`                               | 교체 | `color/feedback/danger/on-base`                                                            | DSN-19                                      |
| `ui/ModalSheet.tsx`, `ui/ActionMenu.tsx`                                                                                                                          | black 40% backdrop                                        | 교체 | `color/overlay/scrim`                                                                      | DSN-19                                      |
| `shell/UniversalShell.tsx`                                                                                                                                        | black 35% drawer backdrop                                 | 교체 | `color/overlay/scrim`                                                                      | DSN-21                                      |
| `feedback/FeedbackOverlay.tsx`, `post/ReplyComposerSurface.tsx`                                                                                                   | black 48% backdrop                                        | 교체 | `color/overlay/scrim`                                                                      | DSN-21                                      |
| `post/PostComposer.tsx`, `post/PostDeletionAction.tsx`, `profile/ProfileEditDiscardDialog.tsx`, `reaction/ReactionProfilesModal.tsx`, `shell/ProfileSwitcher.tsx` | black 40% modal backdrop                                  | 교체 | `color/overlay/scrim`                                                                      | DSN-21                                      |
| `shell/SidebarNavigation.tsx`                                                                                                                                     | Primary icon foreground `#111111`                         | 교체 | `color/action/primary/on-base`                                                             | DSN-21                                      |
| `post/PostMediaViewer.tsx`                                                                                                                                        | fixed black/white, black 55%·92% media overlay            | 예외 | Fullscreen media 고정색과 `0.55–0.92` overlay 유지                                         | DSN-21 예외 검증                            |
| `post/PostComposerMediaControls.tsx`, `profile/ProfileEditImageFields.tsx`                                                                                        | `colors.light/dark` 직접 참조로 media mask 전경·배경 구성 | 예외 | theme 전환과 무관한 fixed black/white를 유지하고 직접 Light/Dark theme 참조는 제거         | DSN-21                                      |
| `shell/ProfileSwitcher.tsx`                                                                                                                                       | raw neutral profile gradient                              | 후속 | 제품 의미 승인 전 유지, profile component token 후보                                       | DSN-21 또는 연결된 Product 이슈             |
| `post/PostComposer.tsx`, `shell/ProfileSwitcher.tsx`, `shell/UniversalShell.tsx`, `ui/ActionMenu.tsx`                                                             | raw rgba box shadow                                       | 유지 | DSN-14 elevation 계약을 적용하며 shared primitive는 DSN-19, shell/domain은 DSN-21에서 이관 | DSN-14 → DSN-19/21                          |
| `ui/ToastProvider.tsx`                                                                                                                                            | `accent` background와 일반 background foreground          | 교체 | Toast API는 feedback `base/on-base`; 실제 호출부가 Info/Success/Warning/Danger 의미를 선택 | DSN-19 API, DSN-21/Product 호출부           |
| `shell/UnreadDot.tsx`, `notification/NotificationListItem.tsx`                                                                                                    | `accent`, Primary와 Primary Subtle을 unread 의미로 재사용 | 후속 | unread 전용 semantic 역할 승인 전 legacy 표현 유지                                         | DSN-21; 제품 의미 결정 시 Product 이슈 연결 |
| `post/PostActionBar.tsx`                                                                                                                                          | `like` 등 제품 action 의미색                              | 예외 | Like/Repost/Bookmark 의미 승인 전 유지, component token 후보                               | DSN-21 또는 연결된 Product 이슈             |

## Runtime theme 전략

Figma와 semantic contract는 Light/Dark를 모두 production 값으로 제공한다. DSN-4는 runtime selector를 활성화하지 않는다. 현재 앱은 Light만 공급한다. DSN-19는 selector API와 공용 theme·primitive의 Light/Dark 소비를 구현하고, 프로덕션 전체 Dark 활성화 gate는 DSN-21 또는 연결된 Product 이슈의 route·shell·domain consumer 이관까지 완료된 뒤 닫는다.

- 공용 primitive가 semantic foreground pair와 interaction state를 소비한다.
- DSN-19의 공용 primitive raw 값과 DSN-21/Product의 route·shell·domain raw 값이 각각 이관되거나 위 inventory의 예외로 남는다.
- DSN-19 Storybook에서 공용 primitive의 Light/Dark와 핵심 state를 검증하고, DSN-21/Product가 대표 route·shell consumer의 theme 전환을 검증한다.
- Web 자동 대비와 실제 Android/iOS runtime QA를 서로 다른 증거로 기록한다.

## 예외와 금지

- Fullscreen media의 fixed black/white는 허용한다.
- Fullscreen media overlay `0.55–0.92`는 표준 scrim으로 강제 통일하지 않는다.
- Like, Repost와 Bookmark 의미색은 제품 의미 승인 전 일괄 변경하지 않는다.
- Medal과 profile gradient는 component token 후보이며 raw gradient의 일반 사용 근거가 아니다.
- 신규 raw color, gradient와 backdrop 추가는 금지한다. semantic token이 없으면 계약을 먼저 갱신하거나 예외를 문서화한다.
- `[Legacy] Color`에 새 binding을 추가하지 않는다.
