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

### Full Web screen baseline · DSN-49

2026-08-28 KST에 [`05 Screens - Web`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1846-880)을
readback한 Full Web 기준은 route·state `FRAME` 31개와 Profile lifecycle `INSTANCE` 4개, 총 35개
screen-like surface다. 피그마 인벤토리의 정본은
[`00 Screen Inventory · DSN-49 · Complete`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13275),
[`Route contracts · 20`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13292),
[`State and candidate contracts · 8`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13462)이다.

아래 목록은 DSN-50 Compact Web 1024와 DSN-51 Mobile 390이 누락 없이 같은 계약 세트를 만들 때
사용하는 handoff checklist다. 상태를 `Current`로 승격하거나 새 route를 정의하는 목록이 아니다.
위험·상태·진행도 분류는 Full의 `Current`·`Target`·`Candidate`·`Legacy`를 그대로 유지하고,
각 플랫폼의 새 node ID와 검증 결과는 DSN-50·DSN-51이 소유하며 DSN-37이 통합한다.

`01 Public Web`의 `/`(`1945:939`)와 `/privacy`(`1945:949`)는 현재 inventory의
`Current`·`Implemented` snapshot이지만, 현재 화면 구성을 장기 보존할 canonical state로
확정하지 않았다. 따라서 DSN-49의 31개 기준선에서 의도적으로 제외하며, DSN-50·DSN-51도
이를 viewport별로 1:1 복제하지 않는다. 향후 Public surface의 목표 상태는 별도 범위에서 정한다.

#### Full Web route·state frames

