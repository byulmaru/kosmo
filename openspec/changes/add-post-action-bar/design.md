## Context

`apps/app`은 Android·iOS·Web을 공유하는 React Native 애플리케이션이며, 게시글 목록과 상세는 공통 Post Action Bar와 composite Relay fragment를 사용한다. UI theme에는 `textSecondary`, `primary`, spacing·typography token과 compact/full breakpoint가 있고 `lucide-react-native`가 이미 설치되어 있다. 기존 공용 `Button`은 일반 텍스트 버튼에 맞춘 최소 높이 40px 계약이어서, Figma 기반 28px Action Bar control에 그대로 사용하기 어렵다.

[KOSMO Action 컴포넌트](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005)는 Reply → Repost → Reaction → Bookmark → More 순서, 16px icon/count, 4px 내부 간격, 약 50px social action 영역과 측정 높이 약 27px을 보여 준다. `docs/design/post-action-bar.md`는 이를 production 정수값 28px로 정규화하고 Bar·control 높이 28, Reply·More control slot의 content column 양끝 정렬, social action 너비 50, More target 너비 최소 28을 canonical geometry로 확정한다. Figma에는 pending·disabled와 접근 가능한 실패 toast가 없으므로 상태·피드백 계약은 기존 구현을 유지한다. Figma는 이 change에서 수정하지 않으며 비규범적 시각 참고로만 사용한다. `docs/domain`·`docs/design`은 제품·디자인의 canonical source, Linear는 범위·소유권·의존성의 source, `post-action-bar` spec은 상태·입력·접근성·통합 동작의 규범 계약이다.

공유 change의 계약 부모는 PROD-432다. PROD-433은 독립 UI와 상태 카탈로그를, PROD-414는 최초 production surface 배치와 Repost menu·toast를, PROD-432는 준비된 나머지 action 상태 연결·최종 정책·More 링크 복사·통합 검증의 기존 완료 이력을 소유한다. 이후 완료된 sibling PROD-598은 More의 작성자 삭제 항목·확인 dialog·mutation·cache·실패 계약을 소유하며, PROD-432 production surface는 이 결과를 링크 복사와 조합하고 순서·자격·회귀만 통합 검증했다. PROD-432 완료 뒤 발견된 실제 Clipboard 런타임 회귀와 남은 archive는 PROD-632가 인계받는다. PROD-434는 canceled ownership record로만 유지한다. Reply·Repost·Reaction·Bookmark 자체의 저장·GraphQL·count 집계·도메인 상태 의미·권한·Content·Reply Parent·Repost Source 관계 조합 및 Post Visibility 정책은 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425와 canonical 문서의 계약을 재사용한다. Post Action Bar 배치·Repost menu·toast와 삭제 More menu는 `docs/design/post-action-bar.md`, Post Share Reference는 ADR 0015와 Post 객체 문서를 따른다.

## Goals / Non-Goals

**Goals:**

- 하나의 고정된 공개 `PostActionBar` API로 다섯 액션의 순서, optional 표시, 상태와 callback 경계를 제공한다.
- Reply `expanded`, Repost `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`를 처리 상태와 독립적으로 모델링하고 범용 `selected` 공개 prop을 만들지 않는다.
- Reaction·Bookmark count를 제외하고, 선행 계약이 제공한 Reply·Repost의 optional count는 실행 환경 locale의 표준 compact formatting으로 표시한다.
- 같은 React Native 구현이 Android·iOS·Web에서 28 logical unit geometry와 접근성 metadata를 제공한다. Web은 24×24 CSS px 최소 target을 충족하고 Native target 복구는 출시 gate로 분리한다.
- UI, surface 배치, 실제 데이터 연결을 각 구현 이슈가 독립적으로 리뷰·검증할 수 있게 하면서 하나의 공유 spec으로 최종 결과를 묶는다.
- PROD-632가 mock 검증과 실제 Clipboard 런타임 사이의 차이를 확인한다. 현재 구현 slice는 실제 복사 실패 감지와 복구 UX를 제공하며, 동일 환경의 변경 전 실패·변경 후 성공 근거를 확보한 뒤에만 링크 복사 자체의 복구 완료와 최종 change 정합성·archive를 판단한다.

