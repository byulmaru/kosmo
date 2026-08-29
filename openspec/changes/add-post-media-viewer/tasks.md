## 1. PROD-650 Gallery 진입과 Viewer session 경계

> Checked items in Sections 1–5 preserve PROD-650 historical completion. Unchecked consumer integration, platform runtime and archive work remains owned by PROD-849 as marked below.

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/post-media-gallery.md`
- `docs/design/post-media-viewer.md`
- PROD-650

**Deliverable**

일반 목록·상세의 공개된 정상 이미지 tile에서 surface Post ID·Media owner Post ID와 선택한 위치를 안정적인 Host에 전달하고, 기존 Post Node visibility·authorization 경계로 조회한 surface에서 두 identity의 관계를 검증해 현재 Media 목록을 사용한다.

**Guardrails**

- Stable surface-level Host가 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}` session과 기존 `node(surfacePostId)` query·Action/Reply/thread composition을 소유하고 Media owner가 surface 또는 direct Source인지 검증한다.
- 일반·Quote는 surface Post를 Media owner로 사용한다. Pure Repost는 direct Source를 Media·본문·Profile과 Repost·Reaction·Bookmark·More의 owner로 사용하되 Reply는 바깥 contentless Repost 기준으로 disabled이며 Wide Source Composer를 열지 않는다.
- Modal shell·close·origin 또는 screen fallback focus는 query의 Suspense·error boundary 밖에 유지한다. Sensitive 가림 상태와 `interactive=false` Reply 부모 preview에는 Viewer 진입을 제공하지 않는다.
- 같은 Content의 일시 unavailable·복구 상태는 유지하고 다른 revision은 original selected index에서 초기화하며, 해당 index가 없으면 unavailable을 표시한다. Actor/environment가 바뀌면 Viewer를 닫고 이전 query를 폐기한다.
- 별도 Media query·authorization을 추가하거나 이전 byte·URL 또는 다른 Post·Profile·revision의 Media를 섞지 않는다.
- PROD-626의 gallery geometry·Sensitive·retry 동작을 복제하거나 회귀시키지 않는다.

**Verification**

- Component test로 정상 tile의 surface Post ID·선택 index, pure Repost의 direct Source Media owner·disabled Reply·Source social target, 주변 Post navigation 전파 차단, Sensitive·retry control 격리, Reply preview 비대화형 경계, query cache hit·loading·error·retry·null Post·Content·Media의 shell 유지, 같은 Content 복구 상태 보존, 다른 revision reset·original index unavailable, URL·actor 전환, 명시적 dismiss·Viewer 삭제 action·surface unmount와 focus 복귀를 검증한다.
- PROD-626 baseline의 1·2·3·4장, Sensitive와 error·retry test를 함께 통과시킨다.

