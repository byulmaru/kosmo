# Post Action Bar

Post Action Bar는 Post의 Reply, Repost, Reaction, Bookmark와 More action을 한 줄에 배치하는 공용 UI다.
각 action의 fragment, mutation과 상태 소유권은 해당 private child가 가지며, Bar는 고정 순서와 공통 control
표현을 조립한다.

## Figma geometry

기준 source는 Figma `KOSMO` 파일의 [`PostActionControl` 3801:8494](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3801-8494)와 [`PostActionBar` 6604:48270](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6604-48270)다. source metadata에서 27px로 측정되는 한 줄 높이는 구현과 검증에서 exact 28px 정수 계약으로 정규화한다.

- `Platform=Web`은 기존 source node [`2184:3966`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=2184-3966)를 보존하며 Bar와 visual/layout control 높이가 28px이다. Web runtime의 실제 interactive rectangle은 이 row를 세로로 위아래 4px씩 덮는 36px 높이를 사용한다. `05 Screens - Web`과 [`01 Mobile Web exceptions`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1938-880) consumer만 이 variant를 상속한다.
- `Platform=iOS`는 44pt, `Platform=Android`는 48dp인 Native target variant다. glyph·count·state layer와 내부 visual control은 28px을 유지하고 투명 touch-target wrapper만 세로로 확장한다. 28px visual은 wrapper의 세로 중앙에 두어 iOS는 위·아래 8pt, Android는 위·아래 10dp를 남긴다. More wrapper는 각각 44×44pt, 48×48dp이며 28px visual을 세로 중앙·가로 오른쪽에 맞춰 content column 끝선을 보존한다. 나머지 action slot 너비는 50px을 유지한다. Android canonical Home [`4524:3985`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-3985)·Local [`4524:4139`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139), iOS Home [`6619:7918`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6619-7918)과 iOS post-detail [`1943:2837`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1943-2837)이 해당 source를 소비한다. 이 Figma consumer 연결은 runtime 적용 완료 증거가 아니다.
- Bar는 가용 너비를 채우고 Reply control slot의 왼쪽 경계와 More control slot의 오른쪽 경계를 PostBody가 사용하는 content column의 양끝에 맞춘다. 나머지 action은 그 사이를 `space-between`으로 분배한다. Figma의 302px frame은 기준 viewport의 측정값이며 production 고정 너비가 아니다.
- Web의 Reply, Repost, Reaction, Bookmark layout slot은 최소 50px이고 More slot은 28px이다. 실제 target은 count가 있으면 숫자 `0`도 표시값으로 취급해 `왼쪽 6px + glyph 16px + gap 4px + 렌더된 count + 오른쪽 6px`을 HUG하고, count가 없으면 28×36px이다. leading Reply target은 slot 시작점에 맞춰 target·state layer가 content column의 왼쪽 경계에서 시작하고 glyph는 그보다 6px 안쪽에 둔다. Repost·Reaction·Bookmark target은 각 slot 가운데에 유지하며 target이 50px보다 넓을 때만 slot도 함께 늘린다. More glyph는 28px target 가운데에 둔다. action 사이의 분배 여백 전체를 interactive rectangle으로 확장하거나 인접 target과 겹치게 하지 않는다.
- Native의 Reply, Repost, Reaction, Bookmark target 너비는 각각 50px이다. Bookmark target 안의 28px IconOnly visual과 More의 28px visual을 각각 오른쪽에 맞추고 두 target 사이 gap을 0으로 둔다. 따라서 iOS는 `50 + 44`, Android는 `50 + 48`인 인접 target을 만들며 hit area를 겹치지 않고 More target 오른쪽 경계를 content column 끝에 맞춘다.
- 모든 glyph의 visual box는 16×16px, glyph와 count 사이는 4px다. count는 16px 한 줄이며 icon과 시각 중심을 맞춘다.
- 순서는 `Reply → Repost → Reaction → Bookmark → More`로 고정한다. Reply와 Repost만 count를 표시하고 Reaction·Bookmark·More에는 count slot을 만들지 않는다.
- Web의 trailing group은 Bookmark 50px, 간격 4px, More 28px을 묶은 exact 82px이며 Bar의 오른쪽 끝에 맞춘다.
- Reaction은 `HeartPlus` glyph를 사용한다.
- pending spinner, selected·pressed·disabled visual은 같은 28px slot 안에서 layout을 바꾸지 않는다. focus indicator와 accessible name·state는 확장된 Web interactive rectangle에서도 유지한다.
- Action Bar의 Reply는 외부 Composer가 공급하는 controlled `expanded`와 default·disabled만 표현한다. Reply 제출 중 spinner·입력 차단은 Composer의 `답글 게시` 버튼이 소유하며 Action Bar에 별도 pending 상태로 중복 표현하지 않는다.
- `/bookmarks` 목록의 Bookmark action은 저장된 상태에서 파생한 `Selected`를 사용한다. Compact와 Full 모두
  같은 `PostListItem` source와 `itemSpacing=0` stack rhythm을 유지하며 선택 상태 때문에 목록 간격을 바꾸지 않는다.
- Figma Action은 내부 상하 padding 4px을 포함한다. canonical
  [`PostListItem` Text·Media variants](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1924-1992)는
  카드 상단 12px·하단 4px을 사용한다. content column의 기존 4px gap 뒤 final slot 상단 4px을 더해 마지막
  presentation(본문·미디어 또는 Reaction Summary)과 Action Bar 사이를 8px로 만들고, slot 하단은 0으로
  두어 카드 하단 4px이 구분선 간격을 단독 소유한다. Native visual을 이 Bar의 세로 중앙에 두므로 16px glyph의
  상단은 iOS 14pt, Android 16dp이며, 확대된 target은 visual 위·아래에 같은 여백을 남긴다. 본문과 Bar를
  overlap하지 않는다. Quote와 순수 Repost는 별도 slot 없이 Action Bar를 직접 배치하고 카드 상단 8px·하단
  1px을 사용한다.
- Figma `Size=Mobile` Text·Media·PureRepost·Quote와 Post detail의 `PostLayout`은 Action Bar slot을 HUG하고
  Android variant를 `48dp`로 유지한다. Reaction Summary가 나타나거나 instance가 교체되어도 세로 Auto Layout의
  `8px` gap이 Bar를 아래로 밀며, Compact PostMediaViewer tray는 `64px` 안에 같은 `48dp` Bar를 배치한다.
