# Post Content Link Preview

[Post Content](../domain/objects/post-content.md#link-preview)의 Link Preview는 발행된 본문 뒤에 표시하는 선택적 metadata 카드다. 이 문서는 카드의 presentation과 공용 consumer 범위를 정하며, 링크 후보·metadata·조회 정책은 domain 계약을 따른다.

## 카드 표현

- 카드는 본문을 대체하지 않고 본문 아래, 같은 Post content column 안에 표시한다.
- 제목은 카드의 필수 정보이며 설명과 이미지가 있을 때 함께 표시한다. 표시할 카드가 없으면 빈 영역이나 오류 placeholder를 만들지 않는다.
- Post 내부의 일반 Link Preview surface에는 [`background/surface`](./colors.md#component-usage-mapping)를 사용한다. 이를 modal·menu용 elevated card로 올리지 않으며, Quote Source preview의 별도 no-fill 표현은 유지한다.
- 외부 페이지를 화면 안에 iframe, embed 또는 별도 page content로 렌더링하지 않는다.

## 이미지 presentation

- 큰 이미지는 이미지 URL이 있고, 사전에 전달된 이미지 크기 정보의 너비와 높이가 모두 양의 정수이며, 너비가 600px 이상이고 너비/높이 비율이 1.5 이상일 때 사용한다. 카드는 이미지를 텍스트 위에 전체 너비로 표시하고, 이미지 영역은 16:9 비율이 유지되는 `cover` frame을 사용한다.
- 작은 이미지, 정사각형·세로 이미지, 크기 정보가 없거나 불완전·유효하지 않은 이미지는 기존 96×96 compact 배치를 유지한다. 이미지 URL이 없으면 기존 텍스트 카드로 표시한다.
- 크기 정보가 카드의 첫 표시 시점에 준비되어 있어야 한다. 이미지 로드 완료 뒤 크기나 배치를 다시 분류하지 않으며, 이미지가 로드되어도 카드 높이가 바뀌지 않게 한다.

## 상호작용

- 대화형 Post Content에서는 카드 전체가 본문 첫 링크와 같은 URL을 연다. 카드 입력은 부모 Post의 navigation을 함께 실행하지 않는다.
- 전체 Post preview가 `interactive=false`로 표시되는 Composer의 Reply Parent·Quote Source 등에서는 카드도 비대화형으로 유지한다. 카드만 별도 외부 링크 입력을 추가하지 않는다.

## Content Warning과 Media

- Link Preview는 본문과 같은 Content Warning 경계 안에 둔다. Warning이 본문을 가릴 때 카드도 함께 숨기고 기존 reveal 동작을 따른다.
- Post에 Media가 있으면 Link Preview 카드를 표시하지 않는다. 기존 Media 표시와 gallery 순서는 바꾸지 않는다.

## 공용 표시 범위

- Local·federated Post와 기존 발행 Post는 같은 카드 presentation을 사용한다.
- Local·Remote Post는 같은 링크 선택·metadata 표시 규칙을 따른다. 카드는 공용 Post Content 표시 안에서 렌더링하며 consumer별로 이미 정해진 compact·interactive 등 presentation variant는 유지한다.
- 타임라인·상세·알림 및 Composer에서 표시하는 발행된 Reply Parent·Quote Source도 같은 Link Preview 표시 결과를 사용한다.
- 미발행 Composer draft의 OG preview와 사용자가 Link Preview 표시를 숨기는 설정은 후속 범위다.
