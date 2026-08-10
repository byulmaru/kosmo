## Context

이 기록은 PROD-650의 수정된 Linear 계약, Post Content·Media 도메인 경계, Post Media Gallery·Viewer·Post 상세 thread·Action Bar·접근성·breakpoint canonical 문서와 사용자에게 확인한 viewer layout·원문·Composer·thread·탐색·저장 제외 결정을 구현 전에 고정한다. 구현 지침은 `design.md`에 두고, 여기에는 여러 surface와 플랫폼이 함께 따라야 하는 durable choice만 기록한다.

## Decision Records

### 안정적인 surface-level Host가 Viewer session과 Post query를 소유한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, PROD-650
- Status: Active
- Context / Problem: Parent Post fragment projection과 Viewer lifecycle을 함께 묶으면 목록·Quote·Repost presentation branch가 바뀌거나 fragment가 unavailable일 때 Viewer instance·modal focus·내부 탐색 상태가 parent tree에 따라 remount된다.
- Decision Outcome: 목록과 상세의 기존 Action authentication·Reply coordinator provider 아래 안정적인 surface-level `PostMediaViewerHost`를 둔다. Gallery launcher는 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`을 전달한다. Host는 현재 Relay actor environment에서 기존 `node(surfacePostId)` visibility·authorization 경계를 사용하는 Post query, Viewer session, 기존 Action/Reply binding과 Wide thread composition을 소유하고, Media owner가 surface 또는 direct Source인지 검증한다. 일반·Quote는 두 ID가 같고 pure Repost는 바깥 contentless Repost가 surface, direct Source가 Media owner다. Modal shell·close·origin 또는 screen fallback focus는 query의 Suspense·error boundary 밖에 유지한다.
- Alternatives Considered: Parent fragment를 Viewer에 직접 전달, Gallery 내부 modal, 앱 전체 단일 modal coordinator, Media ID 기반 query, route 기반 Viewer. Parent fragment 방식은 lifecycle을 presentation branch에 결합하고, Gallery 방식은 Post 맥락을 복제하며, app-global coordinator는 nested Viewer stack과 focus/delete callback registry를 새로 요구한다. Media ID와 route 방식은 기존 visibility·revision·URL/history 경계를 바꾼다.
- Consequences: PostListItem·PostLayout은 fragment·Action Bar·Wide detail을 Viewer에 조립하지 않고 launch 요청만 보낸다. Pure Repost의 Media·본문·Profile과 Repost·Reaction·Bookmark·More는 direct Source를 대상으로 하지만 Reply binding·availability는 바깥 contentless Repost를 사용해 disabled로 유지하며 Wide Source Composer도 열지 않는다. Wide thread 안의 다른 Media는 해당 nested surface Host가 별도 Viewer stack entry로 연다. Relay actor/environment generation이 바뀌면 열린 Viewer를 닫고 이전 query를 폐기한다.
- Confirmation / Follow-up: Cache hit·loading·error·retry·null Post·Content·Media에서 같은 modal shell·close·focus fallback이 유지되는지, pure Repost의 surface identity·Source Media owner·Action availability, 목록·Quote·Repost·상세 projection 전환과 actor 전환·nested Viewer stack을 component·Storybook·runtime에서 확인한다.

### Content revision이 Viewer presentation state의 identity를 결정한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, PROD-650
- Status: Active
- Context / Problem: Query unavailable을 곧바로 session 종료나 state reset으로 취급하면 같은 Content의 일시적인 loading·error·null projection 뒤 사용자의 탐색·원문·retry 상태를 잃는다. 반대로 다른 immutable Content revision까지 같은 상태를 유지하면 새 Media document에 이전 state를 적용한다.
- Decision Outcome: 같은 Content ID가 일시 unavailable이었다 복구되면 current index·expanded·overflow·Media loading/error/retry state를 유지한다. 다른 non-null Content ID로 바뀌면 해당 state를 초기화하고 session을 연 original selected index를 다시 사용한다. 새 revision에 해당 document index가 없으면 다른 Media로 이동하거나 clamp하지 않고 unavailable을 표시한다. Media ID가 같아도 URL이 바뀌면 image instance와 load state를 URL 기준으로 교체하며 이전 pixel·byte·URL을 유지하지 않는다.
- Alternatives Considered: Unavailable마다 Viewer close, 모든 projection 변화에서 reset, 모든 revision에서 state 유지, index clamp. 각각 query lifecycle과 modal lifecycle을 다시 결합하거나 동일 Content 복구 상태를 잃고, immutable revision 경계를 흐리거나 사용자가 선택하지 않은 Media로 이동한다.
- Consequences: Session은 original selected index를 유지하고 presentation은 마지막 non-null Content ID를 구분해야 한다. Null Post·Content·Media와 query loading·error는 modal chrome·close를 유지한 unavailable/loading/error projection으로 표시한다. 다른 revision reset과 같은 revision 복구를 별도 회귀 검증한다.
- Confirmation / Follow-up: Image 이동·원문 펼침·error/retry 뒤 null projection→같은 Content 복구 보존, 다른 revision reset·선택 index 부재 unavailable, 동일 Media ID URL 변경의 이전 byte 비보존을 자동화와 runtime에서 확인한다.

### Post surface는 Viewer selection session을, Viewer는 현재 Post projection을 소유한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-650
- Status: Superseded
- Context / Problem: Gallery는 Media geometry·Sensitive·retry만 알고 작성자·원문·Post action target은 알지 못한다. Gallery가 Viewer와 데이터를 직접 소유하면 현재 Content revision과 상위 Post action 경계가 분리된다.
- Decision Outcome: 목록·상세의 Post surface가 open 상태, 선택 index와 origin focus target만 소유한다. Gallery는 Sensitive 공개 뒤 정상 tile의 document index만 전달한다. Viewer는 같은 surface가 전달한 Post fragment에서 현재 projection을 직접 소비하며 별도 Media query, standalone authorization 또는 actor·Profile·Post·Content identity reconciliation을 추가하지 않는다.
- Alternatives Considered: Gallery 내부 modal state, Media ID 기반 별도 query, route 기반 viewer. 각각 Post 맥락 공급을 중복하거나 authorization·revision 경계를 갈라놓고, route는 승인된 제외 범위를 확장한다.
- Consequences: 목록과 상세은 같은 Viewer API를 사용해야 한다. Post·Profile·Content projection, 선택된 action Profile 또는 Relay actor/environment generation 변화만으로 Viewer를 자동 종료하지 않고 현재 fragment·Action·Composer binding을 반영한다. 선택 Media가 unavailable이면 이전 byte·URL 없이 modal chrome과 close control을 유지하며, 명시적 dismiss·Viewer 안의 삭제 action·surface unmount만 session을 종료한다. Reply 부모 preview는 callback을 받지 않는다.
- Confirmation / Follow-up: session field가 선택 index·origin focus로 제한되는지, identity·actor 변화에도 현재 projection을 표시하는지, unavailable 상태가 이전 URL을 유지하지 않는지, 명시적 종료와 origin focus 복귀를 component·runtime에서 확인한다.

### Viewer는 표시용 Post fragment를 읽고 orchestration은 Post surface에 유지한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-viewer.md`, PROD-650
- Status: Superseded
- Context / Problem: Viewer에 body, Media, Profile scalar를 각각 projection하거나 caller가 같은 fragment 데이터의 identity·availability를 다시 합성하면 fragment colocation이 깨지고 caller와 Viewer의 표시 lifecycle이 중복된다. 반대로 Viewer가 Action·thread query까지 소유하면 기존 Post surface와 또 하나의 Post orchestrator가 된다.
- Decision Outcome: `PostMediaViewer`는 Post fragment에서 Content body, Media와 Profile 표시 데이터 및 Media unavailable presentation을 직접 소유한다. Post surface는 선택 index·origin focus session과 Action/Reply binding을 계속 소유하고, Wide thread query와 pagination UI state는 `PostDetailThread`가 소유한다.
- Alternatives Considered: Caller가 scalar presentation data를 계속 조립, Viewer가 session·Action·thread query까지 모두 소유. 전자는 Relay fragment colocation을 깨뜨리고 후자는 기존 `PostLayout`·`PostListItem` 책임을 중복한다.
- Consequences: Viewer props에는 Post fragment key와 composable `actionBar`·`wideDetail` slot, 선택 index와 origin focus만 전달한다. Caller의 identity·availability reconciliation과 관련 effect는 제거한다. Gallery의 Sensitive 상태는 진입만 제한하고 background 재가림으로 열린 session을 자동 종료하지 않는다. Viewer 안의 삭제 action은 기존 surface close lifecycle을 유지한다.
- Confirmation / Follow-up: Caller scalar·identity·availability projection 제거, Viewer fragment·unavailable presentation, 선택 session·Action·thread·명시적 삭제 lifecycle 보존을 focused component test로 확인한다.