- 같은 `PostListItem` source의 `Size=Mobile` Text·Media·PureRepost·Quote는 좌우 padding 16px을 사용하고,
  Web surface가 사용하는 `Size=Center` 4종은 기존 8px을 유지한다. Mobile Home [`4524:3985`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-3985)과 Local [`4524:4139`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4524-4139) consumer에서 같은 source 상속을 확인한다.
- Mobile 390 Text·Media의 content column은 Avatar·gap을 제외한 `298px`이며 Reaction Summary와 Action Bar slot이
  이 폭을 함께 채운다. Reaction Summary에 별도 314px 고정 폭을 두지 않으므로 왼쪽 치우침이나 우측 clipping 없이
  같은 column edge에 정렬되고, 표시 여부가 바뀌면 세로 Auto Layout이 하단 border를 자연스럽게 이동한다.
- Web production `PostListItem`은 `Size=Center`와 같은 카드 상단 12px·좌우 `spacing.sm` 8px·하단 4px,
  목록 전용 Action Bar slot 상단 4px·하단 0을 사용한다. Mobile의 좌우 16px과 iOS 44pt·Android 48dp
  touch-target wrapper는 현재 Figma target이며, Native production 적용은 관련 Product 이슈와 OpenSpec
  spec·task를 연결한 뒤 구현과 runtime 검증을 함께 진행한다.

## Action semantic colors

- Reaction은 active·Web hover에서 semantic `actionReactionBase` (`#F97066`)를 사용한다.
- Repost glyph와 count는 미선택 default에서 `textSecondary`를 사용한다. Web hover에서는 glyph와 원형
  background만 semantic `actionRepostBase`를 사용하고 count는 `textSecondary`를 유지한다. selected에서는
  glyph와 count 모두 `actionRepostBase`를 사용한다. Light는 `green/600 #16794A`, Dark는
  `green/500 #409667`이다.
- pending·disabled처럼 입력이 차단된 상태에서는 기존 중립 처리 표현이 action 의미색보다 우선한다.
- `actionRepostBase`는 Repost 전용 제품 의미색이며 전역 `feedbackSuccessBase`를 바꾸거나 재사용하지 않는다.

## Web hover target

- Web의 비터치 pointer가 action 위에 머무르면 16×16px glyph를 중심으로 한 28×28px 원형 background를
  표시한다. Reply, Bookmark와 More는 현재 theme의 semantic `primary`를 30% opacity로 사용하고 hover
  foreground에는 불투명 `primary`를 사용한다. Reaction은 `actionReactionBase`, Repost는
  `actionRepostBase`를 같은 방식으로 사용한다. HeartPlus foreground에는 불투명 `actionReactionBase`를
  사용한다. Reply count는 hover·pressed 동안 glyph와 같은 action foreground를 사용한다. Repost count는
  미선택 default·hover에서 `textSecondary`, selected에서 `actionRepostBase`를 사용한다.
- 원형 hover·pressed background는 glyph 주위의 28×28px visual state layer를 유지하고 count를 감싸지 않는다. Web
  interactive rectangle은 count가 있으면 `6 + 16 + 4 + 렌더된 count 너비 + 6`을 HUG하고, count가 없으면
  28×36px이다. target은 28px visual row 위아래로 4px씩 확장되며 action 사이의 분배 여백을 차지하거나 인접
  target과 겹치지 않는다.
- Reaction이 selected 상태이면 hover 여부와 관계없이 HeartPlus는 fill 없이 outline을 유지하고 stroke에만
  `actionReactionBase`를 사용한다. 다른 action의 default·active 색과 Bookmark의 selected fill은 유지하고,
  pressed에서는 각 상태의 foreground에 기존 72% opacity를 적용한다.
  hover가 끝나면 원형 background는 사라지고 미선택 Reaction의 foreground는 기존 default 색으로 돌아간다.
- pending·disabled·resolution-required처럼 입력이 차단된 action은 hover background를 표시하지 않는다.
  Native와 Web touch 입력에는 hover 전용 background를 표시하지 않는다.
- light·dark theme 모두 `primary`, `actionReactionBase`, `actionRepostBase` semantic token을 사용한다.

## 플랫폼 rollout과 release gate

- 현재 출시 범위는 Web이며, runtime의 Native platform file도 아직 같은 28px geometry를 사용한다. Figma의 iOS 44pt·Android 48dp variant와 위 Target consumer는 구현 전 비교·handoff evidence다.
- Native 구현은 28px visual을 유지한 채 Figma target wrapper와 같은 최소 hit area를 제공하되, 인접 target overlap과 화면별 action 정렬을 runtime에서 다시 결정·검증한다.
- Native target 복구, VoiceOver·TalkBack focus boundary, touch 입력과 bottom sheet runtime 관찰은 Native release gate다. 현재 PROD-414 완료나 Web 검증으로 대체하지 않는다.

## Surface 배치

- `PostLayout`은 metadata 뒤 `Engagement`에 Reaction Summary와 bordered Action Bar frame을 순서대로
  렌더링한다. 일반 Text·Media `PostListItem`은 카드 상단 12px·하단 4px, 목록 전용
  Action Bar slot 상단 4px·하단 0을 사용한다.
  content column의 기존 4px gap과 합쳐 마지막 presentation(본문·미디어 또는 Reaction Summary)에서 Action
  Bar까지 8px을 만든다. Quote와 순수 Repost는 별도 slot 없이 Action Bar를 직접 배치하고 카드 상단
  8px·하단 1px을 사용한다.
- 상세 thread의 현재 Post는 metadata 아래 8px에 Reaction Summary를 두고, Summary가 있으면 그 아래 4px부터
  Action Bar frame을 시작한다. Reaction Summary는 border 밖에 있고, Action Bar frame만 full-width 상·하 1px
  `borderSubtle`과 상하 8px padding 사이에 둔다. Summary가 없으면 metadata 하단부터 Action Bar frame 상단
  border까지 canonical Figma와 같은 8px을 둔다.
  이 border와 padding은 thread connector용 gutter가 아니다. Reply surface가 닫힌 기본 상태에서는 빈 Composer
  wrapper를 렌더링하지 않고 Engagement 아래부터 current row 끝까지 4px을 둔다. current row 뒤에는 별도
  thread divider를 렌더링하지 않으며 current row 상단의 16px은 유지한다. Action Bar의 28px visual geometry는 바꾸지 않는다.
