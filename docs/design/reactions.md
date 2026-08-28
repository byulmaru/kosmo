# Reaction UI

## 범위와 정보 구조

Reaction UI는 Post에 Reaction을 추가·삭제하는 Quick Picker와 Unicode-first Full Picker, 이미 등록된 Reaction의 Type별 count를 보여 주는 요약 row, Reaction을 남긴 Profile을 확인하는 전용 route로 구성한다.

- 일반 Post와 Quote Post는 화면에 표시한 해당 Post를 Reaction 대상으로 사용한다.
- 순수 Repost는 바깥 Repost가 아니라 source Post를 Reaction 대상으로 사용한다.
- 목록과 상세 화면은 같은 대상 결정 규칙과 UI를 사용한다. Reaction 요약 row는 Post body 또는 source body 아래, Post Action Bar 위에 표시한다.
- Post surface는 `reactionTarget`을 한 번 결정하고 Quick Picker, 요약 row, Profile 목록에 같은 Post ID를 전달한다. 같은 surface 안에서 서로 다른 Post를 읽거나 변경하지 않는다.
- 이미지 기반 custom reaction의 asset·data·category 계약, API·DB 변경, 전역 toast, 범용 anchored popover, Reply composer, Post Action Bar의 일반 More action menu, 로그인·가입·Profile 선택 onboarding 자체는 이 계약의 범위가 아니다. Action Bar 부모 surface는 기존 인증·Profile 선택 진입점을 재사용할 수 있지만 Reaction feature가 그 흐름을 새로 구현하지 않는다.

## Reaction Quick Picker

Reaction Quick Picker는 현재 제공된 Reaction option을 빠르게 선택하는 펼쳐진 패널이다. option 목록과 toggle intent는 부모가 공급하며 Picker는 플랫폼별 시각 표현만 소유한다.

### 형태

- Web option은 Figma Post Action Bar의 28px 밀도와 함께 사용할 수 있도록 32×32 CSS px의 둥근 사각형으로 정규화하며 radius는 12px이다. emoji는 20px, option 사이 gap과 panel padding은 각각 4px이다. border를 포함한 panel의 전체 높이는 약 42px이다.
- Native Quick Picker selector는 현재 iOS·Android 모두 44 logical unit을 유지하므로 Android 48×48dp baseline을 아직 충족하지 않는다. 반면 Figma `__ReactionSummaryItem`과 PROD-752의 공용 `Tab` 기반 Profile filter는 iOS 44pt·Android 48dp layout box를 표현한다. 이 Figma source만으로 production runtime이 변경됐다고 보지 않으며, Native 출시 전 Quick Picker를 포함한 실제 target과 assistive technology·touch 동작을 별도로 검증한다.
- 바깥 컨테이너는 border가 있는 둥근 직사각형이며 radius는 16px이다.
- option 자체에는 border를 표시하지 않는다.
- 선택 여부는 border가 아니라 option 아래에 분리한 배경 layer로만 구분한다.
- 선택 배경은 기본 상태에서 `primary`, pressed 상태에서 `primaryHover`를 사용하고 각각 70% opacity로 표시한다. 이 opacity는 배경 layer에만 적용하며 emoji는 100% opacity를 유지한다.
- 오류 상태에도 빨간 border를 표시하지 않는다. 마지막 server-confirmed 선택 배경을 유지하고 접근성 문구와 재시도 동작으로 오류를 전달한다.

### Pending과 Disabled

- pending option의 emoji는 그대로 표시한다.
- 투명한 overlay가 option의 네 방향을 0으로 채워 option 전체를 덮는다.
- Web overlay 가운데에는 배경 track이 없는 16×16px spinner를 표시한다. spinner는 2px 두께의 연결된 180° 호이며, `textSecondary` 색의 짙은 head에서 완전히 투명한 tail까지 자연스럽게 흐려진다.
- Native spinner와 target geometry는 이번 Web 우선 변경에서 수정하지 않는다.
- spinner 호는 `motion/duration/loading-cycle` 800ms마다 시계 방향으로 한 바퀴를 linear하게 회전한다. 점이나 분리된 spoke를 사용하지 않는다.
- overlay는 emoji 뒤에 렌더되는 sibling의 paint order를 사용하며 별도 `zIndex`를 두지 않는다.
- pending option만 입력을 막고 다른 Type은 계속 선택할 수 있다.
- Picker 전체가 disabled이면 비활성 UI를 표시하지 않고 Picker를 렌더링하지 않는다.

