## Context

`PROD-92` 브랜치에는 `createPost(input: CreatePostInput!): CreatePostResult!` GraphQL mutation, `Post`/`PostContent` object, `PostVisibility` enum, `TipTapDocument` scalar가 추가되어 있다. 성공 payload는 `CreatePostSuccess { post }`이다. 웹 앱에는 아직 이 API를 사용하는 재사용 가능한 게시글 작성 컴포넌트가 없다.

웹 클라이언트는 Mearie/Svelte GraphQL client를 사용하며, 최신 main의 프론트엔드 규칙은 GraphQL query, mutation, fragment document를 실제로 사용하는 `.svelte` 파일에 colocate하고, 하위 컴포넌트가 데이터를 소비하면 fragment spread로 연결하도록 요구한다. 따라서 새 글 작성 컴포넌트는 작성에 필요한 프로필 정보를 자체 fragment로 선언해 fragment ref로 받아야 한다. 이 컴포넌트를 붙이는 사용처는 선택 프로필 query에서 해당 fragment를 spread해 전달한다.

`@kosmo/core/tiptap`에는 서버가 허용하는 TipTap `doc` subset을 검증하고 Plain Text projection을 추출하는 helper가 있다. 이번 변경의 입력 UI는 textarea가 아니라 TipTap editor여야 한다. 다만 이번 범위는 Plain Text 게시글 작성이므로 editor는 Document/Paragraph/Text 기반 본문 입력에 한정하고, rich text toolbar, mark, image, mention parsing은 후속 범위로 둔다.

기존 `byulmaru/kosmo-old` 작성 화면은 공개 범위 selector를 제공했다. 옵션은 `PUBLIC`, `UNLISTED`, `FOLLOWER`, `DIRECT` 순서였고, 한국어 라벨은 각각 “공개”, “조용한 공개”, “팔로워만”, “언급한 계정만”이었다. 현재 새 enum은 `FOLLOWER` 대신 `FOLLOWERS`를 사용하므로 같은 의미를 `FOLLOWERS`로 매핑한다. `kosmo-old`는 프로필 기본 공개 범위가 없을 때 `UNLISTED`를 fallback으로 사용했다.

## Goals / Non-Goals

**Goals:**

- `apps/web/src/lib/components`에 fragment 기반 새 글 작성 컴포넌트를 추가한다.
- 새 글 작성 컴포넌트는 TipTap editor, Lucide 아이콘을 포함한 공개 설정 드롭다운 버튼, 남은 글자수 숫자 인디케이터, 제출 버튼을 포함한다.
- 새 글 작성 컴포넌트는 작성자 프로필 정보를 `PostComposer_profile` fragment ref로 받고, 표시 UI는 기존 `PostAuthorProfile` 컴포넌트를 재사용한다.
- 게시글 공개 범위 dropdown selector를 제공하고 선택한 `PostVisibility` 값을 mutation에 전달한다.
- editor의 Plain Text projection 기준으로 빈 본문 제출 방지와 500자 초과 본문 검증을 클라이언트에서 먼저 수행한다.
- TipTap editor의 `doc` JSON을 `createPost` mutation으로 제출한다.
- 제출 중과 실패 상태를 컴포넌트에서 확인할 수 있게 한다.
- 성공 후에는 별도 완료 패널이나 경로 이동 없이 editor 본문, 공개 범위, validation/error 상태를 초기화한다.
- `/compose` route는 첫 사용처로서 현재 세션의 선택 프로필을 조회하고, 선택 프로필이 있을 때만 새 글 작성 컴포넌트가 선언한 fragment를 spread해 전달한다.

**Non-Goals:**

- 게시글 상세 페이지, 피드 목록, timeline pagination 구현.
- `createPost` API 계약 변경 또는 서버 검증 정책 변경.
- 리치 텍스트 toolbar, mark, image, mention parsing, 첨부, 인용, 리포스트, 공개 범위별 세부 authorization 정책.
- 작성 중 임시 저장, 자동 저장, offline queue.

## Decisions

1. 새 글 작성 컴포넌트가 작성 UI와 제출 mutation을 소유한다.

   컴포넌트는 TipTap editor 상태, 공개 설정 선택, 남은 글자수 숫자 인디케이터, submit loading/error 상태와 성공 후 초기화를 한 경계 안에서 관리한다. `createPost` mutation도 실제 제출 동작을 소유하는 컴포넌트에 colocate한다. 사용처는 fragment ref를 넘기고 주변 layout/auth 상태만 처리한다.

2. 새 글 작성 컴포넌트는 필요한 프로필 정보를 fragment ref로 받는다.

   작성 컴포넌트는 `PostComposer_profile` fragment를 선언하고, 해당 fragment에서 `PostAuthorProfile_profile`을 spread한다. 부모 route나 다른 사용처는 `selectedProfile { ...PostComposer_profile }`처럼 fragment를 spread해 넘긴다. `PostComposer`는 Mearie가 생성한 `PostComposer_profile$key` 타입을 prop으로 받고, `createFragment`로 `PostComposer_profile`을 읽은 뒤 프로필 표시를 `PostAuthorProfile`에 위임한다. 개별 scalar props로 `id`, `handle`, `displayName` 등을 복제하지 않는다.

3. 입력 source of truth는 TipTap editor이다.

   `TextArea`를 본문 입력의 주 UI로 사용하지 않는다. TipTap editor는 현재 서버가 허용하는 Document/Paragraph/Text subset을 생성해야 하며, 제출 시 editor의 TipTap `doc` JSON을 `createPost.input.content`에 전달한다. 글자수 검증과 인디케이터는 editor 문서에서 얻은 Plain Text projection을 기준으로 한다.

