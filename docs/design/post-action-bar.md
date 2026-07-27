# Post Action Bar

Post Action Bar는 Post의 Reply, Repost, Reaction, Bookmark와 More action을 한 줄에 배치하는 공용 UI다.
각 action의 fragment, mutation과 상태 소유권은 해당 private child가 가지며, Bar는 고정 순서와 공통 control
표현을 조립한다.

## Surface 배치

- `PostListItem`과 `PostLayout`은 `PostActionBar`를 Post content grid 안의 마지막 자식으로 렌더링한다.
- Action Bar는 `PostBody` 또는 Source presentation과 같은 content-level sibling이며 본문, 작성자, 생성 시각,
  Source preview의 `Link`나 `Pressable` 안에 중첩하지 않는다.
- 일반 Post는 본문 뒤, 순수 Repost는 Source presentation 뒤, Quote는 자체 본문과 Source preview 뒤에 Action
  Bar를 둔다. 상세의 metadata가 있으면 metadata 뒤에 둔다.
- 순수 Repost의 본문·생성 시각 affordance는 Repost 자체가 아니라 Source detail로 이동한다. Repost Author와
  Source Author affordance는 각각 해당 Profile로 이동한다.
- 순수 Repost 아래의 Action Bar는 바깥 Repost Post가 아니라 화면에 표시한 direct Source Post를 대상으로
  동작한다. 따라서 Repost menu의 선택 상태, count와 생성·취소 identity도 Source fragment에서 파생한다.
- Quote의 자체 본문 affordance는 Quote detail로 이동하고 Source preview만 Source detail로 이동한다.

## Repost action menu

- Repost trigger는 선택 여부와 관계없이 mutation을 즉시 실행하지 않고 action menu를 연다.
- 현재 Profile이 Source를 Repost하지 않았으면 메뉴에 `재게시하기`, 이미 Repost했으면 `재게시 취소`를
  표시한다. 항목을 선택하고 메뉴가 닫힌 뒤 해당 mutation을 시작한다.
- 향후 `인용하기`는 Quote 작성 계약이 완료될 때 같은 메뉴의 별도 항목으로 추가한다. 구현 전에는 disabled나
  placeholder 항목도 표시하지 않는다.
- Web은 trigger 근처의 anchored menu를 사용한다. trigger는 menu popup과 expanded 상태를 접근성 정보로
  제공하고, 바깥 pointer·focus, Escape로 닫으며 Escape 뒤 trigger로 focus를 돌려보낸다. menu는 방향키,
  Home과 End로 항목 focus를 이동한다.
- Android와 iOS는 safe area를 고려한 bottom action sheet를 사용한다. backdrop, platform back action과
  dismiss gesture로 닫을 수 있고 modal·menu 의미와 44×44 이상의 target을 제공한다.
- mutation pending 중에는 trigger와 menu action의 반복 입력을 막고 기존 selected·count 표현을 유지한다.

## Repost 실패 toast

- 앱은 하나의 공용 transient toast host를 provider에서 제공하고 실제 `PostListItem`·`PostLayout` surface가
  Repost 실패 callback을 action별 한국어 toast로 연결한다. 외부 toast 의존성은 추가하지 않는다.
- 생성 실패 문구는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- 취소 실패 문구는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`다.
- toast는 화면 하단에서 safe area와 고정 탭 바 위에 표시하고 약 3초 뒤 자동으로 사라진다. 새 toast가 오면
  기존 toast를 교체하며 queue, 닫기 control과 toast 내부 재시도 control은 두지 않는다.
- 오류 toast는 보조 기술이 즉시 인식할 수 있는 alert semantics를 제공한다.
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

- 일반 Post, 순수 Repost, Quote와 상세에서 Action Bar가 content grid의 마지막 sibling이고 navigation
  Link/Pressable의 descendant가 아닌지 검증한다.
- Web menu의 open/close, focus 복귀, 키보드 이동과 항목 선택을 검증한다.
- Native bottom action sheet의 backdrop·back dismiss, safe area, modal 접근성과 touch target을 검증한다.
- 선택·미선택 상태의 메뉴 label, pending 중복 차단, 생성·취소 mutation identity와 actor 격리를 검증한다.
- 실패 문구, latest-replace, 자동 dismiss, alert semantics와 실패 뒤 상태 유지·다음 입력 재시도를 검증한다.