### 유지하는 계약

- 부모가 공급한 option 순서와 opaque ID를 그대로 사용한다.
- 서로 다른 Reaction Type은 동시에 선택될 수 있다.
- option은 button role, pressed·busy 상태와 상태별 접근성 label을 제공한다.
- trigger, popover 위치, Post Action Bar 배치, mutation·Relay/cache는 Picker의 시각 표현 범위가 아니다.

## Full Reaction Picker

Full Reaction Picker는 Quick Picker를 폐기하지 않고, Unicode emoji를 검색하거나 category별로 탐색해 더 많은 Reaction을 선택하는 확장 surface다. custom reaction의 데이터·asset 계약이 정해지기 전에는 별도 custom section이나 실패 화면을 추측해 추가하지 않는다.

- Figma source는 `Presentation=Web | Mobile`과 `State=Browse | SearchResults | Empty | Loading`을 조합한 8 variants다. `Browse`는 검색, 빠른 반응, 최근 사용, category와 전체 emoji grid를 표시하고, `SearchResults`는 검색 결과만, `Empty`는 검색 결과 없음만, `Loading`은 spinner만 표시한다. Picker 전체 `Error` variant는 만들지 않는다.
- Web은 trigger에 붙는 non-modal dialog를 사용한다. 열릴 때 검색 field로 focus를 옮기고 같은 trigger, `Escape`, 바깥 클릭으로 닫은 뒤 focus를 trigger에 복원한다.
- Mobile은 modal bottom sheet를 사용한다. `Browse`의 initial height는 480, `SearchResults`·`Empty`·`Loading`의 expanded height는 720이다. `Scrolled`는 expanded sheet의 runtime scroll 위치 표본이지 별도 source variant가 아니다.
- Mobile은 열릴 때 software keyboard를 자동으로 띄우지 않고 sheet title부터 탐색한다. backdrop tap, drag dismiss, Android back으로 닫고 focus를 원래 trigger로 복원한다.
- dialog의 접근성 이름은 `반응 선택`이다. 검색 field, category와 Reaction button은 식별 가능한 이름과 selected 상태를 제공한다. 결과 영역은 Loading에서 busy 상태와 시각적으로 숨긴 `반응을 불러오는 중` 문구를 함께 노출한다.
- spinner는 `motion/duration/loading-cycle` 800ms마다 linear하게 회전한다. reduced motion에서는 회전을 제거하고 정적인 `···`로 대체한다.
- sticky header·category, grid scroll, safe area, software keyboard, Web keyboard, VoiceOver·TalkBack의 실제 focus·dismiss·reflow는 Production runtime QA에서 검증한다.

## Post Action Bar 통합

- 실제 Post Action Bar의 Reaction action은 현재 여섯 Type을 zero-count 여부와 무관하게 client catalog에서 공급하고, selected Profile의 `viewerReactions`를 선택 상태로 사용한다.
- Reaction trigger는 Web·iOS·Android 모두에서 trigger에 붙은 작은 floating popover를 열며 같은 trigger를 다시 누르면 닫힌다. 화면 공간에 따라 위·아래로 전환하고 viewport와 safe area 안으로 수평 위치를 제한한다. option row의 고유 너비가 가용 너비보다 크면 target 크기를 줄이지 않고 feature-local `ScrollView` shell 안에서 수평 scroll을 허용한다.
- popover는 외부 클릭·터치, Web `Escape`, Android back, 대상 Post unmount 또는 selected Profile 전환으로 닫힌다. Web에서는 열릴 때 첫 option으로 focus를 옮기고 닫힐 때 trigger로 focus를 복원한다.
- 한 Type을 선택하거나 해제한 뒤에도 popover를 유지해 여러 Type을 연속으로 조작할 수 있다.
- Action Bar 부모 surface는 target 자체가 적격한 Reaction trigger를 세션 상태와 분리해 해석한다. guest는 기존 인증 진입으로 위임하고, valid 세션에서 selected Profile이 없으면 `ShellChromeContext.openProfileSwitcher()`로 기존 Profile 선택기를 연다. session error에서는 trigger를 disabled로 유지한다. 어떤 resolution에서도 popover나 mutation을 먼저 시작하지 않으며, Profile 선택 성공 뒤 원래 Reaction을 자동으로 재실행하지 않는다.
- 이 통합은 기존 Post Action Bar의 Reaction 자리만 소유한다. 전체 action 조립과 범용 ActionMenu 일반화는 하지 않는다.