4. 기본 본문 제출 방지와 길이 검증은 클라이언트와 서버에서 모두 수행한다.

   컴포넌트는 `kosmo-old`의 `form.svelte.ts` 흐름을 참고해 zod schema `safeParse`, form data parsing, input별 `setCustomValidity`, submit 시 `reportValidity`를 사용한다. TipTap editor는 native input이 아니므로 본문 Plain Text projection을 body proxy input에 동기화해 form validation에 참여시킨다. 빈 본문일 때는 제출 버튼을 비활성화하고 별도 오류 메시지를 표시하지 않는다. 500자 초과는 body custom validity와 오류 상태로 표시해 불필요한 mutation 호출을 줄인다. 서버 검증은 source of truth로 유지되므로 클라이언트 검증을 우회한 요청도 `createPost`에서 거부된다. 서버 오류 메시지는 사용자가 이해할 수 있는 작성 실패 상태로 표시한다.

5. 공개 범위 selector는 드롭다운 버튼으로 구현한다.

   사용자는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 중 하나를 선택할 수 있어야 한다. 라벨과 설명은 `kosmo-old`의 한국어 문구를 따르되, old의 `FOLLOWER` enum 이름은 현재 API의 `FOLLOWERS`로 매핑한다. 기본 surface에는 현재 선택된 공개 범위의 Lucide 아이콘과 라벨이 버튼으로 보이고, 버튼을 열면 옵션 목록이 나타난다. Lucide import 이름은 반드시 `Icon` suffix를 사용하며, `PUBLIC`은 `GlobeIcon`, `UNLISTED`는 `MoonIcon`, `FOLLOWERS`는 `LockIcon`, `DIRECT`는 `AtSignIcon` 아이콘을 사용한다. 공개 범위 선택은 별도 route나 modal보다 작성 폼 내부의 compact dropdown으로 둔다. 드롭다운은 작성자 헤더가 아니라 TipTap editor surface 아래 하단 컨트롤 줄의 왼쪽에 배치하고, 게시 버튼은 같은 줄의 오른쪽에 배치한다. 같은 줄 왼쪽에는 후속 이미지 등 도구 아이콘을 추가할 수 있는 구조를 둔다.

6. 기본 공개 범위는 `UNLISTED`로 둔다.

   현재 새 API의 `Profile`에는 `kosmo-old`의 `config.defaultPostVisibility`에 해당하는 필드가 없다. 따라서 이번 구현에서는 `kosmo-old`의 fallback과 동일하게 초기 선택을 `UNLISTED`로 둔다. 프로필별 기본 공개 범위가 후속 API로 추가되면 `PostComposer_profile` fragment에 해당 값을 추가해 초기 선택에 반영할 수 있다.

7. 남은 글자수 숫자 인디케이터는 게시 버튼 바로 옆에 항상 표시한다.

   인디케이터는 현재/최대 형식이 아니라 Plain Text projection 기준 남은 글자수를 숫자만으로 보여준다. “자 남음”, “자 초과” 같은 suffix는 표시하지 않는다. 500자를 초과하면 음수 숫자를 오류 색상으로 표시하고 제출 비활성화 상태로 연결한다. 공백만 있는 본문은 글자수가 0이 아니어도 제출 불가로 처리하되, 빈 본문 오류 메시지는 표시하지 않는다.

8. 성공 후에는 작성 폼을 초기화한다.

   `createPost`가 `CreatePostSuccess`로 완료되면 별도 완료 패널, 생성 결과 요약, 상세 route 이동 없이 editor 본문, 공개 범위 선택, validation/error 상태를 초기화한다. 공개 범위 선택은 기본값인 `UNLISTED`로 되돌리며, 이번 범위에서는 생성된 게시글의 `id`, 작성자, 현재 콘텐츠, 생성 시각을 화면 표시 목적으로 조회하지 않는다.

9. `/compose`는 첫 사용처일 뿐 작성 로직의 소유자가 아니다.

`/compose` route는 현재 세션의 선택 프로필을 조회하고, 선택 프로필이 있을 때만 `{#if selectedProfile}` 분기로 `PostComposer_profile` fragment ref를 컴포넌트에 넘긴다. 선택 프로필이 없으면 `PostComposer`를 렌더링하지 않고 route-level 안내 상태를 표시한다. editor, 공개 범위, 글자수, mutation 제출 로직은 `PostComposer`에 둔다.

## Risks / Trade-offs

- [Risk] `createPost`의 성공 결과는 `CreatePostSuccess { post }` union payload이지만, 인증 scope와 validation 실패는 GraphQL client 오류로 전달될 수 있다. → [Mitigation] 웹 mutation 호출은 `CreatePostSuccess` 분기와 예외/GraphQL client 오류를 모두 처리하고, 성공 시에는 editor reset만 수행한다.
- [Risk] `DIRECT` 라벨은 언급 기능을 전제로 하지만 이번 변경은 mention UX를 구현하지 않는다. → [Mitigation] 이번 변경은 API enum 선택과 전달만 다루고, mention parsing 또는 수신자 안내는 후속 요구사항에서 다룬다.
- [Risk] 웹 앱에 TipTap editor 또는 Lucide icon 런타임 의존성이 아직 직접 설치되어 있지 않을 수 있다. → [Mitigation] 구현 시 필요한 웹 TipTap/Lucide 패키지는 `pnpm` dependency command로 추가하고, editor output이 서버의 Document/Paragraph/Text subset과 맞는지 검증한다.
