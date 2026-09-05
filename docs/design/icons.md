# Icon

KOSMO 제품 UI에서 같은 의미에 같은 glyph를 사용하기 위한 아이콘 정본이다. 크기·stroke·interactive target의 기본값은 [foundations.md](./foundations.md), 접근성 이름과 상태는 [accessibility.md](./accessibility.md)를 따른다.

## Source of truth

- 제품 UI의 기본 아이콘 세트는 `lucide-react-native`다. `apps/app/package.json`은 `^1.23.0`, lockfile은 `1.23.0`을 고정한다.
- Lucide 이름이 glyph identity다. `X`와 `XIcon`, `Search`와 local alias `SearchIcon`처럼 같은 Lucide glyph의 export alias는 별도 아이콘으로 보지 않는다.
- 신규 또는 수정하는 interactive control에 `×`, `‹`, `›`, `↻`, `…` 같은 문자 glyph를 새로 사용하지 않는다. 아직 production에 남아 있는 항목은 Current inventory와 Confirmed migration에서 추적하며 새 소비처로 복사하지 않는다.
- 기본 viewBox `24×24`, stroke `2`, visual size token과 platform target의 분리는 Foundation 계약을 따른다. scale 밖 optical correction은 이 문서에 근거를 추가한 뒤 사용한다.
- Shell의 글쓰기 glyph는 Lucide 원본 `SquarePen`을 수정하지 않고 사용한다. path를 수정하면 더 이상 Lucide glyph로 보지 않으며 `Icon/Custom/*`로 분리해 출처·라이선스·optical size와 Design owner 승인을 새로 기록한다.
- `SidebarNavigation`의 Compact 글쓰기 진입점은 원형 Primary CTA 안에 canonical `SquarePen` outline을 사용한다. Rest·Hover·Pressed·FocusVisible 상태는 공용 navigation interaction 계약을 따르며, 실제 runtime interaction과 접근성은 PROD-796에서 검증한다.
- `BottomTabBar`는 Home·Search·Compose·Notifications의 미선택 상태에 Lucide outline을 유지하고, 선택 상태에는 `Icon/Custom/Filled/{House,Search,SquarePen,Bell}`을 사용한다. 선택 container에는 상시 fill을 두지 않고 filled glyph와 primary label로 선택을 표현하며, hover·pressed·focus 배경과 ring은 일시적인 interaction feedback으로만 사용한다. 네 filled source는 `lucide-react-native@1.23.0` outline에서 파생한 승인된 24×24 custom counterpart이며 Lucide ISC License를 따른다. Design owner 승인은 DSN-41(2026-08-18)에 기록하며, Profile은 선택 여부와 무관하게 Avatar를 유지한다.
- Web `SearchToolbar`의 Menu·Back·Clear는 canonical `Menu`·`ArrowLeft`·`X`와 `44×44 CSS px` target을 사용한다. Rest는 no-fill, Hover·Pressed는 transient state surface, Pressed visual은 98%, FocusVisible은 `2px` focus ring이다. Leading control이 있는 variant는 왼쪽 `space/8`, 오른쪽 `space/16`을 사용하고 입력창 오른쪽 여백은 유지한다. Android/iOS에는 Web 검색 상단바 통합과 Menu를 적용하지 않으며, Native Back·Clear가 같은 glyph·state identity를 소비할 때 interaction target은 iOS `44×44pt`, Android `48×48dp` 최소값을 따른다. Figma source는 `__SearchToolbarControl`이 소유하며 실제 platform별 interaction은 Product 구현에서 검증한다.
- 새 semantic role, 기존 role의 glyph 변경, custom icon 예외, visual size·stroke의 optical correction, active·filled variant를 결정하면 코드·Figma 변경과 같은 변경 단위에서 이 문서를 갱신한다. 최소한 의미, glyph·code export, source·version, visual size·stroke, control·상태, 소비처와 이관·검증 상태를 기록하며 문서 갱신 전에는 해당 이관을 완료로 보지 않는다.
- 구현 전 확정한 결정은 Confirmed migration에, 현재 production 구현은 Current inventory에, 아직 Design owner 판단이 필요한 항목은 Review queue에 둔다. 코드·Figma 이관과 검증이 끝나면 Current inventory를 갱신하고 해당 migration을 제거한다.
- 전체 redesign 중에는 semantic role과 glyph identity만 먼저 확정할 수 있다. size·stroke·container와 optical correction은 실제 component geometry, Light/Dark와 platform target을 함께 볼 수 있는 후속 redesign 범위로 남기며 semantic mapping 확정을 막지 않는다.
- 아이콘 color는 semantic theme color를 사용한다. Fullscreen media의 고정 black/white는 Foundation의 제품 예외다.