| 구역                      | Full Web surface                                                                                                                                                                  | 분류                                | Inventory contract                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 04 Core routes            | [`/home · Legacy · pre-DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-2553)                                                                      | Legacy · Light · 참조만             | [`/home`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13334)                          |
| 04 Core routes            | [`/notifications`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-2753)                                                                                   | Current · Light                     | [`/notifications`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13350)                 |
| 04 Core routes            | [`/bookmarks · Bookmark actions selected · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-2918)                                                  | Current · Light                     | [`/bookmarks`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13358)                     |
| 04 Core routes            | [`/search · People results · Current`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-3245)                                                               | Current · Light                     | [`/search`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13374)                        |
| 04 Core routes            | [`/follow-requests`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-3551)                                                                                 | Current · Light                     | [`/follow-requests`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13390)               |
| 04 Core routes            | [`/hashtags/[id]/profiles`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-3715)                                                                          | Current · Light                     | [`/hashtags/[hashtagId]/profiles`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13398) |
| 04 Core routes            | [`/profile-edit · Candidate · Custom fields · Dark`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1951-3854)                                                 | Candidate · Dark                    | [`/profile-edit`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13406)                  |
| 04 Core routes            | [`/search · Popular results · Candidate · Product not implemented`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5852-14340)                                 | Candidate · Product 미구현          | [`/search`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13374)                        |
| 04 Core routes            | [`/search · Media results · Candidate · Product not implemented`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5852-14565)                                   | Candidate · Product 미구현          | [`/search`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13374)                        |
| 05 Profile and post       | [`/[profileHandle] · Target tabs · Replies and Media product not implemented`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1953-3855)                       | Target · Product 미구현             | [`/[profileHandle]`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13430)               |
| 05 Profile and post       | [`/[profileHandle]/followers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1953-3992)                                                                       | Current · Light                     | [`/[profileHandle]/followers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13438)     |
| 05 Profile and post       | [`/[profileHandle]/following`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1953-4133)                                                                       | Current · Light                     | [`/[profileHandle]/following`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13446)     |
| 05 Profile and post       | [`/[profileHandle]/[postId] · Current thread`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1953-4274)                                                       | Current                             | [`/[profileHandle]/[postId]`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13454)      |
| 06 Settings workspace     | [`/settings/profile · Follow approval shared Save · Target · Product migration`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1955-4420)                     | Target · Product migration          | [`/settings/profile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13422)              |
| 06 Settings workspace     | [`/settings/theme · Light · Candidate · Product not implemented`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4848-10206)                                   | Candidate · Light · Product 미구현  | [`/settings/theme`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13472)                |
| 08 Representative states  | [`/home · Profile required · Intentional override`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1957-5004)                                                  | Representative state · theme 미표기 | [`/home`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13334)                          |
| 08 Representative states  | [`/[profileHandle]/[postId] · Deleted`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1957-5147)                                                              | Deleted · theme 미표기              | [`/[profileHandle]/[postId]`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13454)      |
| 08 Representative states  | [`/settings · Profile required`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1957-5310)                                                                     | Representative state · theme 미표기 | [`/settings`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13414)                      |
| 09 Timeline routes        | [`/home · Light · DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-8869)                                                                           | Current · Light                     | [`/home`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13334)                          |
| 09 Timeline routes        | [`/local · Light · DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-9060)                                                                          | Current · Light                     | [`/local`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13342)                         |
| 09 Timeline routes        | [`/home · Dark · DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-32769)                                                                           | Current · Dark                      | [`/home`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13334)                          |
| 09 Timeline routes        | [`/local · Dark · DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-32781)                                                                          | Current · Dark                      | [`/local`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13342)                         |
| 10B Local timeline states | [`/local · Loading · Light · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5560-13237)                                                               | Current · Light                     | [`Loading`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13480)                        |
| 10B Local timeline states | [`/local · Empty · Light · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5560-13431)                                                                 | Current · Light                     | [`Empty`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13488)                          |
| 10B Local timeline states | [`/local · Initial error · No saved data · Blank + persistent Toast · Target · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5560-13625)             | Target · Light                      | [`Error targets`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13496)                  |
| 10B Local timeline states | [`/local · Refresh error · Last successful timeline retained + persistent Toast · Target · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5831-14098) | Target · Light                      | [`Error targets`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13496)                  |
| 10B Local timeline states | [`/local · Pagination error · Existing list retained + Toast · Target · DSN-49`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5831-14188)                    | Target · Light                      | [`Error targets`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13496)                  |
| 10C Standalone states     | [`/login/callback · Current · Standalone`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5565-13663)                                                          | Current · Standalone                | [`/login/callback`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13318)                |
| 10C Standalone states     | [`+not-found · Current · Standalone`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5565-13667)                                                               | Current · Standalone                | [`+not-found`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13326)                     |
| 11 Profile pinned states  | [`/[profileHandle] · Pinned · Light · Target tabs`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4849-10625)                                                 | Target · Light                      | [`Pinned`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13528)                         |
| 11 Profile pinned states  | [`/[profileHandle] · Pinned · Dark · Target tabs`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4849-10709)                                                  | Target · Dark                       | [`Pinned`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13528)                         |

#### Profile lifecycle state-family

[`11 Profile lifecycle · DSN-52`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4876-16628)의 네 항목은
일반 route `FRAME`이 아닌 FullWeb consumer `INSTANCE`이고 현재 Screen Inventory에 직접 연결된 행이 없다.
Compact·Mobile에서도 route screen으로 중복 생성하지 않고 독립된 lifecycle state-family로 대응시킨다.

| Full Web lifecycle surface                                                                                                                      | State · theme         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [`Consumer · Viewport=FullWeb, State=Active, Theme=Light`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4876-33061)        | Active · Light        |
| [`Consumer · Viewport=FullWeb, State=Deactivated, Theme=Light`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4876-33181)   | Deactivated · Light   |
| [`Consumer · Viewport=FullWeb, State=DeleteChecked, Theme=Light`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4876-33285) | DeleteChecked · Light |
| [`Consumer · Viewport=FullWeb, State=Deactivated, Theme=Dark`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4876-33420)    | Deactivated · Dark    |

#### Inventory-only canonical overlays

Composer와 Feedback의 Target은 route screen이 아니라 어떤 route에서든 열리는 canonical overlay다.
Full·Compact·Mobile 인벤토리에서 소유 overlay 계약은 유지하되, 현재 runtime의 `/compose`·`/feedback`
호환 route를 별도 canonical screen으로 복제하지 않는다. 호환 route의 제거 여부와 runtime migration은
해당 Product 계약에서 별도로 추적한다.

| Overlay  | Canonical node                                                                                                                             | Inventory contract                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Composer | [`Full Web 1440 · Any route + Composer overlay · Canonical`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5626-47243) | [`/compose · Overlay only`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13366)  |
| Feedback | [`Full Web 1440 · Any route + Feedback overlay · Canonical`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5626-47230) | [`/feedback · Overlay only`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5547-13382) |

#### 사용·종료 경계

- DSN-50·DSN-51은 Legacy `/home` 복제본 대신 DSN-56 `/home`을 현재 기준으로 사용한다.
- 명시되지 않은 theme나 없는 Dark 상태를 임의로 추론하지 않는다. 추가 coverage는 해당 플랫폼 이슈에서 근거를 남긴다.
- Figma readback은 node 구조·명칭·시각 상태만 증명한다. runtime route 도달성, focus·dismiss, 접근성과 Product 구현은 별도로 검증한다.
- 이 기준선 기록과 Figma 인벤토리 readback은 DSN-49 Full Web 완료 증거다. Compact·Mobile 생성은
  DSN-50·DSN-51의 후속 범위이며 DSN-49 종료 blocker가 아니다.
- 이 기록을 포함한 [PR #698](https://github.com/byulmaru/kosmo/pull/698)이 merge된 뒤 merged revision에서 문서를
  readback하면 DSN-49를 종료한다. Product code migration은 이 이슈와 PR의 범위에 포함하지 않는다.

### DSN-50 Compact Web 1024 inventory (2026-08-28)

`05 Screens - Web`의
[`12B Screen Inventory · DSN-50 · Compact Web 1024`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6197-2480)는
`80px` icon rail과 최대 `600px` route column을 사용하는 `1024×900` 표본의 감사 기준이다.

- main route/state는 34개다. Public preserve-only 2개와 Legacy reference 1개를 합친 route/state FRAME은
  37개이고 canonical Composer·Feedback overlay 2개를 더한 물리 FRAME은 39개다.
- Profile lifecycle INSTANCE 5개와 기존 ReplyComposer pattern reference 1개는 물리 FRAME 수에서 분리한다.
  overlay·pattern·lifecycle을 route frame으로 중복 생성하지 않는다.
- 39개 FRAME은 모두 `1024×900`, explicit Light/Dark mode, current main-component 상속을 유지하며 missing
  `mainComponent`가 없다. 이 수량은 inventory에 등록된 DSN-50 범위의 내부 정합성만 증명하며 제품 surface
  전체가 누락 없이 Screens에 승격됐다는 뜻은 아니다.
- 같은 inventory 하단의 `Cross-viewport canonical additions · 19 FRAME + 1 lifecycle` ledger는 이 Compact
  baseline과 별도로 집계한다. Post Activity 6개, Reaction People 3개, Mute·Block category·관리 목록 8개의
  Target FRAME과 PostMediaViewer 대표 FRAME 2개를 추가했고, Full Profile target selector source·consumer
  1개를 lifecycle family로 기록했다. 따라서 기존 Compact 39개 수량은 바뀌지 않는다.
- `Current`, `Target`, `Candidate`, `Legacy`, `Product not implemented`를 그대로 보존한다. Target·Candidate
  화면과 Figma의 focus·dismiss·keyboard·AT·hit area·safe area·reflow는 runtime 완료 증거가 아니다.

사용자 검토에서 확정한 Target 및 readback 교정은 다음과 같다.

| 영역                  | 확정한 Compact/공통 계약                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile required      | `PageHeader`는 상단에 유지하고 상태 본문만 남은 영역에서 중앙 정렬한다.                                                                                                   |
| Recoverable error     | cache가 있으면 마지막 성공 content와 persistent retry Toast를 유지하고, cache가 없으면 skeleton과 Toast를 사용한다. spinner는 실제 retry 중에만 표시한다.                 |
| Followers / Following | Profile detail에 붙이지 않고 `~님의 팔로워`·`~님의 팔로잉` PageHeader와 `팔로워`·`팔로잉` tab을 가진 독립 route로 표시한다. Compact와 Full의 기존 URL frame을 재사용한다. |
| Post thread           | row는 vertical Auto Layout/Hug으로 쌓고 인접한 N개 row 사이 N-1 divider만 실제 row 경계에 둔다.                                                                           |
| Reply                 | Compact Post 상세의 기본 frame은 closed thread다. Reply action은 기존 600×720 modal pattern을 사용하며 inline Composer나 별도 Reply route frame을 만들지 않는다.          |
| Settings              | Target root는 `계정 설정 → 프로필 설정 → 뮤트 및 차단 → 테마` 순서다. `게시물 기본 공개 범위`는 `/settings/profile` 내부 field이며 별도 Target frame을 두지 않는다.       |
| Pinned attribution    | Center/Pinned source에만 `paddingTop=4px`을 적용한다. Repost source는 `paddingTop=0`, 높이 20px을 유지한다.                                                               |
| Bookmarks             | Compact와 Full 모두 Bookmark action을 data-derived `Selected`로 표시하고 같은 `itemSpacing=0` PostListItem stack을 사용한다.                                              |

### DSN-51 Mobile 390 Local error targets (2026-08-30)

[`08 Local timeline states · DSN-56`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4657-13349)는
기존 Loading·Empty와 오류 Target 3개를 분리한다.

- [`Initial error`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4665-4855)는 저장 목록이 없는
  2행 skeleton과 persistent retry Toast를 사용한다.
- [`Refresh error`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8485)는 마지막 성공 목록을,
  [`Pagination error`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8495)는 기존 목록을 유지한 채
  같은 [`Toast · Danger · Action`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1890-1020)을 재사용한다.
- Toast는 Mobile root의 `x=15`, `y=696`, `360×52` absolute overlay이며 `BottomTabBar` 위 16px을 유지한다.
  Initial은 기존 blocking `StateView`를 Target으로 이관한 것이고 Refresh·Pagination은 확정 누락 Target이다.
  세 FRAME 모두 runtime data 보존·retry·accessibility 동작의 완료 증거는 아니다.

### Mobile spacing과 Native action target source (2026-08-30)

- [`/follow-requests` Initial error Target](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-3410)은
  중앙 `StateView`를 제거하고 skeleton 위에 [`Toast instance 6598:1438`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6598-1438)을
  `x=15`, `y=696`, `360×52`로 배치한다. 문구는 `팔로워 요청을 불러오지 못했어요`, action은 `다시 시도`다.
  pagination과 승인·거절 row 실패는 이번 Figma Target 범위에서 변경하지 않는다.
- [`PostListItem`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1924-1992)의
  `Size=Mobile` 4종은 좌우 padding 16px, `Size=Center` 4종은 기존 8px을 사용한다. Mobile Text·Media의
  Reaction Summary slot은 실제 content column `298px`을 채우며 Action Bar와 같은 좌우 edge에 정렬된다. Home [`4524:3985`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-3985)과 Local [`4524:4139`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139) 실제 consumer에서 Mobile 상속을 확인했다.
- [`PostActionBar`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6604-48270)는
  `Platform=Web|iOS|Android` source variant를 제공한다. Web [`2184:3966`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2184-3966)은
  28px, iOS [`6604:1431`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6604-1431)은 44pt,
  Android [`6604:1468`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6604-1468)은 48dp target이며 내부 visual은 모두 28px이다. Native visual은 target의 세로 중앙에 두어 iOS는 위·아래 8pt, Android는 위·아래 10dp를 유지한다. Bookmark의 28px IconOnly visual과 More visual은 세로 중앙·가로 오른쪽에 맞추며 두 target 사이 gap은 0이다.
- `04 Screens - Mobile`의 canonical 조립은 Android baseline이다. 2026-08-30 readback 기준 직접 SECTION 하위
  `390×844` FRAME 85개와 screen INSTANCE 17개(overlay 4개, Profile lifecycle 13개)가 Android source 또는
  platform-neutral source를 사용한다.
  Home [`4524:3985`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-3985)·Local
  [`4524:4139`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139)은 Android
  `TabList` 48dp, `PostActionBar` 48dp, `BottomTabBar` 96dp를 연결한다. 별도 Android preview 두 장은 이 canonical
  consumer와 중복되어 제거했다.
- Android [`TabList 4515:11869`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4515-11869)는
  48dp touch 영역을 유지하고 visual boundary를 `y=44`에 둔다. 선택 Underline의 하단과 boundary가 맞닿으며,
  Android/iOS `TabList` 안의 nested `Tab`은 같은 platform variant만 사용한다.
- [`01 Mobile Web exceptions`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1938-880)은
  public routes 4개, route-owned Search results, Feedback Idle·Error 7개만 격리하고 Web 28px source를 유지한다.
- [`05 iOS representative deltas`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-2488)는
  Notifications, Search, Home [`6619:7918`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6619-7918),
  Post detail, Settings 5개만 유지한다. iOS Home은 47pt shell top safe area, iOS `TabList`, 44pt `PostActionBar`,
  108pt `BottomTabBar`를 사용한다. platform-neutral `__MobileFullscreenComposerShell`은 동일 화면을 중복 생성하지 않는다.
- iOS post-detail Target [`1943:2837`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-2837)은
  screen-owned [`PostListItem assembly 6783:1507`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6783-1507) 안에서
  [`PostActionBar 6783:1515`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6783-1515)를 iOS 44pt source에 연결한다.
  shared `PostListItem`의 nested swap이 기존 28px bounds를 보존하므로 이 Native Target frame만 화면 수준 assembly를 사용한다.
  이 분리는 runtime Native 적용 완료를 뜻하지 않는다.
- 위 Target/source consumer는 Figma evidence다. production padding, Native hit area, Toast retry·persistent lifecycle과
  VoiceOver·TalkBack focus boundary는 아직 구현·runtime 완료로 세지 않는다.

DSN-51의 플랫폼별 완료 판정은 다음처럼 Figma 확인과 runtime 검증을 분리한다.

| 플랫폼     | Figma에서 확인한 범위                                                                                                                                                                                                   | 미확인·Product 후속                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android    | `390×844` canonical baseline, Android `TabList`·`PostActionBar`·`BottomTabBar`, Light/Dark 대표 consumer와 route/state·overlay 조립                                                                                     | 실제 48dp 입력 영역, Safe Area·IME reflow, TalkBack name·state·focus order와 production source 적용, 현재 Native `/feedback` page를 overlay/sheet Target으로 이관하는 Product 계약 |
| iOS        | [`05 iOS representative deltas`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-2488)의 Notifications·Search·Home·Post detail·Settings, iOS `TabList`·44pt `PostActionBar`·108pt `BottomTabBar` | 대표 5개 밖의 parity, 실제 44pt 입력 영역, Safe Area·keyboard·VoiceOver·font scaling, 현재 Native `/feedback` page를 overlay/sheet Target으로 이관하는 Product 계약                |
| Mobile Web | [`01 Mobile Web exceptions`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1938-880)의 public route·Search·Feedback Target과 Web 28px source                                                        | 실제 viewport·keyboard·zoom/reflow·focus lifecycle, 현재 Web direct `/feedback` fallback을 overlay-only Target으로 이관하는 Product 계약                                           |

`확인`은 위 Figma node의 geometry·source/instance·mode readback만 뜻한다. 실제 runtime 증거가 없는 항목은
`미확인`으로 유지하고 DSN-51 완료를 제품 구현 완료로 일반화하지 않는다.

### DSN-51 Mobile assembled consumer coverage (2026-08-30, 2026-09-03 correction)

- [`Composer and overlay consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56043)는
  Composer Light [`6732:50502`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6732-50502)·Dark
  [`6732:50505`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6732-50505)에 `03 Patterns`의 private
  DSN-61 [`__MobileFullscreenComposerShell`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5284-38074)
  `Viewport=Full, Content=Empty` variant [`5235:9474`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5235-9474)를
  각각 하나씩 연결한다. 두 Target consumer는 `390×844`와 Light/Dark mode를 소유하고 candidate source의 Current
  승격을 뜻하지 않는다. 기존 Mobile ReplyComposer Light/Dark 조립은 제거하고 같은 section의
  [`Focused · Keyboard 6665:56053`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56053)와
  [`Context · Initial anchor 6665:56250`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56250)이
  전역 Mobile Composer를 재사용한다. Focused는 `@kosmo님에게 답글` 최소 맥락만 표시하고, Initial anchor에서는
  Parent를 기본 viewport 위에 숨긴다. [`Parent revealed on upward scroll 7392:27994`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7392-27994)는
  Action Bar 없는 `PostListItem` Parent와 공개 범위 위 border까지 연결된 thread line을 보여준다. Drawer/ProfileSwitcher도 route가 아니므로 별도 route FRAME을 만들지
  않는다. Web-only Feedback bottom sheet는 `01 Mobile Web exceptions`로 이동했다.
