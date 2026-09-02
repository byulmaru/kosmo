## Context

PROD-626은 공용 `PostMediaGallery`·`PostMediaImage`에 최대 4장 gallery geometry, Sensitive 공개 상태와 image별 loading·retry를 제공한다. `PostBody`는 Viewer를 연 document index·origin control을 launcher에 전달한다. 목록과 상세의 안정적인 surface 경계에 있는 `PostMediaViewerHost`가 명시적인 surface Post ID와 Media owner Post ID를 session에 저장하고, 기존 `node(surfacePostId)` visibility·authorization 정책으로 surface Post를 조회해 owner가 그 surface 또는 direct Source인지 확인한다. 일반·Quote는 두 ID가 같고 pure Repost는 direct Source가 Media owner지만 Reply identity는 바깥 surface Post에 남는다. 상세 route의 `PostDetailThread`는 현재 Media owner와 ancestors·reply descendants, Reply Composer와 reply pagination을 계속 조합하며 Host는 그 표시 경계를 재사용한다.

React Native `Modal`, `useWindowDimensions`, focus ref와 Native `PanResponder`를 사용하는 선행 UI가 있으나 Media Viewer 공용 primitive는 없다. 기존 `PostActionSurface`는 Relay fragment와 인증·Profile 선택·Reply callback을 결합하고 Reaction·Repost·More도 각 overlay를 열 수 있으므로, Viewer 안에서 중복 action row를 만들거나 중첩 modal을 무검증으로 추가하면 플랫폼별 overlay·focus가 달라질 수 있다.

## Goals / Non-Goals

**Goals:**

- Gallery launcher가 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`을 안정적인 surface-level Viewer Host에 전달하고, Host가 두 identity를 검증한다.
- Host가 기존 Post Node visibility·authorization 경계로 조회한 현재 projection의 Media 순서와 승인된 표시 URL만 사용하고 이전 URL을 snapshot으로 유지하지 않는다.
- Modal shell·close·focus fallback을 Post query의 Suspense·error boundary 밖에 유지한다.
- 같은 Content의 일시 unavailable·복구 상태는 보존하고 다른 revision은 원래 선택 index에서 초기화하며, actor/environment 전환은 Viewer를 닫고 query를 폐기한다.
- Compact Web·Native의 image/detail layout과 Wide Web의 image/Post 상세 thread 분할을 하나의 공용 Viewer 경계에서 제공한다.
- Wide Web에서 원문 전체·기존 Action Bar·Reply Composer·reply descendants와 pagination을 기존 Post 상세 계약으로 제공한다.
- Sensitive·loading·error·retry, modal close·focus 복귀와 Web·Native 탐색 입력을 분리 검증할 수 있게 한다.
- Viewer open·Media navigation·close 중 route와 browser history를 바꾸지 않는다.

**Non-Goals:**

- 새 GraphQL field·Media query·authorization·dependency를 추가하지 않는다. Host의 Post query는 기존 `node(id)` 정책을 재사용한다.
- Gallery geometry, Post action 도메인 동작과 Relay cache update를 재구현하지 않는다.
- Zoom·pan, route·deep link, Media 편집·metadata와 파일 공유·다운로드·기기 저장을 구현하지 않는다.

### Delivery lifecycle

이 기존 change는 최종 Viewer 행동 계약을 재사용한다. PROD-650의 완료된 Host·query·runtime 구현 이력은
historical evidence로 보존하고, PROD-853은 Production consumer와 분리된 공용 UI·component test·Storybook만
제공한다. PROD-849가 Production Host·Relay·route 연결·교체와 Web/iOS/Android runtime QA를 이어서 소유하며,
PROD-853 PR 완료만으로 이 change를 archive하지 않는다. 새 Viewer abstraction·feature flag·dependency는 만들지 않는다.
PROD-650의 Web `>=768px` inline Reply Composer는 Current historical evidence로 남기고, DSN-63 Target은
`768–1279px`에서 Viewer close 후 공용 `600×720` Reply modal을, `>=1280px`에서만 inline Composer를 사용한다.

## Implementation Guidance

### Current Constraints

- `PostContentRenderer`는 paragraph와 gallery를 함께 조합하고 Gallery는 Post author·action·thread fragment를 알지 못한다. Viewer를 Gallery 내부 state로 두면 원문과 기존 Action Bar·Reply Composer·reply descendants를 안전하게 공급할 수 없다.
- `PostMediaGallery`가 Sensitive 공개 상태를 로컬에서 소유한다. 공개 전에는 tile과 image byte가 mount되지 않으므로 viewer trigger도 생성하면 안 된다.
- `PostMediaImage`는 gallery용 `cover` geometry와 image별 generation·loading·error·retry를 소유한다. Viewer의 `contain` surface가 gallery frame state나 인접 tile 상태를 바꾸면 안 된다.
- 목록·상세는 같은 `PostBody`를 사용하지만 `PostDetailThread`만 ancestors·reply descendants와 pagination을 소유한다. Viewer가 route component를 중첩하거나 별도 viewer 전용 thread를 만들면 recursive Viewer, 중복 Media·focus target, pagination·lifecycle 회귀가 생긴다.
- 기존 Reaction·Repost·More UI는 자체 overlay를 열 수 있다. Viewer 구현은 Web과 iOS·Android에서 overlay stacking, dismiss 순서와 focus 복귀를 실제 runtime으로 확인해야 한다.

### Recommended Approach

목록과 상세의 기존 Action authentication·Reply coordinator provider 아래 안정적인 surface 경계에 `PostMediaViewerHost`를 둔다. `PostBody`에서 Gallery까지는 `onMediaOpen(index, origin)` callback seam만 전달하고 launcher는 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`을 Host에 연다. Gallery는 Sensitive 공개 뒤 정상 image tile에만 이 callback을 연결하고 Reply 부모 preview의 `interactive=false` 경로에는 전달하지 않는다. 일반·Quote는 두 ID를 같은 Post로 전달하고, 목록 pure Repost는 바깥 contentless Repost를 surface identity로, direct Source를 Media owner identity로 전달한다. 상세의 기존 non-interactive pure Repost preview에는 새 launcher를 추가하지 않는다.

