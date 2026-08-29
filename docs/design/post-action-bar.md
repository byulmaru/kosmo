# Post Action Bar

Post Action Bar는 Post의 Reply, Repost, Reaction, Bookmark와 More action을 한 줄에 배치하는 공용 UI다.
각 action의 fragment, mutation과 상태 소유권은 해당 private child가 가지며, Bar는 고정 순서와 공통 control
표현을 조립한다.

## Figma geometry

기준 source는 Figma `KOSMO` 파일의 [`Action` node 88:1005](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005)다. source metadata에서 27px로 측정되는 한 줄 높이는 구현과 검증에서 exact 28px 정수 계약으로 정규화한다.

- Bar와 각 interactive control의 높이는 Web·Android·iOS 모두 28px·28dp·28pt다. Native 값은 출시 전 임시 예외이며 아래 release gate를 통과하기 전에는 Native 접근성 완료를 주장하지 않는다.
- Bar는 가용 너비를 채우고 Reply control slot의 왼쪽 경계와 More control slot의 오른쪽 경계를 PostBody가 사용하는 content column의 양끝에 맞춘다. 나머지 action은 그 사이를 `space-between`으로 분배한다. Figma의 302px frame은 기준 viewport의 측정값이며 production 고정 너비가 아니다.
- Reply, Repost, Reaction, Bookmark의 action slot 너비는 각각 50px이며 icon-count visual group을 slot 왼쪽에 맞춘다. 따라서 각 glyph의 왼쪽 경계는 자기 slot의 왼쪽 경계와 일치한다. More는 이 왼쪽 정렬에서 제외해 16px glyph를 최소 28px interactive target 가운데에 두고 target 오른쪽 경계를 content column 오른쪽 끝에 맞춘다.
- 모든 glyph의 visual box는 16×16px, glyph와 count 사이는 4px다. count는 16px 한 줄이며 icon과 시각 중심을 맞춘다.
- 순서는 `Reply → Repost → Reaction → Bookmark → More`로 고정한다. Reply와 Repost만 count를 표시하고 Reaction·Bookmark·More에는 count slot을 만들지 않는다.
- pending spinner, selected·pressed·disabled 표현은 같은 28px slot 안에서 layout을 바꾸지 않는다. focus indicator와 accessible name·state는 compact geometry에서도 유지한다.
- `/bookmarks` 목록의 Bookmark action은 저장된 상태에서 파생한 `Selected`를 사용한다. Compact와 Full 모두
  같은 `PostListItem` source와 `itemSpacing=0` stack rhythm을 유지하며 선택 상태 때문에 목록 간격을 바꾸지 않는다.
- Figma Action은 내부 상하 padding 4px을 포함한다. canonical
  [`PostListItem` Text·Media variants](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1924-1992)는
  카드 상단 12px·하단 4px을 사용한다. content column의 기존 4px gap 뒤 final slot 상단 4px을 더해 마지막
  presentation(본문·미디어 또는 Reaction Summary)과 Action Bar 사이를 8px로 만들고, slot 하단은 0으로
  두어 카드 하단 4px이 구분선 간격을 단독 소유한다. Quote와 순수 Repost의 별도 spacing 계약은 유지한다.
- 이 값은 현재 Figma target이다. production `PostListItem`은 이 문서 변경에서 수정하지 않으며 카드 상단
  8px과 목록 전용 Action Bar slot 상단 0·하단 4px을 유지한다. Figma target의 production 적용은 관련
  Product 이슈와 OpenSpec spec·task를 연결한 뒤 구현과 runtime 검증을 함께 진행한다.

## Action semantic colors

- Reaction은 active·Web hover에서 semantic `actionReactionBase` (`#F97066`)를 사용한다.
- Repost glyph와 count는 default·Web hover·selected에서 semantic `actionRepostBase`를 사용한다. Light는
  `green/600 #16794A`, Dark는 `green/500 #409667`이다.