- [`Composer state consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6771-10454)는
  같은 Candidate source의 Full Media·Poll·CW와 Keyboard Empty·Media·Poll·CW Light 변형 7개를 실제
  `390×844` Target consumer로 연결한다. 8개 source variant 모두 최소 1개 consumer를 가지며, source 내부
  Auto Layout을 그대로 상속한다. Candidate source를 Current로 승격하거나 production keyboard avoidance·
  Poll·CW 동작 완료로 세지 않는다.
- [`/compose` Native route Target](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6847-52049)은
  Product migration 전 호환 진입 근거로만 남고, 상태 표본은 canonical Mobile Composer overlay lifecycle로 분류한다.
  [`Loading 6919:12624`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6919-12624)은
  visibility row, 40px Avatar·작성자·본문 editor와 64px 도구 영역을 공용 `Skeleton`으로 표현한다.
  [`Initial error exit 6921:52548`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6921-52548)은
  Composer를 제거하고 이전 Home surface 위에 기존 Danger Toast를 표시한다. [`Profile required 6922:12635`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6922-12635)는
  transient 오류가 아니므로 안내 상태와 Home action을 유지한다. 작성 중 게시·업로드 실패는 이 initial-load
  이탈 계약을 상속하지 않고 draft를 보존한다. 이는 Candidate source의 Current 승격이나 실제 navigation·retry·
  accessibility runtime 완료를 뜻하지 않는다.
- [`Mobile route and state consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6704-9407)는
  `/settings/profile` default·Profile required, Post detail deleted, Search 9상태와 Mobile Composer overlay 3상태,
  총 15개를
  Android baseline FRAME으로 묶는다. Profile required·Post deleted·Search no results의 360px StateView는 route
  content 중앙에 정렬하고, `/settings/profile` content는 좌우 15px과 360px form row를 사용한다. 공용 source와 screen-owned safe area 경계를 유지한다.
