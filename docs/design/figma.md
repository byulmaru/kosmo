# Figma 파일 구조와 작업 규칙

KOSMO 디자인 작업은 Figma의 `KOSMO` 파일에서 한다.

- 파일 키: `Erj975S6vVP8PlHQius801`

## 페이지 구조

| 페이지                                         | 용도                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `01 Foundations`                               | 프로덕션 Foundations — Color System, Typography, Brand & Logo, Motion과 Component Usage Mapping                         |
| `02 Components`                                | 컴포넌트 라이브러리. 도메인별 섹션으로 구성 (아래 참고)                                                                 |
| `03 Patterns`                                  | 여러 Production component를 조합한 비교·검토용 snapshot. source와 제품 동작의 정본은 아니다                             |
| `04 Screens - Mobile`                          | 모바일 화면 디자인. Screen Inventory 프레임에서 화면별 상태(완료 / 마이그레이션 필요 / 신규 필요)를 추적한다            |
| `05 Screens - Web`                             | 웹 화면 디자인. 화면마다 1440 / 1024 두 breakpoint 프레임으로 구성하고, Web Screen Inventory 프레임에서 상태를 추적한다 |
| `06 Prototypes / Flows`                        | 승인된 interaction·motion의 재생 가능한 대표 timeline과 제품 flow                                                       |
| `07 Archive`                                   | 구 와이어프레임 보관. 새 디자인의 마이그레이션 원본으로만 참조한다                                                      |
| `99 Archive — Foundations Legacy · 2026-08-10` | 기존 Foundation 프레임과 variable 원본. 새 작업에 사용하지 않고 이관 근거로만 보존한다                                  |

웹 화면의 1440 프레임은 레이아웃 브레이크포인트 3단계(풀 사이드바 + 피드 + 컴포저, `≥ full`/1280px)에 대응한다. 1024 프레임(접힌 아이콘 메뉴 + 피드)은 코드의 2단계(`compact`~`full`/768~1279px 아이콘 레일 + 피드)에 대응한다. 단계 정의와 대응은 [breakpoints.md](./breakpoints.md)를 참고한다.

### `01 Foundations` 프로덕션 구조

- [`01 Color System · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1661-254) — primitive, semantic Light/Dark, feedback, state, contrast와 migration 계약
- [`02 Typography & Layout · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1659-255) — typography, font mode, spacing, radius, border, elevation, icon과 density/rhythm 계약. 상세 사용 규칙은 [foundations.md](./foundations.md)를 따른다.
- `03 Brand & Logo · Production` — 로고 규칙, 플랫폼 자산과 Default Avatar
- [`04 Motion · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1772-890) — duration, easing, interaction·overlay·loading과 OS reduced-motion 계약. 상세 규칙은 [motion.md](./motion.md)를 따른다.
- [`08 Component Usage Mapping`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1684-254) — 실제 화면과 공용 컴포넌트의 Legacy → Production color 적용표

Active color variable collection은 다음 두 개다.

- `KOSMO Primitive Color` — 실제 값과 alpha. UI에서 직접 사용하지 않는다.
- `KOSMO Semantic Color` — Light/Dark mode와 Web/Android/iOS code syntax. 새 디자인은 이 컬렉션만 사용한다.

Active motion variable collection은 `KOSMO Motion`이다. duration과 `standard`·`enter`·`exit`·`linear` easing의 Web/Android/iOS code syntax를 제공하며, 재생 가능한 대표 계약은 [`KOSMO Motion Playground · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1774-880)의 Figma Motion timeline에서 확인한다. 화면 간 이동용 Prototype reaction·flow와 motion timeline을 같은 증거로 취급하지 않는다. 기존 Components/Screens의 최종 적용은 DSN-13에서 구현 evidence와 함께 동기화한다.

`[Legacy] Color`, `[Legacy] Foundation`, `[Legacy] Brand`, `[Legacy] 컬렉션 1`은 기존 binding 보존용이다. 새 binding을 추가하지 않으며 DSN-13에서 Components/Screens를 active collection으로 이관한다. 자세한 색상 값과 역할은 [colors.md](./colors.md)를 따른다.

### `02 Components` 섹션 구성 (2026-08 기준)

- `00 Page Guide` — 페이지 목적과 Production 상태를 설명하는 guide frame
- `01 Primitives · Current production` — Button, input, selection, feedback처럼 여러 도메인이 소비하는 독립 source
- `02 Shared domain · Production` — profile, navigation, composer처럼 제품 문맥을 가진 공용 source
- `03 Component Usage Mapping` — source와 실제 consumer의 사용 관계
- `04 Settings · Production` — SettingsItem, SettingsNavigationList와 설정 전용 field composition source

