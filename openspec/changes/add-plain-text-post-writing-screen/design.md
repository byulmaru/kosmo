## Context

`PROD-92` 브랜치에는 `createPost(input: { content, visibility }): CreatePostResult!` GraphQL mutation, `Post`/`PostContent` object, `PostVisibility` enum, `TipTapDocument` scalar가 추가되어 있다. 성공 payload는 `CreatePostSuccess { post }`이며, 웹 앱에는 `/compose` 탭과 하단 탭 navigation은 있지만 현재는 안내 문구만 표시한다.

웹 클라이언트는 Mearie/Svelte GraphQL client를 사용하며, `SidebarNavigation`에서 `createQuery`/`createMutation` 패턴으로 현재 세션의 선택 프로필과 계정 프로필 목록을 이미 조회한다. 최신 main의 프론트엔드 규칙은 GraphQL query, mutation, fragment document를 실제로 사용하는 `.svelte` 파일에 colocate하고, 하위 컴포넌트가 데이터를 소비하면 fragment spread로 연결하도록 요구한다. 작성 UI는 TipTap editor를 사용하고, 제출 시 editor가 가진 TipTap `doc` JSON을 `createPost` mutation의 `content` 입력에 그대로 전달한다.

최신 main에는 게시글 작성자 표시용 `PostAuthorProfile` 컴포넌트가 추가되어 있고, 이 컴포넌트는 `Profile` fragment ref를 props로 받는다. 새 글 작성 컴포넌트가 선택 프로필을 표시할 때는 별도 one-off author UI를 만들기보다 이 컴포넌트를 재사용하고, 부모 query document 안에서 해당 fragment를 spread한다.

기존 `byulmaru/kosmo-old` 작성 화면은 공개 범위 selector를 제공했다. 옵션은 `PUBLIC`, `UNLISTED`, `FOLLOWER`, `DIRECT` 순서였고, 한국어 라벨은 각각 “공개”, “조용한 공개”, “팔로워만”, “언급한 계정만”이었다. 현재 새 enum은 `FOLLOWER` 대신 `FOLLOWERS`를 사용하므로 같은 의미를 `FOLLOWERS`로 매핑한다. `kosmo-old`는 프로필 기본 공개 범위가 없을 때 `UNLISTED`를 fallback으로 사용했다.

## Goals / Non-Goals

**Goals:**

- 로그인한 사용자가 선택된 프로필로 게시글을 작성할 수 있는 TipTap 기반 작성 컴포넌트를 구현한다.
- `/compose`는 현재 세션의 선택 프로필을 조회하고, 선택 프로필이 없으면 작성 컴포넌트를 렌더링하지 않는다.
- 게시글 공개 범위 selector를 제공하고 선택한 `PostVisibility` 값을 mutation에 전달한다.
- 공백을 trim한 본문이 비어 있거나 500자를 초과하면 제출 버튼을 비활성화한다.
- TipTap editor의 `doc` JSON을 그대로 사용해 `createPost` mutation을 호출한다.
- 제출 중과 실패 상태를 화면에서 확인할 수 있게 한다.
- 성공 후 별도 완료 패널이나 경로 이동 없이 editor 본문과 공개 범위를 초기화한다.

**Non-Goals:**

- 게시글 상세 페이지, 피드 목록, timeline pagination 구현.
- `createPost` API 계약 변경 또는 서버 검증 정책 변경.
- 이미지/첨부, 인용, 리포스트, 공개 범위별 세부 authorization 정책.
- 작성 중 임시 저장, 자동 저장, offline queue.

## Decisions

1. 작성 페이지에서 `currentSession.selectedProfile`을 직접 조회한다.

   사이드바가 같은 정보를 이미 조회하지만, 작성 가능 여부는 `/compose` 페이지의 핵심 상태이다. 페이지가 독립적으로 현재 선택 프로필을 조회하면 모바일 drawer가 열리지 않은 상태에서도 빈 프로필/로딩/오류 상태를 명확히 렌더링할 수 있다. 대안으로 사이드바 상태를 전역 store로 공유할 수 있지만, 현재 앱에는 그런 전역 session store가 없고 이 변경의 범위를 키운다.