- Action Bar는 `PostBody` 또는 Source presentation과 같은 content-level sibling이며 본문, 작성자, 생성 시각,
  Source preview의 `Link`나 `Pressable` 안에 중첩하지 않는다.
- 일반 Post는 본문 뒤, 순수 Repost는 Source presentation 뒤, Quote는 자체 본문과 Source preview 뒤에 Action
  Bar를 둔다. 상세의 metadata가 있으면 metadata 뒤에 둔다.
- Quote 목록은 Source preview의 내부 하단 padding을 4px로 줄이고 Source preview border 밖에서 직접 배치한
  Action Bar까지 8px 간격을 둔다. 순수 Repost도 direct Action Bar와 attribution·Source 간격을 유지한다.
- Center·Mobile Quote의 `Quote article` wrapper는 `PostContent` 높이를 Hug한다. 자체 본문이 줄바꿈되면
  Source preview와 Action Bar를 함께 아래로 밀어 Source preview의 하단 1px border와 둥근 모서리를 자르지 않는다.
- direct Quote Source preview는 기본 fill을 갖지 않고 주변 Post background와 같은 평면을 유지하며 semantic
  border로만 경계를 구분한다. Web에서 source navigation이 활성인 preview는 pointer hover 동안 root 전체에
  semantic `stateHover` overlay를 적용한다. `interactive=false`인 Composer preview와 Native에는 hover fill을
  적용하지 않는다. 본문과 Source preview 안의 클릭 가능한 외부 링크는 mode별 semantic `actionLinkBase`와
  기존 밑줄을 사용하며 Post·Source navigation과 입력을 분리한다.
- 순수 Repost의 본문·생성 시각 affordance는 Repost 자체가 아니라 Source detail로 이동한다. Repost Author와
  Source Author affordance는 각각 해당 Profile로 이동한다.
- 순수 Repost 아래 Action Bar의 Reply는 바깥 contentless Repost의 Reply 계약을 유지해 disabled로 표시한다.
  Repost·Reaction·Bookmark·More는 화면에 표시한 direct Source Post를 대상으로 동작한다. 따라서 Repost
  menu의 선택 상태, count와 생성·취소 identity도 Source fragment에서 파생한다.
- Quote의 자체 본문 affordance는 Quote detail로 이동하고 Source preview만 Source detail로 이동한다.
- `PostSourcePresentationView`의 바깥 Post와 nested Source 작성자 행은 생성 시각 Link의 최소 44×44px target을 유지하고, 시간 label을 그 target 안에서 오른쪽 정렬해 preview의 오른쪽 content inset에 맞춘다.
- 순수 Repost의 `{displayName}님이 재게시함` attribution은 `typography.sm`의 14/20 line box에 맞추고 바로
  아래 Source 표준행과의 추가 간격을 두지 않는다. Web의 Profile text link는 inline target 예외를 사용하며,
  Native target과 인접 Source link 비중첩은 출시 전 runtime gate에서 다시 검증한다.
- Reply Parent가 조회되는 일반 목록의 Content Post는 같은 상단 attribution 행에 기존 Reply action과 같은
  Message Circle icon과 `{displayName}님에게 답글` 문구를 표시한다. icon은 장식 요소로 보조 기술에서 숨기고,
  문구는 클릭 동작이나 Post·Profile navigation 없이 일반 텍스트로 인식되게 한다. Reply이면서 Quote인 Post도
  이 행을 자체 Content·Source preview 위에 한 번 표시한다. Reply Parent를 조회할 수 없거나 일반 Post 또는
  Content 없는 순수 Repost이면 Reply attribution과 대체 문구를 표시하지 않는다.
- Repost와 Reply attribution은 icon column, text slot, `typography.sm` line box와 바로 아래 Post 행 사이의
  간격을 공유한다. Repost의 Profile link 의미와 Reply의 비대화형 텍스트 의미는 각 변형이 따로 소유하며,
  공용 행이 링크 여부를 추론하지 않는다.

## Source가 Quote인 순수 Repost