### Web 768px에서 compact detail과 Post 상세 thread를 분기한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-650
- Status: Active
- Context / Problem: Figma는 Mobile fullscreen 기준만 제공한다. 넓은 Web에서 작은 축약 panel만 두면 기존 Post 상세의 원문·Composer·reply interaction을 이어가지 못하고, Native는 Web shell breakpoint를 사용하지 않는다.
- Decision Outcome: Web `<768px`와 iOS·Android는 image 위·compact detail panel 아래의 세로 layout을 사용한다. Web `>=768px`는 viewport의 `24px` inset 안에서 image 왼쪽·기존 Post 상세 thread surface 오른쪽의 분할 layout을 사용해 원문 전체·기존 Action Bar·Reply Composer·reply descendants를 제공한다. 오른쪽 rail은 `clamp(320px, 25vw, 350px)`로 제한하고 나머지 폭을 image에 배정한다. 320px 최소폭은 기존 Post 상세의 228px Action Bar가 내부 padding·avatar column 뒤에도 가로 overflow 없이 보존되는 최소 안전폭이다. 이미지는 두 layout 모두 `contain`으로 표시한다.
- Alternatives Considered: 모든 플랫폼 fullscreen image-only, 모든 폭 세로 layout, Wide Web의 축약 PostListItem 또는 작성자·원문·Action Bar만 있는 panel, Post 상세 route의 600px 폭 재사용, 고정 3:1·4:1 비율, Web compact/full shell의 1280px 추가 분기. 각각 승인된 Post 맥락을 제거하거나 넓은 Web을 낭비하고, Composer·thread interaction을 누락하거나 viewport에 따라 rail이 너무 크거나 작아지며 Viewer에 필요 없는 세 번째 layout을 만든다.
- Consequences: Web은 767px와 768px 경계, 25vw가 최소·최대 clamp에 걸리는 viewport를 직접 확인하고 Native는 화면 폭과 관계없이 compact 세로 layout을 유지한다. Wide 오른쪽은 기존 Post 상세와 같은 표현·interaction·pagination을 제공하지만 같은 600px 폭은 사용하지 않고, 원본 Post Media는 왼쪽에만 표시한다.
- Confirmation / Follow-up: Storybook과 Web runtime에서 `<768px`·`>=768px`, Wide 오른쪽 독립 scroll·Composer·reply pagination을 확인하고 iOS·Android runtime에서 compact 세로 layout을 구분해 확인한다.