**Non-Goals:**

- Toolbar container가 child mutation payload, cache update 정책, navigation 또는 Content·Reply Parent·Repost Source 관계 조합 정책을 재구현하는 것. 구현된 private child action은 자기 Relay fragment·mutation·pending·파생 상태를 colocate할 수 있다.
- Toolbar container가 clipboard 또는 private child action의 menu·mutation 상태를 다시 구현하는 것. Repost child와 production `PostDeletionAction` child는 각각 자기 action menu의 open·dismiss·선택을 fragment·mutation 경계와 함께 조립할 수 있다.
- 새로운 More action이나 삭제 domain 계약을 이 change에서 정의하는 것. 완료된 PROD-598의 삭제 action은 현재 production menu에 조합하지만 삭제 확인·mutation·cache·실패 소유권을 재구현하지 않는다. 새로운 guest 인증 목적지·임시 인증 화면 또는 새로운 Profile 선택 화면도 만들지 않고 기존 플랫폼 인증 진입과 `ShellChromeContext.openProfileSwitcher()`를 재사용한다.
- 액션을 임의 배열로 조립하는 범용 toolbar API나 공개 action leaf 컴포넌트를 제공하는 것
- 기존 개별 action 계약을 재정의하거나 Figma 파일을 동기화하는 것

## Implementation Guidance

### Current Constraints

- 게시글 렌더 경로는 route → `PostLayout`/`PostList` → `PostListItem`이며, `PostActionBar`의 composite fragment는 준비됐지만 production surface에는 아직 배치되지 않았다. PROD-414가 `PostListItem`·`PostLayout` 내부에서 최초 배치와 Repost 연결을 함께 소유하고 `PostList`, route 또는 `actionBar?: ReactNode` seam을 추가하지 않는다.
- `Button`의 40px 일반 버튼 metric과 loading/disabled 표현은 Action Bar의 16px glyph·count, 28px target과 도메인 상태+pending 조합에 맞지 않는다.
- React Native Web을 공유하므로 DOM element, CSS selector, Web 전용 event에 의존한 구현은 native 계약을 깨뜨린다.
- Figma의 측정 높이 약 27px은 production 정수값 28px로 정규화한다. Web은 28×최소 28 target 안에 24×24 CSS px 사각형을 포함하며, Native의 28pt·28dp는 출시 전 임시 예외로만 사용한다.
- 선행 action 계약이 제공하는 Reply count와 아직 config 기반인 도메인 상태의 cache 소유권은 상위 Relay/surface 계층에 있다. 구현된 Repost child는 composite parent fragment 아래 자기 fragment·mutation·pending과 viewer-relative 파생 상태를 colocate하되 toolbar container가 mutation payload나 cache update 정책을 재구현하지 않는다.
- 현재 `PostMoreMenu`와 Storybook Clipboard mock은 canonical URL 생성, 성공·rejection과 menu dismiss를 검증하지만 실제 Web·Native Clipboard adapter의 secure context·permission·platform 동작을 증명하지 않는다. 확인된 production bundle에서는 `EXPO_PUBLIC_WEB_ORIGIN` env가 literal `undefined`로 주입되어 clipboard 호출 전에 URL 생성이 실패했다. `postClipboard` 경계는 false-positive를 제거해 실패 감지와 복구 UX를 보장할 뿐, 이 원인을 제거하거나 실패 환경의 복사 성공을 보장하지 않는다. PROD-632의 5.1은 이 원인 재현과 mock·adapter 차이의 기록으로 완료하고, 5.4는 변경 후 Web runtime 성공과 지원 Native runtime 증거가 확보될 때까지 미완료로 유지한다.

### Recommended Approach

