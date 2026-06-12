# Figma 파일 구조와 작업 규칙

KOSMO 디자인 작업은 Figma의 `KOSMO` 파일에서 한다.

- 파일 키: `Erj975S6vVP8PlHQius801`

## 페이지 구조

| 페이지                  | 용도                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `01 Foundations`        | 디자인 토큰 시각화 — Colors, Typography, Spacing & Radius                                                               |
| `02 Components`         | 컴포넌트 라이브러리. 도메인별 섹션으로 구성 (아래 참고)                                                                 |
| `03 Patterns`           | (예약, 비어 있음)                                                                                                       |
| `04 Screens - Mobile`   | 모바일 화면 디자인. Screen Inventory 프레임에서 화면별 상태(완료 / 마이그레이션 필요 / 신규 필요)를 추적한다            |
| `05 Screens - Web`      | 웹 화면 디자인. 화면마다 1440 / 1024 두 breakpoint 프레임으로 구성하고, Web Screen Inventory 프레임에서 상태를 추적한다 |
| `06 Prototypes / Flows` | (예약, 비어 있음)                                                                                                       |
| `07 Archive`            | 구 와이어프레임 보관. 새 디자인의 마이그레이션 원본으로만 참조한다                                                      |

### `02 Components` 섹션 구성 (2026-06 기준)

- `Mobile` — 모바일 셸 컴포넌트 (BottomTab, Header, Dropdown-Menu 등)
- `POST` — 포스트 카드와 부속 컴포넌트 (PostCard, UserInfo, Reaction, CWPostCard 등)
- `🪄 Compose` — 작성(Edit) 화면 컴포넌트
- `🆕 Primitives` — 기본 요소 (Button, TextField, TextArea, Avatar, Switch, Checkbox, TagChip, placeholder류 등)
- `🔔 Notice` — 알림/사용자 행/프로필 컴포넌트
- `🔍 Search` — 검색 컴포넌트
- `🧵 Post Detail` — 스레드 상세 컴포넌트
- `⚙️ Settings` — 설정 행 컴포넌트
- `💻 Web` — 웹 전용 컴포넌트 (WebSidebar, NavItem, ComposeWidget 등)
- `⚠️ POST_LEGACY (Deprecated)` — 사용 금지. 현행 `POST` 섹션 컴포넌트로 대체됐다

## 디자인 원칙

- **재사용성보다 UX를 우선한다.** 과거에는 모바일/웹 화면에서 같은 컴포넌트를 재사용하는 것을 최우선으로 했지만, 메뉴 등 일부 컴포넌트를 양쪽에서 재사용하려다 디자인 문제가 발생해 방향을 바꿨다 (2026-06 결정). 재사용이 UX를 해치면 플랫폼 전용 컴포넌트(예: `💻 Web` 섹션)를 따로 만든다.

## 작업 규칙

- 새 화면/컴포넌트는 `02 Components`의 기존 컴포넌트와 Foundation 변수(디자인 토큰)를 사용해 만든다.
- **폰트 크기, 폰트 weight 등 스타일 값은 반드시 존재하는 변수에 연결한다.** 필요한 변수가 없다면 임의로 추가하거나 raw 값을 쓰지 말고, 디자인 오너에게 확인을 받은 뒤 변수를 추가/변경한다.
- 외부 라이브러리(SDS, Ant Design, Material Design 3 등)의 컴포넌트와 토큰은 사용하지 않는다. 외부 라이브러리 토큰은 KOSMO 브랜드 토큰으로 통합 완료됐다 (2026-05).
- 와이어프레임이 필요할 때 별도 와이어 키트를 만들지 않는다. "디테일을 줄인 실제 디자인"으로 — `02 Components`를 그대로 쓰되 모노톤 + `primary` 액센트, 회색 placeholder로 표현한다.