### Compact 원문은 3줄에서 펼치고 Wide는 Post 상세 전체를 scroll한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/domain/objects/post-content.md`, PROD-650
- Status: Active
- Context / Problem: Compact 화면에서 원문 전체를 image와 같은 흐름에 두면 긴 Post가 Action Bar를 viewport 밖으로 밀지만, viewport 높이의 32%만 상한으로 쓰면 500px 이하의 낮은 화면에서 작성자·원문 control·Action Bar가 사용할 고정 영역보다 panel 상한이 작아질 수 있다. Wide Web까지 3줄 panel로 제한하면 기존 Post 상세와 thread interaction을 충분히 제공하지 못한다.
- Decision Outcome: Web `<768px`와 Native detail panel은 내용 높이를 따르되 최대 높이를 `clamp(192px, viewport height의 32%, 240px)`로 계산한다. `192px`은 낮은 viewport에서 작성자·원문 control·Action Bar를 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니다. 실제로 3줄을 넘는 원문에만 더 보기·접기를 제공하고, 상한을 넘으면 원문 body만 줄어들고 scroll하며 기존 Post Action Bar를 원문 바로 아래의 고정 영역에 둔다. Web `>=768px` 오른쪽은 원문을 접지 않고 기존 Post 상세 thread 전체를 독립 scroll한다.
- Alternatives Considered: `min(240px, 32vh)`만 사용, 192px 또는 240px 고정 panel, 모든 환경에서 원문 전체 상시 표시, 모든 환경에서 3줄 panel, 원문 생략. 순수 32vh 상한은 낮은 화면에서 고정 chrome을 가릴 수 있고, 고정 panel은 짧은 원문에 불필요한 여백을 만들며, 나머지는 compact action 위치를 불안정하게 하거나 Wide의 원문·Composer·thread 맥락을 제거한다.
- Consequences: Compact 원문 overflow를 실제 layout으로 판정하고 expanded state를 전달해야 한다. Panel과 body가 남는 높이를 채우지 않도록 하되 상한을 넘는 body만 shrink·scroll해야 한다. 390px 높이에서도 작성자·원문 control·Action Bar가 남아야 한다. Wide는 기존 Post 상세의 Action Bar·Composer·reply pagination과 child overlay를 같은 fragment·binding으로 재사용해야 한다.
- Confirmation / Follow-up: Compact에서 짧은·긴 원문, 펼침·접기, 일반·390px 높이의 panel 상한·고정 chrome 보존·Action Bar 인접 배치·text-only scroll을 확인하고 Wide에서 원문 전체·독립 scroll·Composer·reply descendants를 확인한다.

