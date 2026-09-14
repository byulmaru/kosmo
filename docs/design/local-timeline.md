# Local Timeline

Home과 Local은 같은 타임라인 화면군이며 각각 `/home`, `/local` canonical route를 사용한다. 공통 상단 탭의
표시 문구는 `홈`, `로컬` 순서이고 최초 진입의 기본 route는 `/home`이다. Local을 별도 사이드바나 하단 탭 항목으로
추가하지 않으며, `/local`에서도 기존 홈 내비게이션 항목을 현재 화면군의 active 진입점으로 유지한다.

## 화면 구조

- 모바일과 Web 모두 기존 `PageHeader` 아래에 공용 `TabList`와 underline `Tab`을 배치한다.
- 선택된 underline 탭은 하단 중앙의 `action/primary/base` 64×4px 채움 인디케이터로 표시한다. 인디케이터는
  border가 아니라 `Tab/Underline`이 소유하는 별도 요소다.
- TabList 하단 전체에는 탭과 타임라인 콘텐츠를 구분하는 1px `border/subtle` boundary를 표시한다. 64×4px
  인디케이터는 이 하단 boundary 위에 놓이며 Home과 Local 사이의 세로 border나 바깥 좌우 border는 추가하지 않는다.
- 탭은 상단에 고정하고 목록만 스크롤한다.
- Home과 Local은 기존 `PostListItem`을 사용하며 Local 전용 게시글 카드나 목록 primitive를 만들지 않는다.
- 목록의 색상, 간격과 typography는 기존 semantic token을 사용한다. 현재 앱 설정과 전역 Provider가 Light로
  고정되어 있으므로 Local은 별도 theme 전환을 추가하지 않으며, Dark 실화면 검증은 앱 전역 theme 활성화 뒤
  수행한다.
- 현재 완료 검증은 배포·실행 가능한 Web Light를 대상으로 한다. Android/iOS 공용 route와 component는 유지하되
  인증된 Native runtime 증거가 없는 상태를 미검증으로 기록하고 이 change의 완료 blocker로 사용하지 않는다.
  Native 전달·QA가 재개되면 해당 시점의 지원 범위와 runtime 검증 책임을 다시 정한다.
- Local route에서 게시글 작성자와 카드를 선택하면 기존 Profile 및 Post detail route로 이동한다.

## 상호작용

- 비활성 탭을 선택하면 해당 canonical route로 전환한다.
- 이미 선택된 Local 탭을 다시 선택하면 현재 목록의 최신 데이터를 다시 요청한다.
- Web의 sidebar·mobile drawer·하단 탭 바에서 `/local`의 active 홈 항목을 다시 실행하면 `/home`으로 이동하지
  않고 document scroll을 최상단으로 이동한 뒤 같은 Local 새로고침 경로를 실행한다.
- compact·full Web의 Local 헤더 브랜드 마크도 현재 Local 타임라인을 재선택한다. 실제 link 대상은 `/home`으로
  유지해 새 탭·modifier 활성화는 홈 진입으로 처리한다. 모바일 Web과 Android/iOS 헤더의 브랜드 마크는
  비상호작용 요소로 유지하며 Android/iOS bottom navigation의 재선택·scroll 정책은 변경하지 않는다.
- 키보드에서는 기존 `TabList`의 방향키, `Home`, `End`, `Enter`, `Space` 동작과 focus-visible 표현을 유지한다.
- 선택된 Profile이 바뀌면 Local 목록은 이전 Relay actor/store의 connection data, edge와 cursor를 재사용하지
  않는다.

## 상태