2. 작성 본문은 TipTap editor 문서를 source of truth로 둔다.

   서버는 TipTap `Document`/`Paragraph`/`Text` subset을 검증한다. 클라이언트도 TipTap editor에서 생성된 `doc` JSON을 그대로 제출하면 브라우저에서 보이는 문서 구조와 API 저장 입력이 일치한다. 별도의 문자열 projection을 만들고 다시 TipTap JSON으로 변환하는 방식은 editor와 저장 입력 사이의 drift를 만들 수 있으므로 사용하지 않는다.

3. 기본 본문 검증은 클라이언트와 서버에서 모두 수행한다.

   웹 화면은 trim 기준 빈 본문과 500자 초과에서 제출 버튼을 비활성화해 불필요한 mutation 호출을 줄인다. 빈 본문은 별도 오류 메시지를 표시하지 않고 비활성화 상태만 제공한다. 서버 검증은 source of truth로 유지되므로 클라이언트 검증을 우회한 요청도 `createPost`에서 거부된다. 서버 오류 메시지는 사용자가 이해할 수 있는 작성 실패 상태로 표시한다.

4. 공개 범위 selector는 `kosmo-old`의 옵션과 라벨을 새 enum에 맞춰 제공한다.

   사용자는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 중 하나를 선택할 수 있어야 한다. 라벨과 설명은 `kosmo-old`의 한국어 문구를 따르되, old의 `FOLLOWER` enum 이름은 현재 API의 `FOLLOWERS`로 매핑한다. 공개 범위 선택은 별도 route나 modal보다 작성 폼 내부의 compact selector로 둔다. 대안으로 `PUBLIC`을 고정할 수 있지만, 기존 제품 흐름과 사용자의 명시 요구사항을 충족하지 못한다.

5. 기본 공개 범위는 `UNLISTED`로 둔다.

   현재 새 API의 `Profile`에는 `kosmo-old`의 `config.defaultPostVisibility`에 해당하는 필드가 없다. 따라서 이번 구현에서는 `kosmo-old`의 fallback과 동일하게 초기 선택을 `UNLISTED`로 둔다. 프로필별 기본 공개 범위가 후속 API로 추가되면 `/compose` query에서 해당 값을 받아 초기 선택에 반영할 수 있다.

6. 작성 성공 후에는 폼만 초기화한다.

   현재 범위에는 게시글 상세 route나 피드 갱신 흐름이 없다. 따라서 mutation 성공은 editor 본문을 비우고 공개 범위를 기본값인 `UNLISTED`로 되돌리는 것으로 처리한다. 별도 성공 패널을 만들거나 생성된 게시글 경로로 이동하지 않는다.

7. GraphQL document는 실제 사용하는 component에 colocate한다.

   최신 main의 `memory/frontend-svelte.md`는 GraphQL operation을 실제 사용하는 Svelte 파일에 두고, GraphQL 데이터를 소비하는 컴포넌트는 fragment ref를 받도록 정한다. 따라서 `/compose/+page.svelte`는 현재 세션 query를 colocate하고, 새 글 작성 컴포넌트는 선택 프로필 fragment와 `createPost` mutation을 colocate한다. 작성자 표시는 `PostAuthorProfile`을 재사용하고, 부모 query selection에 `PostAuthorProfile_profile` fragment spread를 포함한다. 별도 `.ts` GraphQL document 파일이나 수동 author props 복제는 만들지 않는다.

## Risks / Trade-offs

- [Risk] `createPost`의 성공 결과는 `CreatePostSuccess { post }` union payload이지만, 인증 scope와 validation 실패는 GraphQL client 오류로 전달될 수 있다. → [Mitigation] 웹 mutation 호출은 `CreatePostSuccess` 분기와 예외/GraphQL client 오류를 모두 처리해 작성 실패 메시지로 매핑한다.
- [Risk] 성공 후 생성된 게시글을 즉시 확인하는 화면이 없다. → [Mitigation] 이번 변경은 작성 컴포넌트와 mutation 제출에 집중하고, 상세 route나 피드 갱신은 후속 게시글 표시 흐름에서 다룬다.
- [Risk] `DIRECT` 라벨은 언급 기능을 전제로 하지만 이번 변경은 mention UX를 구현하지 않는다. → [Mitigation] 이번 변경은 API enum 선택과 전달만 다루고, mention parsing 또는 수신자 안내는 후속 요구사항에서 다룬다.