### Wide Viewer는 route가 아닌 재사용 가능한 Post 상세 thread surface를 사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, PROD-650
- Status: Active
- Context / Problem: 현재 detail route가 `PostDetailThread` query와 document scroll을 소유하고 Viewer API에는 thread 입력이 없다. Route를 Viewer 안에 중첩하거나 `PostListItem`을 복제하면 route·focus·Media가 중복되고 Composer·reply pagination이 누락된다.
- Decision Outcome: Detail route와 Viewer가 reply ancestors·현재 Post·reply descendants 표시를 공유할 수 있도록 Post 상세 thread surface를 추출한다. Reply Composer는 기존 상세처럼 초기에는 닫혀 있고 Reply action으로 현재 Post 아래에서 펼친다. Viewer는 Host가 조회한 현재 Post query projection을 사용하고 원본 Post Media를 오른쪽에서 생략하되 thread 안의 다른 Media와 viewer interaction은 유지한다. Thread의 다른 Media는 해당 nested surface Host가 별도 Viewer stack entry로 연다. Thread data는 같은 Post node와 기존 visibility 정책으로 load하되 route·browser history를 변경하지 않는다. Loading·error·identity mismatch는 오른쪽에만 반영해 Viewer session과 modal chrome을 유지한다.
- Alternatives Considered: Detail route component 직접 mount, Viewer 전용 thread 구현, `PostListItem` 하나만 표시, open 시 detail route로 navigation. 각각 ownership 중첩·계약 복제·Composer와 descendants 누락·승인된 URL/history 유지 위반을 만든다.
- Consequences: 기존 reply connection pagination을 오른쪽 scroller에 연결하는 seam과 원본 Media 생략 입력이 필요하다. Route와 Viewer의 pagination coordination은 아래 Relay ownership 결정에 따르며 Viewer 뒤 원래 Post surface는 focus와 interaction 대상에서 제외해야 한다.
- Confirmation / Follow-up: 목록·상세 양쪽에서 같은 원본 Post identity, Media 비중복, Composer 작성, route와 Viewer의 독립 pagination UI state, loading·error와 route/history 유지·focus 복귀를 확인한다.