Host는 열린 session, `node(surfacePostId)` Post query, 기존 Action/Reply binding과 Wide thread composition을 소유한다. Query 결과에서 `mediaOwnerPostId`가 surface 또는 direct Source인지 검증하며 Content availability로 owner를 재추론하지 않는다. Pure Repost의 Media·본문·Profile과 Repost·Reaction·Bookmark·More는 direct Source를 사용하되 Reply binding·availability는 바깥 contentless surface Post를 사용해 disabled로 유지한다. Wide thread도 Media owner를 표시하면서 같은 surface Reply identity를 전달해 Source Composer를 열지 않는다. Modal shell·close·origin 또는 screen fallback focus는 query 경계 밖에 유지하고 Content·Media·Profile presentation만 `Suspense`·error boundary 안에서 교체한다. Query는 현재 Relay actor environment를 사용하고 기존 Post Node visibility·authorization을 그대로 적용하므로 별도 Media authorization을 만들지 않는다. Relay actor/environment generation이 바뀌면 session을 닫고 이전 query를 폐기한다.

같은 Content ID가 null projection을 거쳐 복구되면 current index·expanded·overflow·Media loading/error/retry state를 유지한다. 다른 non-null Content ID가 도착하면 그 상태를 초기화하고 session을 연 original selected index를 다시 사용한다. 새 revision에 해당 document index가 없으면 index를 clamp하거나 다른 Media로 이동하지 않고 unavailable을 표시한다. Media ID가 같아도 URL이 바뀌면 image instance와 load state를 새 URL 기준으로 교체해 이전 pixel·byte를 유지하지 않는다.

Wide Web의 오른쪽은 route component 자체를 중첩하지 않고 `PostDetailThread`의 표시·interaction 조합을 재사용 가능한 thread surface로 추출해 사용한다. Reply ancestors, Media owner Post와 reply descendants를 기존 연결 순서대로 포함한다. 원본 Media는 생략하고 Reply Composer는 처음부터 열지 않으며 기존 Post 상세처럼 Reply action을 실행했을 때 현재 Post 아래에서 펼친다. 다만 pure Repost는 surface Reply availability가 disabled이므로 Source Composer를 열지 않는다. Ancestors·descendants와 Quote·Repost 안의 Media 및 viewer interaction, Action Bar·Reply Composer·reply descendants는 기존 표현을 유지한다. 목록처럼 thread data가 아직 없는 caller는 Media owner Post node의 기존 visibility 정책을 따르는 Post detail thread operation을 Viewer 경계 안에서 load할 수 있다. 이 operation은 standalone Media authorization을 추가하지 않고 route·browser history를 변경하지 않으며 현재 Viewer Media owner identity와 결과가 다르면 표시하지 않는다.

