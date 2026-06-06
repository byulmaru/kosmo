## Context

현재 DB 모델에는 `post`와 `post_content` 테이블이 있고, `post.current_content_id`로 최신 본문을 가리키는 구조가 준비되어 있다. GraphQL API에는 아직 게시글 타입과 작성 mutation이 없으며, 이번 Linear PROD-92 범위는 Plain Text 게시글 작성이다.

사용자 경험은 Plain Text 글쓰기에서 시작하지만 API 입력과 저장 포맷은 향후 리치 텍스트 편집으로 확장 가능한 TipTap 문서 JSON을 기준으로 둔다. 따라서 클라이언트는 Plain Text를 TipTap `doc` 형태로 감싸서 보내고, 서버는 저장 계층에 Plain Text projection과 TipTap JSON 원본을 함께 가진다.

## Goals / Non-Goals

**Goals:**

- `createPost(input: { content, visibility })` GraphQL mutation을 추가하고 `content`는 TipTap 문서 JSON scalar, `visibility`는 `PostVisibility` enum으로 받는다.
- 작성 actor는 현재 로그인 세션의 active profile로 결정한다.
- 새 게시글은 `ACTIVE` 상태와 입력받은 공개 범위로 생성한다.
- `post`와 `post_content`를 한 transaction에서 생성하고 `post.current_content_id`를 연결한다.
- TipTap 문서를 검증하고 Plain Text projection을 추출한 뒤 `body_text`와 TipTap JSON `body_json`으로 저장한다.
- GraphQL에 최소 `Post`, `PostContent`, `TipTapDocument`, `PostState`, `PostVisibility`를 노출한다.

**Non-Goals:**

- 게시글 목록/상세 query, timeline pagination.
- 이미지/첨부, TipTap 확장 mark/node 입력, spoiler 입력.
- 인용, 리포스트, 답글/thread 모델.
- 공개 범위 선택 UI.

## Decisions

1. 입력은 TipTap 문서 JSON을 custom scalar로 받는다.

   GraphQL nested input type으로 TipTap node tree를 모두 모델링하면 TipTap 확장마다 schema 변경이 필요하다. 이번 변경에서는 `TipTapDocument` custom scalar를 두고 서버에서 허용 subset을 검증한다. 공개 범위는 `PostVisibility` enum 입력으로 받는다. spoiler, attachment 같은 옵션은 이후 별도 요구사항에서 추가한다.

2. 저장은 `body_text` projection과 `body_json` TipTap 문서를 함께 사용한다.

   `body_text`는 검색, 알림 preview, plain fallback에 유용한 projection이다. `body_json`은 향후 리치 텍스트 편집과 federation 변환의 기준 데이터가 된다. 이번 변경에서 허용하는 입력 subset은 TipTap `Document`, `Paragraph`, `Text` extension으로 구성한 schema를 따른다.

3. TipTap JSON은 `TipTapDocument` scalar로 입력과 출력 모두에 사용한다.

   작성 mutation의 `content` 입력과 `PostContent.bodyJson` 출력은 같은 scalar를 사용한다. 클라이언트는 저장된 문서 원본을 그대로 다시 렌더링하거나 편집 초기값으로 사용할 수 있다. 다만 이번 변경에서 허용하는 문서 subset은 TipTap 기본 `doc`/`paragraph`/`text` extension으로 제한한다. 저장된 HTML projection은 GraphQL 필드로 노출하지 않는다.

4. TipTap 타입과 schema는 게시글 도메인 파일이 아니라 `@kosmo/core/tiptap`에서 제공한다.

   `@kosmo/core/tiptap`은 `@tiptap/core`의 `getSchema`와 TipTap 기본 node extension으로 schema를 만들고, TipTap JSON validation과 Plain Text projection helper를 제공한다. 게시글 본문 필수 여부와 최대 길이 같은 정책만 `@kosmo/core/validation`의 게시글 validation에 둔다.

5. actor는 active profile scope가 보장한 `ctx.session.profileId`를 사용한다.

   GraphQL auth scope는 `usingProfile`을 사용해 로그인과 active profile 존재를 함께 보장한다. `deriveContext`는 `session.activeProfileId`가 현재 계정에 연결된 활성 프로필일 때만 `ctx.session.profileId`로 채운다. 따라서 resolver에서는 추가 `Profiles`/`AccountProfiles` 조회 없이 `ctx.session.profileId`를 작성자 프로필 ID로 사용한다.

6. `Post`와 `PostContent`는 Node 타입으로 등록한다.

   기존 GraphQL 스타일은 DB row 기반 object를 `createObjectRef` loadable Node ref로 정의한다. 게시글도 같은 방식으로 등록해 이후 `node(id:)`, 상세 query, connection에서 일관되게 재사용한다.

## Risks / Trade-offs

- `body_text`와 `body_json`을 함께 저장하면 두 값이 불일치할 수 있다. 생성 시점에는 입력 TipTap JSON에서 projection을 생성하고, 이후 편집 mutation을 추가할 때도 JSON에서 projection을 재생성하는 정책을 둔다.
- JSONB 컬럼 추가는 기존 DB에 migration/push가 필요하다. 배포 전 `post_content.body_json` 추가가 반영되지 않으면 작성 mutation insert가 실패한다.
- TipTap 전체 스키마를 허용하지 않고 기본 `Document`/`Paragraph`/`Text` extension subset만 허용한다. 리치 텍스트 mark나 커스텀 node가 필요해지면 TipTap extension 목록을 명시적으로 확장해야 한다.
- 공개 범위 값은 이번 변경에서 입력으로 받지만, 공개 범위별 federation/authorization 세부 정책은 후속 조회/배포 경로에서 더 구체화해야 한다.
