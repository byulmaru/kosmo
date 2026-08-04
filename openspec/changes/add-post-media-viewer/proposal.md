## Why

Post의 이미지가 gallery 안에서 crop되어 보이지만 원본 비율로 크게 확인하거나 같은 Post의 다른 이미지를 연속해서 탐색할 수 없다. 사용자가 선택한 이미지와 원문·Post action 맥락을 함께 유지하는 접근 가능한 viewer가 필요하다.

## What Changes

- 일반 목록·상세의 공개된 정상 이미지 tile에서 modal Post Media Viewer를 연다.
- 같은 Post Content revision의 Media를 document 순서대로 표시하고, 선택 index 시작·비순환 이전/다음·다중 이미지 counter를 제공한다.
- Web `<768px`와 Native는 image 위·detail panel 아래, Web `>=768px`는 image 왼쪽·detail panel 오른쪽 layout을 사용한다.
- 작성자와 3줄로 접힌 원문을 표시하고, 펼친 text 영역만 scroll하며 기존 Post Action Bar는 panel 아래에 고정한다.
- Sensitive 공개 상태, 이미 승인된 Post 조회 결과와 Content revision 경계를 유지하고 loading·error·retry·lifecycle close를 정의한다.
- Modal close, keyboard arrow, Native swipe, Screen Reader 위치 안내와 focus 복귀를 플랫폼별로 지원한다.
- Media 파일 공유·다운로드·기기 저장, zoom·pan, route·deep link와 Media 전용 action은 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`
- Linear Contract: PROD-650
- Linear Implementations: PROD-650

## Capabilities

### New Capabilities

- `post-media-viewer`: 선택한 Post Media를 같은 Content revision과 Post action 맥락 안에서 반응형 modal로 탐색하는 동작을 정의한다.

### Modified Capabilities

- `post-media-display`: 일반 interactive gallery의 공개된 정상 tile을 viewer trigger로 바꾸되 Sensitive·error control과 비대화형 Reply 부모 preview의 경계를 유지한다.

## Impact

- App의 공용 Post surface, Media gallery·image renderer, modal·gesture·focus 처리와 Post Action Bar 조합이 영향받는다.
- Component test와 Storybook fixture에 viewer 상태·layout·탐색·오류·접근성 사례가 추가된다.
- GraphQL schema, 서버·DB, Media authorization, 저장소 URL 계약과 외부 dependency는 변경하지 않는다.
- 구현은 PROD-626의 `add-compact-post-media-gallery` 변경과 PR 위에 stack하며, 그 gallery 계약을 전제로 한다.