Figma에 반영할 때는 사용 중인 glyph만 `Icon/Lucide/<Lucide name>` component로 추가한다. Component description에 Lucide 버전, code export, semantic role, visual size·stroke를 기록한다. 새 semantic role이나 glyph가 생기면 코드 변경에서 아래 inventory를 갱신하고 Figma library sync 대상에도 추가한다.

Lucide path를 별도 SVG 묶음으로 레포에 복제하지 않는다. lockfile이 원본 버전을, Figma component가 승인된 visual copy를, 이 문서가 semantic mapping을 보존한다. Lucide 버전을 올릴 때는 변경된 path를 Figma와 함께 시각 검토한다.

이 문서의 inventory만으로 Figma 반영 완료를 뜻하지 않는다. Figma sync는 component node와 description을 readback한 별도 evidence로 확인한다.

## Confirmed control mappings

| 의미                             | Lucide glyph / code export                                    | visual                                                                            | control·상태                                                                                                                                                                 | 현재 소비처                                                                                       |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 새 글 작성                       | `SquarePen` / `SquarePen`                                     | canonical source `24×24`, stroke `2`                                              | Lucide 원본 path 유지; accessible name `글쓰기`                                                                                                                              | Figma 이관 완료; Production 코드·runtime 검증은 PROD-796                                          |
| 재게시 attribution               | `Repeat2` / `Repeat2`                                         | 전체 redesign 후속                                                                | 장식 아이콘; 인접한 attribution 문장이 의미를 제공                                                                                                                           | `PostListItem`; 코드·Figma 이관 대기                                                              |
| overflow 없는 반응한 프로필 보기 | `Ellipsis` / `MoreHorizontal`                                 | control target Web `32`, iOS `44`, Android `48`; glyph size·stroke는 Review queue | `ReactionSummary` trailing `IconButton`; 모든 Type과 control이 한 줄에 들어갈 때만 사용; accessible name `반응한 프로필 보기`; overflow에서는 같은 자리를 text `+N`으로 교체 | `ReactionSummary`; 조건부 코드·Figma 이관 대기                                                    |
| 화면·하위 화면 뒤로              | `ArrowLeft` / `ArrowLeft`                                     | Profile Edit `24`, Composer media editor `20`, stroke `2`                         | `44×44` target; route·screen·overlay subview의 이전 view로 돌아갈 때 사용                                                                                                    | Profile Edit·`ComposerMediaEditor` Figma 이관 완료; 다른 route는 개별 검증                        |
| Profile 이미지 편집              | `Camera` / `Camera`                                           | `20`, stroke `2`                                                                  | `40×40` affordance; 실제 focus target은 header·avatar preview 전체                                                                                                           | `ProfileEditImageFields` Figma 이관 완료; Production 코드·runtime 검증 대기                       |
| Profile Mute 상태                | `VolumeOff` / `VolumeOff`                                     | `16`, stroke `2`                                                                  | 팔로잉·팔로워 아래 상태·해제 행; secondary 문장 + Link Indigo text action, 아이콘은 장식                                                                                     | `ProfileHero` Figma 이관 완료; Production 코드·runtime 접근성 검증 대기                           |
| Profile 고정 상태·action         | `Pin` / `Pin`                                                 | `24`/`2`; attribution `16`; Web `18`; Native `24`                                 | 장식 attribution; `PinOff` 미사용; 상태 label 필수                                                                                                                           | DSN-55 Figma 완료; Production은 PROD-809                                                          |
| modal·viewer 닫기                | `X` / `XIcon`                                                 | Viewer `24`, 기본 close `20`, stroke `2`                                          | `IconButton`; surface별 accessible name과 focus restore 유지                                                                                                                 | `PostMediaViewer`, `ReplyComposerSurface`, `FeedbackOverlay`, `ModalSheet`, `ComposerMediaEditor` |
| 항목·미디어 제거                 | `X` / `XIcon`                                                 | Profile Tag `20`, Composer media `18`, stroke `2`                                 | 제거 대상을 포함한 accessible name; disabled 상태 유지                                                                                                                       | `ProfileTagChip`, `PostComposerMediaControls`                                                     |
| Composer 확장                    | `Expand` / `Expand`                                           | `20` inside Web `32×32`, stroke `2`                                               | Rail에서 Overlay로 확장; Overlay·editor에서는 숨김                                                                                                                           | Figma 이관 완료; Production 코드·runtime 검증은 PROD-797                                          |
| Composer 미디어 편집             | `Pen` / `Pen`                                                 | canonical source `24×24`; `20` inside Web `32×32`, stroke `2`                     | attachment별 ALT·향후 이미지 편집과 Post 공유 민감도 화면 진입; editor preview에서는 숨김                                                                                    | `__ComposerMediaItem`; Figma 이관 완료, Product 구현·runtime 접근성 검증 대기                     |
| Composer 미디어 민감 상태        | `Flag` / `Flag`                                               | canonical source `24×24`; `16` inside `28px` pill, stroke `2`                     | Post `sensitiveMedia=true`일 때 모든 Ready attachment가 함께 표시; 어느 pill도 같은 `Tool=Sensitive`로 진입; Native target은 `44pt`/`48dp`                                   | `__ComposerMediaItem`; Figma 이관 완료, Product 구현·runtime 접근성 검증 대기                     |
| Poll 선택지 추가                 | `Plus` / `Plus`                                               | `16` inside `32×32`, stroke `2`                                                   | 최대 선택지 수에서 숨김                                                                                                                                                      | `__ComposerPollEditor`; Product capability 구현 대기                                              |
| Composer Poll                    | `ChartNoAxesColumnIncreasing` / `ChartNoAxesColumnIncreasing` | `20` inside Web `32×32`, stroke `2`                                               | toggle action; 활성 상태와 action 노출을 분리                                                                                                                                | `__ComposerFooter`; Product capability 구현 대기                                                  |
| Composer CW                      | `TriangleAlert` / `TriangleAlert`                             | `20` inside Web `32×32`, stroke `2`                                               | toggle action; `aria-pressed`·focus 상태는 Product에서 검증                                                                                                                  | `__ComposerFooter`; Figma 이관 완료, Product runtime 검증 대기                                    |
| Composer Emoji                   | `FaceSlightlySmiling` / 미제공                                | `20` inside Web `32×32`, stroke `2`                                               | capability flag로 노출 제어                                                                                                                                                  | `__ComposerFooter`; Figma 이관 완료, Product export·runtime 구현 대기                             |
| 입력 지우기·최근 검색 삭제       | `X` / `X`                                                     | `18` / `16`, stroke `2`                                                           | `IconButton`; 입력 focus 유지                                                                                                                                                | Search route                                                                                      |
| Viewer 이전 이미지               | `ChevronLeft` / `ChevronLeftIcon`                             | `24`, stroke `2`, fixed white                                                     | `48×48` `IconButton`; 첫 이미지에서 disabled·opacity `0.3`                                                                                                                   | `PostMediaViewer`                                                                                 |
| Viewer 다음 이미지               | `ChevronRight` / `ChevronRightIcon`                           | `24`, stroke `2`, fixed white                                                     | `48×48` `IconButton`; 마지막 이미지에서 disabled·opacity `0.3`                                                                                                               | `PostMediaViewer`                                                                                 |

