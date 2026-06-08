## Why

현재 웹 앱에는 게시글을 작성하는 재사용 가능한 컴포넌트가 없다. `PROD-92`에서 게시글 작성 GraphQL mutation과 TipTap 문서 저장 계약이 준비되었으므로, 이번 변경은 선택 프로필 정보를 fragment로 받아 TipTap 기반 게시글 작성 UI와 제출 흐름을 소유하는 새 글 작성 컴포넌트를 추가한다.

## What Changes

- `apps/web/src/lib/components`에 fragment 기반 새 글 작성 컴포넌트를 추가한다.
- 새 글 작성 컴포넌트는 필요한 작성자 프로필 정보를 GraphQL fragment ref로 받고, 프로필 표시는 기존 `PostAuthorProfile` 컴포넌트에 위임한다.
- 작성 본문은 TipTap editor를 통해 입력하고, editor의 TipTap `doc` JSON을 `createPost` mutation에 전달한다.
- 작성 컴포넌트는 공개 설정을 선택하는 아이콘 포함 드롭다운 버튼을 제공한다.
- 작성 컴포넌트는 editor의 Plain Text projection 기준 남은 글자수 숫자만 게시 버튼 바로 옆에 표시한다.
- `kosmo-old`의 작성 화면을 참고해 게시글 공개 범위 선택을 제공한다.
- 선택된 프로필이 없으면 사용처에서 새 글 작성 컴포넌트를 렌더링하지 않고, 빈 본문 제출 방지, 500자 초과 form validation, mutation 실패는 컴포넌트에서 처리한다.
- 작성 중에는 제출 중 상태와 중복 제출 방지를 제공한다.
- 작성 성공 후에는 별도 완료 패널이나 경로 이동 없이 editor 본문과 공개 범위를 기본값으로 초기화한다.
- `/compose` 탭은 이 컴포넌트를 붙이는 첫 사용처로만 얇게 연결한다.
- 이미지, 첨부, 리치 텍스트 toolbar/mark, 인용, 리포스트, 게시글 상세/목록 API 구현은 이번 범위에서 제외한다.

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `post`: 웹 클라이언트의 TipTap 기반 새 글 작성 컴포넌트, 공개 범위 드롭다운 선택, 글자수 인디케이터, 선택 프로필 기반 작성 흐름, 제출/실패 상태와 성공 후 editor 및 공개 범위 초기화 요구사항을 추가한다.

## Impact

- `apps/web/src/lib/components`: fragment 기반 새 글 작성 컴포넌트, `PostAuthorProfile` 기반 작성자 표시, TipTap editor surface, Lucide 아이콘을 포함한 공개 설정 드롭다운 버튼, 글자수 인디케이터, GraphQL `createPost` mutation 사용, 제출/오류 UI, 성공 후 editor 및 공개 범위 초기화, 기존 `Button` 등 폼 컴포넌트 재사용 또는 필요한 최소 조정.
- `apps/web/package.json`: 공개 설정 아이콘 표시를 위해 `@lucide/svelte` dependency를 추가한다.
- `apps/web`: `/compose`는 선택 프로필 query와 새 글 작성 컴포넌트 렌더링만 담당하는 첫 integration surface로 사용한다.
- `apps/api/schema.graphql`: `PROD-92`에서 추가된 `createPost`, `Post`, `PostContent`, `PostVisibility`, `TipTapDocument` 계약을 클라이언트에서 사용한다.
- `openspec`: `post` delta spec, 설계 문서, 구현 task 추가.