## Reaction 요약 row

- Post에 하나 이상의 Reaction이 있을 때만 요약 row를 표시한다. Reaction이 없으면 별도 빈 영역이나 zero-count Type을 표시하지 않는다.
- standalone `반응` 제목은 표시하지 않는다.
- count는 server가 제공한 양수 값을 사용하고 조회된 Profile 수로 다시 계산하지 않는다. 표시 순서는 Product가 공급한 ordered Type을 그대로 사용하며 Design System이나 `ReactionSummary`가 server 순서, count 내림차순, viewer 선택 여부 중 하나를 임의로 적용하지 않는다.
- Figma private source `__ReactionSummaryItem`은 `Platform=Web | iOS | Android`, `Item=Reaction | Selected | Overflow`를 제공한다. Web은 32px, iOS는 44pt, Android는 48dp 높이이며 모두 radius 12, emoji 20px, count 14px, 내부 gap 4px, 좌우 padding 8px을 사용한다. 현재 production runtime 반영은 연결된 Product 이슈가 별도로 소유한다.
- 요약 row의 token은 Profile 목록을 여는 control이 아니라 해당 Type의 Reaction을 추가·삭제하는 toggle이다. 선택 상태, pending, error와 disabled 상태는 Quick Picker와 동일한 controller에서 공급한다.
- 선택된 token은 Quick Picker와 동일하게 이모지·count와 분리한 `primary` 배경 layer를 70% opacity로 표시하고, pressed 상태에서는 `primaryHover`를 사용한다. 이모지와 count는 100% opacity를 유지한다.
- 이미 다른 사용자가 남겨 둔 token도 선택한 Profile의 Reaction이 없으면 추가하고, 있으면 삭제한다. mutation이 성공하기 전에는 count나 선택 상태를 바꾸지 않는다.
- selected Profile이 없으면 token은 보이지만 disabled이며 mutation을 시작하지 않는다.
- 양수 count Type이 하나라도 있으면 token 뒤에 Reaction People 진입 control을 항상 한 개 표시한다. 모든 Type token과 `Ellipsis`가 한 줄에 완전히 들어가면 canonical `Ellipsis` icon을 사용하고 접근성 이름은 `반응한 프로필 보기`로 제공한다. 이 control은 selected Profile이 없어도 사용할 수 있다.
- 모든 Type token과 `Ellipsis`가 들어가지 않으면 같은 item geometry의 `+N` control로 trailing control을 교체한다. `N`은 숨겨진 Reaction Type 수이며 숨겨진 Reaction count의 합이 아니다. 접근성 이름은 `숨겨진 반응 유형 N개, 반응한 프로필 보기`로 제공한다.
- width-fit은 trailing People control의 폭을 항상 먼저 예약한다. 모든 Type과 `Ellipsis`가 들어가면 전체 token을 표시한다. 그렇지 않으면 Product 순서의 마지막 token부터 하나씩 제외하고, 제외할 때마다 새 `N`의 실제 렌더링 폭으로 다시 계산해 표시 token과 `+N`이 모두 완전히 들어갈 때까지 반복한다. token이나 trailing control을 축소·클리핑하지 않고 wrap이나 horizontal scroll도 사용하지 않는다.
- 한 줄에 표시할 최대 Type 수와 viewer-selected Type의 우선 배치는 Product 정책이다. Figma의 viewer-priority 표본은 선택 반응을 overflow 앞에 보존할 수 있다는 후보만 보여 주며 정렬 규칙을 확정하지 않는다. `16`을 포함한 외부 서비스의 표시 수는 참고값일 뿐 KOSMO 상한이 아니다.
- 향후 Product가 2~3줄 요약을 명시적으로 확정하면 위 한 줄 계약을 그때 교체한다. multi-line variant는 pill끼리 겹치지 않는 범위에서 세로 간격을 최소화해 조밀하게 배치하고, 큰 row gap이나 카드처럼 분리된 행 표현은 사용하지 않는다. 정확한 줄 수, 세로 gap과 전체 높이 상한은 해당 Product 계약과 함께 확정한다.

