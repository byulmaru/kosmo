## Why

공용 `PostComposerTarget`과 Media presentation은 Storybook에서 검증됐지만 Production은 별도 `PostComposer` UI를 사용해 canonical Rail/Overlay, 모바일 전체 화면, media 편집 상태가 실제 작성 lifecycle에 연결되지 않았다. DSN-43 계약을 기존 작성·업로드·Relay 경계를 유지한 채 Production에 적용해야 한다.

## What Changes

- Full Web의 Right Rail 작성 폼과 expand Overlay를 공용 Post Composer presentation으로 표시한다.
- compact Web의 글쓰기 진입은 desktop modal Overlay를, mobile Web·iOS·Android의 하단 글쓰기 탭은 전체 화면 composer를 연다.
- `/compose` 직접 접근은 별도 작성 구현 대신 같은 Overlay/전체 화면 composer 경계에 위임한다.
- 기존 본문, Content Warning, 공개 범위, 최대 4개 Media, Alt Text, Sensitive Media, upload 진행·실패·재시도·제거·편집, 제출 상태와 `createPost` mutation을 보존한다.
- Overlay의 Escape·backdrop·닫기, 모바일 back, keyboard/짧은 viewport scroll, 닫힌 뒤 trigger focus 복귀를 Production host가 소유한다.
- 일반 Post 작성 성공 시 surface를 닫되 Web은 현재 route를 유지하고 모바일은 Home으로 돌아간다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/figma.md`, `docs/design/media-upload-errors.md`, `docs/design/icons.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- Linear Contract: DSN-43
- Linear Implementations: PROD-797; 선행 PROD-854, PROD-796

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: 공용 Post Composer presentation을 기존 draft, upload, Relay, mutation 상태와 연결하고 surface별 close·focus·success lifecycle을 추가한다.
- `web-app-shell`: breakpoint와 platform별 글쓰기 진입점이 같은 Production composer를 Rail, desktop Overlay 또는 모바일 전체 화면으로 여는 계약을 추가한다.

## Impact

- 영향 코드: 앱 shell/route의 composer host, 기존 `PostComposer`, `PostComposerTarget`, Media presentation/editor와 관련 Storybook Tests.
- 기존 GraphQL schema, `createPost`·Media upload mutation, Relay actor environment, API·DB 모델은 변경하지 않는다.
- Poll·Emoji 동작, Profile switching, Reply presentation 재설계는 범위 밖이다.