Profile 고정 action은 canonical `24×24` `Pin`을 재사용한다. attribution의 인접 label은 `고정됨`, owner
action label은 상태에 따라 `프로필에 고정` 또는 `프로필 고정 해제`다.

`ArrowLeft`는 화면·경로 또는 overlay 안의 하위 view에서 이전 navigation state로 돌아간다. `ChevronLeft`·
`ChevronRight`는 carousel·단계처럼 같은 view 안의 순서를 이동하거나 목록의 destination을 나타낸다. route·subview
back에 chevron을 사용하지 않는다.

## Current Lucide inventory

| 영역             | semantic role    | Lucide glyph                   | 주요 production 소비처                                                                  |
| ---------------- | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Shell            | 홈               | `House`                        | `BottomTabBar`, `SidebarNavigation`                                                     |
| Shell            | 검색             | `Search`                       | `BottomTabBar`, `SidebarNavigation`, Search input                                       |
| Shell            | 글쓰기           | `PenLine`                      | `BottomTabBar`, `SidebarNavigation`                                                     |
| Shell            | 알림             | `Bell`                         | `BottomTabBar`, `SidebarNavigation`                                                     |
| Shell            | 프로필           | `UserRound`                    | `SidebarNavigation`                                                                     |
| Shell            | 팔로우 요청      | `UserRoundPlus`                | Home, `SidebarNavigation`                                                               |
| Shell            | 북마크           | `Bookmark`                     | `SidebarNavigation`, `PostActionBar`                                                    |
| Shell            | 설정             | `Settings`                     | `SidebarNavigation`                                                                     |
| Shell            | 피드백           | `Mail`                         | `SidebarNavigation`                                                                     |
| Shell            | 메뉴·drawer 열기 | `Menu`                         | Search route, `UniversalShell`                                                          |
| Shell            | 로그아웃         | `LogOut`                       | `LogoutControl`                                                                         |
| Profile switcher | 펼치기·접기      | `ChevronDown`, `ChevronUp`     | `ProfileSwitcher`                                                                       |
| Profile switcher | 프로필 추가      | `Plus`                         | `ProfileSwitcher`                                                                       |
| Profile switcher | 선택됨           | `Check`                        | `ProfileSwitcher`                                                                       |
| Navigation       | 뒤로             | `ArrowLeft` 또는 `ChevronLeft` | Search, Profile Edit, Post detail, Settings, `UniversalShell`; Confirmed migration 참고 |
| Navigation       | 다음 destination | `ChevronRight`                 | Settings rows                                                                           |
| Post action      | 답글             | `MessageCircle`                | `PostActionBar`, list metadata, reply notification                                      |
| Post action      | 재게시           | `Repeat2`                      | `RepostAction`, repost notification                                                     |
| Post action      | 반응             | `Heart`                        | `PostActionBar`                                                                         |
| Post action      | 더보기           | `MoreHorizontal`               | `PostActionBar`, deletion menu trigger                                                  |
| Post action      | 삭제             | `Trash2`                       | `PostDeletionAction`                                                                    |
| Post action      | 링크 복사        | `Link2`                        | `PostMoreMenu`                                                                          |
| Media            | 이미지 추가      | `ImagePlus`                    | `PostComposerMediaControls`                                                             |
| Media            | 업로드 다시 시도 | `RefreshCw`                    | `PostComposerMediaControls`                                                             |
| Profile          | 이미지 편집      | `Camera`                       | `ProfileEditImageFields`                                                                |
| Visibility       | 공개             | `Globe`                        | `postVisibilityPresentation`                                                            |
| Visibility       | 조용한 공개      | `Moon`                         | `postVisibilityPresentation`                                                            |
| Visibility       | 팔로워만         | `Lock`                         | `postVisibilityPresentation`                                                            |
| Visibility       | 언급한 계정만    | `AtSign`                       | `postVisibilityPresentation`                                                            |
| Search           | 최근 검색        | `History`                      | Search route                                                                            |
| Notification     | 팔로우           | `UserPlus`                     | `NotificationListItem`                                                                  |
| Notification     | 반응             | `Smile`                        | `NotificationListItem`                                                                  |

