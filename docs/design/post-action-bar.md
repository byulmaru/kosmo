# Post Action Bar

Post Action Bar는 Post의 Reply, Repost, Reaction, Bookmark와 More action을 한 줄에 배치하는 공용 UI다.
각 action의 fragment, mutation과 상태 소유권은 해당 private child가 가지며, Bar는 고정 순서와 공통 control
표현을 조립한다.

## Figma geometry

기준 source는 Figma `KOSMO` 파일의 [`Action` node 88:1005](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005)다. source metadata에서 27px로 측정되는 한 줄 높이는 구현과 검증에서 exact 28px 정수 계약으로 정규화한다.

- Bar와 각 interactive control의 높이는 Web·Android·iOS 모두 28px·28dp·28pt다. Native 값은 출시 전 임시 예외이며 아래 release gate를 통과하기 전에는 Native 접근성 완료를 주장하지 않는다.
- Bar는 가용 너비를 채우고 좌우 8px padding 안에서 action을 `space-between`으로 분배한다. Figma의 302px frame은 기준 viewport의 측정값이며 production 고정 너비가 아니다.
- Reply, Repost, Reaction, Bookmark의 action slot 너비는 각각 50px다. More는 16px glyph를 사용하되 실제 interactive target 너비를 최소 28px로 확보하고 오른쪽 8px inset에 맞춘다.
- 모든 glyph의 visual box는 16×16px, glyph와 count 사이는 4px다. count는 16px 한 줄이며 icon과 시각 중심을 맞춘다.
- 순서는 `Reply → Repost → Reaction → Bookmark → More`로 고정한다. Reply와 Repost만 count를 표시하고 Reaction·Bookmark·More에는 count slot을 만들지 않는다.
- pending spinner, selected·pressed·disabled 표현은 같은 28px slot 안에서 layout을 바꾸지 않는다. focus indicator와 accessible name·state는 compact geometry에서도 유지한다.
- Figma Action은 내부 상하 padding 4px을 포함한다. 목록 surface는 28px Action Bar 자체 geometry를 바꾸지
  않고 전용 slot의 상단 padding은 0, 하단 padding은 4px로 두어 아래 카드 구분선과 4px 간격을 만든다.

## 플랫폼 rollout과 release gate

- 현재 출시 범위는 Web이며, 구현 drift를 막기 위해 Native platform file도 우선 같은 28px geometry를 사용한다.
- iOS 출시 전에는 실제 hit target을 최소 44×44pt, Android 출시 전에는 최소 48×48dp로 복구한다. visual 28px row 유지 여부와 hit target 확장 방식은 target overlap 없이 별도 결정한다.
- Native target 복구, VoiceOver·TalkBack focus boundary, touch 입력과 bottom sheet runtime 관찰은 Native release gate다. 현재 PROD-414 완료나 Web 검증으로 대체하지 않는다.

## Surface 배치

- `PostLayout`은 `PostActionBar`를 Post content grid 안의 마지막 자식으로 렌더링한다. `PostListItem`은
  상단 0·하단 4px을 제공하는 목록 전용 slot을 마지막 자식으로 두고 그 안에 `PostActionBar`를 렌더링한다.
- Action Bar는 `PostBody` 또는 Source presentation과 같은 content-level sibling이며 본문, 작성자, 생성 시각,
  Source preview의 `Link`나 `Pressable` 안에 중첩하지 않는다.
- 일반 Post는 본문 뒤, 순수 Repost는 Source presentation 뒤, Quote는 자체 본문과 Source preview 뒤에 Action
  Bar를 둔다. 상세의 metadata가 있으면 metadata 뒤에 둔다.
- Quote 목록은 Source preview의 내부 하단 padding을 4px로 줄이고, 공용 Action Bar slot의 상단 padding 0을
  유지하면서 Source preview border 밖에서 Action Bar까지 8px 간격을 둔다. 일반 Post와 순수 Repost의 상단
  간격은 늘리지 않는다.
- 순수 Repost의 본문·생성 시각 affordance는 Repost 자체가 아니라 Source detail로 이동한다. Repost Author와
  Source Author affordance는 각각 해당 Profile로 이동한다.
- 순수 Repost 아래의 Action Bar는 바깥 Repost Post가 아니라 화면에 표시한 direct Source Post를 대상으로
  동작한다. 따라서 Repost menu의 선택 상태, count와 생성·취소 identity도 Source fragment에서 파생한다.
- Quote의 자체 본문 affordance는 Quote detail로 이동하고 Source preview만 Source detail로 이동한다.
- 순수 Repost의 `{displayName}님이 재게시함` attribution은 `typography.sm`의 14/20 line box에 맞추고 바로
  아래 Source 표준행과의 추가 간격을 두지 않는다. Web의 Profile text link는 inline target 예외를 사용하며,
  Native target과 인접 Source link 비중첩은 출시 전 runtime gate에서 다시 검증한다.

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
  shadow를 사용해 Action Bar 위에 떠 있는 compact control로 구분한다.
