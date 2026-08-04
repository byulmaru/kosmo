## Why

현재 Post Composer는 사용자가 입력한 `@handle`을 특정 local/remote Profile identity와 연결할 수 없어, 같은
handle 후보를 안전하게 구분하거나 canonical `Post.MentionedProfile` 관계를 만들 수 없다. PROD-652는 일반
Post와 Reply에서 명시적으로 선택한 Profile만 본문 mention과 관계로 저장하는 기반을 이번 사이클에 먼저
제공하고, `DIRECT` 조회 권한은 PROD-462로 분리한다.

## What Changes

- Web/Native 공용 Post Composer와 Reply Composer가 `@` 입력에서 기존 인증 `searchProfiles`를 사용해 Profile을
  검색하고 Avatar, 표시 이름과 `relativeHandle`로 후보를 구분한다.
- 사용자가 결과를 keyboard 또는 touch로 선택하면 `relativeHandle` Plain Text를 삽입하고 Profile global ID를
  작성 상태에 연결한다. 직접 입력한 같은 문자열은 관계를 만들지 않는다.
- mention text 삭제·수정과 selected Profile, Reply Parent 또는 Relay Environment 전환 시 stale 선택을 제거하고,
  loading·empty·error·focus 상태를 플랫폼 접근성 계약에 맞춘다.
- `CreatePostInput`에 선택적 Mentioned Profile ID 목록을 추가하고, 서버가 concrete Profile identity, 중복과 현재
  Profile 검색 visibility를 검증한다.
- `post_mention` 관계를 추가해 Post, 첫 PostContent와 Mentioned Profile 관계를 한 transaction으로 저장하며,
  실패 시 부분 상태를 남기지 않는다.
- 기존 PUBLIC/UNLISTED/FOLLOWERS 일반 Post·Reply, Media와 Plain Text 작성 계약을 유지한다.
- `DIRECT` 공개 범위, Mention notification, ActivityPub typed Mention/recipient projection과 ProseMirror Mention
  node는 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`,
  `docs/design/reply-composer.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-652`
- Linear Implementations: `PROD-652`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `data-model`: Post와 명시적으로 선택한 Profile 사이의 중복 없는 Mentioned Profile 관계와 foreign key,
  transaction 저장 계약을 추가한다.
- `post`: Plain Text `createPost` 입력·검증·원자적 저장과 유니버설 Post Composer의 Profile 검색·mention 상태·제출
  계약을 확장한다.
- `post-reply-ui`: 기존 Reply Composer가 일반 Composer와 같은 Profile mention 검색·선택·상태 격리·제출 계약을
  재사용하도록 확장한다.

## Impact

- Database: `post_mention` migration, Drizzle table/constraints/indexes
- Core: local `createPost` Mentioned Profile 검증과 관계 저장 transaction
- GraphQL: `CreatePostInput`의 선택적 concrete `Profile` global ID 목록과 committed SDL
- Universal app: `PostComposer`, Reply surface, Relay mutation/검색 fragment, 공용 mention 상태와 접근 가능한 결과 UI
- Verification: core/API PostgreSQL integration, app unit·Storybook, Relay/TypeScript, Web keyboard·focus와 Native
  touch/runtime 검증
- Follow-up boundaries: PROD-462 `DIRECT`, PROD-340 typed Mention node, PROD-359 remote DIRECT recipient와 Mention
  notification은 이 change의 완료·archive 조건이 아니다.