PROD-433에서는 `apps/app/src/components/post`에 공개 `PostActionBar` 하나를 추가하고, 반복되는 Pressable·icon·count·spinner·접근성 처리는 같은 모듈의 비공개 control로 캡슐화한다. 현재 공개 props는 `post` composite fragment ref와 `reply`, `reaction`, `bookmark`, 독립 UI용 `more` config, production 합성용 `moreItems`·`onDeleted`, Repost error callback으로 고정한다. Repost의 최종 disabled 행동을 연결할 concrete host input 또는 fragment shape는 actual production caller와 함께 PROD-432가 설계한다. Action Bar 컨테이너는 고정된 한국어 접근성 이름 `액션 바`와 toolbar role을 제공하되 내부 button을 하나의 접근성 요소로 병합하지 않는다. Reply는 callback, 외부 Composer의 controlled `expanded`와 default·pending·disabled 처리 상태를 받는다. 구현된 private Repost child는 `viewerRepost`와 mutation 진행 상태에서 `hasReposted`, 접근성 label, 정확한 delete identity와 create/delete 종류를 함께 파생한다. Reaction은 `hasReacted`, Bookmark는 `hasBookmarked`를 처리 상태와 독립적으로 받는다. Reaction과 Bookmark는 count를 받지 않고, Reply는 선행 계약이 제공한 count만 optional로 받으며 Repost child는 자기 fragment의 count를 사용한다. `hasReacted` 또는 `hasBookmarked`가 true이면 pending spinner를 제외한 Heart·Bookmark 내부를 현재 처리 상태 색상으로 채우며 default에서는 primary 색상을 사용한다. 독립 UI의 More는 callback과 접근성 label만 소비하고, production에서는 private `PostDeletionAction`이 `moreItems`와 삭제 자격을 조합해 menu·dialog·mutation 상태를 소유한다.

Bar와 각 control은 높이 28을 사용한다. Bar는 별도 좌우 inset 없이 Reply target의 왼쪽 경계와 More target의 오른쪽 경계를 PostBody가 사용하는 content column의 양끝에 맞추고, 고정 순서의 나머지 action을 `space-between`으로 분배한다. Reply·Repost·Reaction·Bookmark의 target 너비는 각각 50, More target 너비는 최소 28이며 모든 glyph visual box는 16×16이다. Reply·Repost·Reaction·Bookmark의 icon-count visual group은 각 target 왼쪽에 맞춰 glyph 왼쪽 경계가 target 왼쪽 경계와 일치한다. More glyph는 이 왼쪽 정렬에서 제외하고 28px target 가운데에 둔다. icon과 count의 내부 간격은 4, count line box는 16으로 유지한다. pending spinner, selected·pressed·disabled 표현은 같은 28px slot 안에서 layout을 바꾸지 않는다. Web target은 축 정렬된 24×24 CSS px 사각형을 포함하고 인접 target과 겹치지 않아야 한다. Android·iOS도 현재는 같은 28dp·28pt geometry를 사용하지만, Native release 전에 iOS 44×44pt와 Android 48×48dp target을 복구하고 touch·VoiceOver·TalkBack runtime을 별도 검증한다. count는 저장소에 이미 사용 중인 `Intl.NumberFormat` compact notation 관례를 재사용해 실행 환경의 기본 locale에 맞게 표시하고, K/M 반올림·단위 승격·상한을 수동 구현하지 않는다. 색상·typography는 기존 theme token을 사용하고 icon은 기존 `lucide-react-native`에서 시각적으로 대응하는 glyph를 선택한다. 폭 검증은 기존 Storybook의 `kosmoMobile` 390px, `kosmoCompact` 900px, `kosmoFull` 1400px viewport에서 실제 목록·상세 surface 콘텐츠 폭과 한국어·영어 대표 compact fixture를 사용한다.