### Relay가 동일 reply pagination operation을 조정한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-viewer.md`, PROD-650
- Status: Active
- Context / Problem: Route와 Viewer 사이에 request ref·owner token·visibility gate를 공유하면 독립 scroll surface의 UI state와 component lifetime이 결합되고 background prefetch를 불필요하게 중지한다.
- Decision Outcome: Route와 Viewer의 `PostDetailThread`는 component 간 token이나 visibility gate를 공유하지 않는다. 각 surface는 same-surface burst 재진입 guard, local pagination UI state와 completion 뒤 saved metrics 재평가를 소유하며, 두 surface에서 겹친 같은 Relay environment의 동일 query·variables에 대한 in-flight dedupe와 normalized connection merge는 Relay 21이 소유한다.
- Alternatives Considered: Viewer open 동안 배경 document pagination 중지, shared request ref와 owner token 유지. 두 방식 모두 surface lifecycle을 결합하고 미리 불러올 수 있는 reply를 막는다.
- Consequences: 같은 surface의 synchronous burst는 local guard가 막지만 두 surface는 서로를 차단하지 않는다. 성공 completion에서는 Relay의 pageInfo 병합이 반영될 다음 task까지 guard 해제를 미뤄 stale cursor 재진입을 막고, error completion에서는 즉시 해제해 해당 surface의 retry를 허용한다. 같은 cursor·count·environment가 아닌 request의 dedupe는 가정하지 않는다. Component test는 두 UI trigger가 Relay boundary에 독립적으로 도달하고 한 surface의 error·retry가 다른 surface를 변경하지 않는지를 검증하되 cross-surface 실제 network 횟수는 앱 계약으로 고정하지 않는다.
- Confirmation / Follow-up: Independent near-end, surface-local loading·error·retry와 Viewer completion 뒤 saved metrics 재평가를 focused test로 확인한다.

### Media 탐색은 순환하지 않고 위치를 조건부 표시한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650
- Status: Active
- Context / Problem: 최대 4장의 document 순서를 유지하면서 끝 경계와 단일 이미지에서 불필요한 UI를 명확히 해야 한다.
- Decision Outcome: 선택한 index에서 시작해 이전·다음으로 document 순서를 탐색하고 첫·마지막 경계에서 control을 비활성화하며 순환하지 않는다. Web arrow key와 Native 수평 swipe를 추가하되 이전·다음 control을 모든 플랫폼의 명시적 입력으로 유지한다. 시각적 `현재/전체`는 다중 Media에서만 표시하고 Screen Reader 위치 정보는 한 장에도 제공한다. 현재 image는 Alt Text를 accessible name으로 사용하고 없으면 document 순서 fallback을 사용하며, 위치 안내는 image 이름과 별도로 전달한다.
- Alternatives Considered: 끝에서 순환, 단일 이미지에도 `1/1` 상시 표시, gesture-only 탐색. 각각 document 경계 예측성을 낮추거나 시각 noise를 늘리고 동등 입력을 제거한다.
- Consequences: keyboard·swipe는 동일 index reducer를 사용하고 disabled 상태를 보조 기술에 전달해야 한다. 원문 vertical scroll과 Native swipe의 gesture 경쟁을 조정해야 한다.
- Confirmation / Follow-up: 1장, 첫·중간·마지막, nullable Alt Text·fallback, 비순환 end state, Web keyboard와 Native button·swipe·Screen Reader 위치 안내를 확인한다.