| 상태                    | 표시                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 최초 로딩               | 공용 `StateView` loading으로 `로컬 타임라인을 불러오는 중입니다.`를 표시하고 보조 기술에 알린다                                                                                                              |
| 빈 목록                 | `아직 게시글이 없어요` / `첫 게시글이 올라오면 여기에 표시돼요.`                                                                                                                                             |
| 최초 오류 · Current     | 성공 목록을 렌더링한 적이 없으면 Web은 빈 목록 영역을, Android/iOS Native는 공통 2행 목록 skeleton을 표시하고 두 플랫폼군 모두 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다 |
| 새로고침 중             | Relay의 `store-and-network` 조회 상태를 따른다. 별도 상단 spinner는 표시하지 않는다                                                                                                                          |
| 새로고침 오류 · Current | 마지막 성공 목록을 유지하고 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다                                                                                                    |
| 추가 로딩               | 기존 목록 아래 spinner와 `게시글을 더 불러오는 중입니다.` live status                                                                                                                                        |
| 추가 오류 · Target      | 기존 목록을 유지하고 `더 불러오지 못했어요` toast와 `다시 시도` action                                                                                                                                       |
| Profile 없음            | Home과 같은 기존 Profile 생성·선택 흐름으로 이동하는 onboarding을 표시한다                                                                                                                                   |

추가 로딩 spinner는 공용 secondary 전경 색상(`theme.foregroundSecondary`)을 사용한다.

Local 탭 재선택의 hard refresh는 기존 Relay query·environment를 재사용한다. 성공 payload는 동일 store에 적용하고,
hard transport error에서는 마지막 성공 목록과 scroll position을 유지한 채 persistent retry toast를 표시한다.
refresh token을 사용하고 `onComplete` 오류를 공용 Relay fail-open boundary로 전달해 Toast를 열며, route
이탈·selected Profile 전환 때 stale toast를 정리한다.
목록은 refetch 오류 경계 밖에서 동일한 Relay store를 계속 읽는다. 실패·재시도 때 경계는 refetch와 Toast만
교체하며, 목록과 열린 답글 작성창·입력 내용은 재마운트하지 않는다. 요청 중복 제어·Disposable 저장·명령형
refetch 등록은 추가하지 않고 요청 lifecycle은 Relay에 맡긴다.
이 사용자가 다시 시도할 수 있는 hard refresh 오류는 unexpected-error reporter에 별도 보고하지 않는다.
HTTP 200의 `data + errors`는 Relay가 처리하며 사용 가능한 부분 데이터를 적용한다. `localTimeline: null`이면 목록의
빈 상태를 표시할 수 있다. query·cursor·filtering 정책과 추가 페이지 로딩 동작은 유지한다.

Local query가 성공 결과를 렌더링하기 전 발생한 오류는 Web의 빈 목록 영역 또는 Android/iOS Native의 2행 skeleton과
공용 persistent Toast로 표시한다. 성공 결과에는 빈 목록과 route 재진입 뒤 Relay cache에서 렌더링한 목록도 포함한다.
성공 결과를 한 번 렌더링한 뒤 hard refresh 요청이 실패하면 cache 목록을 유지하고 같은 persistent retry Toast를
표시한다. 최초 오류 전용 Web 빈 배경이나 Native skeleton으로 목록을 대체하지 않는다.
추가 오류도 기존 목록과 자동으로 사라지는 `게시글을 더 불러오지 못했어요.` / `다시 시도` toast를 유지한다.
Storybook의 오류·재시도 검증은 실제 Web·Native network/runtime QA 완료를 뜻하지 않는다.

### Home 오류 동작 (현재 사용자 결정 기반 구현 결정, 2026-09-09)

- 최초 Home query가 완전한 Relay timeline data 없이 실패하면 blocking 오류 화면과 `다시 시도` action을 표시하고,
  프로필 onboarding으로 대체하지 않는다. 이 오류는 기존 unexpected-error reporter에 한 번만 보고한다.
- 이미 표시 중인 Home timeline을 새로고침하거나 재검증하는 query가 실패하면 현재 timeline 내용을 유지하고 Home
  오류 toast만 표시한다. blocking 오류 화면이나 별도 inline 오류·재시도 상태로 교체하지 않는다.
- 이 Home 결정은 위 표의 최초·새로고침 `Target` 표현보다 우선한다. Local의 해당 상태와 Figma Target 승격 범위는
  기존 계약을 유지한다.

## Figma 근거

- [Mobile Home/Local route](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4522-3985)
- [Mobile Local Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139)
- [Mobile Local states](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4657-13349)
- [Mobile Local Initial error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4665-4855)
- [Mobile Local Refresh error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8485)
- [Mobile Local Pagination error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8495)
- [Web Home/Local route](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4522-24016)
- [Web Local Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-9060)
- [Web Local Initial error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5560-13625)