PROD-433의 Storybook은 Reply `expanded`, 실제 Relay fragment ref에서 파생한 Repost `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`, config 기반 Reply·Reaction·Bookmark의 기본·pending·disabled와 Repost child의 기본·pending, active Reaction·Bookmark의 채워진 icon, Reaction·Bookmark count 제외, 한국어·영어 compact count, count 없음, optional 액션, More callback-only와 390px·900px·1400px 폭을 각각 검토할 수 있게 한다. Repost state는 actual operation이 `PostActionBar` parent fragment에서 private child fragment까지 fragment ref를 전달해 만든다. 처리 상태의 시각 표현은 도메인 상태의 primary 표현보다 우선하되 의미와 접근성 상태는 유지한다. 상호작용 검증은 default의 callback 또는 child mutation 호출, config 기반 action의 pending·disabled 차단과 Repost mutation pending 차단, controlled `expanded`, More callback, keyboard/touch activation, `액션 바` toolbar 이름과 내부 button 탐색을 확인한다. Repost policy-disabled 시각·입력 차단·접근성 상태는 concrete seam과 actual caller를 설계하는 PROD-432 surface 통합에서 검증한다. 이 단계에서는 `PostListItem`, `PostLayout` 또는 route를 수정하지 않는다.

PROD-414는 준비된 `PostActionBar`를 `PostLayout`의 content grid 마지막 sibling으로, `PostListItem`에서는 목록 전용 final slot 안에 배치하며 둘 다 본문·작성자·생성 시각·Source navigation link 밖에 둔다. 일반 Post와 Quote는 자신을, 순수 Repost는 화면에 표시한 direct Source fragment를 Action Bar target으로 공급한다. Repost trigger는 즉시 mutation을 실행하지 않고 항상 menu를 열며, 현재 `viewerRepost` 상태에 따라 `재게시하기` 또는 `재게시 취소` 항목만 표시한다. Web은 새 외부 positioning dependency 없이 scroll container 밖의 overlay layer에 anchored menu를 두고 첫 item target이 trigger pointer 지점을 덮게 배치한다. 따라서 첫 입력은 menu만 열고 같은 위치의 두 번째 입력이 실제 item을 선택한다. menu는 첫 item에서 아래 방향으로 펼치되 viewport 안으로 보정하며, theme card surface·4px card padding·36px item 높이·128px 최소폭·8px 좌우 padding·18px Repost icon·14px·500 label·1px border·`0 2px 4px` shadow로 Action Bar 위의 compact floating control을 표현한다. Android·iOS는 기존 44px 이상 safe area bottom action sheet를 유지한다. 바깥 pointer·focus, Escape, backdrop, platform back action과 dismiss gesture를 platform 계약에 맞게 처리하고 keyboard focus·복귀와 menu/modal semantics를 제공한다. `인용하기`는 PROD-431 전까지 표시하지 않는다.

목록 `PostListItem`은 Action Bar 자체 28px geometry를 유지하면서 목록 전용 final slot의 상단 padding을 0, 하단 padding을 `spacing.xs` 4px로 둔다. Quote 목록은 nested Source preview 내부 하단 padding을 `spacing.xs` 4px로 줄이고 border 밖에서 Action Bar까지 `spacing.sm` 8px 간격을 두되, 일반 Post와 순수 Repost의 상단 간격은 늘리지 않는다. 상세 thread의 현재 Post는 current row 상단 `spacing.lg` 16px을 유지하고, Reaction Summary가 있으면 Summary와 Action Bar 사이를 `spacing.xs` 4px로 둔다. inline Reply Composer가 닫힌 상태에서는 빈 Composer wrapper를 렌더링하지 않으며 Action Bar 아래부터 다음 thread divider까지 current row wrapper가 `spacing.xs` 4px을 제공한다. 카드 구분선 두께는 1px을 유지하고 입력·메뉴 외곽선용 `border`보다 낮은 강도의 light/dark semantic `divider` color를 사용한다. 순수 Repost attribution은 `typography.sm`의 20px line box를 사용하고 Source 표준행과의 추가 gap을 두지 않는다. Web attribution Profile text link는 inline target 예외를 사용하며, Native target 복구와 인접 Source link 비중첩은 출시 전 runtime gate로 남긴다.