이 절은 [PROD-828](https://linear.app/byulmaru/issue/PROD-828)의 `X(Twitter) 방식대로`라는 표시 방향을
구체화한다. Domain Gate 전환 승인 상태는
[ADR 0027](../domain/decisions/0027-repost-of-quote-source-presentation.md)에서 추적한다. 제품 결정과 현재 UI에
반영된 범위를 구분한다.

- A가 B의 Quote를 Repost하고 B가 C의 Post를 인용했다면, `A님이 재게시함`, B의 표준 Author·생성 시각·Content,
  C의 Source preview, Action Bar 순서로 표시한다. B의 Quote를 별도 Source 카드 안에 다시 감싸지 않는다.
- preview는 B를 기준으로 한 단계다. C도 Quote이면 C의 Author·생성 시각·Content까지만 보여주며, C가
  인용한 Post는 추가로 표시하거나 이를 대신하는 placeholder·별도 CTA를 두지 않는다. Quote와 Reply+Quote를
  직접 표시할 때도 같은 preview 깊이를 사용한다.
- 바깥 목록 항목이 article, 카드 padding과 row divider를 한 번만 소유한다. B의 표준 행과 C의 preview에
  article이나 전체 게시글 renderer를 재귀적으로 중첩하지 않는다. C의 preview border는 인용 관계를 구분하는
  기존 Quote 표현으로 유지한다.
- A의 attribution은 A의 Profile로, B의 Author는 B의 Profile로 이동한다. B의 본문 shortcut·생성 시각과
  순수 Repost ID 직접 진입은 B의 canonical Post 상세로 이동한다. C의 Author는 C의 Profile로, C의 본문
  shortcut·생성 시각은 C의 canonical Post 상세로 이동한다. B의 직접 관계를 C로 평탄화하지 않는다.
- C의 preview는 기존 Source preview 입력 경계를 따른다. Author·생성 시각은 각각 독립 Link이고, 본문은
  pointer·touch shortcut을 제공한다. 본문 shortcut을 별도 접근성 Link나 keyboard focus 대상으로 중복하지
  않는다. 본문의 외부 Link는 자신의 URL만 열며 preview 전체와 빈 padding을 하나의 Link로 감싸지 않는다.
- Action Bar와 Reaction Summary는 C의 preview 뒤에 한 번만 배치하며 모든 navigation target의 sibling으로
  둔다. Repost·Reaction·Bookmark·More와 Summary는 B를 대상으로 하고, Reply는 바깥 contentless Repost의
  기존 binding과 disabled 상태를 유지한다. C에 별도의 Action Bar를 붙이지 않는다.
- B를 조회할 수 있고 C가 unavailable이면 C의 preview를 생략하고 B의 Content와 Repost 항목을 유지한다.
  B 자체를 조회할 수 없으면 기존 Post Eligibility에 따라 순수 Repost 항목을 표시하지 않는다. preview의
  Content Warning·Media 표현과 조회 범위는 각 대상의 기존 계약을 따른다.
- 순수 Repost의 별도 상세 화면은 만들지 않는다. B 상세로 replace redirect한 뒤에는 B의 기존 Quote 상세와
  C의 한 단계 preview를 사용하며, A의 attribution이나 바깥 Repost의 Reply 상태를 B 상세로 전달하지 않는다.
- Web과 공용 Native presentation은 같은 표시·이동 계약을 사용한다. Web Storybook·runtime 검증과 Native의
  실제 touch·VoiceOver·TalkBack 검증은 구분하며, Native runtime 관찰은 출시 gate에 남긴다.

## Repost action menu

- Mobile Target consumer section [`6772:10989`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6772-10989)은
  Repost·Quote menu Light/Dark, More menu Light와 Delete confirmation Light/Dark를 기존 ActionMenu·ModalSheet
  source로 조립한다. 이 화면 집합은 runtime menu mutation·focus·dismiss 완료 증거가 아니다.
- Repost trigger는 선택 여부와 관계없이 mutation을 즉시 실행하지 않고 action menu를 연다.
- 현재 Profile이 Source를 Repost하지 않았으면 메뉴에 `재게시하기`, 이미 Repost했으면 `재게시 취소`를
  표시한다. 항목을 선택하고 메뉴가 닫힌 뒤 해당 mutation을 시작한다.
- 향후 `인용하기`는 Quote 작성 계약이 완료될 때 같은 메뉴의 별도 항목으로 추가한다. 구현 전에는 disabled나
  placeholder 항목도 표시하지 않는다.
- Web은 scroll container 밖의 overlay layer에 trigger 근처의 anchored menu를 렌더링한다. 첫 action item은
  trigger의 pointer 지점을 덮어 첫 활성화로 menu를 연 뒤 포인터를 움직이지 않은 두 번째 활성화가 실제
  menu item을 선택하게 한다. trigger 자체는 두 번째 입력에서도 mutation을 직접 실행하지 않는다.
- Web menu는 첫 item에서 아래 방향으로 펼치되 viewport 가장자리 안으로 보정해 scroll container나 화면
  하단에 잘리지 않게 한다. 바깥 pointer·focus, Escape로 닫으며 Escape 뒤 trigger로 focus를 돌려보내고,
  방향키, Home과 End로 item focus를 이동한다.
- Web item은 theme card surface(light theme에서는 흰색), 4px card padding, 36px 높이와 128px 최소폭,
  8px 좌우 padding, 18px Repost icon, 14px·500 label, 1px menu border와 `0 2px 4px`
  shadow를 사용해 Action Bar 위에 떠 있는 compact control로 구분한다. 모든 Web `ActionMenu` item은
  icon과 label을 같은 왼쪽 시작선에 고정하고 label을 왼쪽 정렬한다. 첫 item을 제외한 각 item 위에는
  theme divider 1px를 두며 hover와 pressed 상태는 theme surface 배경으로 표시한다.
- Android와 iOS는 safe area를 고려한 bottom action sheet를 사용한다. backdrop, platform back action과
  dismiss gesture로 닫을 수 있고 modal·menu 의미를 제공한다. sheet 내부 menu item의 target은 Action Bar의
  28px trigger geometry와 별도이며 최소 44×44를 유지한다.
- mutation pending 중에는 trigger와 menu action의 반복 입력을 막고 기존 selected·count 표현을 유지한다.

## Post Activity route

- Post Activity는 Repost action menu와 별개인 목록 surface다. modal이나 action sheet로 표시하지 않고 `게시 활동` 전용 route로 이동한다.
- 화면 순서는 `PageHeader(게시 활동) → underline TabList(재게시 | 인용) → 선택한 목록`으로 고정한다. Reaction People의 pill filter와 합치지 않는다.
- `재게시` tab은 기존 `ProfileListItem`의 `Bio=False, Action=Follow` 계약을 사용한 Profile 목록을 표시하고 관계에 따라 `팔로우`, `팔로잉`, `요청됨` 상태를 노출한다. `인용` tab은 기존 `PostListItem`의 `Kind=Quote`를 사용한 Quote Post 목록을 표시한다. 두 목록 renderer를 하나의 새 범용 component로 합치지 않는다.
- Compact·Full Web에서는 기존 shell의 중앙 600px route column만 교체하며 Full Web의 `RightRail`은 유지한다. Mobile은 pushed dedicated screen을 사용하고 현재 shell 계약에 따라 `BottomTabBar`를 유지한다.
- Target screen evidence는 [`05 Screens - Web`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-16233)과
  [`04 Screens - Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-21917)의
  Full·Compact·Mobile Reposts·Quotes 6개 Light FRAME이다.
- Figma는 두 tab의 기본·선택 상태와 responsive surface를 확정한다. entry control, URL·Back fallback, 재게시·인용 connection/API, empty·error·pagination과 scroll restoration은 연결된 Production 이슈가 소유하며 이번 디자인 완료 증거에 포함하지 않는다.

## More 링크 복사 menu

- Web More 메뉴는 게시글·프로필에서 최소폭 160px을 사용한다. `프로필에 고정`과 `프로필 고정 해제`의
  문구 전환으로 폭이 달라지지 않게 여유를 두며, Repost와 다른 메뉴의 기본 최소폭 128px은 유지한다.
- Web ActionMenu는 퇴장 애니메이션 동안 닫기 직전 항목의 문구·아이콘·폭을 유지하고 다음 open에서 최신
  항목을 표시한다. 선택 callback은 사용자 입력 시점에 즉시 실행해 clipboard 등 사용자 활성화를 보존한다.

- Web의 More menu는 Repost와 같은 외부 overlay·viewport 보정·dismiss·keyboard 계약을 재사용하되 More
  trigger의 오른쪽을 기준으로 왼쪽을 향해 펼친다. menu card의 오른쪽 경계는 trigger 오른쪽보다 5px
  바깥에 두고 첫 item의 시각 target 오른쪽 경계는 trigger 오른쪽과 맞춘다. 따라서 28×36px Web More trigger는
  첫 item의 확장 hit area 안에 남아, menu를 연 위치에서 포인터를 움직이지 않은 두 번째 활성화가
  `링크 복사`를 선택한다.
- 왼쪽 viewport 가장자리와 충돌하면 menu를 화면 안으로 보정한다. 이 방향 선택은 More에만 적용하며
  Repost menu의 기존 시작 정렬과 Native bottom action sheet는 바꾸지 않는다.

## Profile 고정 More menu와 attribution

- Profile 목록 최상단의 고정 Post는 `Pin`과 `고정됨`을 표시한다. `Pin`은 인접한 문장이 의미를 제공하는
  장식 아이콘이며 보조 기술에 중복 announce하지 않는다.
- `고정됨` 위쪽 여백은 `Pinned attribution / Size=Center, Kind=Pinned` source가 `paddingTop=4px`로 소유한다.
  이 source의 전체 높이는 24px이고 내부 text line box는 기존 20px을 유지한다. 순수 Repost의 attribution
  source에는 이 여백을 적용하지 않으며 기존 `paddingTop=0`, 높이 20px을 유지한다.
- owner의 More `ActionMenu`는 기존 첫 행 `링크 복사`를 유지하고, 다음 행을 상태에 따라
  `프로필에 고정` 또는 `프로필 고정 해제`로 전환한다. `삭제`는 마지막에 두며 기존 eligibility가 있을 때만 표시한다.
- 고정·해제에는 같은 `Pin` glyph를 사용하고 `PinOff`는 사용하지 않는다. attribution은 `16`/`secondary`,
  Web menu는 `18`/`primary`, Native menu는 `24`/`primary`를 사용하며 삭제의 `danger` 색은 유지한다.
- 고정 Post는 Profile 목록에만 우선 표시하고 Home timeline 순서는 변경하지 않는다.
- 고정 수·대상 자격·권한·교체·lifecycle 정책은 PROD-809에서 아직 확정되지 않았다. 기존 DSN-55의 교체 확인과
  empty·removed·unavailable 대표 화면만으로 제품 정책을 확정하지 않는다. 필요한 추가 UI는 PROD-809의
  canonical 계약 확정 후 범위를 정한다.
- 단순 고정·해제는 확인 없이 실행한다. 실제 호출 가능 여부는 consumer가 판단하며 공용 UI가 자격·권한을
  계산하지 않는다. persistence/API·ActivityPub·pagination·mutation·동시성은 PROD-809가 소유한다.

### Storybook 이관 · PROD-863

- 시각·상태 근거는 [DSN-55 handoff](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4827-6858)와
  `PostAttributionRow`의 [Center Pinned](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4821-12984)·
  [Mobile Pinned](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4821-12988) source다.
- `PostListItem`의 `pinned`는 표시만 소유한다. 정렬·자격을 계산하거나 Home에 고정을 적용하지 않는다.
  실제 Pin mutation과 production 호출자가 없으므로 `profilePin`·`onAction` 공개 API와 가짜 요청 함수를
  미리 만들지 않는다. 실제 요청 실행은 PROD-809에서 mutation을 연결할 때 개별 액션 내부에 둔다.
- 고정·해제 메뉴 조립과 요청·상태 전환 모의는 Storybook fixture가 소유한다. Storybook 전용 adapter가
  실제 `PostActionBar`에 메뉴 항목·pending 표시·focus 복귀 연결·sheet 아이콘 크기를 공급한다.
  fixture 밖에서는 원래 props를 그대로 전달하며 production `PostActionSurface`는 고정 항목을 조립하지 않는다.
- 기존 `usePostMoreMenuItem`이 복사 URL·클립보드 실패 처리를 유지하고, `PostDeletionAction`이 삭제
  eligibility·확인창·mutation·cache·실패 처리를 유지한다. fixture는 owner의 복사·고정·삭제 순서와
  visitor의 링크 복사만 있는 메뉴를 보여준다. 실제 고정 자격·정책은 후속 Profile consumer가 확정한다.
- 이 메뉴의 sheet 아이콘은 DSN-55 source에 맞춰 24px을 사용한다. 공용 `ActionMenu`의 다른 소비자는
  기존 20px을 유지한다. Web 메뉴는 기존 18px을 유지한다.
- fixture의 모의 요청 중 실제 More trigger의 busy·disabled 표시를 검증한다. 모의 완료 뒤 More trigger로
  focus를 돌리고, 실패하면 기존 고정 표시를 유지하며 공용 toast에 한국어 오류를 표시한다. 오류 원문은
  표시하지 않는다. 메뉴를 다시 열어 재시도할 수 있지만, 이는 실제 Pin 요청의 중복 방지·실패 복구 증거가 아니다.
- `KOSMO/Patterns/Profile/Pin Action`의 Playground는 수동 Controls·Actions용이며 자동 조작은 Controls가
  비활성화된 `Tests`에 둔다. Controls는 owner/visitor, pin/unpin, 본문과 요청 success/pending/error를 제공한다.
- 2026-09-08 PROD-863 범위 확정에 따라 empty·removed·unavailable·loading·error 전용 상태 카드와
  presentation Control, 교체 확인과 replace/confirm/cancel 공개 API는 이 이관에서 제외한다. 고정·해제 요청의
  pending·실패 피드백은 유지한다. ConfirmationContent는 이 이슈의 선행 조건이 아니다.
- 2026-09-09 리뷰 답변과 사용자 승인에 따라 기존 callback 기반 실행 계약을 위의 fixture 기반 표시
  검증으로 변경했다. `ProfilePinAction` production controller를 제거하며 요청 수명과 결과 반영은
  실제 mutation 구현 시 다시 검증한다.
- 이 이관은 제품 정책과 독립적인 공용 UI 범위만 구현하므로 새 OpenSpec을 만들지 않는다. PROD-809의
  정책 검토·명세 확정은 이 이관 완료를 기다리지 않으며, API·mutation·cache·pagination·권한과 실제 Profile
  연결, Native touch·focus·screen reader QA는 미완료 runtime 범위로 남긴다.
- 2026-09-09 로컬 검증: Relay·TypeScript·lint·Storybook 빌드와 Pin·PostActionBar·Posts의 123개 테스트가
  통과했다. 새 정적 빌드의 키보드 고정 모의 실행·표시 전환·More focus 복귀를 확인했고, 완료 상태의
  접근성 재검사는 위반 0건이었다. 이 기록은 fixture의 공용 UI 검증이며 실제 Pin mutation 증거가 아니다.

## Repost 실패 toast

- 앱은 하나의 공용 transient toast host를 provider에서 제공하고 실제 `PostListItem`·`PostLayout` surface가
  Repost 실패 callback을 action별 한국어 toast로 연결한다. 외부 toast 의존성은 추가하지 않는다.
- 생성 실패 문구는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- 취소 실패 문구는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- toast는 화면 하단에서 safe area와 고정 탭 바 위에 표시하고 약 3초 뒤 자동으로 사라진다. 새 toast가 오면
  기존 toast를 교체하고 dismiss timer를 다시 시작하며 queue, 닫기 control과 toast 내부 재시도 control은 두지 않는다.
- 오류 toast는 보조 기술이 즉시 인식할 수 있는 alert semantics를 제공한다. 활성 toast와 같은 문구가 다시
  발생해도 새 alert instance로 교체해 보조 기술이 반복된 실패를 다시 인식할 수 있어야 한다.
- Repost 실패 Toast는 Danger tone의 semantic `feedback/danger/subtle` 배경과 `feedback/danger/on-subtle` 전경,
  `feedback/danger/base` 4px left rail을 사용한다. message는 20px line box와 toast padding만으로 수직 중앙 정렬하며 별도 glyph transform을 두지 않는다.
- 실패 시 pending만 종료하고 이전 서버 확정 selected 상태, `repostCount`와 Relay cache를 유지한다. 사용자는
  메뉴를 다시 열고 같은 action을 선택해 재시도한다. 성공 toast는 표시하지 않는다.

## Post 삭제 More menu

- Action Bar의 16px `MoreHorizontal` 케밥 icon은 삭제를 즉시 실행하는 button이 아니라 기존 `ActionMenu`를
  여는 More trigger다. trigger의 접근성 이름은 `더 보기`이고 menu open 상태를 노출한다.
- `삭제` 항목은 현재 selected Profile과 Action Bar target Post의 Author Profile이 같고, target이 Content를
  가진 Active Post일 때만 표시한다. 일반 Post, Reply, Quote와 Reply이면서 Quote를 포함하며 guest, 다른
  Profile, Tombstone과 Content 없는 Repost에는 표시하지 않는다.
- 순수 Repost surface의 Action Bar target은 기존 배치 계약대로 direct Repost Source다. 따라서 More의 삭제
  eligibility와 mutation ID도 Source를 기준으로 하며, 바깥 Repost의 취소는 Repost action menu가 계속
  소유한다.
- `링크 복사`와 `삭제`가 함께 제공되면 일반 action인 `링크 복사`를 먼저, destructive action인 `삭제`를
  마지막에 둔다. `삭제` item은 `Trash2` icon, theme `danger` 색과 접근성 이름 `게시글 삭제`로 파괴적 결과를
  label과 색상 모두로 구분한다.
- `삭제` item을 선택하면 More menu를 닫고 확인 dialog를 연다. 이 선택만으로 mutation이나 cache 변경을
  시작하지 않는다. dialog title은 `게시글을 삭제할까요?`, 설명은 `삭제한 게시글은 복구할 수 없습니다.`,
  action은 `취소`와 `삭제`를 사용한다.
- Figma 배치 근거는 [`Post deletion confirmation placement`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5631-25077)다.
  canonical [`ModalSheet`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1882-926)의
  content swap에 공용 [`ConfirmationContent`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5103-15173)의
  `Tone=Danger`, `State=Idle|Pending`을 넣고 제목·설명·action label만 삭제 문맥으로 설정한다. Web·Mobile과
  Light·Dark 배치 표본은 source 조합 evidence이며 Production Screens consumer나 runtime 상호작용 완료를
  뜻하지 않는다. 이 조합은 visual/layout source 계약이며 runtime semantic surface를 `Tone=Danger`에서 자동
  파생한다는 뜻이 아니다.
- 확인 dialog는 공용 `ModalSheet`와 `ConfirmationContent` 조합을 사용한다. Web에서는 native `<dialog>`가
  `alertdialog` role과 `aria-modal`을 가진 유일한 modal surface이고, inner React Native surface에는 중복
  modal semantics를 두지 않는다. Android·iOS에서는 기존 `ModalSheet`의 modal 접근성 의미를 재사용한다.
  `ModalSheet`의 canonical `420px` semantic shell과 `backgroundElevated`·`borderDefault` token을 사용하며,
  처음 열릴 때 안전한 `취소`에 focus를 두고 pending 전에는 Escape, platform back과 backdrop으로 취소할 수
  있으며 닫힘이 완료된 뒤 More trigger로 focus를 돌려보낸다.
- 사용자가 dialog의 `삭제`를 확인한 경우에만 target Post ID로 기존 GraphQL `deletePost` mutation을 한 번
  실행한다. pending 중에는 두 action과 dismiss 입력을 막고 destructive action에 busy 상태를 노출한다.
- 서버 성공 payload의 `postId`를 확인한 뒤에만 현재 Relay actor Store에서 해당 Post를 Active content로
  제거한다. Home·Profile 목록은 삭제된 Post edge를 표시하지 않고 상세는 기존 삭제됨·접근 불가 상태로
  전환하며, 다른 selected Profile의 actor Store는 변경하지 않는다. 성공하면 dialog를 닫고 성공 toast는
  표시하지 않는다.
- 실패에는 optimistic 삭제를 적용하지 않고 서버 확정 Post와 cache를 유지한다. dialog는 열린 상태에서 다시
  입력할 수 있게 복구하고 공용 toast host에 `게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.`를
  alert semantics로 표시한다.

## 소유권과 후속 범위

- `PROD-414`는 실제 Action Bar surface 배치, Repost menu, 생성·취소 action과 실패 toast를 소유한다.
- `PROD-415`는 목록의 Source 이동과 순수 Repost ID 직접 접근의 Source detail redirect를 소유한다.
- `PROD-431`은 `인용하기` 메뉴 항목과 Quote 작성 흐름을 소유한다.
- `PROD-471`은 Repost 취소 뒤 서버 확정 Source 상태를 같은 actor Store에 정규화하는 cache 갱신을 소유한다.
- `PROD-598`은 기존 Post 삭제 domain과 GraphQL resolver를 재사용해 More의 작성자 삭제 항목, 확인 dialog,
  Relay cache 동기화와 실패 복구를 소유한다.
- `PROD-937`은 `PROD-598`의 author deletion behavior를 바꾸지 않고 공용 `ModalSheet`·`ConfirmationContent`
  presentation migration, Web 단일 `alertdialog`·`aria-modal` surface, canonical `420px` shell과
  focus·dismiss·pending 회귀 검증을 소유한다.
- `PROD-809`는 Profile 고정의 최대 수·대상 자격·권한·lifecycle·pagination·persistence/API·ActivityPub과
  교체 mutation·동시성·실패 처리 정책, 실제 Production·runtime 검증을 소유한다.
- `PROD-425`는 pure Repost Reply의 바깥 contentless Post binding과 disabled 상태를 소유한다.
- Reaction, Bookmark, More의 실제 연결과 여러 action의 최종 통합, guest 인증 진입, valid 세션의 Profile
  선택기 진입과 session error 비활성화는 각 구현 이슈와 `PROD-432`가 소유한다.

## 검증

- 일반 Post, 순수 Repost, Quote 목록에서는 Action Bar slot이, 상세에서는 Action Bar가 content grid의 마지막
  sibling이고 navigation Link/Pressable의 descendant가 아닌지 검증한다.
- Figma canonical 일반 Text·Media source와 production consumer에서 카드 상단 12px·하단 4px, Action Bar
  slot 상단 4px·하단 0, 마지막 presentation에서 Action Bar까지 8px인지 검증한다. 순수 Repost와 Quote는
  direct Action Bar와 카드 상단 8px·하단 1px을 유지하고 1px 구분선은 semantic `divider` color를 사용해야 한다.
  순수 Repost는 attribution line box가 20이고 Source 표준행과의 추가 gap이 0인지, Quote는 Source preview
  내부 하단 padding이 4px이고 border 밖에서 Action Bar까지 8px인지 함께 검증한다. Quote Source preview는
  resting fill이 투명하고 border는 유지되며 Web pointer hover에서만 `stateHover` overlay를 사용하는지도 확인한다.
- 일반 목록의 Reply와 Reply+Quote는 조회 가능한 Parent의 display name을 사용한 Reply attribution을 한 번
  표시하고, 일반 Post와 Parent를 조회할 수 없는 Reply에는 표시하지 않는지 검증한다. Reply attribution은
  클릭 가능한 요소가 아니며 장식 icon과 문구를 중복 announce하지 않아야 한다.
- `/bookmarks`의 Bookmark action이 Compact·Full에서 모두 data-derived `Selected`인지, 두 목록의
  `PostListItem` stack 간격이 모두 0인지 확인한다.
- Compact·Full과 Light·Dark의 Pinned attribution은 위쪽 4px을 포함한 24px 높이인지, Repost attribution은
  위쪽 여백 없이 20px인지 확인한다.
- 상세 thread의 현재 Post에서 current row 상단부터 content까지 16px, metadata 하단부터 Reaction Summary까지
  8px, Reaction Summary 아래부터 Action Bar frame 상단 border까지 4px인지 검증한다. Summary가 없으면
  metadata 하단부터 border까지 8px이어야 하며, 위아래 1px border와 8px padding 사이에는 Action Bar만
  있어야 한다. selected Profile이 있고 Reply
  surface가 닫힌 기본 상태에서도 빈 wrapper가 남지 않으며 Engagement 아래부터 current row 끝까지 4px이고
  current row 뒤 별도 thread divider가 없는지 exact geometry로 검증한다.
- 모든 플랫폼 구현에서 Bar와 visual/layout slot 높이 28, Reply·More layout slot endpoint의 content column 양끝 정렬, social layout slot 최소 너비 50, More 너비
  28, glyph 16, icon-count gap 4와 고정 순서를 검증한다. Web에서는 count가 있으면 숫자 `0`을 포함해 target
  너비가 `6 + 16 + 4 + 렌더된 count 너비 + 6`, count가 없으면 28×36인지 확인한다. social slot은
  `max(50, target 너비)`이고 leading Reply target은 slot 시작에, 나머지 social target은 가운데에 정렬하며,
  Bookmark 50 + gap 4 + More 28 trailing group이 exact
  82px이고 모든 interactive rectangle이 분배 여백을 덮거나 서로 겹치지 않아야 한다.
- Web pointer hover에서는 glyph 중심 28×28 원형 background, count 기반 HUG 또는 count 없는 28×36 click target,
  일반 action의 30% `primary` background·불투명 `primary` foreground,
  Reply glyph·count의 동일 foreground, Repost의 미선택 glyph·count 중립색·hover glyph 의미색과 중립 count·selected
  glyph·count의 mode별 `actionRepostBase`, Reaction의 30% `actionReactionBase` background·불투명 foreground·HeartPlus selected outline과
  기존 pressed 상태 보존을 검증한다.
  blocked action, Web touch 입력과 Native에는 hover background가 나타나지 않는지 확인한다.
- Web menu가 scroll container 밖에서 잘리지 않고 첫 item이 trigger pointer 지점을 덮는지, 같은 위치의
  두 번째 pointer 활성화로 item이 선택되는지 검증한다. More menu는 card 오른쪽이 trigger 오른쪽보다 5px
  바깥에 있고 첫 item 오른쪽은 trigger 오른쪽과 맞아 왼쪽으로 펼쳐지는지, Repost menu는 기존 시작
  정렬을 유지하는지 함께 검증한다. card surface·36px 높이·128px 최소폭·18px icon·14px·500
  label·8px 좌우 padding·border·`0 2px 4px` shadow를 제공하는지 검증한다. open/close, focus 복귀와
  키보드 이동도 함께 검증한다.
- Native bottom action sheet의 backdrop·back dismiss, safe area, modal 접근성과 menu item target을 검증한다.
- Native 44pt·48dp Action Bar target과 VoiceOver·TalkBack runtime은 출시 전 후속 gate로 남기고, 현재 28px
  공통 구현의 완료 증거로 보고하지 않는다.
- 순수 Repost에서 Reply는 바깥 contentless Repost identity를 유지해 disabled이고,
  Repost·Reaction·Bookmark·More만 direct Source Post를 대상으로 사용하는지 검증한다.
- Post 본문과 Quote Source의 클릭 가능한 외부 링크가 Light·Dark `actionLinkBase`를 사용하고 밑줄과
  바깥 Post·Source navigation 입력 격리를 유지하는지 검증한다.
- target 자체가 적격할 때 guest는 기존 인증 진입으로, valid 세션에서 selected Profile이 없으면 기존 Profile
  선택기로 위임하고 session error에서는 액션을 비활성화하는지 검증한다. Profile 선택 뒤 원래 액션을 자동으로
  재실행하지 않는다.
- 선택·미선택 상태의 메뉴 label, pending 중복 차단, 생성·취소 mutation identity와 actor 격리를 검증한다.
- 실패 문구, latest-replace, 동일 문구 반복 시 새 alert instance와 dismiss timer 재시작, 자동 dismiss,
  alert semantics, Danger tone의 `feedback/danger/subtle` 배경·`feedback/danger/on-subtle` 전경·
  `feedback/danger/base` 4px left rail, message 중앙 정렬, 별도 glyph transform 없음, 실패 뒤 상태 유지·다음 입력
  재시도를 검증한다.
- 작성자·selected Profile 일치, Active contentful target과 guest·다른 Profile·Tombstone·Content 없는 Repost의
  `삭제` 노출 여부, Source를 target으로 하는 순수 Repost surface, 링크 복사와 destructive item 순서를
  검증한다.
- 삭제 확인 전 취소와 dismiss, dialog의 title·설명·안전한 초기 focus·modal/alertdialog 의미, 정확한 Post ID의
  단일 mutation, pending 중 중복·dismiss 차단과 busy 상태를 검증한다.
- 성공 뒤 Home·Profile 목록 제거와 상세의 삭제됨·접근 불가 상태, selected Profile별 actor Store 격리, 실패
  뒤 cache 유지·dialog 재시도와 접근 가능한 한국어 toast를 검증한다.
- Profile 고정의 Mobile `390`, Web `1024`·`1440` Light/Dark 화면, ProfileHero·PostListItem·PostAttributionRow
  source 상속, 메뉴 label·순서·color, 장식 Pin의 중복 announce 방지를 검증한다. 실제 runtime 접근성은 PROD-809에서
  검증한다.
- Storybook에서 고정·해제 모의 상태에 따른 표시 전환, pending의 busy·disabled UI, 실패 표시 유지·한국어
  toast·재시도와 메뉴 keyboard·dismiss·trigger focus return을 검증한다. fixture 없는 production 메뉴에
  고정 action이 추가되지 않는지도 검증한다. 실제 요청 수명·결과 반영과 교체 확인·전용 상태 화면은
  PROD-809의 mutation·정책 구현 범위에서 검증한다.

## 인용 동의와 원문 표시

[ADR 0029](../domain/decisions/0029-quote-consent-and-federation.md)의 인용 정책을 작성과 표시 흐름에 적용한다.

- 이번 사이클에는 게시글별 인용 허용 설정 `모두`, `팔로워`, `본인만`을 제공한다. 새 글과 기존 글의 초기값은
  `모두`다. Profile 기본값 설정은 PROD-925 Backlog로 분리한다.
- 타인의 글은 Public·Unlisted이고 조회 가능한 경우에만 인용 대상으로 선택한다. 자기 Followers Only 글은
  기존 원문 접근 범위를 유지하며 인용할 수 있다.
- 자기 인용은 QuoteRequest 없이 허용한다. 타인의 원격 글은 `interactionPolicy`가 automatic/manual approval을
  광고하거나, 정책이 없거나 해석되지 않는 경우에도 작성자의 본문을 pending 상태로 게시하고 QuoteRequest를
  보낸다. 게시된 글에서 승인 전 Source를 정상 인용 카드로 표시하지 않으며, Accept와 유효한
  QuoteAuthorization을 받은 뒤 Source를 표시한다. 거절·철회·원문 삭제 후에는 자체 본문을 유지한 채 Source를 숨긴다.
- `interactionPolicy`는 작성 전 UI·eligibility 힌트로만 사용한다. 현재 작성자가 automatic/manual 어느 쪽에도
  포함되지 않으면 승인이 예상되지 않는다고 안내할 수 있지만, 정책 자체를 승인 증거로 사용하지 않는다.
- Kosmo 자체의 건별 수동 승인 UI는 제공하지 않는다. 작성자는 자기 글의 정책을 변경하거나 기존 인용 승인을
  명시적으로 철회할 수 있다. 정책 변경과 차단만으로 기존 승인을 자동 철회하지 않는다.
- 새 QuoteRequest와 새 인용 승인은 양방향 차단 관계에서 막는다. 기존 승인 Source는 기존 방향별 Post 조회
  정책을 적용하므로 Viewer가 Source Author를 차단한 방향만 존재하면 직접 조회 조건에 따라 표시할 수 있고,
  Source Author가 Viewer를 차단했거나 상호 차단한 경우에는 숨긴다. 제3자에게도 Source를 숨기는 사용자 조작은
  별도 승인 철회다.
- PROD-431은 인용 작성과 Composer를, PROD-924는 게시글별 정책·철회 조작과 승인 lifecycle 연동을 소유한다.
  후속 설계에서는 이 조작의 진입점·오류 복구·접근성을 기존 공용 UI 계약에 맞춰 구체화한다.
- PROD-431은 승인 경계가 없는 ActivityPub Source를 정상 인용으로 표시하지 않고 작성 오류로 안전하게
  종료한다. PROD-924가 이를 pending·승인·거절·철회 상태로 연결하며, 그 미완료는 PROD-431의 기본 작성
  UI와 담당 회귀 검증 완료를 막지 않는다.

## 인용 작성 범위

- `인용하기`는 현재 action 대상 Post를 direct Source로 선택해 공용 Composer를 연다. Source 자체가 Quote여도
  그 Source의 Source로 대상을 바꾸지 않는다. 작성 중 preview는 한 단계만 표시한다.
- 본문·Visibility·Content Warning·Sensitive Media·Media, pending·폐기·실패 복구는 기존 Composer를 재사용한다.
  Source preview만으로 유효한 작성 Content를 만들지 않는다.
- 로컬 Quote 작성에는 Reply Parent를 추가하지 않는다. Reply+Quote 작성 UI·API와 본문 링크의 인용 카드
  전환은 2026-09-09 PROD-431 사용자 지시로 제외했다. 기존 Reply 작성과 저장된 관계의 표시 계약은 유지한다.
- 게시 전의 Source preview와 게시 후 승인에 따른 Source 표시는 구분한다. 작성 성공은 요청한 selected Profile의
  Relay Environment에 반영한다. 클라이언트는 서버 payload에 없는 Source를 낙관적으로 노출하지 않는다.
  승인 대기를 성공으로 반환하는 서버 lifecycle과 이후 Source 갱신은 PROD-924가 담당한다.