## Confirmed migration

아래 항목은 Design owner가 mapping을 확정했지만 코드·Figma 이관과 실제 화면 검증은 아직 끝나지 않았다. 완료 전까지 Current inventory에는 production 구현을 그대로 기록한다.

| 현재 구현                                                 | 승인 정본                                                                                                                                                                         | 대상                                    | 남은 검증                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Profile Edit back `ArrowLeft` size `22`                   | canonical `ArrowLeft` `24`, stroke `2`, `44×44` target                                                                                                                            | `ProfileEditScreen`                     | Figma 완료; Product 코드 이관과 runtime 검증                                                 |
| Profile image edit `Camera` size `22`                     | canonical `Camera` `20`, stroke `2`, `40×40` affordance; preview 전체가 focus target                                                                                              | `ProfileEditImageFields`                | Figma 완료; Product 코드 이관과 runtime 검증                                                 |
| Profile Mute 상태 표시 없음                               | 상단 `FollowButton` 관계 action 유지 + 팔로잉·팔로워 아래 canonical `VolumeOff` `16` + secondary 상태 문장 + Link Indigo `뮤트 해제` text action; 별도 fill·border 없음           | `ProfileHero`                           | Figma 완료; Product 코드·runtime 접근성·Light/Dark 검증                                      |
| 모든 상태에서 outline icon, 선택 상태의 상시 surface fill | 미선택=Lucide outline, 선택=`Icon/Custom/Filled/{House,Search,SquarePen,Bell}` + primary label + container no-fill; hover·pressed·focus feedback만 일시 표시; Profile Avatar 유지 | `BottomTabBar`                          | PROD-852 공용 UI·Storybook 제공; PROD-796 실제 화면 연결과 Web·iOS·Android runtime 검증 대기 |
| Production 코드의 `PenLine`; Figma의 `SquarePen`          | Lucide 원본 `SquarePen`; Compact Sidebar는 원형 Primary CTA                                                                                                                       | `BottomTabBar`, `SidebarNavigation`     | PROD-852 공용 UI·Storybook 제공; PROD-796 실제 화면 연결과 Web·iOS·Android runtime 검증 대기 |
| 문자 `↻`                                                  | `Repeat2`; size·stroke는 redesign 후속                                                                                                                                            | `PostListItem`                          | 전체 redesign optical 결정, 코드·Figma 이관                                                  |
| `ReactionSummary`의 문자 `…`                              | overflow 없음=`Ellipsis` / `MoreHorizontal`; overflow 있음=숨겨진 Type 수를 나타내는 text `+N`; [Reaction UI](./reactions.md)의 width-fit 계약을 따름                             | `ReactionSummary`                       | 조건별 Figma·코드 이관과 실제 화면 검증                                                      |
| `UserPlus`                                                | `UserRoundPlus` / `UserRoundPlus`                                                                                                                                                 | `NotificationListItem` 팔로우 알림      | 코드·Figma 소비처 이관, 실제 화면 검증                                                       |
| `History`                                                 | `RotateCcwClock` / `History`                                                                                                                                                      | Search route                            | Figma 소비처 이관, 실제 화면 검증                                                            |
| `Smile`                                                   | `FaceSlightlySmiling`; code export 미정                                                                                                                                           | `NotificationListItem` 반응 알림        | 의존성·버전 결정, 코드·Figma 이관·화면 검증                                                  |
| route back의 `ChevronLeft`                                | `ArrowLeft`; size·stroke는 redesign 후속                                                                                                                                          | Post detail, Settings, `UniversalShell` | 전체 redesign optical 결정, 코드·Figma 이관                                                  |