- Mobile 검색의 Initial은 탭 없이 유지한다. Loading·No results·Initial error·Cached error·People success와
  Popular·Latest·Media 미구현 상태는 실제 Android `TabList`의 `인기 / 최신 / 미디어 / 사람` 4탭을 사용한다.
  People 상태는 `사람`을 선택하고 `ProfileListItem`·64px Profile skeleton만 표시하며, 나머지 세 탭은 임의 결과 대신
  `Product not implemented`를 유지한다. iOS 결과 consumer도 같은 4탭의 iOS `TabList`를 사용한다.
- Mobile [`followers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-1852)·[`following`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-1998)은
  ProfileHero 없이 `~님의 팔로워`·`~님의 팔로잉` PageHeader와 Android `팔로워 / 팔로잉` TabList를 가진 독립 route다.
- [`Profile content tabs consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6713-10042)는
  Default와 Pinned Light/Dark에 `게시물 / 답글 / 미디어` TabList를 추가한 Target 복제본이다. 기존 Pinned
  Light [`4843:4813`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4843-4813)·Dark
  [`4843:4898`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4843-4898) consumer도 같은 TabList를 사용하며 답글·미디어의 Product 구현 완료를 뜻하지 않는다.
- [`PostMediaViewer compact lifecycle`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6571-7605)는
  image stage와 semantic detail panel을 세로 Auto Layout으로 조립한다. 모든 Mobile 비키보드 lifecycle은
  `654px` stage와 `y=654` detail anchor를 유지하고, Light landscape 16:9와 Dark portrait 3:4 Media는 stage 안에서
  비율을 보존해 가로·세로 중앙에 contain한다. Media Error [`6665:55675`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-55675)는
  중앙 state 대신 기존 Danger Action Toast [`7380:55058`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7380-55058)를 사용한다. shared Compact source 승격과
  runtime lifecycle은 별도 후속 범위다.
- [`Post action overlays and picker`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6772-10989)는
  Quick reaction Light/Dark, Repost·Quote menu Light/Dark, More menu Light와 FullReactionPicker Browse Light/Dark를
  실제 PostMediaViewer Open 배경 위 child overlay로 조립한다. Quick Picker는 reaction trigger 위에 놓이며 배경
  Media·원문·Action Bar를 바꾸지 않는다. 모든 base stage/detail은 각각 `654px`/`y=654`이며 Quick selector는
  `y=726`이다. Repost·More·Full Picker도 같은 Viewer를 유지한다. Delete confirmation
  Light/Dark는 기존 공용 confirmation evidence로 분리해 유지한다.