## Reaction People route

- 요약 row의 trailing People control은 overflow가 없으면 `Ellipsis`, overflow가 있으면 `+N`으로 표시하며 둘 다 overlay를 열지 않고 `반응한 사람` 전용 route로 이동한다. 이 surface에는 scrim, X, 바깥 영역 dismiss를 두지 않고 `PageHeader`의 Back action으로 이전 화면에 돌아간다.
- 화면 순서는 `PageHeader(반응한 사람) → pill filter → Profile 목록`으로 고정한다. 목록 안에 `반응한 사람` 제목을 다시 표시하지 않는다.
- Compact·Full Web에서는 기존 shell의 중앙 600px route column만 교체하며 Full Web의 `RightRail`은 유지한다. Mobile은 pushed dedicated screen을 사용하고 현재 shell 계약에 따라 `BottomTabBar`를 유지한다.
- Target screen evidence는 [`05 Screens - Web`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-16233)과
  [`04 Screens - Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-21917)의
  Full·Compact·Mobile `Default selected` 3개 Light FRAME이다. expanded/collapsed filter는 DSN-60 Pattern
  source의 interaction coverage로 유지한다.
- server가 제공한 양수 count Type과 순서를 그대로 사용한다. 처음 진입할 때 server 순서의 첫 Type을 선택하고, 사용자가 pill을 바꾸면 해당 Type의 Profile 목록을 표시한다.
- collapsed filter는 server 순서의 앞 6개와 같은 줄의 `+N` control을 표시한다. 현재 선택 Type이 앞 6개 밖에 있으면 앞 5개와 현재 선택 Type을 표시해 선택 상태를 숨기지 않는다. `+N`을 펼치면 전체 Type을 wrap해 표시하고 다시 접을 수 있다.
- Reaction pill 묶음은 접근성 `tablist`, 각 pill은 selected 상태를 가진 `tab`으로 노출한다. `+N`과 접기 control은 tablist 밖의 button이며 각각 `나머지 반응 N개 모두 보기`, `반응 목록 접기`로 이름을 제공한다. Type 전환 뒤 focus는 선택한 tab에 유지하고 목록 갱신을 보조 기술에 알리는 실제 동작은 runtime QA에서 검증한다.
- 각 pill은 emoji와 count, selected 상태를 표시한다. 각 Profile row 왼쪽에는 해당 Profile이 남긴 Reaction Type을 식별할 수 있는 emoji를 표시하고, Profile 정보 영역은 기존 `ProfileListItem`의 `Bio=False, Action=Follow` 계약을 재사용한다. Follow action은 관계에 따라 `팔로우`, `팔로잉`, `요청됨` 상태를 표시한다.
- Profile row의 border는 인접한 Profile 사이에만 표시한다. 마지막 row 뒤에는 표시하지 않으므로 Profile이 한 명이면 separator가 없다. pagination 영역의 별도 상단 border는 유지한다.
- Profile 목록의 최초 조회가 실패하면 header와 filter를 유지한 route content 안에 오류와 다시 시도 동작을 표시한다.
- 추가 page 조회가 실패하면 이미 표시한 Profile을 유지하고 목록 내부에 오류와 다시 시도 동작을 표시한다. 이 조회 오류에 snackbar나 toast를 사용하지 않는다.
- 같은 Type의 route를 다시 방문할 때 cache된 Profile을 먼저 표시하고 background에서 최신 목록을 조회한다. Profile 전환 뒤에는 이전 actor의 cache를 재사용하지 않는다.
- token toggle의 mutation 오류와 Profile 조회 오류는 서로 독립적이다. 한쪽 오류가 다른쪽 interaction을 막지 않는다.
- Figma는 route의 시각 구조만 확정한다. 실제 URL, history가 없는 직접 진입의 Back fallback, sticky·scroll restoration·focus와 empty/error/pagination 동작은 연결된 Production 이슈와 runtime QA가 소유한다.
- 현재 production code의 `ReactionProfilesModal`은 연결된 Production 이슈에서 이 route로 교체하기 전까지 남아 있다. 이 디자인 결정만으로 runtime 반영이 완료됐다고 보지 않는다.

## Mutation과 공유 상태

- private `PostReactionController`가 한 `reactionTarget`의 `viewerReactions`, Type별 pending·error, mutation과 Relay cache 갱신을 소유한다. generic context나 공용 mock infrastructure로 일반화하지 않는다.
- Quick Picker option과 요약 token은 같은 controller 상태와 toggle 동작을 사용한다. 한쪽에서 성공한 변경은 같은 surface의 다른쪽에 즉시 같은 server-confirmed 상태로 보인다.
- 선택 상태와 count는 optimistic하게 바꾸지 않는다. mutation payload가 성공을 확인한 뒤에만 해당 Type의 상태를 반영한다.
- add/delete mutation payload는 대상 Post의 현재 `viewerReactions`와 `reactionCounts`를 함께 반환한다. Relay가 이 Post를 정규화한 결과를 선택 상태와 count의 authoritative 상태로 사용하며, client에서 count delta를 계산하거나 별도 refetch로 보정하지 않는다.
- 요청한 Type만 pending으로 막고 다른 Type은 계속 조작할 수 있다. 같은 Type의 연속 입력은 하나의 operation만 만들지만 서로 다른 Type은 동시에 진행할 수 있다.
- mutation 실패는 해당 Type에 기존 inline `오류, 다시 시도` 상태를 표시하며 전역 toast를 추가하지 않는다. 실패 전 선택 상태와 count를 유지하고 재시도는 해당 Type의 오류만 지운다.
- 필요한 mutation payload가 있으면 GraphQL `errors`가 함께 있어도 해당 Reaction 결과는 성공으로 처리한다. payload가 없거나 network가 실패하면 기존 선택 상태와 count를 유지한다.
- mutation과 Relay cache 갱신은 요청을 시작한 selected Profile의 Relay Environment 안에서 끝낸다. 이전 actor의 늦은 성공·실패 callback은 새 actor의 popover, pending, error, 선택 또는 count UI를 변경하지 않는다.
- 같은 actor의 여러 화면에서 동시에 보낸 요청을 client 전역에서 직렬화하지 않는다. 서로 다른 Type의 응답 순서는 보존되지만 같은 Type의 cross-surface 응답 순서는 server 결과에 따른다.

## 컴포넌트 경계

- `ReactionSelector`는 Quick Picker의 플랫폼별 presentation만 소유한다.
- `FullReactionPicker`는 Unicode-first 검색·category 탐색과 Web dialog·Mobile sheet presentation을 소유한다. custom reaction의 asset·data·API와 runtime fetch·cache는 소유하지 않는다.
- private `ReactionAction`과 `ReactionPopover`는 Action Bar trigger와 anchored popover를 소유한다.
- private `PostReactionController`는 한 Post의 toggle 상태와 mutation/cache 동작을 소유한다.
- private `__ReactionSummaryItem`은 Web 32px·iOS 44pt·Android 48dp의 reaction, selected, `+N` item presentation을 소유한다.
- `ReactionSummary`는 Product-ordered input을 한 줄 width-fit으로 조합하고 `Ellipsis` 또는 `+N`의 항상 도달 가능한 People 진입점을 표시하는 presentation을 소유한다. 표시 상한과 정렬 정책은 소유하지 않는다.
- `PostReactionSummary`는 count·controller와 Reaction People route 진입을 연결한다.
- Reaction People route content는 pill filter, reaction emoji prefix, 기존 `ProfileListItem`·`FollowButton`을 사용한 Profile 목록, pagination과 조회 오류를 소유한다. 별도 범용 modal shell이나 Reaction 전용 Profile identity row는 만들지 않는다.
- `PostListItem`과 `PostLayout`은 일반·Quote·순수 Repost의 `reactionTarget`을 한 번 결정해 목록과 상세에 전달한다.
- `PostActionBar`에는 Reaction 전용 private controller 연결만 추가하며 generic slot이나 범용 menu abstraction을 만들지 않는다.

## 검증

- Storybook interaction에서 Web option의 exact 32×32px, 20px emoji, 16×16px spinner와 2px stroke, 70% selected 배경, 오류 재시도와 disabled 시 미렌더링을 검증한다.
- Full Picker는 8 source variants, Web dialog와 Mobile 480·720 sheet geometry, 검색 결과 없음과 spinner-only Loading, reduced-motion 정적 대체를 검증한다. 실제 focus·dismiss·safe area·keyboard·screen reader 동작은 Figma 완료와 분리해 runtime에서 검증한다.
- Reaction 요약은 Web 32px·iOS 44pt·Android 48dp item geometry, standalone 제목 제거, Quick Picker와 공유하는 selected·pending·error 상태를 검증한다.
- 타임라인 `PostListItem`의 실제 content column인 Mobile 314px과 Center Web 524px에서 모든 Type과 `Ellipsis`가 들어가면 전체 token과 `Ellipsis`를 표시하는지, 그렇지 않으면 `+N` 폭을 먼저 예약한 뒤 완전히 들어가는 token만 Product 순서로 표시하는지 검증한다. `N`이 숨겨진 Type 수인지, wrap·horizontal scroll·부분 clipping이 없는지도 함께 확인한다. detail `PostLayout`의 390px·600px full-width row는 별도 consumer로 확인한다. viewer-selected 저빈도 Type 표본은 후보 표시일 뿐 정렬 규칙이나 표시 상한으로 해석하지 않는다.
- mutation 성공 전 상태 불변, 성공 payload Post의 authoritative 선택·count·순서 정규화, 실패 시 기존 상태 보존, Type별 동시성·재시도, selected Profile별 Environment 격리를 검증한다.
- 일반·Quote는 own Post ID, 순수 Repost는 source Post ID를 목록과 상세 각각에서 사용하는지 검증한다.
- Action Bar trigger는 target이 적격할 때 guest에서 기존 인증 진입, valid 세션의 selected Profile 부재에서 기존 Profile 선택기 진입, session error에서 disabled인지 검증한다. resolution 전에는 popover·mutation이 없고 Profile 선택 뒤 원래 Reaction을 자동 재실행하지 않는다. 요약 token toggle은 selected Profile이 없으면 계속 disabled이며 trailing People control과 Profile 목록 조회는 가능해야 한다.
- Reaction People route의 Back header, 양수 count pill 순서, 기본 선택, collapsed `앞 6개 + +N`, selected-outside-top-six 보존, expanded 전체 Type, item emoji, `ProfileListItem`의 팔로우·팔로잉·요청됨 상태, Profile 사이 separator, pagination·최초/추가 조회 재시도와 actor별 cache 격리를 검증한다.
- 390px Mobile, 1024px Compact Web, 1440px Full Web에서 전용 route가 기존 shell 계약을 유지하는지 검증한다. Full Web은 `RightRail`, Mobile은 `BottomTabBar`를 보존하고 route 안에는 modal chrome이 없어야 한다.
- 320px, 390px, 600px Web viewport에서 Quick Picker가 viewport 안에 머물고 exact 32px target을 유지한 채 feature-local horizontal scroll로 접근 가능한지 실제 관찰한다. 요약 row는 같은 viewport에서 scroll 대신 한 줄 width-fit과 항상 도달 가능한 trailing People control을 유지하고, overflow가 있을 때만 이를 `+N`으로 표시해야 한다.
- 자동 검증과 Web runtime 관찰을 분리해 기록한다. iOS·Android runtime은 이번 Web 우선 범위의 완료 증거가 아니며 Native 출시 전 44pt·48dp target과 assistive technology 동작을 별도로 관찰한다.