개별 DSN 작업의 검토용 section이 페이지에 함께 있을 수 있지만 위 번호 체계의 정본 source section으로 간주하지
않는다. 독립 source는 `02 Components`에 두고, 여러 source를 조합하지만 navigation·상태·저장 lifecycle을 소유하지
않는 예시는 `03 Patterns`에 둔다.

### `03 Patterns` 섹션 구성

- `01 Overlay ownership snapshot`
- `02 Mobile overlay patterns`
- `03 Web overlay patterns`
- `04 Composer presentation patterns · DSN-43`
- `05 Settings control patterns · DSN-44`
- `06 Exploration · Settings detail grouping · DSN-44` — 기존 SettingsItem 조합만 검토하는 비제품 탐색 예시

`01`–`05`는 승인된 component 조합을 비교·검토하는 snapshot이며 해당 제품 화면에 채택됐다는 evidence는 아니다.
`06`은 제품 IA·route·저장 계약을 승인하지 않는 exploration이다. 어느 쪽도 Foundation, component source,
`docs/design`과 연결된 Product 이슈의 계약을 대체하지 않는다.

#### DSN-43 PostComposer source 계약

- `Rail`·`Overlay`의 모든 public `PostComposer` variant는 하나의 공용
  [`__ComposerFooter`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4096-2528) source를
  instance로 소비하며 footer action row를 consumer마다 복제하지 않는다.
- Footer action availability는 `__ComposerFooter`의 `Show media action`·`Show poll action`·
  `Show CW action`·`Show emoji action` Boolean property로 독립 노출한다. Figma source와 완성형 specimen은
  네 action을 모두 기본 `true`로 두며, Product는 아직 구현하지 않은 action을 같은 property·capability flag로
  숨긴다.
- `CW active`·`Poll active`는 action 노출 여부와 별개인 modifier state다. `03 Patterns` specimen이
  Poll·Emoji action을 켜두어도 Product 기능이 준비됐다는 의미가 아니며, runtime capability·feature flag·interaction
  lifecycle은 Product가 소유한다.
- [`__ComposerCWField`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4049-27766)는
  `Lines=1|2`가 하나의 exposed `Value`를 공유한다. 두 줄 상태도 별도 문구 layer를 덧붙이지 않고 같은 값을 최대 두 줄로
  wrap한다.
- [`__ComposerPollEditor`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3705-8002)의
  선택지 입력은 canonical `TextField`, 복수 선택은 canonical `Checkbox`, 선택지 추가·제거는 canonical `Plus`·`X`를
  소비한다. 단일 선택 표시는 공용 Radio source가 생기기 전까지 Poll 내부의 semantic-token-bound control로 유지한다.
- [`__SensitiveMediaRow`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2190-4175)는
  canonical `Switch`를 소비하며 로컬 track·thumb 조합을 만들지 않는다.
- Web footer는 Media → Poll → CW → Emoji 순서로 공용 `IconButton`의 `32×32` target과 `20×20` icon,
  action 사이 `4px` 간격을 사용한다. 글자 수 counter는 `32px`, 제출은 기존 `Button/Compact` `72×32`를 사용해
  `Rail`의 실제 footer 폭 `270px` 안에서 한 줄로 배치한다. 이 규칙은 Web 전용이며 iOS `44pt`·Android `48dp`
  target 계약은 유지한다.
- Overlay 전용 미디어 설명 편집은
  [`ComposerMediaEditor`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4193-11169)
  source가 `02 Shared domain · Production`에서 소유한다. `PostComposer Surface=Overlay, State=Media`와 같은
  `600×624` 경계 안에서 body를 교체하며, 별도 `ModalSheet`·scrim을 중첩하거나 `PostComposer`의 `State`·`Rail`
  variant로 추가하지 않는다.
- editor header는 `44×44` hit target 안에 기존 Web `IconButton` `32×32`와 canonical `ArrowLeft`·`X`를 사용한다. Back은 draft와
  media를 유지한 채 Composer로 돌아가고, Close는 Composer Overlay 전체를 닫는다. preview 안의 X는 해당
  attachment만 제거하며, 하단 `완료`는 ALT 편집을 draft에 반영하고 Composer로 돌아간다. Rail에서 ALT 편집을
  시작해도 같은 Overlay의 editor view로 직접 전환한다.
- scrim, focus trap·restore, Escape, discard confirmation, viewport와 mobile fullscreen lifecycle은 Product의
  상위 Overlay 구현이 소유한다.
