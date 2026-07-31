## Why

Web 게시글 Action Bar는 아이콘만 보여 포인터 사용자가 상호작용 가능 여부를 파악하기 어렵다. PROD-595는
기존 action 기능과 click target geometry를 유지하면서 hover 시 glyph 중심의 원형 affordance를 추가한다.

## What Changes

- Web의 비터치 pointer hover 시 각 Post Action control의 16×16 glyph 중심에 28×28 원형 background를 표시한다.
- Reply·Repost·Bookmark·More는 semantic `surface`를 사용한다. Reaction은 semantic `like`를 30% opacity의
  background로 사용하고 hover foreground에는 불투명 `like`를 사용한다.
- selected Reaction heart의 stroke와 fill은 hover 여부와 관계없이 `like`를 사용한다.
- active·pressed 표현을 유지하고 pending·disabled·resolution-required에는 hover background를 표시하지 않는다.
- Web touch와 Native에는 hover 전용 background를 노출하지 않는다.
- action 기능·count·mutation·target 크기와 Action Bar 배치는 변경하지 않는다.
- 다른 action의 semantic tint 확장은 후속 범위로 남긴다.

## Authority / Provenance

- Canonical: `docs/design/post-action-bar.md`
- Linear Contract: [PROD-595](https://linear.app/byulmaru/issue/PROD-595/web-%EA%B2%8C%EC%8B%9C%EA%B8%80-%EC%95%A1%EC%85%98-%EB%B2%84%ED%8A%BC%EC%9D%98-hover-%ED%81%B4%EB%A6%AD-%EC%98%81%EC%97%AD%EC%9D%84-%EC%8B%9C%EA%B0%81%ED%99%94%ED%95%9C%EB%8B%A4)
- Linear Implementations: PROD-595

## Capabilities

### New Capabilities

- `post-action-hover-target`: Web Post Action control의 실제 target hover 표현과 기존 상태·플랫폼 경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- Universal client: 공통 `PostActionControl`의 Web pointer 상태, icon visual layer와 Reaction theme style
- State catalog: Post Action Bar Storybook의 hover·blocked·geometry 검증
- Canonical design: `docs/design/post-action-bar.md`의 Web hover target 규칙
- Dependency: PROD-595는 최신 공통 Action Bar 통합을 소유한 PROD-432 위에 stack하며 PROD-432 merge 뒤 전달한다.
- API·GraphQL·mutation·새 runtime dependency 영향 없음
