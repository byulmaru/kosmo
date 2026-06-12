## 1. PostComposer 컴포넌트 경계

- [x] 1.1 `apps/web/src/lib/components/PostComposer.svelte`를 추가한다.
- [x] 1.2 `PostComposer.svelte`에 `PostComposer_profile` fragment를 선언하고 선택 프로필을 fragment ref prop으로 받는다.
- [x] 1.3 `PostComposer` 내부에서 `createFragment`로 `PostComposer_profile`을 읽고, 작성자 표시는 `PostAuthorProfile`에 위임한다.
- [x] 1.4 개별 scalar props로 `id`, `handle`, `displayName` 등을 복제하지 않는다.
- [x] 1.5 `PostComposer` Storybook story를 추가해 fragment mock 기반 기본 상태를 확인할 수 있게 한다.

## 2. TipTap 작성 UI

- [x] 2.1 `PostComposer` 본문 입력을 textarea placeholder가 아니라 TipTap editor surface로 구현한다.
- [x] 2.2 editor는 현재 서버가 허용하는 Document/Paragraph/Text 기반 TipTap `doc` JSON을 생성한다.
- [x] 2.3 editor의 Plain Text projection을 기준으로 빈 본문 제출 방지와 500자 초과 제출 방지를 클라이언트에서 처리한다.
- [x] 2.4 게시 버튼 바로 옆에 suffix 없이 남은 글자수 숫자만 표시하는 인디케이터를 추가한다.
- [x] 2.5 글자수 초과는 인디케이터 색상과 제출 버튼 비활성화 상태에 연결하고 빈 본문은 제출 버튼 비활성화만 적용한다.

## 3. 공개 설정과 제출 흐름

- [x] 3.1 `kosmo-old`를 참고해 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 공개 범위 옵션과 라벨/설명을 정의한다.
- [x] 3.2 공개 설정 UI는 editor 아래 하단 컨트롤 왼쪽에서 제출 버튼과 같은 줄에 현재 선택 값을 보여주는 Lucide 아이콘 포함 드롭다운 버튼과 옵션 목록으로 구현한다.
- [x] 3.3 공개 범위 기본값을 `UNLISTED`로 두고, 사용자가 선택한 값을 `createPost` mutation 입력에 연결한다.
- [x] 3.4 `PostComposer.svelte`에 `createPost` mutation을 colocate하고 `CreatePostSuccess` 분기를 처리한다.
- [x] 3.5 mutation 성공 후 완료 패널이나 경로 이동 없이 editor 본문, 공개 범위, 오류 상태를 초기화한다.
- [x] 3.6 mutation 제출 중 상태를 표시하고 중복 제출을 방지한다.
- [x] 3.7 mutation 실패를 작성 실패 메시지로 표시하고 사용자가 editor 내용을 유지한 채 다시 제출할 수 있게 한다.

## 4. 컴포넌트 상태 검증

- [x] 4.1 `PostComposer` Storybook story에 글자수 초과와 실패 상호작용 상태를 추가한다.
- [x] 4.2 Mearie/Svelte 타입 생성 또는 동기화가 필요한 경우 실행해 GraphQL operation 타입을 최신화한다.
- [x] 4.3 `pnpm --filter @kosmo/web check`로 Svelte 타입 검증을 통과시킨다.

## 5. 첫 사용처 연결

- [x] 5.1 `/compose/+page.svelte`에 현재 세션과 선택 프로필을 조회하는 GraphQL query를 colocate하고 `selectedProfile { ...PostComposer_profile }` fragment spread를 포함한다.
- [x] 5.2 `/compose` route는 세션 로딩, 인증 없음, 선택 프로필 없음 상태를 처리하고, 선택 프로필이 있을 때만 `{#if}` 분기로 `PostComposer`에 fragment ref를 전달한다.
- [x] 5.3 선택 프로필이 없으면 `/compose` route는 `PostComposer`를 렌더링하지 않고 route-level 안내 상태만 표시한다.
- [x] 5.4 `/compose` route에는 editor, 공개 범위, 글자수, mutation 제출 로직을 두지 않는다.
- [x] 5.5 로컬 웹 앱에서 `/compose`가 `PostComposer`의 첫 integration surface로 정상 렌더링되는지 확인한다.
