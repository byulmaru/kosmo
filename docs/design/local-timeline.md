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
- 키보드에서는 기존 `TabList`의 방향키, `Home`, `End`, `Enter`, `Space` 동작과 focus-visible 표현을 유지한다.
- 선택된 Profile이 바뀌면 Local 목록은 이전 Relay actor/store의 connection data, edge와 cursor를 재사용하지
  않는다.

## 상태

| 상태                   | 표시                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 최초 로딩              | 공용 `StateView` loading으로 `로컬 타임라인을 불러오는 중입니다.`를 표시하고 보조 기술에 알린다                               |
| 빈 목록                | `아직 게시글이 없어요` / `첫 게시글이 올라오면 여기에 표시돼요.`                                                              |
| 최초 오류 · Target     | 저장 목록이 없으면 2행 목록 skeleton을 표시하고 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다 |
| 새로고침 오류 · Target | 마지막 성공 목록을 유지하고 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다                     |
| 추가 로딩              | 기존 목록 아래 spinner와 `게시글을 더 불러오는 중입니다.` live status                                                         |
| 추가 오류 · Target     | 기존 목록을 유지하고 `더 불러오지 못했어요` toast와 `다시 시도` action                                                        |
| Profile 없음           | Home과 같은 기존 Profile 생성·선택 흐름으로 이동하는 onboarding을 표시한다                                                    |

세 오류 표현은 연결된 Figma `Target`이며 현재 runtime/OpenSpec 완료 계약이 아니다. 현재 계약은 최초 오류에서 기존
`RouteBoundary`의 `로컬 타임라인을 불러오지 못했어요` / `잠시 후 다시 시도해주세요.` / `다시 시도`를 사용하고,
추가 오류에서는 기존 목록과 `게시글을 더 불러오지 못했어요.` toast 및 재시도 action을 유지한다. Target을 Current로
승격할 때 별도 Product/runtime 작업에서 OpenSpec, runtime과 Web/Native QA를 함께 갱신한다.

## Figma 근거

- [Mobile Home/Local route](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4522-3985)
- [Mobile Local Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139)
- [Mobile Local states](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4657-13349)
- [Mobile Local Initial error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4665-4855)
- [Mobile Local Refresh error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8485)
- [Mobile Local Pagination error](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6576-8495)
- [Web Home/Local route](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4522-24016)
- [Web Local Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4532-9060)
- [Web Local states](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4657-9841)