- [x] 1.1 목록·상세의 기존 provider 아래 stable `PostMediaViewerHost`와 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}` session을 두고 기존 `node(surfacePostId)` visibility·authorization query를 연결한다.
- [x] 1.2 공개된 정상 tile에 viewer trigger semantics와 접근 가능한 이름을 제공하고 주변 navigation과 기존 gallery control 실행을 격리한다.
- [x] 1.3 Modal shell·close·origin 또는 screen fallback focus를 Host query boundary 밖에 유지하고 cache hit·loading·error·retry·null Post·Content·Media의 안전한 presentation을 구현한다.
- [x] 1.4 같은 Content unavailable→복구 state 보존, 다른 Content revision의 original index reset·부재 unavailable, Media URL 변경의 이전 byte 비보존과 actor/environment 전환 close·query 폐기를 구현한다.
- [x] 1.5 PostListItem·PostLayout은 surface Post ID와 Media owner Post ID로 launch만 요청하고 parent fragment·Action Bar·Wide detail 조립과 Viewer lifecycle reconciliation을 제거한다. Quote는 두 ID 모두 outer Post를 사용하고 목록 pure Repost는 outer surface와 direct Source Media owner를 각각 전달하며 상세 pure Repost에는 새 launcher를 추가하지 않는다.
- [x] 1.6 목록·Quote·Repost·상세 projection 전환, pure Repost의 disabled surface Reply·Source social target, nested Viewer stack, query lifecycle·revision·URL·actor·focus 복귀를 Relay mock 기반 component test로 회귀 검증한다.

## 2. PROD-650 Image surface와 Media 탐색

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- PROD-650

**Deliverable**

선택한 Media를 원본 비율로 크게 표시하고 같은 Content revision의 최대 4장을 이전·다음, Web keyboard와 Native swipe로 비순환 탐색할 수 있다.

**Guardrails**

- Viewer 이미지는 `contain`을 사용하고 gallery의 `cover` geometry를 변경하지 않는다.
- 첫·마지막 경계에서 반대편으로 순환하지 않고 범위를 벗어나는 control을 disabled로 전달한다.
- 다중 Media에만 시각 counter를 표시하며 Screen Reader 위치 정보는 단일 Media에도 제공하고, nullable Alt Text 또는 document 순서 fallback을 image accessible name으로 별도 유지한다.
- Loading·error·retry는 Media identity별로 격리하고 raw URL·내부 오류·권한 세부 정보를 노출하지 않는다.

**Verification**

- Component test로 선택 index, 1장·첫·중간·마지막, button·keyboard·swipe 이동, 비순환 경계, Alt Text·fallback과 counter·announcement를 검증한다.
- 각 Media의 loading·error·retry가 현재 index와 다른 Media 상태를 변경하지 않는지 검증한다.

- [x] 2.1 Modal image surface에 선택 Media의 `contain` 표시와 identity별 loading·error·retry 상태를 제공한다.
- [x] 2.2 이전·다음 control, 비순환 index 전이, nullable Alt Text·fallback과 단일·다중 counter·Screen Reader 위치 정보를 구현한다.
- [x] 2.3 Web arrow key와 vertical scroll을 침범하지 않는 Native 수평 swipe를 같은 탐색 결과에 연결한다.
- [x] 2.4 탐색·상태·오류 격리의 focused component test를 추가하고 통과시킨다.

## 3. PROD-650 반응형 Post detail·thread와 기존 interaction

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/design/post-media-viewer.md`
- `docs/design/post-action-bar.md`
- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- PROD-650

**Deliverable**

PROD-650 Current historical evidence는 Compact Web·Native의 작성자·3줄 원문·고정된 기존 Post Action Bar와 Web `>=768px` Wide rail의 inline Reply Composer를 포함한다. DSN-63 Target은 Wide Web `768–1279px`에서 Reply action 뒤 Viewer를 먼저 닫고 공용 `600×720` Reply modal을 열며, `>=1280px`에서만 rail 안에 inline Composer를 펼친다. PROD-853은 disconnected shared UI·component test·Storybook을, PROD-849는 이 Target의 Production consumer replacement와 connected runtime을 소유한다.

**Guardrails**

- Web `<768px`와 Native는 image 위·compact detail 아래의 세로 layout을 사용한다. Detail panel은 내용 높이를 따르되 최대 높이를 `clamp(192px, 32vh, 240px)`로 계산한다. `192px`은 낮은 viewport에서 고정 chrome을 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니다. 실제로 3줄을 넘는 원문에만 더 보기·접기를 제공하며, 상한을 넘으면 펼친 text 영역만 줄어들고 scroll한다.
- Web `>=768px`는 `24px` viewport inset 안에서 image 왼쪽·`clamp(320px, 25vw, 350px)`의 기존 Post 상세 thread surface 오른쪽 layout을 사용하고 원문 전체·reply descendants를 표시한다. DSN-63 Target의 `768–1279px` Reply action은 Viewer close 후 공용 `600×720` Reply modal로, `>=1280px` Reply action은 inline Composer로 이어진다.
- Wide 원본 Post Media와 nested Viewer trigger는 오른쪽에서 생략하되 thread 안의 Media는 기존 표현을 유지한다.
- Wide 오른쪽 전체는 독립 scroll하고 기존 reply connection의 loading·error·retry·pagination을 재사용한다. Thread data가 없거나 실패해도 왼쪽 image와 modal chrome은 유지한다.
- 기존 Post Action Bar의 Reply·Repost·Reaction·Bookmark·More target·authentication·selected Profile·count·pending·cache·failure 계약과 일반·Repost·Quote Post surface의 target routing을 재사용하고 Quote를 새 action으로 추가하지 않는다.
- Viewer open·탐색·close 중 route·browser history를 바꾸지 않고 배경 Post surface를 focus·interaction 대상에서 제외한다.
- Media 파일 공유·다운로드·기기 저장, Viewer 전용 action과 새 Post 링크 계약을 추가하지 않는다.

