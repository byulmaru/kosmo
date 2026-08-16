# UI Foundation 규칙

이 문서는 DSN-14에서 확정한 KOSMO의 typography, spacing, radius, border width, elevation, icon, density와 UI 일관성 판정을 기록한다. 시각 정본은 Figma [`02 Typography & Layout · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1659-255)이며, 구현 전환은 아래 소유권 표를 따른다.

## Typography

- UI 텍스트는 SUIT Variable, 본문은 Pretendard Variable을 사용한다.
- 역할을 먼저 선택하고 size, weight, leading을 임의로 조합하지 않는다.
- 12px는 시간, 핸들, 비핵심 metadata에만 사용한다. 읽거나 선택해야 하는 정보는 14px 이상이다.
- line-height는 font size별 고정 px가 아니라 역할별 비율로 유지한다.

| 역할           | 크기 | Line height | Weight | 대표 용도                     |
| -------------- | ---: | ----------: | -----: | ----------------------------- |
| `UI/Display`   |   38 |        115% |    700 | 제한적으로 사용하는 display   |
| `UI/Heading/L` |   30 |        115% |    700 | 큰 화면 제목                  |
| `UI/Heading/M` |   24 |        115% |    700 | 중간 제목                     |
| `UI/Heading/S` |   20 |        130% |    700 | 모바일 section 제목           |
| `UI/Title`     |   18 |        130% |    600 | 설정·surface 제목             |
| `UI/Copy/L`    |   16 |        150% |    400 | 읽고 선택하는 기본 UI 텍스트  |
| `UI/Copy/M`    |   14 |        150% |    400 | helper·validation·보조 설명   |
| `UI/Copy/S`    |   12 |        130% |    400 | 시간·핸들·비핵심 metadata     |
| `UI/Label/L`   |   16 |        150% |    600 | 사용자 이름·강한 action label |
| `UI/Label/M`   |   14 |        150% |    600 | 버튼·탭·action count          |
| `UI/Label/S`   |   12 |        130% |    600 | 짧은 비핵심 badge label       |
| `Content/L`    |   18 |        150% |    400 | 강조 본문                     |
| `Content/M`    |   16 |        150% |    400 | 기본 포스트 본문              |
| `Content/S`    |   14 |        150% |    400 | 보조 본문·설명                |

MCP Preview font 대응과 Production runtime 로딩 규칙은 [typography.md](./typography.md)를 따른다.

## Spacing, radius, border width

- spacing은 `0, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48`의 범용 숫자 scale을 사용한다.
- radius는 `0, 2, 4, 8, 12, 16, 20, 24, full(999)`을 사용한다. `10`, `14` radius는 만들지 않는다.
- border width는 `0, 1, 2`만 사용한다. `1`은 기본 경계, `2`는 focus·강조, `0`은 명시적 경계 제거다.
- scale 밖 spacing은 component-local optical correction으로만 허용한다. component, platform, 시각적 이유, 비교 evidence와 Design owner 승인을 기록하고 전역 token으로 승격하지 않는다.

## Density와 rhythm

Density는 별도 runtime mode나 새 token collection이 아니라 `space/*`를 조합하는 authoring recipe다.

| Recipe   | Inset | Stack | Section | 적용                                         |
| -------- | ----: | ----: | ------: | -------------------------------------------- |
| Compact  |    12 |     8 |      16 | 명시적으로 선택한 고밀도 목록·메뉴           |
| Standard |    16 |    12 |      24 | 별도 spacing 계약이 없는 새 일반 UI의 기본값 |
| Spacious |    24 |    16 |      32 | 명시적으로 선택한 온보딩·독립 section        |

- Figma·component에 명시된 spacing 계약이 있으면 recipe보다 우선한다.
- Compact·Spacious는 명시적 opt-in만 허용한다. 부모, route, theme에서 자동 상속하지 않는다.
- breakpoint는 layout 단계만 결정한다. typography, line-height, interactive target을 함께 축소하지 않는다.
- PostLayout의 avatar와 body처럼 의도된 도메인 geometry는 해당 component가 계속 소유한다.
- 기존 화면에 Standard를 소급 적용하거나 Components/Screens binding을 자동 변경하지 않는다.

## Elevation과 shadow

Shadow pigment는 고정 `#000000`을 사용한다. geometry는 mode와 무관하며 opacity만 Light 10%, Dark 40%로 바뀐다.

| 역할       | Shadow                               | 대표 용도           |
| ---------- | ------------------------------------ | ------------------- |
| `flat`     | 없음                                 | 기본 surface        |
| `raised`   | `0 2px 8px 0`                        | 카드·sticky surface |
| `floating` | `0 4px 6px -1px`, `0 2px 4px -2px`   | 메뉴·popover        |
| `overlay`  | `0 10px 15px -3px`, `0 4px 6px -4px` | modal·sheet         |

Fullscreen media와 제품 고유 shadow는 일괄 치환하지 않고 아래 Inventory의 전용 예외로 유지한다.

## Icon

- 기본 viewBox는 `24×24`, visual size는 `16, 18, 20, 24, 48, 64`다.
- 용도는 차례로 compact metadata, button/menu optical, 기본 UI, navigation/emphasis, empty/feature, feature illustration이다.
- 기본 stroke는 `2`다. 32px 이상 outline icon이 과도하게 두꺼워 보일 때만 Design·Code owner 승인으로 `1.5`를 허용한다.
- visual size와 interactive target은 별도다. target은 Web 32px, iOS 44pt, Android 48dp를 확보한다.
- scale 밖 size·stroke는 optical correction에만 허용하며 component, 이유, platform, canonical target과 evidence를 description 또는 Inventory에 기록한다.

## UI 일관성 Inventory

| 후보                            | 판정      | 재사용·유지 경계                                                                                                              | 후속 소유자                                         |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `LogoutControl`                 | 분리      | compact는 공용 `IconButton`; label·pending·error를 포함한 full shell action은 전용 유지                                       | shared primitive는 DSN-19, shell call-site는 DSN-21 |
| `ProfileSwitcher`               | 전용 유지 | `Avatar`, `Button`은 재사용하되 actor 전환·create·unread·compound trigger·focus/scroll lifecycle은 component가 소유           | route/shell migration은 DSN-21                      |
| `ProfileEditImageFields`        | 전용 유지 | `ActionMenu`와 upload error semantics는 재사용하고 header/avatar aspect·overlap·camera veil은 component가 소유                | domain migration은 DSN-21/Product                   |
| `FeedbackForm`                  | 전용 유지 | `Button`, `TextArea`, `RadioGroup`·`RadioOption`은 재사용하고 option layout·dirty/submitting·mutation lifecycle은 form이 소유 | domain migration은 DSN-21/Product                   |
| Modal·sheet·menu overlay        | 분리      | 공용 scrim·elevation·focus primitive는 공유하고 close/restore/scroll lifecycle은 각 surface가 소유                            | primitive는 DSN-19, call-site는 DSN-21/Product      |
| Fullscreen media                | 예외 유지 | 고정 black/white, 강한 overlay, media control geometry는 제품 전용 evidence를 유지                                            | DSN-21/Product                                      |
| Route loading·empty·error·retry | 분리      | `StateView`, `Skeleton`, `Button` vocabulary는 공유하고 list skeleton·pagination geometry는 route가 소유                      | DSN-21, 최종 Figma evidence는 DSN-13                |
| Shell·viewport·scroll           | 분리      | `UniversalShell`과 768/1280 단계는 공유하고 picker·drawer·route overlay의 focus/scroll은 해당 surface가 소유                  | DSN-21, 최종 Figma evidence는 DSN-13                |

같은 역할의 소비자가 추가로 확인되기 전에는 새 공용 primitive를 선행 생성하지 않는다. 역할이 다른 UI를 형태가 비슷하다는 이유만으로 합치지 않는다.

## 상태·접근성·viewport 정본

- focus-visible, keyboard, modal close·focus restore, accessible name·announcement는 [accessibility.md](./accessibility.md)를 따른다.
- mobile `<768`, compact Web `768–1279`, full Web `≥1280`과 shell·scroll 규칙은 [breakpoints.md](./breakpoints.md)를 따른다.
- 공용 header geometry와 상태는 [page-header.md](./page-header.md)를 따른다.
- route별 loading, empty, error, retry 의미와 전용 geometry는 각 제품 문서를 따른다.

## 후속 작업 경계

- DSN-14: 이 문서와 Figma Foundation 계약을 정본으로 고정한다.
- DSN-18: [motion.md](./motion.md)의 motion, transition, easing, reduced-motion 계약을 정본으로 고정한다.
- DSN-19: `tokens.ts`에 numeric spacing·radius·border·icon, role typography와 Light/Dark elevation을 구현했다. 기존 `spacing`·`radii`·`typography`·`shadow` export는 DSN-21 consumer 이관 동안만 deprecated compatibility alias로 유지한다.
- DSN-19: Button·TextField·TextArea·ModalSheet·ActionMenu·StateView·Skeleton·ToastProvider·Avatar가 승인 foundation과 semantic color를 직접 소비한다.
- DSN-21 또는 연결된 Product 이슈: route, shell, domain consumer와 상태를 이관·검증한다.
- PROD-752: Search와 ReactionProfilesModal의 raw tab을 공용 `TabList`·`Tab`으로 이관하고, consumer별 상태·layout·lifecycle은 유지한다.
- PROD-753: FeedbackForm·ProfileDefaultPostVisibilityControl의 radio semantics와 Web keyboard 동작을 공용 `RadioGroup`·`RadioOption`으로 수렴하고, mutation·dirty/submitting·Relay actor lifecycle과 option layout은 각 consumer에 유지한다.
- DSN-13: 선행 구현 후 Components/Screens를 최종 재바인딩하고 evidence를 남긴다.