같은 PROD-414 surface는 Repost child의 action별 error callback을 앱 provider의 단일 transient toast host에 연결한다. 생성 실패는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`, 취소 실패는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`로 표시한다. toast는 safe area와 고정 탭 바 위 화면 하단에서 약 3초 뒤 사라지고 최신 toast가 이전 toast를 교체하며 alert semantics를 제공한다. close·retry control과 success toast는 두지 않는다. 새 외부 dependency 없이 최소 공용 host와 platform menu 경계를 만들고, private Repost child의 fragment·mutation·pending·actor 격리는 유지한다. PROD-434는 canceled 상태이므로 별도 surface task를 실행하지 않는다.

PROD-425는 PROD-414가 배치한 actual Post Action Bar의 Reply config를 existing Composer와 연결한다. display Post와 Action Bar target을 분리해 순수 Repost의 Repost child는 direct Source target을 유지하면서 Reply eligibility는 바깥 contentless Repost에서 disabled로 전달한다. selected Profile이 있는 목록은 modal·전체 화면 Reply surface, 상세 thread는 행별 inline surface를 열고 Composer가 소유한 `expanded`를 Action Bar에 다시 공급한다. selected Profile이 없는 guest에는 이 child slice에서 Reply config를 새로 노출하지 않으며 인증 진입과 최종 guest 정책은 PROD-432가 소유한다.

PROD-432는 PROD-414 surface와 PROD-425가 연결한 Reply 결과 위에 아직 config 기반인 나머지 action 구현 결과를 surface 입력으로 변환한다. surface는 canonical 계약 전체를 하나의 boolean으로 재사용하지 않고, Content·Reply Parent·Repost Source 관계 조합, Post Visibility와 대상 관련 조건으로 결정되는 대상 적격성과 현재 실행 주체·세션의 실행 권한을 분리한다. 대상 자체가 부적격하거나 인증된 실행 주체가 권한을 갖지 못하면 disabled를 전달한다. 순수 Repost의 Reply는 PROD-425가 연결한 바깥 contentless Repost identity와 disabled 상태를 유지하고, Repost·Reaction·Bookmark·More만 direct Source target을 사용한다. target 자체가 적격하면 `SessionProvider.status`에 따라 `guest`는 기존 플랫폼 인증 진입(Web `/login`, Native `/`)으로 위임하고, `valid`인데 selected Profile이 없으면 `ShellChromeContext.openProfileSwitcher()`를 호출하며, `error`에서는 disabled로 유지한다. resolution 전에 child UI나 mutation을 시작하지 않고 Profile 선택 성공 뒤 원래 action을 자동 재실행하지 않는다. 이 change에서는 새 인증 목적지·임시 인증 화면·Profile 선택 화면을 만들지 않는다. surface는 PROD-425의 Reply callback·`expanded`를 재구현하지 않고 회귀 검증하며, Reaction에 하나 이상의 Reaction Type 존재를 나타내는 `hasReacted`, Bookmark에 `hasBookmarked`를 공급한다. Repost의 최종 disabled 행동을 child에 연결할 concrete host input 또는 fragment shape는 actual Home·Profile·상세 caller와 함께 이 단계에서 설계하고 통합 검증한다. Reaction과 Bookmark count는 연결하지 않고 Reply도 선행 계약이 제공하는 count만 optional로 연결하며 계약이 없는 `0`이나 새 집계를 합성하지 않는다. viewer-independent count와 선택 Profile별 도메인 상태의 기존 Relay cache 경계를 유지하고 action별 pending을 분리한다. Bookmark 해제 성공은 현재 Relay actor Store의 `Post.viewerBookmark`, Bookmark record와 응답 처리 시점에 로드된 `BookmarkConnectionList_bookmarks` edge를 함께 제거하되 다른 actor Store를 변경하지 않는다. Repost 외 action 요청이 실패하면 해당 action 계약에 맞는 접근 가능한 안내를 제공하되 PROD-414의 Repost toast를 재구현하지 않는다. Surface는 ADR 0015 Post Share Reference를 복사하는 `링크 복사` item을 `moreItems` 첫 항목으로 제공하고, private `PostDeletionAction`은 이 항목과 PROD-598의 작성자 `삭제`를 자격 충족 시 마지막 항목으로 조합해 menu·dialog·delete mutation을 소유한다. 삭제 확인·mutation·cache·실패는 PROD-598 결과를 재사용한다. Web More menu는 공용 overlay의 viewport 보정과 첫 item overlap을 유지하면서 trigger 오른쪽을 기준으로 왼쪽을 향해 펼친다. menu card 오른쪽은 trigger 오른쪽보다 5px 바깥에 두고 첫 item 오른쪽은 trigger 오른쪽과 맞춰, 같은 위치의 두 번째 활성화가 `링크 복사`를 선택하게 한다. Repost의 기존 시작 정렬과 Native bottom action sheet는 유지한다. 공유 참조 origin은 Web에서 현재 browser origin을 우선 사용하고, Android·iOS처럼 browser origin이 없을 때만 현재 deployment의 configured Local Instance `canonical_origin`을 client 설정에서 사용한다. 두 경우 모두 canonical Post 경로와 direct Source 선택 규칙, query·hash·API origin·native deep link 제외를 유지한다. 모든 자식과 선행 action이 준비된 뒤 목록·상세의 동일 계약, Profile 전환, 성공·실패 복귀, disabled 정책 및 More 조합을 PROD-432가 통합 검증한다. 변경 후 Web runtime 성공과 지원 Native runtime 증거를 확보하고 최종 archive하는 책임은 PROD-632가 가진다.

