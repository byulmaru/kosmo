## Context

PROD-626은 공용 `PostMediaGallery`·`PostMediaImage`에 최대 4장 gallery geometry, Sensitive 공개 상태와 image별 loading·retry를 제공하지만 정상 tile은 의도적으로 비대화형으로 남긴다. 현재 `PostBody` fragment는 Content와 Media만 읽고, 목록의 `PostListRow`와 상세의 `PostLayout`이 작성자·Post action target·Reply binding을 소유한다. Viewer가 gallery 안에서 자체 Post 데이터를 다시 조회하면 동일 Post·revision·action target 경계가 갈라지므로, PROD-650은 이 Post surface의 기존 데이터를 재사용해야 한다.

React Native `Modal`, `useWindowDimensions`, focus ref와 Native `PanResponder`를 사용하는 선행 UI가 있으나 Media Viewer 공용 primitive는 없다. 기존 `PostActionSurface`는 Relay fragment와 인증·Profile 선택·Reply callback을 결합하고 Reaction·Repost·More도 각 overlay를 열 수 있으므로, Viewer 안에서 중복 action row를 만들거나 중첩 modal을 무검증으로 추가하면 플랫폼별 overlay·focus가 달라질 수 있다.

## Goals / Non-Goals

**Goals:**

- Gallery 선택 index를 Post surface가 소유하는 modal viewer로 전달한다.
- 현재 Post Content revision의 Media 순서와 이미 승인된 표시 URL만 사용한다.
- Mobile·Web 반응형 image/detail layout과 기존 Post Action Bar를 하나의 공용 경계에서 제공한다.
- Sensitive·loading·error·retry, modal close·focus 복귀와 Web·Native 탐색 입력을 분리 검증할 수 있게 한다.

**Non-Goals:**

- 새 GraphQL field·Media query·authorization·dependency를 추가하지 않는다.
- Gallery geometry, Post action 도메인 동작과 Relay cache update를 재구현하지 않는다.
- Zoom·pan, route·deep link, Media 편집·metadata와 파일 공유·다운로드·기기 저장을 구현하지 않는다.

## Implementation Guidance

### Current Constraints

- `PostContentRenderer`는 paragraph와 gallery를 함께 조합하고 Gallery는 Post author·action fragment를 알지 못한다. Viewer를 Gallery 내부 state로 두면 원문과 기존 Action Bar를 안전하게 공급할 수 없다.
- `PostMediaGallery`가 Sensitive 공개 상태를 로컬에서 소유한다. 공개 전에는 tile과 image byte가 mount되지 않으므로 viewer trigger도 생성하면 안 된다.
- `PostMediaImage`는 gallery용 `cover` geometry와 image별 generation·loading·error·retry를 소유한다. Viewer의 `contain` surface가 gallery frame state나 인접 tile 상태를 바꾸면 안 된다.
- 목록·상세는 같은 `PostBody`를 사용하지만 author layout과 Reply coordinator를 서로 다른 상위 surface에서 조합한다. Viewer가 두 caller별 markup으로 갈라지면 target·lifecycle·접근성 회귀가 생긴다.
- 기존 Reaction·Repost·More UI는 자체 overlay를 열 수 있다. Viewer 구현은 Web과 iOS·Android에서 overlay stacking, dismiss 순서와 focus 복귀를 실제 runtime으로 확인해야 한다.

### Recommended Approach

Post surface에 viewer coordinator를 두고 `{selectedIndex, originControl}`만 열린 상태로 보관한다. `PostBody`에서 Gallery까지는 `onMediaOpen(index, origin)` callback seam만 전달하고, Gallery는 Sensitive 공개 뒤 정상 image tile에만 이 callback을 연결한다. Reply 부모 preview의 `interactive=false` 경로에는 callback을 전달하지 않는다.

Coordinator는 현재 surface가 가진 Post fragment와 presentation 입력에서 Media, Content identity, 작성자, 원문과 기존 action binding을 viewer에 공급한다. 새 Media query를 만들지 않고, Post·Profile·Content identity가 바뀌면 열린 selection을 폐기한다. 목록과 상세은 같은 viewer presentation을 사용하고 caller는 기존 Reply binding과 삭제 lifecycle 같은 Post surface 입력만 제공한다.

Viewer presentation은 하나의 full-screen modal 안에서 다음 영역을 조합한다.

1. Close와 현재 위치를 가진 modal chrome
2. Gallery와 별개 상태를 가진 `contain` image surface 및 이전·다음 입력
3. 작성자와 접힌 원문을 가진 detail text scroller
4. 같은 Post fragment·binding을 소비하는 기존 `PostActionSurface`

폭 분기는 Web에서만 768px을 기준으로 하고 Native는 항상 세로 layout을 사용한다. 원문 overflow 여부는 실제 text layout에서 확인해 3줄을 넘을 때만 control을 표시한다. 펼친 상태는 현재 Viewer session 안에서 유지하되 새 Post·revision으로 이어지지 않는다. Image load generation은 Media identity별로 격리해 현재 index 이동이나 retry가 다른 항목 상태를 초기화하지 않게 한다.

