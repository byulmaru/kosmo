## Context

이 결정 기록은 `PROD-219`의 웹앱 셸 internal scroll 전환 범위를 반영한다. Linear 이슈 검토에서 PM은 internal scroll 방향을 수용했고, 범위 리뷰에서는 스펙/구현 분리와 최소 smoke 검증, `PROD-233` 후속 E2E 분리가 적절하다고 판단했다.

## Decision Records

### `(tabs)` shell은 viewport 고정 app shell로 전환한다

- Status: Accepted
- Context / Problem: 현재 `(tabs)` shell은 document/window scroll 기반이라 중앙 피드가 길어질 때 좌측/우측 shell chrome의 배치 책임이 흐려진다. 단기 sticky/fixed 보정만으로는 `RightRail`, bottom tab padding, route sticky header의 기준이 계속 섞인다.
- Decision Outcome: `(tabs)` shell을 viewport height 기준 app shell로 전환하고, 중앙 콘텐츠 영역이 단일 세로 internal scroll container를 소유하게 한다. shell chrome은 viewport 기준으로 고정 배치한다.
- Alternatives Considered: 좌측 sidebar만 fixed 처리하는 단기 패치가 있었지만, 우측 rail과 모바일 chrome의 scroll 기준은 여전히 document scroll에 남아 구조적 문제가 반복된다.
- Consequences: `(tabs)/+layout.svelte`가 scroll ownership의 중심이 된다. SvelteKit 기본 document scroll restoration과 내부 scroller 동작이 어긋날 수 있으므로 route 이동과 검색 `noScroll`을 구현 중 검증해야 한다.
- Confirmation / Follow-up: 모바일, `md`~`xl`, `xl+` viewport에서 shell chrome 고정과 중앙 내부 스크롤을 smoke로 확인한다.

### `md`/`xl` 반응형 shell 단계는 유지한다

- Status: Accepted
- Context / Problem: 기존 `add-shell-responsive-breakpoints` change와 `docs/design/breakpoints.md`는 모바일, 아이콘 레일, 풀 3분할의 3단계 shell을 정의한다. Internal scroll 전환이 이 단계 정의를 다시 흔들면 범위가 커진다.
- Decision Outcome: Internal scroll 전환은 기존 `md`/`xl` 3단계 shell 모델 위에서만 수행한다. 새 breakpoint나 multi-column workspace 레이아웃은 도입하지 않는다.
- Alternatives Considered: 미래 multi-column/timeline workspace까지 함께 고려하는 방식은 지금 이슈에 필요하지 않고 구현 범위를 흐린다.
- Consequences: 중앙 content region은 기본 single-pane 내부 스크롤로 시작한다. 향후 큰 레이아웃 옵션은 별도 제품/스펙 이슈로 다룬다.
- Confirmation / Follow-up: `docs/design/breakpoints.md`와 `web-app-shell` 스펙의 단계 설명이 구현과 맞는지 확인한다.

### `RightRail`은 document sticky가 아니라 shell column에 배치한다

- Status: Accepted
- Context / Problem: 현재 `RightRail.svelte` 자체에는 sticky가 없지만 부모 wrapper가 `sticky top-0`에 의존한다. Shell이 document scroll을 소유하지 않게 되면 이 의존은 의미가 흐려진다.
- Decision Outcome: 우측 rail은 `xl+` shell grid의 우측 column 안에서 `h-full`/`min-h-0` 기준으로 배치한다. 내용이 viewport보다 길어지면 중앙 콘텐츠와 독립된 rail overflow를 허용한다.
- Alternatives Considered: 부모 wrapper의 sticky를 유지하는 방식은 document scroll model에 계속 결합되므로 제외한다.
- Consequences: 우측 rail이 현재 composer만 담더라도 column/overflow 경계를 먼저 명확히 둔다.
- Confirmation / Follow-up: `xl+` viewport에서 중앙 콘텐츠 scroll이 우측 rail 위치를 이동시키지 않는지 확인한다.

### 반응형 내비게이션 E2E suite는 PROD-233으로 남긴다

- Status: Accepted
- Context / Problem: Internal scroll 구현 과정에서 viewport별 nav smoke 검증은 필요하지만, 반응형 앱 내비게이션 E2E suite 전체를 포함하면 `PROD-233`과 범위가 겹친다.
- Decision Outcome: `PROD-219`는 구현 변경을 검증하기 위한 최소 viewport smoke까지만 포함한다. `PROD-233`은 변경된 shell 기준으로 반응형 내비게이션 E2E를 보강하는 후속 이슈로 유지한다.
- Alternatives Considered: PROD-233을 선행 블로커로 두는 방식은 shell 구조 변경 후 E2E를 다시 고쳐야 할 가능성이 커서 제외한다.
- Consequences: Linear 관계는 `PROD-219 blocks PROD-233`가 자연스럽다. 구현 PR에서는 broad E2E suite를 새로 만들지 않는다.
- Confirmation / Follow-up: 구현 PR에서 smoke 검증 결과를 기록하고, PROD-233에서는 새 shell 기준의 E2E를 작성한다.

## Remaining Decisions

- 내부 scroll container용 custom back/forward scroll restoration helper가 필요한지는 구현 검증 후 결정한다.
- iOS Safari/WebView safe-area/overscroll 대응이 별도 이슈로 커지는지는 구현 검증 후 결정한다.
- 프로필/게시글 상세 wrapper 정리가 단순 호환 보정인지 별도 layout 리팩터링인지 구현 중 결정한다.

## Superseded Decisions

- 없음.
