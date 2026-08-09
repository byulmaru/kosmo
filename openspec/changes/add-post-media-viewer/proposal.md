## Why

Post의 이미지가 gallery 안에서 crop되어 보이지만 원본 비율로 크게 확인하거나 같은 Post의 다른 이미지를 연속해서 탐색할 수 없다. 사용자가 선택한 이미지와 원문·Post action 맥락을 함께 유지하는 접근 가능한 viewer가 필요하다.

## What Changes

- 일반 목록·상세의 공개된 정상 이미지 tile에서 modal Post Media Viewer를 연다.
- 안정적인 `PostMediaViewerHost`가 Gallery의 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`로 기존 Post `node(id)` visibility·authorization 경계의 surface Post를 조회하고 Media owner가 그 surface 또는 direct Source인지 확인한다. 일반·Quote는 두 ID가 같고, pure Repost는 바깥 contentless Repost가 surface, direct Source가 Media owner다. Reply는 surface 기준으로 disabled이고 나머지 social action은 Source를 대상으로 한다.
- Web `<768px`와 Native는 image 위·compact detail panel 아래, Web `>=768px`는 image 왼쪽·기존 Post 상세 thread surface 오른쪽 layout을 사용한다. Wide Web은 `24px` viewport inset 안에서 오른쪽 rail을 `clamp(320px, 25vw, 350px)`로 제한하고 나머지 폭을 image에 배정한다.
- Compact detail은 작성자와 3줄로 접힌 원문을 표시하고, 내용 높이를 따르되 최대 높이를 `clamp(192px, 32vh, 240px)`로 계산한다. `192px`은 낮은 viewport에서 고정 chrome을 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니다. 펼친 text 영역만 줄어들고 scroll하며 기존 Post Action Bar를 원문 바로 아래의 고정 영역에 둔다.
- Wide Web detail은 원본 Post의 전체 원문·기존 Action Bar, Reply Composer와 reply descendants를 기존 Post 상세 표현과 interaction으로 제공하고, 원본 Media는 왼쪽 image surface에만 표시한다.
- Wide Web detail 전체는 image surface와 독립적으로 scroll하고 기존 reply loading·error·retry·pagination을 유지한다.
- Modal shell·close·focus fallback을 Post query의 Suspense·error boundary 밖에 유지하고 cache hit·loading·error·retry·null Post·Content·Media 상태를 안전하게 표시한다.
- 같은 Content revision의 일시 unavailable·복구는 탐색·원문·Media 상태를 유지하고, 다른 revision은 원래 선택 index에서 초기화하며 해당 index가 없으면 unavailable을 표시한다. Relay actor/environment가 바뀌면 Viewer를 닫고 이전 query를 폐기한다.
- Modal close, keyboard arrow, Native swipe, Screen Reader 위치 안내와 focus 복귀를 플랫폼별로 지원하고 Viewer open·탐색·close 중 route와 browser history를 유지한다.
- Media 파일 공유·다운로드·기기 저장, zoom·pan, route·deep link와 Media 전용 action은 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`
- Linear Contract: PROD-650
- Linear Implementations: PROD-650

## Capabilities

### New Capabilities

- `post-media-viewer`: 선택한 Post Media를 안정적인 Host가 조회한 현재 Post query projection과 Post action 맥락 안에서 반응형 modal로 탐색하는 동작을 정의한다.

### Modified Capabilities

- `post-media-display`: 일반 interactive gallery의 공개된 정상 tile을 viewer trigger로 바꾸되 Sensitive·error control과 비대화형 Reply 부모 preview의 경계를 유지한다.

## Impact

- App의 공용 Post surface, stable Viewer Host와 Post query boundary, Media gallery·image renderer, Post 상세 thread·Reply Composer·reply pagination, modal·gesture·focus 처리와 Post Action Bar 조합이 영향받는다.
- Component test와 Storybook fixture에 viewer 상태·layout·탐색·오류·접근성 및 wide thread interaction 사례가 추가된다.
- GraphQL schema, 서버·DB, Media authorization, 저장소 URL 계약과 외부 dependency는 변경하지 않는다.
- 구현은 PROD-626에서 병합된 gallery 계약을 재사용하고 최신 `main`을 부모로 사용한다. PROD-626의 남은 runtime QA·archive 책임은 가져오지 않는다.