- 현재 Typography line-height FLOAT 변수는 `115`·`130`·`150` 같은 백분율 값이지만 Plugin API binding에서는 px로
  해석된다. 이 경로로 편집한 Composer 텍스트는 검증된 CW `16/24`, Poll `14/20`, editor title `20/26`, footer
  counter `130%` line-height를 유지하고 family·size·weight만 variable에 bind한다. 백분율을 안전하게 표현하는 token
  계약이 생기기 전까지 line-height를 기계적으로 bind하지 않는다.

#### DSN-44 설정 control 계약

- [`RadioOption`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2792-4951) — `Selected=True/False`와 `Default`, `Hover`, `Pressed`, `FocusVisible`, `Disabled`를 독립 축으로 조합한다.
- [`Slider`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3474-25448) — 대표 값 `0/25/50/75/100` 각각에 `Default`, `Hover`, `FocusVisible`, `Dragging`, `Disabled`를 제공한다.
- [`ListboxOption`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3597-7772) — `Selected=True/False`와 `Default`, `Hover`, `Pressed`, `FocusVisible`, `Disabled`, `Active`를 독립 축으로 조합한다. `Active`는 키보드 탐색 등 현재 활성 option, `Selected`는 확정된 값을 뜻한다.
- MultiSelect combobox는 검색 결과가 없는 상태와 현재 입력으로 새 태그를 만드는 action을 [`Create` specimen](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4025-10133)으로 검증한다.
- [`ColorPickerPanel`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3819-8600)은 Light/Dark semantic preview와 비차단 대비 경고를 함께 제공한다.

SearchField, Switch와 Tabs는 기존 공용 source를 재사용한다. 이 계약은 설정용 control의 조합 가능성까지만 다루며
설정 IA, route, 저장 방식, frontend lifecycle은 포함하지 않는다.

## 디자인 원칙

- **재사용성보다 UX를 우선한다.** 과거에는 모바일/웹 화면에서 같은 컴포넌트를 재사용하는 것을 최우선으로 했지만, 메뉴 등 일부 컴포넌트를 양쪽에서 재사용하려다 디자인 문제가 발생해 방향을 바꿨다 (2026-06 결정). 재사용이 UX를 해치면 같은 source로 억지 통합하지 않고 플랫폼 전용 컴포넌트로 분리한다.

## Default Avatar

- 프로필 이미지 URL이 없는 사용자의 공용 fallback은 `01 Foundations`의
  [`Default Avatar`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1659-463)
  노드를 사용한다 (2026-07-31 결정).
- 구현 에셋은 배경과 crop을 포함한 전체 노드를 1024×1024 PNG로 export한 단일 원본을 사용한다. 내부 SVG만
  별도로 사용하거나 크기별 raster variant를 만들지 않는다.
- 공용 Avatar primitive는 실제 프로필 이미지 URL을 우선하고, URL이 없을 때만 이 기본 이미지를 표시한다.
  원형 clipping과 크기 조절은 primitive가 소유하며 접근 가능한 이름은 기존 프로필 이름을 유지한다.
- 네트워크 이미지 로드 실패를 기본 이미지로 전환하는 정책은 이 결정에 포함하지 않는다.

## 작업 규칙

- 새 화면/컴포넌트는 `02 Components`의 기존 컴포넌트와 Foundation 변수(디자인 토큰)를 사용해 만든다.
- 색상은 `KOSMO Semantic Color`를 사용한다. `KOSMO Primitive Color`, `[Legacy] Color`와 raw hex를 UI에 직접 연결하지 않는다.
- 새 semantic 역할이 필요하면 먼저 [colors.md](./colors.md)와 `08 Component Usage Mapping`을 갱신하고 Light/Dark 값, foreground pair와 consumer를 함께 정의한다.
- motion은 `KOSMO Motion`과 [motion.md](./motion.md)의 semantic 역할을 사용한다. raw duration·easing이나 reduced-motion 대체가 없는 animation을 새로 추가하지 않는다.
- **폰트 크기, 폰트 weight 등 스타일 값은 반드시 존재하는 변수에 연결한다.** 필요한 변수가 없다면 임의로 추가하거나 raw 값을 쓰지 말고, 디자인 오너에게 확인을 받은 뒤 변수를 추가/변경한다.
- 외부 라이브러리(SDS, Ant Design, Material Design 3 등)의 컴포넌트와 토큰은 사용하지 않는다. 외부 라이브러리 토큰은 KOSMO 브랜드 토큰으로 통합 완료됐다 (2026-05).
- 와이어프레임이 필요할 때 별도 와이어 키트를 만들지 않는다. "디테일을 줄인 실제 디자인"으로 — `02 Components`를 그대로 쓰되 모노톤 + `primary` 액센트, 회색 placeholder로 표현한다.