`RotateCcwClock`은 현재 고정한 `lucide-react-native@1.23.0`에서 동일 path의 `History` export를 사용한다. `FaceSlightlySmiling`은 이 버전에 export가 없고 `Smile`과 path도 다르므로 자동 대체하지 않는다. 코드 이관 전에 Lucide 버전 갱신 또는 승인된 source를 별도로 결정한다.

## Review queue

아래 optical 항목은 전체 redesign의 후속 범위이며 자동 치환하지 않는다. semantic mapping을 다시 열지 않고 실제 화면의 component geometry, Light/Dark와 platform target을 함께 비교해 확정한다.

| 현재 표현                                                   | 역할·소비처                                         | 검토할 후보                                                               | 상태                                                  |
| ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `Repeat2` size·stroke 미확정                                | 재게시 attribution, `PostListItem`                  | redesign의 canonical icon scale                                           | glyph 확정; 실제 attribution row에서 검토 대기        |
| `Ellipsis` size·stroke 미확정 (`MoreHorizontal` code alias) | overflow 없는 반응한 프로필 보기, `ReactionSummary` | control target Web `32`, iOS `44`, Android `48` 안의 canonical icon scale | 조건부 semantic mapping 확정; glyph optical 검토 대기 |
| stroke `3.5`; repost `2.7`                                  | `PostActionControl`, `RepostAction`                 | 기본 stroke 또는 optical 예외                                             | action bar 전체 redesign에서 검토 대기                |
| scale 밖 stroke `2.25`                                      | Profile switcher add `Plus`                         | 기본 stroke 또는 optical 예외                                             | switcher 전체 redesign에서 검토 대기                  |

## Out of icon-set scope

- Reaction emoji는 사용자가 선택하는 product data이며 Lucide로 치환하지 않는다.
- `ReactionPendingSpinner`의 custom SVG는 loading feedback 전용이다. reduced-motion의 `···`도 control icon이 아니라 상태 대체 표현이다.
- Logo, app icon, favicon, default avatar와 OG image는 [logo.md](./logo.md)의 brand asset이다.
- `ActivityIndicator`와 Storybook placeholder SVG는 제품 아이콘 inventory에 포함하지 않는다.

## Verification surface

- 이 문서는 semantic mapping과 Figma handoff의 정본이다.
- 기존 Storybook story는 실제 화면의 size, state, focus, keyboard, theme를 확인한다. 별도 icon catalog story는 전체 inventory를 시각 비교할 필요가 생길 때 추가한다.
- 아이콘 교체 시 해당 component test 또는 기존 story에서 glyph identity와 기존 target·accessible name·disabled/focus 계약을 함께 검증한다.