**Verification**

- Component test와 Web runtime으로 compact 짧은·긴 원문, 내용 높이·`clamp(192px, 32vh, 240px)` 최대 높이, 390px 높이의 고정 chrome 보존, expanded state, text-only scroll 경계, fixed Action Bar와 767·768px layout을 검증한다. Storybook은 기존 상태 fixture를 유지하고, wide rail clamp·원문 전체·Composer·reply thread·Media 비중복을 함께 확인한다. 이때 `>=768px` inline Composer는 PROD-650 Current historical evidence로 확인하고, DSN-63 Target의 `768–1279px` Viewer close→공용 `600×720` Reply modal 및 `>=1280px` inline Composer 분기는 PROD-849 connected runtime에서 확인한다.
- Component test로 Viewer 현재 Post의 Content Warning 공개 표현, route와 Viewer의 independent near-end, surface-local loading·error·retry 및 Viewer completion 뒤 saved metrics 재평가를 확인한다. Web runtime에서 오른쪽 독립 scroll·reply pagination, Composer·Post/reply action, route·history 유지와 child overlay layering·dismiss·focus를 확인한다.
- iOS·Android runtime에서는 compact Action Bar child overlay의 layering, dismiss 순서와 focus를 action별로 확인한다.

> Section 3의 checked items 3.1–3.3, 3.5–3.8은 PROD-650 Current historical completion을 보존한다. 그 항목에 포함된 `>=768px` inline Composer wording은 DSN-63 Target의 `768–1279px` Viewer close→공용 Reply modal 규칙을 대체하지 않는다.

- [x] 3.1 작성자와 실제 overflow 기반 3줄 원문·더 보기·접기·text scroller를 detail panel에 제공한다.
- [x] 3.2 Web 768px 경계와 Native 고정 Mobile layout에서 image·detail·고정 Action Bar 영역을 조합한다.
- [x] 3.3 기존 Post Action Bar fragment·binding의 surface routing을 연결하고 pure Repost의 바깥 disabled Reply·direct Source social target과 Viewer 전용 Media action 부재를 회귀 검증한다.
- [ ] 3.4 Reaction·Repost·More·Reply overlay를 세 플랫폼에서 확인하고 기존 동작을 보존하는 layer 처리만 적용한다. **Owner: PROD-849**. PROD-849는 DSN-63 Target의 `768–1279px` Viewer close→공용 Reply modal 및 `>=1280px` inline Reply 분기의 Production replacement·overlay·runtime 검증을 수행한다.
- [x] 3.5 기존 `PostDetailThread`의 reply ancestors·현재 Post·reply descendants 표시를 route와 Viewer가 재사용할 수 있는 surface로 추출하고, 현재 Post의 원본 Media·nested Viewer만 생략하며 Reply action으로 Composer를 펼치는 기존 상세 동작을 유지한다.
- [x] 3.6 Wide Viewer와 route의 `PostDetailThread`가 component 간 pagination token·Viewer visibility gate 없이 각 scroll surface의 burst 재진입 guard와 local UI state를 유지하고, 두 surface에서 겹친 같은 Relay environment의 동일 operation·variables에 대한 in-flight dedupe·connection merge를 Relay에 맡기며 Viewer completion 뒤 near-end saved metrics 재평가를 유지한다.
- [x] 3.7 Wide Viewer의 전체 원문·Composer·Post/reply action과 child overlay를 직접 사용할 수 있게 하고 route·history 유지, 배경 비활성화와 focus lifecycle을 자동화한다.
- [x] 3.8 Wide Web의 `clamp(320px, 25vw, 350px)` thread rail과 Compact Web·Native의 내용 높이·`clamp(192px, 32vh, 240px)` detail panel을 구현하고, Wide Action Bar의 가로 overflow 방지·390px 높이의 고정 chrome 보존·짧은 원문 Action Bar 인접 배치와 expanded text-only scroll을 회귀 검증한다.

