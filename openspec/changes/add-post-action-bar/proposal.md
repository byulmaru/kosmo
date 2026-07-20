## Why

Reply·Repost·Reaction·Bookmark를 실제 게시글 화면에 일관되게 연결하려면 Android·iOS·Web이 공유하는 Action Bar 표시 계약이 먼저 필요하다. 현재 저장소에는 이 액션들의 고정 배치, 처리 상태, 접근성 및 반응형 표현을 독립적으로 검증할 공통 React Native 컴포넌트 계약이 없다.

## What Changes

- 고정 순서 Reply → Repost → Reaction → Bookmark → More를 표시하는 공통 `PostActionBar`를 추가한다.
- 액션별 선택 상태와 처리 상태(default·pending·disabled·error), 선택적 count, callback 및 접근성 metadata 계약을 정의한다.
- compact·mobile·web 폭에서 같은 액션 순서와 최소 44×44 interactive target을 유지한다.
- More는 표시와 callback만 제공하며 메뉴와 링크 복사 같은 실제 동작은 후속 범위로 남긴다.
- 공통 컴포넌트, production Post surface 배치, 실제 action 데이터 연결과 최종 통합 검증을 각각 PROD-433, PROD-434, PROD-432가 소유하도록 공유 구현 순서를 정의한다.
- Figma Action 노드는 현재 시각 표현을 확인하는 참고 자료로만 사용하고 수정하지 않는다. Figma에 없는 상태와 접근성 동작은 Linear와 이 OpenSpec을 따른다.

## Capabilities

### New Capabilities

- `post-action-bar`: 게시글 액션의 고정 배치, 상태 표현, 입력·접근성 계약과 production surface 통합 경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- 계약 부모: [PROD-432](https://linear.app/byulmaru/issue/PROD-432/post-action-bar%EB%A5%BC-%EA%B5%AC%ED%98%84%EB%90%9C-post-%EC%95%A1%EC%85%98%EC%97%90-%EC%97%B0%EA%B2%B0%ED%95%98%EA%B3%A0-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%9C%EB%8B%A4)
- 구현 자식: [PROD-433](https://linear.app/byulmaru/issue/PROD-433/post-action-bar-ui-%EC%BB%B4%ED%8F%AC%EB%84%8C%ED%8A%B8%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4), [PROD-434](https://linear.app/byulmaru/issue/PROD-434/post-action-bar%EB%A5%BC-%EA%B2%8C%EC%8B%9C%EA%B8%80-%EB%AA%A9%EB%A1%9D%EC%83%81%EC%84%B8-surface%EC%97%90-%EB%B0%B0%EC%B9%98%ED%95%9C%EB%8B%A4)
- 예상 코드 영역: `apps/app/src/components/post`, `apps/app/src/stories`, 게시글 목록·상세 surface와 관련 Relay fragment
- 기존 theme token과 `lucide-react-native`를 재사용하며 새 runtime dependency는 추가하지 않는다.
- Reply·Repost·Reaction·Bookmark의 저장소·GraphQL mutation·권한·Post Kind 정책은 각 선행 이슈의 기존 계약을 소비하며 이 change에서 재정의하지 않는다.
- 시각 참고: [KOSMO Action 컴포넌트](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005)
