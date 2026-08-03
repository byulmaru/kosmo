## Why

현재 Post 목록과 상세는 최대 4개의 첨부 이미지를 각각 전체 폭으로 세로 나열해, 여러 이미지가 있는 Post가 타임라인을 과도하게 점유하고 이미지 묶음의 순서와 관계를 한눈에 파악하기 어렵다. PROD-626은 기존 Media 조회·가림·오류 계약을 유지하면서 이미지 개수에 맞는 compact 분할 갤러리로 이 임시 배치를 교체한다.

## What Changes

- Post 목록과 상세의 공용 Media renderer가 첨부 이미지 1~4장을 개수별 surface 비율과 분할 배치로 표시한다.
- 1장은 기존 원본 비율 규칙을 유지하고, 2장은 token gap·외곽 border를 제외한 이미지 영역 2:1의 정사각 2열, 3장은 4:3의 첫 이미지+오른쪽 2분할, 4장은 1:1의 2×2 배치를 사용한다.
- 다중 이미지 tile은 document 순서를 유지하고 공용 theme token의 간격·외곽선·radius 안에서 `cover`로 표시한다.
- Sensitive Media 가림 상태는 1장은 1:1, 2장은 정사각 tile에서 계산한 높이, 3장은 4:3, 4장은 1:1 surface를 예약한다.
- 이미지 tile 자체는 이번 변경에서 새 navigation control이 되지 않는다. 일반 목록·상세에서는 기존 공개·다시 가리기와 오류 재시도 control을 유지하고, 비대화형 Reply Composer 부모 preview는 같은 gallery 배치를 사용하되 기존처럼 Sensitive 이미지를 가린 채 내부 control을 표시하지 않는다.
- 개수별 배치와 접근성 결정을 `docs/design`에 기록하고 Web·Android·iOS 자동화와 runtime 증거를 구분한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`
- Linear Contract: PROD-626
- Linear Implementations: PROD-626. PROD-571은 완료된 선행 구현이며 PROD-650은 이 변경이 막고 있는 후속 viewer 구현이다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post-media-display`: 기존 최대 4개 Media의 세로 나열 surface 계약을 이미지 개수별 compact 분할 갤러리 계약으로 변경한다.

## Impact

- `apps/app`의 공용 Post Media gallery/image presentation과 직접 component test·Storybook fixture가 영향을 받는다.
- Post 목록과 Post 상세은 같은 공용 renderer를 계속 사용하며 Home·Profile·상세별 별도 배치를 추가하지 않는다.
- `docs/design`에 Post Media gallery의 durable layout·접근성 결정을 추가한다.
- GraphQL, Relay fragment, Media URL·authorization, DB, ActivityPub, 새 dependency에는 변화가 없다.
