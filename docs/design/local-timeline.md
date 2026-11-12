# Local Timeline

인증 사용자의 Home, Local과 Federated는 같은 타임라인 화면군이며 각각 `/home`, `/local`, `/federated` canonical route를 사용한다. 공통 상단 탭의 표시 문구는 `홈`, `로컬`, `연합` 순서이고 최초 진입의 기본 route는 `/home`이다. Local과 Federated를 별도 사이드바나 하단 탭 항목으로 추가하지 않으며, 두 route에서도 기존 홈 내비게이션 항목을 현재 화면군의 active 진입점으로 유지한다.

## 비로그인 Web 첫 화면

PROD-1199의 비로그인 Web 첫 화면(`/`)은 공통 공개 화면의 중앙 콘텐츠에 Local 목록을 표시한다. 로그인과 선택 Profile 없이 첫 조회·다음 페이지 조회와 공개 Profile·Post 탐색을 제공한다. 방문자 메뉴·긴 로고·하단 CTA는 [public-content-onboarding.md](./public-content-onboarding.md)를 따른다.

비로그인 첫 화면의 헤더는 route가 소유하며 모든 Web 화면 폭에서 `타임라인 둘러보기`로 표시한다. 모바일 Web에서는 같은 헤더에 메뉴 진입점을 유지한다.

공개 첫 화면에는 인증용 Home·Local 탭을 추가하지 않는다. 모바일 메뉴 헤더와 기존 목록의 로딩·빈 결과·오류·재시도 표현을 재사용하며, Profile이 없다는 이유로 공개 읽기를 Profile 준비 화면으로 바꾸지 않는다. 인증 `/local`과 Native의 Profile 준비·로그인 흐름은 그대로 유지한다.

## 화면 구조

아래 Home·Local·Federated 탭과 재선택 규칙은 인증 타임라인에 적용한다.

- 모바일과 Web 모두 기존 `PageHeader` 아래에 공용 `TabList`와 underline `Tab`을 배치한다.
- 선택된 underline 탭은 하단 중앙의 `action/primary/base` 64×4px 채움 인디케이터로 표시한다. 인디케이터는
  border가 아니라 `Tab/Underline`이 소유하는 별도 요소다.
- TabList 하단 전체에는 탭과 타임라인 콘텐츠를 구분하는 1px `border/subtle` boundary를 표시한다. 64×4px
  인디케이터는 이 하단 boundary 위에 놓이며 탭 사이의 세로 border나 바깥 좌우 border는 추가하지 않는다.
- 탭은 상단에 고정하고 목록만 스크롤한다. 모바일 Web에서는 route의 브랜드 헤더와 탭을 하나의 sticky 영역으로 유지한다.
- Home, Local과 Federated는 기존 `PostListItem`을 사용하며 timeline 전용 게시글 카드나 목록 primitive를 만들지 않는다.
- Home은 선택한 Profile의 실제 게시 요청 가운데 처리 중이거나 실패한 항목만 카드로 게시글 목록 위에 표시하며, 카드 배치는 목록의 header로 조합한다. 표시 상태는 `QUEUED`·`PROCESSING`·`PUBLISHING`·`CONFIRMING`·`FAILED`다. 게시 완료(`PUBLISHED`)·취소(`CANCELLED`)된 요청은 Home 카드에서 사라지고, 실제 Post 표시는 기존 권한·목록 정책을 따른다. 표시할 카드가 없으면 영역을 생략하고 빈 상태·로딩·오류 안내, 제목, 테두리, 이력·전체 보기 링크를 표시하지 않는다. 전용 게시 요청 화면이나 사이드바 메뉴·대체 경로를 두지 않는다. Native에서는 하나의 `FlatList`가 스크롤을 소유하고 Web에서는 기존 문서 흐름을 유지한다.
- 목록의 색상, 간격과 typography는 기존 semantic token을 사용한다. 현재 앱 설정과 전역 Provider가 Light로
  고정되어 있으므로 Local은 별도 theme 전환을 추가하지 않으며, Dark 실화면 검증은 앱 전역 theme 활성화 뒤
  수행한다.
- 기존 Local 화면의 완료 검증은 Web Light를 대상으로 한다. Native 당겨서 새로고침(PROD-1005)은 별도로
  iOS·Android에서 홈·로컬 각각 성공·실패·재시도와 페이지 읽기의 공존을 검증해야 하며, 인증된 Native runtime
  증거가 없으면 해당 검증을 미완료로 기록한다.
- Local·Federated route에서 게시글 작성자와 카드를 선택하면 기존 Profile 및 Post detail route로 이동한다.

## 상호작용

