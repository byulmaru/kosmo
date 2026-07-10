## Context

이 결정 기록은 `PROD-219`의 방향 전환을 반영한다. 초기 PM 검토에서는 internal scroll app shell이 가능해 보였지만, 구현 검토와 조작감 확인 과정에서 피드 바깥 shell 영역의 wheel/trackpad scroll이 자연스럽지 않고, custom wheel forwarding은 사용자 입력 감각을 해친다는 판단이 있었다. 따라서 active `add-web-app-shell-internal-scroll` change를 supersede하고 document scroll + sticky rails 방향으로 재정렬한다.

## Decision Records

### `(tabs)` shell은 document/window scroll을 유지한다

- Status: Accepted
- Context / Problem: internal scroll app shell은 중앙 피드만 스크롤되는 구조를 만들 수 있지만, 사이드바·우측 rail·빈 shell 영역 위에서 기본 scroll이 이어지지 않는다. 이를 보정하려면 wheel 이벤트 전달 같은 custom 동작이 필요하다.
- Decision Outcome: `(tabs)` shell의 기본 scroll owner는 document/window로 유지한다. 중앙 `main`은 단일 internal scroll container가 되지 않는다.
- Alternatives Considered: 중앙 internal scroller와 shell chrome wheel forwarding을 함께 쓰는 방식은 조작감이 어색하고 구현 책임이 커져 제외한다.
- Consequences: web route scroll restoration은 Expo Router/browser의 document scroll 정책과 맞춘다. 내부 scroller 전용 helper는 만들지 않는다.
- Confirmation / Follow-up: 피드, 사이드바, 우측 rail, 빈 layout 영역에서 wheel/trackpad 입력이 자연스럽게 document scroll로 이어지는지 smoke로 확인한다.

### 데스크톱 좌우 rail은 sticky로 고정한다

- Status: Accepted
- Context / Problem: document scroll을 유지하면 중앙 콘텐츠가 길어질 때 좌우 rail도 함께 밀릴 수 있다. rail을 시각적으로 viewport에 머무르게 해야 하지만, fixed로 빼면 grid flow와 column width 계산이 깨질 수 있다.
- Decision Outcome: `md+` 좌측 icon rail/full sidebar와 `xl+` 우측 rail은 grid flow 안에서 `position: sticky` 기반으로 고정한다. rail wrapper는 viewport height 경계를 갖고, 필요한 경우 내부 overflow를 허용한다.
- Alternatives Considered: `position: fixed` rail은 더 강한 고정감을 주지만 layout flow에서 빠져 중앙 column 겹침, 반응형 폭 계산, safe-area 조정이 커지므로 후속 리팩터링 후보로 남긴다.
- Consequences: sticky 조건을 깨는 부모 overflow/transform을 피해야 한다. 실제 고정 동작은 viewport별 smoke로 확인한다.
- Confirmation / Follow-up: `md`~`xl` icon rail과 `xl+` full sidebar/right rail이 document scroll 중 viewport에 머무르는지 확인한다.

### 모바일 bottom tab은 fixed chrome으로 유지하되 겹침을 padding 정책으로 다룬다

- Status: Accepted
- Context / Problem: internal scroll shell에서는 bottom tab을 shell row로 둘 수 있었지만, document scroll 모델에서는 현재 fixed bottom tab 구조가 자연스럽다. 다만 긴 콘텐츠 하단과 겹침이 생길 수 있다.
- Decision Outcome: 모바일 bottom tab은 safe-area를 포함한 fixed bottom chrome으로 유지한다. route content 하단은 bottom tab 높이를 고려한 padding 또는 scroll padding으로 겹침을 방지한다.
- Alternatives Considered: bottom tab을 normal flow row로 넣는 방식은 document scroll 모델에서는 화면 하단 고정성이 약해져 제외한다.
- Consequences: PROD-220 하단바 겹침은 이 구조 안에서 해소되는지 확인하고, 별도 IA 변경은 하지 않는다.
- Confirmation / Follow-up: 모바일 `/home`, `/search`, `/compose`, 프로필/게시글 상세에서 하단 content가 bottom tab에 가려지지 않는지 확인한다.

### route scroll은 별도 internal restoration helper를 만들지 않는다

- Status: Accepted
- Context / Problem: internal scroll shell에서는 route 이동 시 내부 scroller top 이동과 back/forward 복원이 별도 구현 책임이 된다. 새 방향은 document scroll을 유지하므로 별도 helper의 필요성이 낮다.
- Decision Outcome: 일반 route 이동과 back/forward는 Expo Router/browser document scroll 정책에 맞춘다. 검색 화면의 query-only `router.replace`는 현재 document scroll과 입력 focus를 보존한다.
- Alternatives Considered: component-local scroll position Map은 internal scroller 전용 보정이므로 이번 방향에서는 제외한다.
- Consequences: 구현 PR에서 internal scroller restoration 코드는 추가하지 않는다. 검색 query navigation의 scroll/focus 회귀만 smoke로 확인한다.
- Confirmation / Follow-up: path-changing navigation은 새 route 상단에서 시작하고, 검색 tab/q 변경은 현재 document position과 input focus를 유지하는지 확인한다.

### 반응형 내비게이션 E2E suite는 PROD-233으로 남긴다

- Status: Accepted
- Context / Problem: sticky rail 전환에도 viewport별 nav smoke는 필요하지만, 반응형 앱 내비게이션 E2E suite 전체를 포함하면 `PROD-233`과 범위가 겹친다.
- Decision Outcome: `PROD-219`는 구현 변경을 검증하기 위한 최소 viewport smoke까지만 포함한다. `PROD-233`은 변경된 shell 기준으로 반응형 내비게이션 E2E를 보강하는 후속 이슈로 유지한다.
- Alternatives Considered: PROD-233을 선행 블로커로 두는 방식은 shell 구조 변경 후 E2E를 다시 고쳐야 할 가능성이 커서 제외한다.
- Consequences: Linear 관계는 `PROD-219 blocks PROD-233`가 자연스럽다. 구현 PR에서는 broad E2E suite를 새로 만들지 않는다.
- Confirmation / Follow-up: 구현 PR에서 smoke 검증 결과를 기록하고, PROD-233에서는 새 shell 기준의 E2E를 작성한다.

## Remaining Decisions

- 우측 rail 내부 overflow 허용 조건과 세부 class는 구현 중 실제 content 높이를 보고 확정한다.
- iOS Safari와 Expo native safe-area/overscroll 대응이 별도 이슈로 커지는지는 구현 검증 후 결정한다.
- fixed rail이 필요한지는 sticky 구현 후 실제 사용감과 layout 안정성을 보고 후속으로 판단한다.

## Superseded Decisions

- `add-web-app-shell-internal-scroll`의 “`(tabs)` shell은 viewport 고정 app shell로 전환한다” 결정은 supersede한다.
- `add-web-app-shell-internal-scroll`의 “`RightRail`은 document sticky가 아니라 shell column에 배치한다” 결정은 supersede한다.
- internal scroll container용 custom back/forward restoration helper 검토는 더 이상 이번 범위의 결정 사항이 아니다.