PROD-632는 확인된 production bundle 원인인 `EXPO_PUBLIC_WEB_ORIGIN` literal `undefined` 주입으로 URL 생성이 clipboard 전에 실패하는 경로를 5.1에서 재현·기록하고, 실제 변경은 기존 `PostMoreMenu`·production surface 소유 경계 안에서 수행한다. Web은 현재 browser origin을 우선하고 Native 또는 browser origin 부재 시에만 configured Local Instance canonical origin을 fallback으로 사용하며, canonical Post Share Reference, guest 사용, 순수 Repost direct Source, More item 순서·dismiss와 한국어 실패 안내·다음 입력 재시도를 유지해야 한다. 5.4는 변경 후 Web runtime 성공과 지원 Native runtime 증거를 함께 확보한 뒤에만 완료하고, 그 전에는 change를 archive하지 않는다.

### Allowed Alternatives

- 비공개 control은 직접 `Pressable`을 사용하거나 기존 primitive를 조합할 수 있다. 어느 쪽이든 공개 leaf 컴포넌트를 추가하지 않고 specs의 입력·상태·28px geometry·접근성 계약을 충족해야 한다.
- 구현된 action child는 `PostActionBar`와 같은 모듈에 두거나 비공개 child module로 분리할 수 있다. 어느 쪽이든 parent fragment가 child fragment를 spread하고, fragment·mutation·pending·파생 상태와 private common control 호출이 한 action 소유 경계에 남아야 한다.
- spinner는 React Native `ActivityIndicator` 또는 이미 존재하는 동등한 theme-aware primitive를 사용할 수 있다. Post Action Bar UI를 위한 외부 dependency는 추가하지 않는다.
- PROD-632의 링크 복구는 기존 공유 clipboard 추상화가 없을 때 Expo 호환 clipboard package를 추가할 수 있다. package 선택과 dependency 변경은 해당 구현 PR에서 검증한다.
- PROD-414의 Repost action menu는 `.web.tsx`와 `.native.tsx` 같은 platform file로 나눌 수 있다. 공용 항목·open·dismiss·선택 결과와 접근성 의미는 유지한다.
- PROD-414의 최소 transient toast host는 후속 action이 재사용할 수 있는 좁은 message API를 제공할 수 있지만 queue·persistent notification·success variant까지 미리 일반화하지 않는다.
- surface의 정확한 parent fragment 배치는 각 선행 action 계약과 당시 코드 구조를 따를 수 있다. 구현된 child action은 자기 fragment를 소유하고, 선행 계약이 제공하는 viewer-independent count와 viewer-relative 도메인 상태의 cache 경계 및 action별 처리 상태는 바꾸지 않는다.

### Known Traps