- Web에서 비활성 탭을 선택하면 해당 canonical route로 전환한다. Android/iOS에서는 현재 타임라인
  부모 route의 `timeline` 파라미터와 자식 콘텐츠만 바꾸며 새 Stack 화면이나 전환 animation을 만들지 않는다.
  `/home`, `/local`, `/federated`는 Native 직접 진입의 canonical route로도 계속 동작한다.
- Home에 새 Post가 추가되면 이미 열린 목록에 수동 새로고침 없이 반영한다. 실제 Post를 목록 맨 위에 자동으로
  추가하므로 최신 위치에서는 바로 보이고, 이전 Post를 읽고 있으면 읽던 위치를 유지한다. 사용자가 자연스럽게
  목록 맨 위로 스크롤하면 새 Post가 보인다.
- 이미 선택된 상단 홈, 로컬 또는 연합 탭을 다시 선택하면 현재 타임라인 맨 위로 스크롤하고 해당 화면의 기존 refresh
  경로를 실행한다. 현재 탭과 route를 유지하며, 새로고침 중에도 마지막 목록을 계속 표시한다. 진행 중 반복 입력은
  스크롤을 수행하고 기존 refresh 경로가 중복 요청을 막는다.
- 비활성 탭 선택은 기존 타임라인 진입 동작을 따른다. 이 재선택 정책으로 전환에 별도 새로고침을 추가하지 않는다.
- 같은 Profile actor에서 Home route로 재진입하면 직전 목록을 즉시 표시하면서 최신 Home을 백그라운드에서 다시
  가져온다. 이 자동 갱신은 별도 loading indicator를 표시하지 않는다. 당겨서 새로고침은 사용자가 요청하는 기존
  새로고침 경로로 유지한다.
  Mute·unmute 또는 확정된 follow·unfollow 성공 후에는 다음 Home 재진입에서 서버의 목록 정책을 다시 적용한다.
  Follow 요청 생성·취소는 해당하지 않으며, mutation 직후 timeline을 강제로 조회하지 않는다.
- 앱이 다시 활성화되거나 실시간 업데이트 연결이 복구되면 최신 Home을 자동으로 확인한다. 이전 Post를 읽고 있을
  때는 최신 목록으로 교체해 읽던 내용을 밀어내지 않고 생명주기 갱신을 대기한다. 사용자가 자연스럽게 목록 맨
  위로 돌아오면 대기 중인 최신 Home 확인을 실행해 그 결과를 반영한다.
- Web의 sidebar·mobile drawer·하단 탭 바에서 `/local` 또는 `/federated`의 active 홈 항목을 다시 실행하면 `/home`으로 이동하지
  않고 document scroll을 최상단으로 이동한 뒤 현재 타임라인의 새로고침 경로를 실행한다.
- compact·full Web의 Local·Federated 헤더 브랜드 마크도 현재 타임라인을 재선택한다. 실제 link 대상은 `/home`으로
  유지해 새 탭·modifier 활성화는 홈 진입으로 처리한다. 모바일 Web과 Android/iOS 헤더의 브랜드 마크는
  비상호작용 요소로 유지하며 Android/iOS bottom navigation의 재선택·scroll 정책은 변경하지 않는다.
- 키보드에서는 기존 `TabList`의 방향키, `Home`, `End`, `Enter`, `Space` 동작과 focus-visible 표현을 유지한다.
- 선택된 Profile이 바뀌면 Local 목록은 이전 Relay actor/store의 connection data, edge와 cursor를 재사용하지
  않는다.

## 상태

| 상태                      | 표시                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 최초 로딩                 | 공용 `StateView` loading으로 `로컬 타임라인을 불러오는 중입니다.`를 표시하고 보조 기술에 알린다                                                                                                              |
| 빈 목록                   | `아직 게시글이 없어요` / `첫 게시글이 올라오면 여기에 표시돼요.`                                                                                                                                             |
| 최초 오류 · Current       | 성공 목록을 렌더링한 적이 없으면 Web은 빈 목록 영역을, Android/iOS Native는 공통 2행 목록 skeleton을 표시하고 두 플랫폼군 모두 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다 |
| 새로고침 중               | Web은 별도 상단 spinner를 표시하지 않는다. Android/iOS Native는 목록의 기본 당겨서 새로고침 진행 표시를 사용한다                                                                                             |
| 새로고침 오류 · Current   | 마지막 성공 목록을 유지하고 `로컬 타임라인을 불러오지 못했어요` / `다시 시도` persistent toast를 표시한다                                                                                                    |
| 추가 로딩                 | 기존 목록 아래 spinner와 `게시글을 더 불러오는 중입니다.` live status                                                                                                                                        |
| 추가 오류 · Target        | 기존 목록을 유지하고 `더 불러오지 못했어요` toast와 `다시 시도` action                                                                                                                                       |
| 인증 Local의 Profile 없음 | Home과 같은 기존 Profile 생성·선택 흐름으로 이동하는 onboarding을 표시한다                                                                                                                                   |

