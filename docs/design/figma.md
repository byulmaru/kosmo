# Figma 파일 구조와 작업 규칙

KOSMO 디자인 작업은 Figma의 `KOSMO` 파일에서 한다.

- 파일 키: `Erj975S6vVP8PlHQius801`

## 페이지 구조

| 페이지                                         | 용도                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `01 Foundations`                               | 프로덕션 Foundations — Color System, Typography, Brand & Logo와 Component Usage Mapping                                 |
| `02 Components`                                | 컴포넌트 라이브러리. 도메인별 섹션으로 구성 (아래 참고)                                                                 |
| `03 Patterns`                                  | (예약, 비어 있음)                                                                                                       |
| `04 Screens - Mobile`                          | 모바일 화면 디자인. Screen Inventory 프레임에서 화면별 상태(완료 / 마이그레이션 필요 / 신규 필요)를 추적한다            |
| `05 Screens - Web`                             | 웹 화면 디자인. 화면마다 1440 / 1024 두 breakpoint 프레임으로 구성하고, Web Screen Inventory 프레임에서 상태를 추적한다 |
| `06 Prototypes / Flows`                        | (예약, 비어 있음)                                                                                                       |
| `07 Archive`                                   | 구 와이어프레임 보관. 새 디자인의 마이그레이션 원본으로만 참조한다                                                      |
| `99 Archive — Foundations Legacy · 2026-08-10` | 기존 Foundation 프레임과 variable 원본. 새 작업에 사용하지 않고 이관 근거로만 보존한다                                  |

웹 화면의 1440 프레임은 레이아웃 브레이크포인트 3단계(풀 사이드바 + 피드 + 컴포저, `≥ full`/1280px)에 대응한다. 1024 프레임(접힌 아이콘 메뉴 + 피드)은 코드의 2단계(`compact`~`full`/768~1279px 아이콘 레일 + 피드)에 대응한다. 단계 정의와 대응은 [breakpoints.md](./breakpoints.md)를 참고한다.

### `01 Foundations` 프로덕션 구조

- [`01 Color System · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1661-254) — primitive, semantic Light/Dark, feedback, state, contrast와 migration 계약
- [`02 Typography & Layout · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1659-255) — typography, font mode, spacing, radius, border, elevation, icon과 density/rhythm 계약. 상세 사용 규칙은 [foundations.md](./foundations.md)를 따른다.
- `03 Brand & Logo · Production` — 로고 규칙, 플랫폼 자산과 Default Avatar
- [`08 Component Usage Mapping`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1684-254) — 실제 화면과 공용 컴포넌트의 Legacy → Production color 적용표

Active color variable collection은 다음 두 개다.

- `KOSMO Primitive Color` — 실제 값과 alpha. UI에서 직접 사용하지 않는다.
- `KOSMO Semantic Color` — Light/Dark mode와 Web/Android/iOS code syntax. 새 디자인은 이 컬렉션만 사용한다.

`[Legacy] Color`, `[Legacy] Foundation`, `[Legacy] Brand`, `[Legacy] 컬렉션 1`은 기존 binding 보존용이다. 새 binding을 추가하지 않으며 DSN-13에서 Components/Screens를 active collection으로 이관한다. 자세한 색상 값과 역할은 [colors.md](./colors.md)를 따른다.

### `02 Components` 섹션 구성 (2026-06 기준)

- `Mobile` — 모바일 셸 컴포넌트 (BottomTab, Header, Dropdown-Menu 등)
- `POST` — 포스트 카드와 부속 컴포넌트 (PostCard, UserInfo, Reaction, CWPostCard 등)
- `🪄 Compose` — 작성(Edit) 화면 컴포넌트
- `🆕 Primitives` — 기본 요소 (Button, TextField, TextArea, Avatar, Switch, Checkbox, TagChip, placeholder류 등)
- `🔔 Notice` — 알림/프로필 목록 항목/프로필 컴포넌트
- `🔍 Search` — 검색 컴포넌트
- `🧵 Post Detail` — 스레드 상세 컴포넌트
- `⚙️ Settings` — 설정 행 컴포넌트
- `💻 Web` — 웹 전용 컴포넌트 (WebSidebar, NavItem, ComposeWidget 등)
- `⚠️ POST_LEGACY (Deprecated)` — 사용 금지. 현행 `POST` 섹션 컴포넌트로 대체됐다

## 디자인 원칙

- **재사용성보다 UX를 우선한다.** 과거에는 모바일/웹 화면에서 같은 컴포넌트를 재사용하는 것을 최우선으로 했지만, 메뉴 등 일부 컴포넌트를 양쪽에서 재사용하려다 디자인 문제가 발생해 방향을 바꿨다 (2026-06 결정). 재사용이 UX를 해치면 플랫폼 전용 컴포넌트(예: `💻 Web` 섹션)를 따로 만든다.

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
- **폰트 크기, 폰트 weight 등 스타일 값은 반드시 존재하는 변수에 연결한다.** 필요한 변수가 없다면 임의로 추가하거나 raw 값을 쓰지 말고, 디자인 오너에게 확인을 받은 뒤 변수를 추가/변경한다.
- 외부 라이브러리(SDS, Ant Design, Material Design 3 등)의 컴포넌트와 토큰은 사용하지 않는다. 외부 라이브러리 토큰은 KOSMO 브랜드 토큰으로 통합 완료됐다 (2026-05).
- 와이어프레임이 필요할 때 별도 와이어 키트를 만들지 않는다. "디테일을 줄인 실제 디자인"으로 — `02 Components`를 그대로 쓰되 모노톤 + `primary` 액센트, 회색 placeholder로 표현한다.