- pending·disabled처럼 입력이 차단된 상태에서는 기존 중립 처리 표현이 action 의미색보다 우선한다.
- `actionRepostBase`는 Repost 전용 제품 의미색이며 전역 `feedbackSuccessBase`를 바꾸거나 재사용하지 않는다.

## Web hover target

- Web의 비터치 pointer가 action 위에 머무르면 16×16px glyph를 중심으로 한 28×28px 원형 background를
  표시한다. Reply, Bookmark와 More는 현재 theme의 semantic `primary`를 30% opacity로 사용하고 hover
  foreground에는 불투명 `primary`를 사용한다. Reaction은 `actionReactionBase`, Repost는
  `actionRepostBase`를 같은 방식으로 사용한다. Reply count는 기존 색을 유지하고 Repost count는
  `actionRepostBase`를 유지한다.
- 원형 hover background는 실제 interactive target의 크기·padding·간격을 바꾸지 않는다. Reply, Repost,
  Reaction과 Bookmark의 target은 계속 50×28px이고 More는 28×28px이며, background는 count를 감싸거나
  인접 action target과 겹치지 않는다.
- Reaction이 selected 상태이면 hover 여부와 관계없이 glyph의 stroke와 fill에 `actionReactionBase`를 사용한다. 다른
  action의 default·active 색, selected fill과 모든 action의 pressed opacity는 기존 상태 표현을 유지한다.
  hover가 끝나면 원형 background는 사라지고 미선택 Reaction의 foreground는 기존 default 색으로 돌아간다.
- pending·disabled·resolution-required처럼 입력이 차단된 action은 hover background를 표시하지 않는다.
  Native와 Web touch 입력에는 hover 전용 background를 표시하지 않는다.
- light·dark theme 모두 `primary`, `actionReactionBase`, `actionRepostBase` semantic token을 사용한다.

## 플랫폼 rollout과 release gate

- 현재 출시 범위는 Web이며, 구현 drift를 막기 위해 Native platform file도 우선 같은 28px geometry를 사용한다.
- iOS 출시 전에는 실제 hit target을 최소 44×44pt, Android 출시 전에는 최소 48×48dp로 복구한다. visual 28px row 유지 여부와 hit target 확장 방식은 target overlap 없이 별도 결정한다.
- Native target 복구, VoiceOver·TalkBack focus boundary, touch 입력과 bottom sheet runtime 관찰은 Native release gate다. 현재 PROD-414 완료나 Web 검증으로 대체하지 않는다.

## Surface 배치

- `PostLayout`은 `PostActionBar`를 Post content grid 안의 마지막 자식으로 렌더링한다. 현재 production의
  일반 Text·Media `PostListItem`은 카드 상단 8px과 상단 0·하단 4px인 목록 전용 Action Bar slot을 유지한다.
  별도 Product migration의 target은 Figma와 같은 카드 상단 12px·하단 4px, slot 상단 4px·하단 0이며,
  content column의 기존 4px gap과 합쳐 마지막 presentation(본문·미디어 또는 Reaction Summary)에서 Action
  Bar까지 8px을 만든다. Quote와 순수 Repost는 기존 상단 0·하단 4px slot을 유지한다.
- 상세 thread의 현재 Post는 Reaction Summary가 있으면 Summary와 Action Bar 사이에 4px을 둔다.
  Reply surface가 닫힌 기본 상태에서는 빈 Composer wrapper를 렌더링하지 않고 Action Bar 아래부터 다음
  thread divider까지 4px을 둔다. current row 상단의 16px은 유지한다. 이 간격은 thread current row
  wrapper와 `PostLayout`이 소유하며 Action Bar의 28px geometry는 바꾸지 않는다.
- Action Bar는 `PostBody` 또는 Source presentation과 같은 content-level sibling이며 본문, 작성자, 생성 시각,
  Source preview의 `Link`나 `Pressable` 안에 중첩하지 않는다.
- 일반 Post는 본문 뒤, 순수 Repost는 Source presentation 뒤, Quote는 자체 본문과 Source preview 뒤에 Action
  Bar를 둔다. 상세의 metadata가 있으면 metadata 뒤에 둔다.