Web key handler는 Viewer가 최상위 active modal일 때만 arrow·Escape를 처리하고 form·button 입력과 충돌하지 않게 한다. Web backdrop은 직접 press만 close로 처리하고 image·detail·내부 control press의 전파로 닫지 않는다. Native swipe는 수평 의도가 수직 scroll보다 분명할 때만 인식하며 첫·마지막 경계를 넘기지 않는다. Close ref를 초기 focus target으로 사용하고, dismiss 시 보관한 origin control이 유효하면 그곳으로 복귀한다.

Post Action Bar child overlay는 기존 surface를 재사용하되 Viewer와 child overlay를 동시에 무조건 dismiss하지 않는다. 구현 초기에 Web·iOS·Android에서 overlay layering과 focus를 확인하고, 중첩 native `Modal`이 기존 동작을 보존하지 못하면 같은 coordinator가 Viewer와 child overlay의 표시 순서를 조정한다. 어느 방식이든 action target·pending·cache·실패 계약은 기존 child component가 계속 소유한다.

### Allowed Alternatives

- Viewer presentation이 Post fragment를 직접 읽거나 coordinator가 필요한 presentation data를 명시적으로 전달할 수 있다. 두 방식 모두 현재 Post surface의 동일 Relay identity를 소비하고 별도 Media query·action 복제를 만들지 않아야 한다.
- Image별 load state는 기존 renderer에서 공유 가능한 presentation seam을 추출하거나 Viewer 전용 얇은 `contain` renderer로 둘 수 있다. Gallery의 `cover` geometry와 retry 격리 계약을 바꾸지 않는 방식만 허용한다.
- Child action overlay가 중첩 modal로 검증되면 Viewer를 유지한 채 열 수 있고, 플랫폼 제약이 확인되면 coordinator가 child overlay 동안 Viewer presentation을 일시 조정할 수 있다. 사용자에게 보이는 action 결과와 dismiss·focus 계약은 같아야 한다.

### Known Traps

- Viewer가 Media ID만 받아 새 query를 실행하면 Post visibility와 Content revision 경계를 우회하거나 stale Media를 섞을 수 있다.
- 전체 Post row·body navigation Pressable 안에 viewer tile semantics를 중첩하거나 press propagation을 막지 않으면 viewer와 상세 route가 함께 열린다.
- Sensitive placeholder나 gallery retry control을 viewer trigger로 감싸면 공개·재시도와 viewer open이 동시에 실행된다.
- 최초 reveal만 확인하고 열린 session에서 Sensitive 재가림·삭제·조회 무효화를 감시하지 않으면 더 이상 표시할 수 없는 이전 image가 modal에 남는다.
- Gallery용 `cover` renderer를 그대로 확대하면 원본 확인 목적을 깨뜨리고, Viewer용 `contain` 변경을 공용 frame에 강제하면 compact gallery geometry가 회귀한다.
- Action Bar 모양만 복제하면 인증·selected Profile·Relay target·pending·failure·count 계약이 분기된다.
- `numberOfLines={3}`만 두고 실제 overflow를 측정하지 않으면 짧은 원문에도 더 보기가 나타나거나 긴 원문의 control이 누락된다.
- Storybook과 Web keyboard 자동화만으로 Native back·swipe·VoiceOver·TalkBack 또는 중첩 overlay를 완료로 판단하면 안 된다.

## Risks / Trade-offs

- [목록과 상세의 상위 Post surface 조합이 달라 coordinator seam이 커질 수 있음] → Gallery에는 index callback만 추가하고 Post 데이터·Action Bar binding은 두 상위 caller가 같은 Viewer API로 공급한다.
- [Viewer와 Reaction·Repost·More overlay의 native stacking이 불안정할 수 있음] → 구현 초기에 각 child action을 세 플랫폼에서 확인하고, 실패하면 action 의미를 바꾸지 않는 coordinator-level layer 전환으로 제한한다.
- [긴 원문 scroll과 Native 수평 swipe가 gesture를 경쟁할 수 있음] → 수평 의도 threshold를 두고 vertical text scroll을 우선하며 이전·다음 button을 항상 대체 입력으로 유지한다.
- [Post·revision 변경 뒤 이전 Media가 잠시 남을 수 있음] → Post·Profile·Content identity를 Viewer session key로 사용하고 불일치 시 render 전에 닫는다.
- [기기 저장 부재가 Figma와 다르게 보일 수 있음] → 기존 Post Action Bar만 표시하고, 저장은 permission·delivery·failure UX를 가진 별도 후속 계약임을 canonical과 PR에 명시한다.

## Migration Plan

1. PROD-626의 최신 head와 gallery component test를 baseline으로 고정한다.
2. Gallery callback seam과 normal tile semantics를 추가하고 Sensitive·retry·Reply preview 회귀를 먼저 검증한다.
3. 공용 Viewer coordinator·presentation을 목록과 상세에 연결하고 Storybook에서 single·multi·긴 원문·loading·error·responsive 상태를 검증한다.
4. Web pointer·keyboard·focus와 iOS·Android touch·swipe·back·Screen Reader를 별도 runtime 증거로 확인한다.
5. 이상이 있으면 Viewer와 tile trigger만 제거해 기존 비대화형 gallery로 rollback한다. 서버·DB migration이나 저장 데이터 rollback은 없다.

## Open Questions

없음. Child action overlay의 구체적인 layer 구현은 스펙을 바꾸지 않는 runtime 검증 checkpoint로 남긴다.
