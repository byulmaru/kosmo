## Why

게시글 목록 화면과 게시글 상세 페이지에서 작성자 프로필 영역이 반복해서 필요하다. 타임라인, 프로필 게시글 목록, 더보기로 진입하는 상세 페이지가 같은 작성자 UI를 재사용할 수 있도록 공통 컴포넌트 계약을 먼저 만든다.

## What Changes

- 게시글 작성자 프로필 표시 컴포넌트를 추가한다.
- 작성자 표시 이름, 핸들, 프로필 이미지와 이미지 없음 fallback을 렌더링한다.
- 긴 표시 이름과 핸들이 목록/상세 레이아웃을 깨지 않도록 처리한다.
- 작성자 프로필 링크가 제공되면 프로필 페이지로 이동 가능한 형태로 렌더링한다.
- 특정 게시글 목록 라우트나 상세 라우트 구현에는 의존하지 않는다.

## Capabilities

### New Capabilities

- `web-post`: 웹 앱에서 게시글 관련 UI가 공유해야 하는 작성자 프로필 표시 계약을 다룬다.

### Modified Capabilities

없음.

## Impact

- `apps/web/src/lib/components`에 게시글 작성자 프로필 표시 컴포넌트와 Storybook story가 추가된다.
- `apps/web/src/lib/index.ts`에서 새 컴포넌트를 export한다.
- API schema, 데이터 모델, 라우팅, 의존성은 변경하지 않는다.