- [`ProfileSwitcher overlay lifecycle`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6773-11566)는
  Drawer의 ProfileSwitcher OpenLong을 기존 host·scrim·drawer 안에서 교체한 Target이다. picker 목록과 새 프로필
  추가 행은 scroll/fixed 영역을 나누고, Drawer의 primary navigation만 남은 높이를 채워 스크롤하며 divider 아래
  footer는 바닥에 고정한다. Feedback Error는 Web exception section으로 이동했다. `blockedBy`는 별도 오류 화면이
  아니라 기존 Profile route shell 안에서 cover·avatar·표시 이름·handle만 남긴 최소 ProfileHero와 actionless
  StateView로 통일한다. Mobile [`6774:12067`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6774-12067),
  Compact [`7371:19453`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7371-19453),
  Full [`7380:20771`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7380-20771) Target을 두며,
  bio·수치·게시물·관계 action은 숨긴다.
- 같은 section의 Mobile [`blocking 7580:14180`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7580-14180)은
  기존 Android Dark Profile route shell과 최소 `ProfileHero`를 재사용하고, action이 있는 `StateView`에
  `차단한 프로필입니다`와 Secondary `차단 해제`만 제공한다. bio·수치·게시물·Follow·Message action은
  표시하지 않으며 실제 해제 mutation과 완료 피드백은 Product/runtime 범위다.
- 같은 section의 Mobile muted direct Profile Target [`7541:14061`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7541-14061)은
  기존 Android baseline Profile shell을 복제하고 `ProfileHero`의 `Muted=true`만 적용해 전체 Profile·Post·BottomTabBar를
  유지한다. 별도 `StateView`나 새 컴포넌트는 추가하지 않으며 Dark·runtime lifecycle은 후속 범위다.
- [`Mobile Screen Inventory`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6653-25532)의
  `Main route/state contracts · 38`은 `/compose` Empty·Loading·Error + Retry·Profile required를 각각 분리해 기록하고,
  `Assembled Target consumers + contract review · 15`는 Composer 7-state consumer, Post content warning의 Mobile
  List/detail 4-state consumer와 moderation direct consumer를 기록한다. moderation 행은
  `blocking 7580:14180`·`blockedBy 6774:12067`·`muted 7541:14061`을 함께 참조하고, `Remaining Mobile contract review`는
  confirmation, retained-list pagination loading과 Native/direct `/feedback`의 Product/runtime 소유권만 남긴다.

#### Screens 승격 결과와 남은 검증 공백

Components·Patterns의 source/specimen은 재사용·배치 근거이지 canonical product screen 증거가 아니다. 2026-08-28
현재 `02 Components`, `03 Patterns`, `04 Screens - Mobile`, `05 Screens - Web`을 대조한 결과는 다음과 같다.
`06 Prototypes / Flows`와 `07 Archive`는 canonical screen을 대신하지 않으며, Prototypes의 Reaction motion demo도
Reaction People route로 세지 않는다.

| surface                 | 2026-08-28 canonical evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 판정과 남은 경계                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Post Activity           | [`05 Screens - Web` Target section](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-16233)과 [`04 Screens - Mobile` Social activity section](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-21917)에 Reposts·Quotes 6개 FRAME이 있다.                                                                                                                                                                                                                                                                                                                | Full·Compact·Mobile의 canonical Screen gap은 닫혔다. URL·Back fallback, data·empty·error·pagination·scroll restoration은 Product/runtime 범위다. |
| Reaction People         | 같은 Web Target section과 Mobile Social activity section에 Full·Compact·Mobile `Default selected` 3개 FRAME이 있고 DSN-60의 collapsed filter source를 재사용한다.                                                                                                                                                                                                                                                                                                                                                                                                                                   | canonical Screen gap은 닫혔다. expanded/collapsed interaction, URL·focus·loading·error·pagination은 Product/runtime에서 검증한다.                |
| Mute·Block 설정         | Web Target section과 [`04 Screens - Mobile` Moderation settings section](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6571-7604)에 `뮤트한 프로필`·`차단한 프로필` loaded list가 Full·Compact·Mobile 각 1개씩 총 6개 FRAME으로 있다. Full 두 화면의 Settings master는 두 destination의 하위 목록을 직접 제공하고, Compact category FRAME [`6338:1641`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6338-1641)과 Mobile category FRAME [`6393:8193`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6393-8193)이 같은 순서를 제공한다. | Full·Compact·Mobile의 category→destination Screen gap은 닫혔다. loading·empty·error·pagination과 해제 mutation은 runtime state coverage다.       |
| PostMediaViewer         | [`Compact Web open`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25262)과 [`Mobile compact lifecycle`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6571-7605)의 Open Light/Dark·Loading·Error·Unavailable consumer가 image stage와 `PostLayout` detail panel을 세로 Auto Layout으로 조립한다. Mobile 비키보드 consumer는 stage/detail `654px` anchor를 공유하고 Media Error는 공용 Danger Action Toast를 사용한다.                                                                                                                                 | route로 세지 않는 overlay coverage다. shared source 승격과 실제 modal lifecycle은 후속 범위다.                                                   |
| ReplyComposer           | `03 Patterns`의 Web modal은 기존 source를 유지하고, [`Mobile composer and overlay consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56043)는 전역 Mobile Composer의 Focused/Keyboard·Initial anchor와 Parent upward-scroll reveal consumer를 사용한다. 기존 Mobile ReplyComposer fullscreen 조립은 제거했다.                                                                                                                                                                                                                                                       | 독립 route FRAME이나 Mobile 전용 Composer source를 추가하지 않는다. 실제 upward-scroll·keyboard·dismiss·focus runtime은 Product에서 검증한다.    |
| Profile target selector | `ProfileLifecycleScreen` source가 [`Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4867-13083), [`Compact`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4868-38112), [`Full`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-45172) `TargetSelectorOpen`을 제공하고 Full consumer [`6316:48437`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-48437)가 연결된다.                                                                                                                                | viewport별 lifecycle source gap은 닫혔다. selector의 실제 선택·저장·focus·dismiss 동작은 runtime 완료 증거가 아니다.                             |