- Android와 iOS는 safe area를 고려한 bottom action sheet를 사용한다. backdrop, platform back action과
  dismiss gesture로 닫을 수 있고 modal·menu 의미를 제공한다. sheet 내부 menu item의 target은 Action Bar의
  28px trigger geometry와 별도이며 최소 44×44를 유지한다.
- mutation pending 중에는 trigger와 menu action의 반복 입력을 막고 기존 selected·count 표현을 유지한다.

## Repost 실패 toast

- 앱은 하나의 공용 transient toast host를 provider에서 제공하고 실제 `PostListItem`·`PostLayout` surface가
  Repost 실패 callback을 action별 한국어 toast로 연결한다. 외부 toast 의존성은 추가하지 않는다.
- 생성 실패 문구는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- 취소 실패 문구는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- toast는 화면 하단에서 safe area와 고정 탭 바 위에 표시하고 약 3초 뒤 자동으로 사라진다. 새 toast가 오면
  기존 toast를 교체하며 queue, 닫기 control과 toast 내부 재시도 control은 두지 않는다.
- 오류 toast는 보조 기술이 즉시 인식할 수 있는 alert semantics를 제공한다.
- light toast는 `accent`의 `#262626` 배경, dark toast는 `#ffffff` 배경을 사용한다. message line box와 toast
  padding은 유지하고 glyph만 2px 아래로 이동해 시각 중심을 맞춘다.
- 실패 시 pending만 종료하고 이전 서버 확정 selected 상태, `repostCount`와 Relay cache를 유지한다. 사용자는
  메뉴를 다시 열고 같은 action을 선택해 재시도한다. 성공 toast는 표시하지 않는다.

## 소유권과 후속 범위

- `PROD-414`는 실제 Action Bar surface 배치, Repost menu, 생성·취소 action과 실패 toast를 소유한다.
- `PROD-415`는 목록의 Source 이동과 순수 Repost ID 직접 접근의 Source detail redirect를 소유한다.
- `PROD-431`은 `인용하기` 메뉴 항목과 Quote 작성 흐름을 소유한다.
- `PROD-471`은 Repost 취소 뒤 서버 확정 Source 상태를 같은 actor Store에 정규화하는 cache 갱신을 소유한다.
- Reaction, Reply, Bookmark, More의 실제 연결과 여러 action의 최종 통합 범위는 각 구현 이슈와 `PROD-432`에
  남긴다.

## 검증

- 일반 Post, 순수 Repost, Quote 목록에서는 Action Bar slot이, 상세에서는 Action Bar가 content grid의 마지막
  sibling이고 navigation Link/Pressable의 descendant가 아닌지 검증한다.
- 목록의 일반 Post·순수 Repost·Quote에서 Action Bar slot의 상단 padding이 0, 하단 padding이 4이고 1px 구분선이 semantic
  `divider` color를 사용하는지 검증한다. 순수 Repost는 attribution line box가 20이고 Source 표준행과의
  추가 gap이 0인지, Quote는 Source preview 내부 하단 padding이 4px이고 border 밖에서 Action Bar까지 8px인지 함께 검증한다.
- 모든 플랫폼 구현에서 Bar와 control 높이 28, 좌우 padding 8, social action 너비 50, More target 너비 최소
  28, glyph 16, icon-count gap 4와 고정 순서를 검증한다. Web runtime에서는 각 target이 24×24 CSS px 자체를
  포함하고 서로 겹치지 않는지도 확인한다.
- Web menu가 scroll container 밖에서 잘리지 않고 첫 item이 trigger pointer 지점을 덮는지, 같은 위치의
  두 번째 pointer 활성화로 item이 선택되는지, card surface·36px 높이·128px 최소폭·18px icon·14px·500
  label·8px 좌우 padding·border·`0 2px 4px` shadow를 제공하는지 검증한다. open/close, focus 복귀와
  키보드 이동도 함께 검증한다.
- Native bottom action sheet의 backdrop·back dismiss, safe area, modal 접근성과 menu item target을 검증한다.
- Native 44pt·48dp Action Bar target과 VoiceOver·TalkBack runtime은 출시 전 후속 gate로 남기고, 현재 28px
  공통 구현의 완료 증거로 보고하지 않는다.
- 선택·미선택 상태의 메뉴 label, pending 중복 차단, 생성·취소 mutation identity와 actor 격리를 검증한다.
- 실패 문구, latest-replace, 자동 dismiss, alert semantics, light `#262626` accent와 message 2px optical shift,
  실패 뒤 상태 유지·다음 입력 재시도를 검증한다.