Viewer presentation은 하나의 full-screen modal 안에서 다음 영역을 조합한다.

1. Close와 현재 위치를 가진 modal chrome
2. Gallery와 별개 상태를 가진 `contain` image surface 및 이전·다음 입력
3. Compact Web·Native에서 작성자와 접힌 원문을 가진 detail text scroller
4. Compact Web·Native에서 같은 Post fragment·binding을 소비하는 기존 `PostActionSurface`
5. Wide Web에서 전체 원문·기존 Action Bar·Reply Composer·reply descendants를 가진 독립 scroll thread surface

폭 분기는 Web에서만 768px을 기준으로 하고 Native는 항상 compact 세로 layout을 사용한다. Wide Web modal은 viewport 사방의 `24px` backdrop inset을 제외한 폭을 사용하고, 오른쪽 thread rail은 `clamp(320px, 25vw, 350px)`로 계산하며 왼쪽 image surface가 나머지 폭을 차지한다. 320px 최소폭은 current row의 좌우 padding 24px을 제외한 content 폭이 274px bounded Action Bar footprint를 수용하도록 보장한다. 기존 Post 상세의 표현·interaction을 재사용하되 route의 `600px` column 폭까지 복제하지 않는다.

Compact 원문 overflow 여부는 실제 text layout에서 확인해 3줄을 넘을 때만 control을 표시한다. Detail panel은 내용 높이를 따르되 최대 높이를 `clamp(192px, viewport height의 32%, 240px)`로 계산한다. `192px`은 낮은 viewport에서 작성자·원문 control·Action Bar를 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니다. Body 영역은 빈 높이를 채우지 않아 Action Bar가 짧은 원문 바로 아래에 놓이게 하고, 낮은 viewport에서 내용이 상한을 넘으면 body만 줄어들고 scroll한다. 다른 non-null Content revision이 도착하면 펼침·overflow·image load state를 초기화한다. 같은 Content에서 Media URL identity만 바뀌면 해당 Image instance와 load state만 교체한다. Wide Web은 원문을 접지 않고 오른쪽 thread surface 전체를 왼쪽 image와 독립적으로 scroll한다. Image load generation은 Media identity별로 격리해 현재 index 이동이나 retry가 다른 항목 상태를 초기화하지 않게 한다.

Host Post query의 loading·error boundary는 Content presentation에만 적용해 modal shell과 close·focus를 유지한다. Wide thread loading·error boundary는 오른쪽 surface에만 적용해 왼쪽 선택 image와 modal chrome을 유지한다. Route와 Viewer의 `PostDetailThread`는 각각 scroll surface의 end-reached, same-surface burst 재진입 guard, pending·error·retry UI state와 completion 뒤 saved metrics 재평가를 소유하고 component 간 request token이나 Viewer visibility gate를 공유하지 않는다. 같은 Relay environment에서 query와 variables가 동일한 pagination operation이 두 surface에서 겹치면 in-flight dedupe와 normalized connection merge는 Relay에 맡긴다. 서로 다른 cursor·count·environment의 request가 dedupe된다고 가정하지 않는다. Viewer 뒤의 원래 Post surface는 modal이 열린 동안 focus와 interaction 대상에서 제외한다.

Web key handler는 Viewer가 최상위 active modal일 때만 arrow·Escape를 처리하고 form·button 입력과 충돌하지 않게 한다. Web backdrop은 직접 press만 close로 처리하고 image·detail·내부 control press의 전파로 닫지 않는다. Native swipe는 수평 의도가 수직 scroll보다 분명할 때만 인식하며 첫·마지막 경계를 넘기지 않는다. Close ref를 초기 focus target으로 사용하고, dismiss 시 보관한 origin control이 유효하면 그곳으로 복귀한다.

Post Action Bar와 thread child overlay는 기존 surface를 재사용하되 Viewer와 child overlay를 동시에 무조건 dismiss하지 않는다. 구현 초기에 Web wide thread와 iOS·Android compact Action Bar에서 overlay layering과 focus를 확인하고, 중첩 native `Modal`이 기존 동작을 보존하지 못하면 같은 coordinator가 Viewer와 child overlay의 표시 순서를 조정한다. 어느 방식이든 action target·pending·cache·실패 계약은 기존 child component가 계속 소유한다.