2026-08-31에는 공용 [`PostContent`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4476-11690)에
`CW=None|Collapsed|Revealed`를 추가하고, [`PostListItem`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1924-1992)과
[`PostLayout`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4690-28152)이 중첩 `PostContent` 속성을
노출하도록 연결했다. [`Post content warning placement`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5028-7437)의
실제 consumer proof는 Collapsed에서 warning만, Revealed에서 warning 다음 8px 아래에 content가 이어지며 두 부모가
Auto Layout으로 높이를 다시 계산하는 것을 확인한다. 이는 source·placement 조립 근거이며 canonical Screen이나 runtime
reveal state·접근성 동작 완료 증거는 아니다.

같은 날 [`21 Post content warning consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6961-12634)에
Android baseline Light `390×844` Target 4개를 추가했다. 목록은 기존 `/home` shell과 `PostListItem`을 재사용해
Collapsed [`6961:12641`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6961-12641)·Revealed
[`6961:12651`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6961-12651)를, 상세는 기존 게시글
route shell 안의 current row를 `PostLayout`으로 조립해 Collapsed
[`6961:12661`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6961-12661)·Revealed
[`6961:12668`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6961-12668)를 비교한다. 네 화면은
중첩 `PostContent`의 `CW`만 교체하며 세로 Auto Layout이 `PostActionBar`와 후속 row를 다시 배치한다. 기존 canonical
화면과 Dark consumer는 변경하지 않았고, disclosure interaction·공유 reveal state·VoiceOver·TalkBack·실제 hit area는
runtime 검증 범위다.

Search Popular·Media, Profile edit, Profile Replies·Media처럼 `Candidate`·`Product not implemented`로 이미
inventory에 등록된 항목은 누락 화면으로 다시 세지 않는다. canonical route family의 광범위한 공백은 찾지
않았다. Mobile `blocking`·`blockedBy`·`muted` direct consumer는 Target으로 조립됐고, Mute·Block confirmation
sheet 배치와 retained-list pagination loading은 Product/runtime 계약 전 임의 geometry를 만들지 않는다. 현재
Native/direct `/feedback` page는 누락 화면이 아니라 호환 runtime route이며, overlay-only Target으로 이관하는
별도 Product 계약에서 제거 여부와 Native presentation을 결정한다. Inventory의 `Remaining Mobile contract review`
행은 이 계약·runtime 후속을 Target screen coverage와 분리한다.

runtime route tree와 main 38개를 family 단위로 대조하면 기존 주요 route의 광범위한 누락은 없다. `/compose`는
현재 route의 Empty와 RouteBoundary Loading·Error, selected-profile guard를 standalone Target FRAME으로 분리하고,
`/feedback`의 일반 진입 Target은 overlay로 유지하고 현재 Web direct URL·Native page는 별도 Product migration으로 분리한다.
standalone default visibility와 Compact detail inline Reply는 Target migration,
Loading·Empty·Error·Deleted·Pinned는 기존 route의 state coverage다. route 파일 수와 Figma FRAME 수를 같게
맞추지 않는다.

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
- `12 Exploration · Mobile composer fullscreen · DSN-61` — 모바일 전체 화면 Composer의 반응형 상태와 편집기 후보
- `17 Post deletion confirmation placement · DSN-61` — 기존 More·ActionMenu·ModalSheet 정본을 조합한 삭제 확인 배치 표본
- `19 DSN-61 · Composer Dark coverage · representative` — 기존 Light pattern을 복제해 정본 `PostComposer` 상속과
  Dark mode만 검증하는 대표 표본

`01`–`05`는 승인된 component 조합을 비교·검토하는 snapshot이며 해당 제품 화면에 채택됐다는 evidence는 아니다.
`06`과 `12`는 제품 IA·route·저장 계약을 승인하지 않는 exploration이고, `17`은 정본 source의 배치·상태 조합,
`19`는 Dark mode·반응형 배치·source 상속만 검증한다. 어느 쪽도 Foundation, component source, `docs/design`과
연결된 Product 이슈의 계약을 대체하지 않는다.

#### DSN-43 PostComposer source 계약

- `Rail`·`Overlay`의 모든 public `PostComposer` variant는 하나의 공용
  [`__ComposerFooter`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4096-2528) source를
  instance로 소비하며 footer action row를 consumer마다 복제하지 않는다.
- Footer action availability는 `__ComposerFooter`의 `Show media action`·`Show poll action`·
  `Show CW action`·`Show emoji action`·`Show submit` Boolean property로 독립 노출한다. Figma source와 완성형
  specimen은 다섯 action을 모두 기본 `true`로 두며, Product는 아직 구현하지 않은 action을 같은
  property·capability flag로 숨긴다. 모바일 fullscreen처럼 header가 제출 action을 소유하는 consumer는
  `Show submit=false`로 footer의 Button만 숨기고 남은 글자 수 counter는 유지한다.
- `CW active`·`Poll active`는 action 노출 여부와 별개인 modifier state다. `03 Patterns` specimen이
  Poll·Emoji action을 켜두어도 Product 기능이 준비됐다는 의미가 아니며, runtime capability·feature flag·interaction
  lifecycle은 Product가 소유한다.
- [`__ComposerCWField`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4049-27766)는
  `Lines=1|2`가 하나의 exposed `Value`를 공유한다. 두 줄 상태도 별도 문구 layer를 덧붙이지 않고 같은 값을 최대 두 줄로
  wrap한다.
- [`__ComposerPollEditor`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3705-8002)의
  선택지 입력은 canonical `TextField`, 복수 선택은 canonical `Checkbox`, 선택지 추가·제거는 canonical `Plus`·`X`를
  소비한다. 단일 선택 표시는 공용 Radio source가 생기기 전까지 Poll 내부의 semantic-token-bound control로 유지한다.
- [`PostComposerMediaItems`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2190-4182)는
  attachment gallery만 소유하며 `__SensitiveMediaRow`를 직접 노출하지 않는다. ALT와 향후 이미지 편집은
  attachment별 상태지만 민감도는 canonical Post Content의 단일 `sensitiveMedia` 값이다. 어느 Ready attachment에서
  `ComposerMediaEditor Tool=Sensitive`로 진입해도 같은 값을 편집하며 모든 Ready attachment가 결과를 함께 표시한다.
  `__SensitiveMediaRow` source는 탐색용 candidate를 위해 보존하지만 production `PostComposerMediaItems` consumer에서는
  사용하지 않는다. attachment별 민감도는 별도 domain/API 계약이 추가될 때 도입한다.
- Ready attachment의 우측 상단 편집 action은 canonical `Pen`을 `20×20`으로 사용하고 `Show edit action`으로
  노출을 제어한다. Rail·Overlay gallery에서는 editor 진입점을 표시하고 `ComposerMediaEditor` 내부 preview에서는
  `false`로 숨긴다. `Expand`는 Composer Rail을 Overlay로 확장하는 별도 semantic action으로 유지한다.
- [`__ComposerMediaItem`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2190-4174)의
  Ready state는 기본 `false`인 `Show ALT status`·`Show sensitive status` Boolean property를 제공한다. ALT가 비어
  있지 않을 때 해당 attachment에만 `ALT` pill을 표시한다. Post의 `sensitiveMedia=true`이면 모든 Ready attachment가
  canonical `Flag`와 `민감` pill을 함께 표시하며, 어느 pill에서 진입해도 같은 `Tool=Sensitive` 값을 편집한다.
  `Show sensitive status`는 attachment별 저장값이 아니라 consumer가 공유 상태를 mirror하기 위한 property다. 두
  status는 각각 `ComposerMediaEditor Tool=Alt`·`Tool=Sensitive`로 바로 재진입한다. Ready thumbnail body의
  pointer/touch도 기본 `Tool=Alt`로 editor를 열되 Remove·Pen·status control은 각 action을 유지한다. Pen은
  keyboard·assistive technology의 명시적 editor 진입점으로 남긴다. pill의 visual height는 `28px`이고 Native는
  투명 wrapper로 iOS `44pt`·Android `48dp` target을 제공한다. Figma는 이 시각·상태 계약만 보장하며 실제 hit
  geometry·event propagation·focus·navigation은 Product에서 검증한다.
- Web footer는 Media → Poll → CW → Emoji 순서로 공용 `IconButton`의 `32×32` target과 `20×20` icon,
  action 사이 `4px` 간격을 사용한다. 글자 수 counter는 `32px`, 제출은 기존 `Button/Compact` `72×32`를 사용해
  `Rail`의 실제 footer 폭 `270px` 안에서 한 줄로 배치한다. 이 규칙은 Web 전용이며 iOS `44pt`·Android `48dp`
  target 계약은 유지한다.
- Overlay 전용 attachment 편집은
  [`ComposerMediaEditor`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5455-38985)
  component set이 `02 Shared domain · Production`에서 소유한다. Web source master는 `920×678`이고 같은 source의
  instance를 `720–920px`에서 resize한다. 우측 tool panel은 `280px`로 고정하고 왼쪽 preview만 남은 폭을 채우며,
  parent Overlay surface는 `min(920px, 100vw - 48px)`를 소유한다. 일반 `PostComposer Surface=Overlay` 자체의
  `600px` 폭은 유지하고, editor 진입 시 같은 parent surface 안의 내용을 교체하면서 editor 폭으로 확장한다.
  별도 `ModalSheet`·scrim을 중첩하거나 `PostComposer`의 `State`·`Rail` variant로 추가하지 않는다.
- `ComposerMediaEditor`는 `Tool=Alt|Sensitive|Image Edit`를 제공한다. `Alt`가 기존 consumer를 보존하는 기본값이고,
  `Sensitive`는 어느 attachment에서 진입해도 Post Content의 공유 `sensitiveMedia`를 편집하며, 토글 결과를 모든
  attachment status pill이 함께 mirror한다. 선택한 이미지는 ALT·향후 이미지 편집을 위한 navigation context이지
  민감도의 소유 단위가 아니다. `Image Edit`는 향후 crop·회전·초점 기능의 확장 구조만 검증하는 specimen이며 현재
  Product 저장·편집 기능을 의미하지 않는다. canonical `TabList`·`Tab/Underline`을 사용하고, 편집할 이미지의
  `48×48` selector는 preview 하단 중앙에서 tool tabs와 분리한다. 이 selector는 Composer 본문의
  `PostComposerMediaItems` gallery를 대체하는 컴포넌트가 아니라 editor 안의 현재 이미지 navigation이다.
- editor header는 `44×44` hit target 안에 기존 Web `IconButton` `32×32`와 canonical `ArrowLeft`·`X`를 사용한다. Back은 draft와
  media를 유지한 채 Composer로 돌아가고, Close는 Composer Overlay 전체를 닫는다. preview 안의 X는 해당
  attachment만 제거한다. 하단 `완료`는 현재 tool의 변경을 draft에 반영하고 Composer로 돌아가며, ALT·향후 이미지
  편집은 선택 attachment에, Sensitive는 Post 전체에 적용한다. Rail에서 편집을 시작해도 같은 Overlay의 editor
  view로 직접 전환한다.
- `< compact` Web과 Android/iOS는 별도 fullscreen editor를 사용한다. scrim, focus trap·restore, Escape,
  discard confirmation, viewport max-height·body scroll, safe area와 mobile keyboard avoidance lifecycle은
  Product의 상위 Overlay 구현이 소유한다.
- `12 Exploration`에 남긴 기존 `600×624`·`SquarePen` PC editor는 `Superseded` decision history다. 새 consumer는
  만들지 않으며 현재 PC 계약은 `__ComposerMediaItem`의 `Pen`과 `ComposerMediaEditor` `920×678` source만 따른다.
- 현재 Typography line-height FLOAT 변수는 `115`·`130`·`150` 같은 백분율 값이지만 Plugin API binding에서는 px로
  해석된다. 이 경로로 편집한 Composer 텍스트는 검증된 CW `16/24`, Poll `14/20`, editor title `20/26`, footer
  counter `130%` line-height를 유지하고 family·size·weight만 variable에 bind한다. 백분율을 안전하게 표현하는 token
  계약이 생기기 전까지 line-height를 기계적으로 bind하지 않는다. `ComposerMediaEditor`가 직접 소유한 text는
  Typography의 `MCP Preview` mode에서 family·size·weight를 bind하고, 중첩 공용 component의 text는 해당 source의
  variable binding을 상속해 로컬 override를 만들지 않는다.

#### DSN-61 모바일 Composer·공용 Confirmation 배치 계약

- [`__MobileFullscreenComposerShell`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5284-38074)은
  public `PostComposer` matrix를 확장하지 않는 private DSN-61 candidate다. 대표 배치로
  `Viewport=Full|Keyboard × Content=Empty|Media|Poll|CW`의 8개 조합을 제공한다. Full의
  [`Poll`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5627-12996)·
  [`CW`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5627-13083)는 Keyboard 변형과 같은
  canonical editor를 소비하고 illustrative keyboard만 제외한다. 본문 `layoutGrow`가 남은 높이를 채우며 footer는
  화면 하단에 유지된다. 8개 variant의 header `글쓰기` fill은 기존 semantic
  `color/foreground/primary` (`VariableID:1660:318`)에 bind해 consumer의 Light/Dark mode를 상속한다.
- 8개 variant의 `Composer body`는 40px `Author row`에 Avatar와 posting identity만 두고, CW·본문·Media·Poll
  editor는 그 아래 358px 전체 폭을 사용한다. Avatar gutter를 편집영역 전체 높이까지 유지하지 않는다.
- 모바일 fullscreen header가 제출 action을 소유하므로 8개 조합 모두 공용 `__ComposerFooter`의
  `Show submit=false`를 유지한다. Poll·CW 표본은 배치와 reflow evidence이며 실제 작성 기능·keyboard avoidance·
  safe area·focus·제출 lifecycle 완료를 뜻하지 않는다.
- `04 Screens - Mobile`의 [`Composer state consumers`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6771-10454)는
  Full Media·Poll·CW와 Keyboard Empty·Media·Poll·CW 7개를 연결한다. 기존 `/compose` Full Empty를 합치면
  8개 variant가 모두 실제 consumer를 가지지만, Keyboard는 illustrative geometry라 Native IME·safe-area reflow는
  별도 runtime QA가 필요하다.
- [`Composer Dark coverage`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5884-14199)는
  Full Web Composer overlay, Full Web thread rail Reply, Compact Web ReplyComposer modal과 전역 Mobile Composer의
  [`Reply Parent upward-scroll reveal Dark representative 5884:14891`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5884-14891)를
  제공한다. 기존 Parent-below preview는 숨기고 새 source를 만들지 않은 채 Light reveal 조립과 기존 instance
  main-component를 그대로 유지하며 nested Light mode override를 제거한 표본이다.
- [`ConfirmationContent`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5103-15173)는
  `Tone=Primary|Danger × State=Idle|Pending`의 공용 단순 확인 content다. `Message`, 선택형 native
  `Supporting content` Slot, 중첩 `Cancel`·`Confirm action` Button을 instance property로 노출한다.
  `Show supporting content=false`가 기본값이며, 필요할 때만 Message 아래·Actions 위에 체크박스·경고·세부 설명
  같은 흐름형 content를 넣는다. Slot content의 상태와 Confirm 활성화 조건은 consumer가 소유한다. action은
  `취소 → 확인` 순서의 `120×40` 두 개를 `space/8` 간격으로 우측 정렬한다. 이 `120×40`은 visual/layout
  bounds다. Web은 같은 bounds를 실제 interaction target으로 사용한다. Native consumer는 visual geometry를
  유지하면서 투명 wrapper 또는 `hitSlop`으로 실제 target을 iOS 최소 `44×44pt`, Android 최소 `48×48dp`로
  확장한다. 서로 다른 action target의 overlap, parent clipping과 VoiceOver·TalkBack focus boundary는
  Product runtime에서 검증한다. Pending은 Cancel을 Disabled, Confirm을 같은 tone의 Loading으로 바꾼다.
  제목·scrim·닫기·centered max-width 420 surface는 canonical
  [`ModalSheet`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1882-926)가 소유한다.
  `Tone`은 visual/action intent이며 접근성 role을 자동 결정하지 않는다. `ModalSheet`는 visual/layout shell이고,
  runtime consumer가 이름이 있는 modal semantic surface 하나를 소유한다. Web의 기본·비파괴 확인은 `dialog`,
  삭제처럼 파괴적이거나 즉각적인 주의가 필요한 확인은 `alertdialog`를 사용하며 둘을 중첩하지 않는다. canonical
  runtime이 단일 role 선택을 지원하기 전에는 현재 consumer-owned semantic surface를 유지할 수 있다. 이는 별도
  visual component source를 허용하거나 현재 runtime geometry·token이 이미 canonical source와 일치한다는 뜻이
  아니다. 정렬은 별도 Product/Frontend migration이 소유한다. role은 비시각 handoff이므로 Figma variant나
  component property를 추가하지 않는다.
- [`Post deletion confirmation placement`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5631-25077)는
  canonical `PostActionBar`의 More, `ActionMenu`, `ModalSheet`, `ConfirmationContent`를
  instance·slot·instance-swap으로 조합한다. 삭제·차단은 Danger, 뮤트·고정 교체는 Primary tone을 사용한다.
  Web은 삭제 Light의 More menu·Idle·Pending과 Dark Idle, Mobile은 삭제 Light의 More menu·Idle과 Dark Idle을
  확인하며 뮤트·차단·고정 교체 표본도 같은 source를 소비한다.
- 대상 정보, 영향 목록, acknowledgement와 인증 handoff를 포함하는 Profile lifecycle 삭제는 선택 Slot만으로 단순
  확인 content에 축약하지 않고 별도 `ProfileLifecycleDeleteConfirmContent`를 유지한다. acknowledgement의
  Checked·Unchecked와 삭제 action의 Disabled·Default 연결도 해당 consumer 계약이다.
- 이 section은 `More → 삭제 → Idle confirmation → Pending`의 responsive placement와 theme 상속만 증명한다.
  Production Screens consumer, focus handoff, dismiss 차단, 접근성 semantics, mutation과 cache 반영은 연결된 Product
  이슈의 runtime 검증으로 남긴다. canonical runtime이 단일 `alertdialog` surface를 지원하기 전에는 현재
  consumer-owned semantic surface를 유지한다. 현재 Post 삭제 runtime의 `480px` max-width와 legacy card·border
  token은 canonical `ModalSheet`의 `420px` 및 `backgroundElevated`·`borderDefault` 계약과 아직 다르며, 이 visual
  정렬은 별도 Product/Frontend migration으로 남긴다. 임시 semantic surface는 별도 visual component source가 아니다.

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