추가 로딩 spinner는 공용 secondary 전경 색상(`theme.foregroundSecondary`)을 사용한다.

상단 Home·Local·Federated 탭 재선택, Local·Federated의 shell 홈 항목 재선택과 Native pull-to-refresh는 각 화면이 소유한 기존 Relay
query·environment와 refresh 경로를 재사용한다. 성공 payload는 동일 store에 적용하고, hard transport error에서는
마지막 성공 목록과 scroll position을 유지한 채 persistent retry toast를 표시한다. Web과 Native 모두 새로고침
요청이 진행 중이면 refresh owner가 반복 입력에 따른 중복 요청을 막고, 요청이 끝나면 다시 새로고침할 수 있다.
Local은 refresh token을 사용하고 `onComplete` 오류를 공용 Relay fail-open boundary로 전달해 Toast를 열며, route
이탈·selected Profile 전환 때 stale toast를 정리한다. Local 목록은 refetch 오류 경계 밖에서 동일한 Relay store를
계속 읽는다. 실패·재시도 때 경계는 refetch와 Toast만 교체하며, 목록과 열린 답글 작성창·입력 내용은 재마운트하지
않는다. Relay refetch lifecycle을 사용한다. 사용자가 다시 시도할 수 있는 Local hard refresh 오류는 unexpected-error
reporter에 별도 보고하지 않는다. HTTP 200의 `data + errors`는 Relay가 처리하며 사용 가능한 부분 데이터를 적용한다.
`localTimeline: null`이면 목록의 빈 상태를 표시할 수 있다. Natural Language Mute Rule은 선택한 Profile에 규칙이 있을 때 기존 제외 판정이 있는 다른 Profile 게시글에만 적용하며, viewer 작성 Post와 판정이 없는 Post에는 적용하지 않는다. 다음 페이지가 더 있어도 보이는 게시글이 늘지 않으면 `더 보기`로 이어서 볼 수 있다. 현재 pin 관계가 있는 Post는 viewer와 무관하게 cursor·limit 전에 Local 후보에서 제외하고, 저장된 pin 순서는 적용하지 않는다. Pin 해제 뒤 후속 서버 조회는 기존 정책에 따라 다시 포함할 수 있지만 이미 로드된 Relay connection은 새 조회 전까지 유지될 수 있다. Remote Featured sync가 Note를 저장한 뒤 최종 pin snapshot을 교체하기 전에는 새 Post가 잠시 보일 수 있다. Post 직접 조회는 이 Local 전용 제외에 영향을 받지 않는다. 기존 접근 권한과 cursor 기준은 유지한다.

Local query가 성공 결과를 렌더링하기 전 발생한 오류는 Web의 빈 목록 영역 또는 Android/iOS Native의 2행 skeleton과
공용 persistent Toast로 표시한다. 성공 결과에는 빈 목록과 route 재진입 뒤 Relay cache에서 렌더링한 목록도 포함한다.
성공 결과를 한 번 렌더링한 뒤 hard refresh 요청이 실패하면 cache 목록을 유지하고 같은 persistent retry Toast를
표시한다. 최초 오류 전용 Web 빈 배경이나 Native skeleton으로 목록을 대체하지 않는다.
추가 오류도 기존 목록과 자동으로 사라지는 `게시글을 더 불러오지 못했어요.` / `다시 시도` toast를 유지한다.
Storybook의 오류·재시도 검증은 실제 Web·Native network/runtime QA 완료를 뜻하지 않는다.

Federated는 [Federated Post List 정책](../domain/policies/post-list.md#federated-post-list)에 따라 Local과 이미 수신된 Remote의 Public top-level 게시글을 표시하고, 같은 Profile 준비, loading, empty, error, retry와 pagination 표현을 사용한다. 화면별 타임라인 이름이 들어가는 문구에서 `로컬`은 `연합`으로 표시하며, 비로그인 Web 첫 화면은 계속 Local만 제공한다.

### Home 오류 동작 (현재 사용자 결정 기반 구현 결정, 2026-09-09)

- 최초 Home query가 완전한 Relay timeline data 없이 실패하면 blocking 오류 화면과 `다시 시도` action을 표시하고,
  프로필 onboarding으로 대체하지 않는다. 이 오류는 기존 unexpected-error reporter에 한 번만 보고한다.
- 이미 표시 중인 Home timeline을 새로고침하거나 재검증하는 query가 실패하면 현재 timeline 내용을 유지하고,
  Web과 Android/iOS 모두 Local과 동일하게 persistent 오류 toast와 `다시 시도` action을 제공한다. 재시도 성공
  또는 화면 이탈 시 오류 toast를 정리한다. blocking 오류 화면이나 별도 inline 오류·재시도 상태로 교체하지 않는다.
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