### Allowed Alternatives

- Host는 기존 `node(surfacePostId)` Post query와 colocated fragment로 Viewer Content·Action·thread 입력을 소유하고 pure Repost의 direct Source projection을 그 query에서 파생한다. Caller가 parent Post fragment, 조립한 `actionBar` 또는 `wideDetail`을 넘겨 Host query lifecycle과 다시 reconcile하는 구조는 허용하지 않는다.
- Host는 목록과 상세의 기존 provider 아래 surface마다 하나씩 둘 수 있다. 앱 전체 단일 modal coordinator나 새 route는 필요하지 않으며, Wide thread 안에서 여는 Viewer는 해당 nested surface Host가 별도 stack entry로 소유한다.
- Image별 load state는 기존 renderer에서 공유 가능한 presentation seam을 추출하거나 Viewer 전용 얇은 `contain` renderer로 둘 수 있다. Gallery의 `cover` geometry와 retry 격리 계약을 바꾸지 않는 방식만 허용한다.
- Child action overlay가 중첩 modal로 검증되면 Viewer를 유지한 채 열 수 있고, 플랫폼 제약이 확인되면 coordinator가 child overlay 동안 Viewer presentation을 일시 조정할 수 있다. 사용자에게 보이는 action 결과와 dismiss·focus 계약은 같아야 한다.

### Known Traps

- Viewer가 Media ID만 받아 query를 실행하거나 기존 `node(surfacePostId)` 대신 별도 authorization을 만들면 Post visibility와 Content revision 경계를 우회하거나 stale Media를 섞을 수 있다.
- Pure Repost의 surface identity와 direct Source Media owner를 하나의 Post ID로 합치면 Viewer에서만 Reply가 Source 기준으로 활성화되고 Wide Source Composer가 열리는 회귀가 생긴다.
- Modal shell을 Host Post query boundary 안에 두면 loading·error·retry 때 close·focus lifecycle까지 unmount된다.
- Parent fragment와 Host query를 동시에 표시 lifecycle source로 사용하면 Quote·Repost projection 변화와 query completion이 Viewer instance·state를 서로 재설정한다.
- 전체 Post row·body navigation Pressable 안에 viewer tile semantics를 중첩하거나 press propagation을 막지 않으면 viewer와 상세 route가 함께 열린다.
- Sensitive placeholder나 gallery retry control을 viewer trigger로 감싸면 공개·재시도와 viewer open이 동시에 실행된다.
- 현재 fragment projection의 Media가 unavailable인데 이전 URL을 별도 snapshot으로 유지하면 더 이상 승인되지 않은 image가 modal에 남는다. Viewer는 이전 URL을 보존하지 않고 modal 안에 unavailable 상태를 표시해야 한다.
- Gallery용 `cover` renderer를 그대로 확대하면 원본 확인 목적을 깨뜨리고, Viewer용 `contain` 변경을 공용 frame에 강제하면 compact gallery geometry가 회귀한다.
- Action Bar 모양만 복제하면 인증·selected Profile·Relay target·pending·failure·count 계약이 분기된다.
- Detail route component를 Viewer 안에 직접 mount하면 route ownership과 Viewer session이 중첩되고 current Post Media·focus·interaction이 중복될 수 있다.
- Wide 오른쪽에 `PostListItem`만 복제하면 Reply Composer·descendants·connection pagination과 Post 상세 표현이 갈라진다.
- Modal 뒤 원래 Post surface를 활성 상태로 남기면 같은 Post action과 focus target이 동시에 노출된다.
- `numberOfLines={3}`만 두고 실제 overflow를 측정하지 않으면 짧은 원문에도 더 보기가 나타나거나 긴 원문의 control이 누락된다.
- Storybook과 Web keyboard 자동화만으로 Native back·swipe·VoiceOver·TalkBack 또는 중첩 overlay를 완료로 판단하면 안 된다.

## Risks / Trade-offs