- `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`를 범용 `selected`로 축약하면 각 상태의 소유권과 의미가 사라진다. 요청 실패를 지속 `error`·danger 상태로 Action Bar에 남기면 일시적 실행 결과와 확정된 도메인 상태가 섞이므로, 도메인 상태는 유지하고 실패는 상위 surface의 toast로 분리한다.
- Native baseline을 충족한 것처럼 보이기 위해 인접 action과 겹치는 `hitSlop`을 추가하면 target ownership과 focus boundary가 불명확해진다. 현재는 겹치지 않는 실제 28px layout을 사용하고 Native 출시 gate를 별도로 남긴다.
- Figma의 측정값 약 27px을 그대로 subpixel·platform별 값으로 복사하면 geometry가 갈라진다. 모든 플랫폼 구현은 canonical 정수값 28을 사용한다.
- 범용 `actions[]`나 공개 Reply/Repost leaf를 추가하면 고정 제품 계약보다 넓은 API와 불필요한 조합을 만든다.
- Toolbar container가 child mutation payload·cache updater, navigation, clipboard 또는 Post 정책 분기를 재구현하면 구현 이슈 간 책임이 다시 결합된다. private Repost·PostDeletionAction child가 자기 menu 상태를 갖는 것은 이 경계 안의 허용된 조립이다. 반대로 구현된 action의 fragment·mutation·pending·파생 상태를 scalar config로 분해하면 함께 바뀌어야 하는 Relay 상태와 mutation identity가 갈라진다.
- pending 하나로 행 전체를 비활성화하면 독립 액션을 불필요하게 차단한다.
- canonical action 계약의 인증 전제까지 대상 적격성 boolean에 합치면 guest의 모든 소셜 액션이 disabled가 되어 인증 진입 callback에 도달할 수 없다.
- `selectedProfile == null`만 보고 guest로 판단하면 valid 세션의 Profile 선택 onboarding을 건너뛰고 잘못된 로그인 경로로 이동한다. `SessionProvider.status`와 selected Profile을 별도로 해석해야 한다.
- 순수 Repost 아래 다섯 액션 모두에 바깥 Repost fragment를 공급하면 Content 없는 Repost를 action target으로 사용한다. 반대로 다섯 액션 모두 direct Source를 사용하면 PROD-425의 Reply binding을 깨뜨린다. Reply는 바깥 contentless Repost의 disabled 상태를 유지하고 나머지 액션만 direct Source fragment를 사용해야 한다.
- Repost trigger에서 즉시 mutation을 실행하거나 선택 상태에 따라 menu와 즉시 실행을 섞으면 미래 `인용하기` 진입점과 interaction 예측 가능성이 깨진다.
- Storybook Clipboard mock 성공만으로 실제 browser secure context·permission이나 Native adapter 동작을 증명하면 PROD-632의 운영 회귀를 다시 놓친다.

## Risks / Trade-offs