- Quote 목록은 Source preview의 내부 하단 padding을 4px로 줄이고, 공용 Action Bar slot의 상단 padding 0을
  유지하면서 Source preview border 밖에서 Action Bar까지 8px 간격을 둔다. 순수 Repost도 기존 slot과
  attribution·Source 간격을 유지한다.
- 순수 Repost의 본문·생성 시각 affordance는 Repost 자체가 아니라 Source detail로 이동한다. Repost Author와
  Source Author affordance는 각각 해당 Profile로 이동한다.
- 순수 Repost 아래 Action Bar의 Reply는 바깥 contentless Repost의 Reply 계약을 유지해 disabled로 표시한다.
  Repost·Reaction·Bookmark·More는 화면에 표시한 direct Source Post를 대상으로 동작한다. 따라서 Repost
  menu의 선택 상태, count와 생성·취소 identity도 Source fragment에서 파생한다.
- Quote의 자체 본문 affordance는 Quote detail로 이동하고 Source preview만 Source detail로 이동한다.
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

## Repost action menu

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

- Web의 More menu는 Repost와 같은 외부 overlay·viewport 보정·dismiss·keyboard 계약을 재사용하되 More
  trigger의 오른쪽을 기준으로 왼쪽을 향해 펼친다. menu card의 오른쪽 경계는 trigger 오른쪽보다 5px
  바깥에 두고 첫 item의 시각 target 오른쪽 경계는 trigger 오른쪽과 맞춘다. 따라서 28px More trigger는
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
- PROD-809에서 확정한 정책에 따라 새 Post를 고정하면 기존 고정 Post가 해제되는 경우
  `고정 게시물을 변경할까요?` 제목과 `새 게시물을 고정하면 현재 고정된 게시물의 고정이 해제됩니다.` 설명을
  표시한다. action은 `취소`와 Primary `변경하기`이며 취소·닫기는 상태를 바꾸지 않는다. 단순
  `프로필 고정 해제`는 확인 없이 수행한다.
- 교체 확인은 도메인 전용 confirmation component나 OS alert를 만들지 않고 canonical `ModalSheet`에 공용
  `ConfirmationContent`의 `Tone=Primary`, `State=Idle`을 넣는다. Web에서는 제목으로 이름 붙은 modal `dialog`,
  Android·iOS에서는 제목으로 이름 붙은 modal 접근성 surface를 제공하며 backdrop과 platform back은 취소와
  동일하게 처리한다. 접근성 role은 `Tone`에서 파생하지 않고 consumer가 문맥에 맞는 semantic surface 하나로
  제공한다.
- empty·removed·unavailable는 representative UI일 뿐이다. 최대 수·대상 자격·권한·lifecycle·pagination·
  persistence/API·ActivityPub과 교체 mutation·동시성·실패 처리 정책은 PROD-809가 소유한다.

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
- 확인 dialog는 Web에서 이름이 있는 `alertdialog` 하나, Android·iOS에서 modal 접근성 의미를 제공한다. Web의
  `dialog`와 `alertdialog`를 중첩하지 않는다. canonical `ModalSheet` runtime이 단일 role 선택을 지원하기 전에는
  현재 Post 삭제 consumer의 전용 semantic surface를 유지한다. 이 surface의 현재 `480px` max-width와 legacy
  card·border token은 canonical `ModalSheet`의 `420px` 및 `backgroundElevated`·`borderDefault` 계약과 아직 다르며,
  별도 Product/Frontend migration에서 정렬한다. 임시 semantic surface는 별도 visual component source가 아니다.
  처음 열릴 때 안전한
  `취소`에 focus를 두고 pending 전에는 Escape, platform back과 backdrop으로 취소할 수 있으며 닫은 뒤 More
  trigger로 focus를 돌려보낸다.
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
- `PROD-809`는 Profile 고정의 최대 수·대상 자격·권한·lifecycle·pagination·persistence/API·ActivityPub과
  교체 mutation·동시성·실패 처리 정책, 실제 Production·runtime 검증을 소유한다.