- [목록과 상세의 상위 Post surface 조합이 달라 Host seam이 커질 수 있음] → 기존 list/detail Action·Reply provider 아래 같은 surface-level Host를 두고 launcher는 surface Post ID·Media owner Post ID·index·origin만 전달하며 Host는 query 결과에서 두 identity의 관계를 검증한다.
- [Host Post query가 parent surface query와 같은 Post를 다시 읽음] → 기존 `node(id)`와 Relay normalized cache를 사용하고 별도 authorization·Media query·수동 dedupe를 추가하지 않는다.
- [목록에서 Wide thread를 위해 추가 Post detail operation이 필요할 수 있음] → 같은 Post node·visibility를 사용하고 thread boundary에만 loading·error를 두며 Media authorization과 route/history는 변경하지 않는다.
- [Viewer 오른쪽 scroller와 기존 document pagination이 가까운 시점에 같은 connection을 load할 수 있음] → 각 surface가 synchronous burst 재진입을 local guard로 막고 loading·error·retry 상태를 분리한다. 두 surface에서 겹친 같은 Relay environment의 동일 operation·variables는 Relay 21의 in-flight dedupe와 connection merge에 맡긴다. Viewer completion 뒤 saved metrics 재평가는 유지하되 서로 다른 surface를 조정하는 앱 token이나 실제 network 횟수를 별도 앱 계약으로 고정하지 않는다.
- [Viewer와 Reaction·Repost·More overlay의 native stacking이 불안정할 수 있음] → 구현 초기에 각 child action을 세 플랫폼에서 확인하고, 실패하면 action 의미를 바꾸지 않는 coordinator-level layer 전환으로 제한한다.
- [긴 원문 scroll과 Native 수평 swipe가 gesture를 경쟁할 수 있음] → 수평 의도 threshold를 두고 vertical text scroll을 우선하며 이전·다음 button을 항상 대체 입력으로 유지한다.
- [768px 부근에서 최소 rail이 image surface를 지나치게 줄일 수 있음] → rail은 현재 274px bounded Action Bar footprint가 잘리지 않는 320px 최소폭을 지키되 modal의 24px inset 안에서 image가 남는지 768px 경계를 직접 확인하고, 넓은 viewport에서는 350px 상한으로 image 비중을 회복한다.
- [Compact panel의 내용 높이와 expanded scroll 제약이 Action Bar를 밀거나 낮은 viewport에서 고정 chrome을 가릴 수 있음] → `clamp(192px, 32vh, 240px)` 최대 높이와 body-only shrink 경계를 함께 두고 짧은 원문·3줄 초과 원문·expanded 상태를 일반 높이와 390px 높이에서 각각 실측한다.
- [Post·revision 변경 뒤 이전 Media가 잠시 남을 수 있음] → Viewer가 소유 Post의 현재 Relay fragment projection만 읽고 이전 Media URL을 session이나 별도 state에 보존하지 않는다. 선택 Media가 사라지면 modal chrome과 close control을 유지한 unavailable 상태로 전환한다.
- [기기 저장 부재가 Figma와 다르게 보일 수 있음] → 기존 Post Action Bar만 표시하고, 저장은 permission·delivery·failure UX를 가진 별도 후속 계약임을 canonical과 PR에 명시한다.

## Migration Plan

1. PROD-626에서 병합된 gallery 계약과 현재 Viewer component test를 baseline으로 고정한다.
2. 목록·상세 provider 아래 stable Host와 `node(surfacePostId)` query를 두고 명시된 Media owner가 surface 또는 direct Source인지 검증하며 modal shell을 query content boundary 밖으로 분리한다.
3. Caller가 전달하던 Post fragment·Action Bar·Wide detail 조립을 Host의 기존 fragment·binding·thread composition으로 이동한다.
4. Cache hit·loading·error·retry·unavailable, 같은 Content 복구·다른 revision reset, URL·actor 전환과 focus 복귀를 component test와 Storybook으로 확인한다.
5. Wide Web의 bounded rail과 Compact Web·Native의 내용 높이 panel·3줄 원문·고정 Action Bar가 기존 Media 탐색을 회귀시키지 않는지 확인한다.
6. Web pointer·keyboard·focus·URL/history와 wide Composer·pagination·nested child overlay, iOS·Android touch·swipe·back·Screen Reader를 별도 runtime 증거로 확인한다. 서버·DB migration이나 저장 데이터 rollback은 없다.

## Open Questions

없음. Child action overlay의 구체적인 layer 구현은 스펙을 바꾸지 않는 runtime 검증 checkpoint로 남긴다.