- [28px target 안에서 pending·selected·disabled 상태가 행 높이를 바꿀 수 있음] → 모든 상태에서 exact 28px 높이와 16px glyph slot을 Storybook geometry assertion으로 검증한다.
- [native와 Web의 접근성 state 지원 차이] → 공통 `accessibilityRole`·`accessibilityLabel`·`accessibilityState`를 우선하고 Storybook 상호작용 테스트와 각 플랫폼의 실제 보조 기술 점검을 분리한다.
- [locale data와 compact 반올림 결과가 플랫폼별로 달라질 수 있음] → 수동 formatter로 결과를 강제하지 않고 한국어·영어 대표 fixture를 Web Storybook과 Android·iOS runtime에서 각각 확인한다.
- [선행 action 이슈의 공개 결과가 달라질 수 있음] → 구현된 action은 private child fragment 경계로 조립하고, 아직 준비되지 않은 action은 기존 config를 유지한 뒤 PROD-432에서 선행 계약에 맞춰 연결한다.
- [More 팝업과 삭제 mutation 소유권이 toolbar container에 섞일 수 있음] → 독립 UI용 callback-only 경계는 유지하고, production에서는 surface가 링크 item만 공급하며 private `PostDeletionAction`이 menu·dialog·PROD-598 mutation 경계를 소유한다.
- [공유 clipboard 추상화가 없어 링크 복사를 구현할 수 없음] → PROD-432 구현 시점에 기존 추상화를 다시 확인하고, 없으면 Expo 호환 clipboard package만 제한적으로 추가한다.
- [Web이 configured origin만 사용하거나 Native가 browser origin에 의존할 수 있음] → ADR 0015와 Post route에 따라 Web은 현재 browser origin을 우선하고 Native 또는 browser origin 부재 시에만 configured Local Instance canonical origin을 fallback으로 사용하며, API origin·native deep link를 배제한 동일 path/direct Source fixture를 공유한다.
- [일시적 toast가 사라져 실패 안내를 놓칠 수 있음] → 화면 toast와 동일한 액션별 한국어 내용을 보조 기술이 즉시 인식할 수 있게 하고 Web·Android·iOS에서 통합 검증한다.
- [공통 cross-platform toast 인프라가 현재 없음] → PROD-414가 새 dependency 없이 provider의 단일 최소 host를 만들고 정확한 Repost 문구·latest replace·자동 dismiss·alert semantics만 구현한다.
- [Web anchored menu와 Native bottom sheet의 동작 차이] → 공용 항목 계약은 공유하되 platform file로 위치·dismiss·focus/back 처리를 분리하고 Web·Android·iOS runtime에서 각각 검증한다.
- [Web overlay가 trigger와 분리되어 item pointer·focus를 바깥 입력으로 오인할 수 있음] → outside 판정은 trigger control과 portal menu를 모두 내부로 취급하고, 같은 위치 두 번째 pointer 입력·Escape focus 복귀·keyboard 이동을 회귀 검증한다.
- [production bundle의 origin env가 literal `undefined`로 주입되어 URL 생성이 clipboard 전에 실패할 수 있음] → 5.1에서 원인을 재현·기록하고, `postClipboard`의 실패 감지·안내 회귀와 변경 후 Web runtime 성공 및 지원 Native runtime 증거를 5.4에서 별도로 확인한다.

## Migration Plan

1. PROD-433에서 surface와 분리된 공통 컴포넌트, Storybook 및 component test를 추가한다.
2. PROD-414에서 `PostActionBar` composite fragment와 private Repost child fragment·mutation·pending을 유지한 채 `PostListItem`·`PostLayout`의 final sibling에 처음 배치하고, 순수 Repost Source target, cross-platform Repost menu와 action별 transient toast를 연결한다. PROD-434의 canceled task는 실행하지 않는다.
3. 선행 action 구현이 준비되면 PROD-432에서 아직 config 기반인 action 상태와 callback, 대상 적격성·현재 세션 실행 권한이 분리된 disabled 정책, 기존 guest 인증 진입, valid 세션의 기존 Profile 선택기 진입, session error 비활성화와 More 링크 복사를 연결한다. 완료된 sibling PROD-598의 작성자 삭제 action은 같은 More menu에 조합하되 소유 계약을 재정의하지 않고 PROD-414의 Repost toast를 포함한 전체 surface 결과를 통합 검증한다.
4. PROD-632에서 production bundle의 `EXPO_PUBLIC_WEB_ORIGIN` literal `undefined` 원인을 재현·기록하고, Web browser origin 우선·Native/browser origin 부재 시 configured Local Instance fallback을 유지하는 최소 수정과 Web·지원 Native 회귀 검증을 진행한다.
5. 변경 후 Web runtime 성공과 지원 Native runtime 증거가 확보되고 canonical 문서·Linear·OpenSpec·구현의 최종 정합성이 확인된 뒤에만 PROD-632가 change를 archive하고 archive 후 strict validation을 수행한다.

롤백은 역순으로 production surface 연결을 제거한 뒤 공통 컴포넌트를 제거한다. 새 persistence나 schema migration이 없으므로 데이터 rollback은 필요 없다. 일부 구현 PR만 완료된 동안에는 change를 archive하지 않는다.

## Open Questions

없음.