## 4. PROD-650 Modal 접근성과 플랫폼 runtime 검증

**Authority / Provenance**

- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- PROD-650

**Deliverable**

Viewer를 keyboard·touch·VoiceOver·TalkBack으로 열고 탐색하고 닫을 수 있으며, 배경 Post와 route·history를 유지한 채 닫은 뒤 원래 tile 또는 안전한 Post target으로 돌아간다.

**Guardrails**

- 명시적인 close control과 modal semantics를 제공한다. Web backdrop 직접 press는 닫되 image·detail panel·modal 내부 control press는 backdrop dismiss로 전파하지 않고, backdrop을 유일한 dismiss 수단으로 사용하지 않는다.
- Web `Escape`, close control과 Native back이 같은 close lifecycle을 사용한다.
- Modal이 열린 동안 배경 Post surface를 focus·interaction 대상에서 제외하고 Viewer lifecycle로 route·browser history를 변경하지 않는다.
- 자동화·Storybook·Web 관찰을 iOS·Android runtime 접근성 증거로 대체하지 않는다.

**Verification**

- Component·Storybook에서 modal role, close 초기 focus, backdrop·내부 press 격리, 배경 비활성화, focus boundary·복귀, route·history 유지, disabled·expanded·busy state와 accessible name을 확인한다.
- Web backdrop·내부 pointer·keyboard·Screen Reader·wide thread focus, iOS touch·swipe·back·VoiceOver, Android touch·swipe·back·TalkBack 결과를 별도 증거로 기록한다.

- [x] 4.1 Modal semantics, close 초기 focus, Web backdrop·내부 press 격리, focus boundary·Escape와 origin tile·fallback Post target 복귀를 구현하고 자동화한다.
- [x] 4.2 1장·다중·긴 원문·첫/중간/마지막·loading/error와 compact Viewer 사례를 유지하고 wide 원문 전체·Composer·reply thread·Media 비중복·독립 scroll Storybook 사례를 추가한다.
- [ ] 4.3 Web `<768px`·`>=768px`에서 backdrop·내부 pointer, keyboard·focus·배경 비활성화·route/history·Screen Reader와 wide thread interaction runtime을 확인하고 결과를 기록한다. **Owner: PROD-849**
- [ ] 4.4 iOS에서 touch·button·swipe·back·VoiceOver runtime을 확인하고 결과를 기록한다. **Owner: PROD-849**
- [ ] 4.5 Android에서 touch·button·swipe·back·TalkBack runtime을 확인하고 결과를 기록한다. **Owner: PROD-849**
- [x] 4.6 Host query loading·error·retry·unavailable에서도 같은 modal shell·close·focus fallback이 유지되는지 자동화한다.
- [x] 4.7 Host query loading·error·retry·unavailable와 같은 Content 복구·다른 revision reset 상태를 Storybook fixture로 확인한다.

## 5. PROD-849 최종 통합·검증·canonical sync·archive

**Authority / Provenance**

- `docs/design/post-media-gallery.md`
- `docs/design/post-media-viewer.md`
- `docs/design/accessibility.md`
- PROD-626
- PROD-650 historical
- PROD-853
- PROD-849

**Deliverable**

PROD-849가 PROD-853의 disconnected shared UI와 PROD-650 historical Viewer runtime evidence를 Production consumer에 통합·교체하고, connected 자동화·Web/iOS/Android runtime·canonical sync·archive 증거를 review 가능한 PR로 전달한다.

**Guardrails**