### 기존 Post action만 제공하고 Media 파일 저장은 후속으로 둔다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, PROD-650
- Status: Active
- Context / Problem: Figma Mobile frame에는 저장 affordance가 있지만, 현재 제품 계약은 이미지보다 원문과 기존 Post Action Bar 맥락을 우선한다. Media 파일 저장은 단순 UI 추가 외에 플랫폼별 permission·delivery·failure 처리가 필요하다.
- Decision Outcome: Viewer는 현재 기존 Post Action Bar가 제공하는 Reply·Repost·Reaction·Bookmark·More와 기존 Post 링크 복사의 surface routing을 재사용한다. 일반·Repost·Quote Post surface의 기존 target routing을 유지하고, pure Repost에서는 Reply를 바깥 contentless Repost 기준으로 disabled로 두되 Repost·Reaction·Bookmark·More는 direct Source를 대상으로 한다. Quote를 새 action으로 추가하지 않으며 Media 파일 URL 복사·공유·다운로드·기기 저장과 Media 전용 Action Bar는 제공하지 않는다.
- Alternatives Considered: Figma 저장 action을 그대로 구현, Web download만 먼저 제공, 현재 Action Bar를 제거하고 Media 전용 row 사용. 각각 승인되지 않은 플랫폼·권한 범위를 추가하거나 기존 Post action 맥락을 잃는다.
- Consequences: Figma와의 의도적 차이를 PR에 기록한다. 기기 저장이 필요하면 권한·파일 전달·실패·재시도 UX를 가진 별도 Linear·canonical 계약으로 시작한다.
- Confirmation / Follow-up: Viewer Action Bar에 기존 action만 있고 Media 파일 저장·공유 항목이나 새 URL 처리가 생기지 않았는지 검증한다.

### 병합된 PROD-626 gallery 계약을 재사용하고 최신 main을 부모로 둔다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-626, PROD-650
- Status: Active
- Context / Problem: PROD-650은 PROD-626이 추가하고 `main`에 병합된 compact gallery와 비대화형 tile 경계를 변경한다. 과거 stack 문구를 유지하면 현재 ancestry와 archive ownership을 잘못 설명한다.
- Decision Outcome: PROD-650 구현은 최신 `main`을 부모로 사용하고 병합된 Gallery geometry·Sensitive·retry 계약을 재사용한다. PROD-626의 남은 runtime QA와 archive 책임을 PROD-650 완료로 대신 처리하지 않는다.
- Alternatives Considered: 과거 PROD-626 head 위 stack을 계속 유지, Gallery를 복제, 두 Linear 이슈와 변경을 합치기. 각각 현재 Git 상태와 어긋나거나 중복 구현·소유권 혼합을 만든다.
- Consequences: push 전 exact `main` parent와 range diff를 확인한다. PROD-650 OpenSpec archive는 자체 task·runtime·CI 및 필요한 canonical spec sync가 완료된 뒤 별도로 판단한다.
- Confirmation / Follow-up: exact parent SHA, branch-only diff, PROD-626와 PROD-650의 남은 책임을 PR에 구분해 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-07의 “Post surface는 Viewer selection session을, Viewer는 현재 Post projection을 소유한다” 결정과 “Viewer는 표시용 Post fragment를 읽고 orchestration은 Post surface에 유지한다” 구현 선택은 2026-08-08의 stable surface-level Host·Post query와 Content revision state identity 결정으로 대체한다.
- 2026-08-04의 identity reconciliation 기반 자동 close와 2026-08-07의 모든 actor 변화에서 session을 유지하는 consequence는 2026-08-08의 “Post·Content query lifecycle은 shell을 유지하되 Relay actor/environment 전환은 close·query 폐기한다” 결정으로 대체한다.
- 2026-08-06의 “Post surface가 identity reconciliation과 availability close를 계속 소유한다” implementation choice는 2026-08-07의 Viewer fragment·unavailable presentation ownership 결정으로 대체한다.
- `Wide Viewer는 route가 아닌 재사용 가능한 Post 상세 thread surface를 사용한다` 기록의 “Viewer open 동안 배경 document pagination을 중지해 단일 owner로 둔다” pagination consequence와 그 검증 항목은 2026-08-06의 `Relay가 동일 reply pagination operation을 조정한다` 결정으로 대체한다. 나머지 thread surface 재사용 결정은 Active다.