- `PROD-425`는 pure Repost Reply의 바깥 contentless Post binding과 disabled 상태를 소유한다.
- Reaction, Bookmark, More의 실제 연결과 여러 action의 최종 통합, guest 인증 진입, valid 세션의 Profile
  선택기 진입과 session error 비활성화는 각 구현 이슈와 `PROD-432`가 소유한다.

## 검증

- 일반 Post, 순수 Repost, Quote 목록에서는 Action Bar slot이, 상세에서는 Action Bar가 content grid의 마지막
  sibling이고 navigation Link/Pressable의 descendant가 아닌지 검증한다.
- Figma canonical 일반 Text·Media source와 representative consumer에서 카드 상단 12px·하단 4px,
  Action Bar slot 상단 4px·하단 0인지 readback한다. production migration에서는 마지막
  presentation(본문·미디어 또는 Reaction Summary)에서 Action Bar까지 8px인지 별도로 검증한다. 이 문서
  변경의 production 완료 증거로 간주하지 않는다. 순수 Repost와 Quote는 slot 상단 0·하단 4px을 유지하고
  1px 구분선은 semantic `divider` color를 사용해야 한다.
  순수 Repost는 attribution line box가 20이고 Source 표준행과의 추가 gap이 0인지, Quote는 Source preview
  내부 하단 padding이 4px이고 border 밖에서 Action Bar까지 8px인지 함께 검증한다.
- 일반 목록의 Reply와 Reply+Quote는 조회 가능한 Parent의 display name을 사용한 Reply attribution을 한 번
  표시하고, 일반 Post와 Parent를 조회할 수 없는 Reply에는 표시하지 않는지 검증한다. Reply attribution은
  클릭 가능한 요소가 아니며 장식 icon과 문구를 중복 announce하지 않아야 한다.
- `/bookmarks`의 Bookmark action이 Compact·Full에서 모두 data-derived `Selected`인지, 두 목록의
  `PostListItem` stack 간격이 모두 0인지 확인한다.
- Compact·Full과 Light·Dark의 Pinned attribution은 위쪽 4px을 포함한 24px 높이인지, Repost attribution은
  위쪽 여백 없이 20px인지 확인한다.
- 상세 thread의 현재 Post에서 current row 상단부터 content까지 16px, Reaction Summary 아래부터 Action Bar까지
  4px인지 검증한다. selected Profile이 있고 Reply surface가 닫힌 기본 상태에서도 빈 wrapper가 남지 않으며
  Action Bar 아래부터 1px thread divider까지 4px인지 exact geometry로 검증한다.
- 모든 플랫폼 구현에서 Bar와 control 높이 28, Reply·More target의 content column 양끝 정렬, social action 너비 50, More target 너비 최소
  28, glyph 16, icon-count gap 4와 고정 순서를 검증한다. Web runtime에서는 각 target이 24×24 CSS px 자체를
  포함하고 서로 겹치지 않는지도 확인한다.
- Web pointer hover에서는 glyph 중심 28×28 원형 background, social action의 50×28 click target과 More의
  28×28 click target 보존, 일반 action의 30% `primary` background·불투명 `primary` foreground,
  Reply count 색 유지, Repost의 mode별 `actionRepostBase`, Reaction의 30% `actionReactionBase` background·불투명 foreground·selected 표현과
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
- 새 고정으로 기존 고정 Post가 해제되는 경우에만 교체 확인을 표시하고 제목·설명·`취소`·Primary `변경하기`가
  정확한지, canonical `ModalSheet`와 플랫폼별 modal 의미를 재사용하는지, backdrop·platform back을 포함한
  취소·닫기는 상태를 유지하며 단순 `프로필 고정 해제`에는 확인을 표시하지 않는지 검증한다. 교체 mutation의
  성공·실패·동시성은 PROD-809에서 검증한다.