- 최신 `main`을 부모로 사용하고 PROD-626의 병합된 gallery 계약을 재사용하되 PROD-849가 남은 consumer replacement·Native QA·archive 책임을 소유한다.
- PROD-849 PR 자체 범위와 필수 connected 검증이 끝나면 Ready 판단을 OpenSpec archive와 분리한다.
- `add-post-media-viewer`는 PROD-849가 PROD-853 shared UI·Gallery consumer·permission mapping·Web/iOS/Android runtime과 canonical delta sync를 완료한 뒤에만 archive한다.

**Verification**

- Focused unit·Storybook 뒤 `pnpm --filter @kosmo/app test`, 관련 lint·Prettier, `git diff --check`, scoped와 전체 OpenSpec strict validation을 통과시킨다.
- Exact `main` parent SHA, branch-only diff, PROD-853 static evidence와 PROD-849 connected CI/runtime 및 미실행 항목을 PR에 분리해 기록한다.

> Section 5의 checked item 5.1은 PROD-650 historical implementation verification을 보존하며, 최종 integration·runtime·canonical sync·archive owner는 PROD-849다.

- [x] 5.1 Host/query refactor 뒤 focused test와 전체 App test, lint·Prettier, diff check와 `add-post-media-viewer` strict validation을 통과시킨다.
- [ ] 5.2 PROD-849가 exact `main` parent SHA와 branch-only diff를 다시 확인하고 PROD-853 static evidence, Production consumer replacement, connected 자동화·Web·iOS·Android 증거 및 제외 범위를 PR에 기록한다. **Owner: PROD-849**
- [ ] 5.3 PROD-849가 Production consumer replacement와 필수 connected 검증을 완료하면 PR readiness를 다시 판단하되 OpenSpec archive와 분리한다. **Owner: PROD-849**
- [ ] 5.4 PROD-849가 Gallery→shared surface·permission mapping·Host/Relay/route replacement와 Web/iOS/Android runtime을 완료하고 canonical `post-media-display`와 이 delta를 동기화한 뒤 `add-post-media-viewer`를 최종 integration/archive하고 strict validation을 통과시킨다. **Owner: PROD-849 / final integration and archive**

## 6. PROD-853 공용 Viewer UI와 Storybook-first 전달

**Authority / Provenance**

- `docs/design/post-media-viewer.md`
- `docs/design/figma.md`
- DSN-63
- PROD-853
- PROD-849

**Deliverable**

Production consumer와 분리된 공용 PostMediaViewer surface, component test와 Storybook 검증 표면을 제공한다.

**Guardrails**

- PROD-853은 Host·Relay·route consumer 교체, Gallery·permission 연결과 Web/iOS/Android runtime을 소유하지 않는다.
- DSN-63의 Compact/Wide 및 Ready/Sensitive/Loading/Error/Unavailable 상태·경계를 공용 UI 계약으로 기록하되 Storybook fixture를 Production 연결 완료로 표현하지 않는다.
- 기존 OpenSpec과 PROD-650 historical completion을 보존하고 새 Viewer abstraction·feature flag·dependency를 추가하지 않는다.

**Verification**

- 실제로 완료한 문서 정렬·strict validation·focused/full component/Storybook 검증만 해당 항목에 check한다. DSN-63 Target의 black 70% overlay, 48×48 interaction target, 30px icon, 2.5 stroke, Compact 56px tray, Wide full-height rail, Ready/Sensitive visibility, Loading/Error/Unavailable close-only surface와 non-cyclic boundary를 PROD-853 disconnected evidence로 기록하고, PROD-849가 최종 consumer·runtime·canonical sync·archive evidence를 이어서 기록한다.

- [x] 6.1 OpenSpec과 Current/Target 문서 책임 정렬
- [ ] 6.2 공용 surface의 상태·경계 component test
- [ ] 6.3 공용 PostMediaViewerSurface 구현
- [ ] 6.4 Controls/Actions/대표 상태 Storybook catalog
- [ ] 6.5 boundary movement와 sensitive reveal interaction contract
- [ ] 6.6 focused/full 자동화, Web Storybook readback, 독립 review
