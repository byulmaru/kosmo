## Why

Kosmo의 Reply Parent 저장·조회와 thread 표시 기반은 있지만, 사용자가 Local Reply를 작성하고 현재 thread에서 확인하며 Parent Author가 기존 inbox에서 알림을 받는 수직 흐름은 아직 연결되지 않았다. PROD-424·425·426이 공유할 작성 계약을 하나의 `add-local-reply-creation` OpenSpec Gate에서 정렬하고, 후행 PROD-423에서 전체 흐름을 통합 검증해 archive할 수 있어야 한다.

## What Changes

- 기존 `createPost` 입력에 nullable `replyParentId`를 추가하고, 요청 Profile이 조회할 수 있는 contentful Parent에 현재 지원 본문·Visibility를 가진 일반 Reply를 생성한다.
- Post 상세의 Reply action에서 기존 composer를 열고, 성공한 Reply를 현재 thread Relay cache에 반영한다. Content 없는 Repost의 action은 표시하되 진입을 차단한다.
- 다른 Profile의 Post에 Local Reply가 생성되면 Parent Author에게 Reply Notification을 Best Effort로 생성하고, 기존 connection·Unread count·Read·badge/cache·inbox 흐름에 연결한다.
- Content Warning, Media/Sensitive Media, Mentioned Profile recipient·Mentioned Profiles 작성/조회, Reply+Quote 작성, ActivityPub Reply, Action Bar 전체 rollout, retry/outbox와 동기 cleanup은 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`, `docs/design/README.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`
- Linear Contract: [PROD-424](https://linear.app/byulmaru/issue/PROD-424), [PROD-425](https://linear.app/byulmaru/issue/PROD-425), [PROD-426](https://linear.app/byulmaru/issue/PROD-426)
- Linear Implementations: [PROD-424](https://linear.app/byulmaru/issue/PROD-424), [PROD-425](https://linear.app/byulmaru/issue/PROD-425), [PROD-426](https://linear.app/byulmaru/issue/PROD-426)

## Capabilities

### New Capabilities

- `local-reply-creation`: Local Reply 생성 입력, Parent 조회·Content 검증, 원자적 저장과 실패 롤백 계약
- `post-reply-ui`: 기존 composer를 사용한 Reply 작성 진입, Repost disabled 상태와 thread cache 통합 계약
- `notification`: Reply source correlation, Best Effort 실패 격리와 기존 Notification API·inbox 통합 계약

### Modified Capabilities

- `post`: Plain Text `createPost` GraphQL 계약이 선택적 Reply Parent를 받고 기존 단일 `Post` payload로 Reply를 반환하도록 확장

## Impact

- Linear: 구현 계약 PROD-424·425·426과 후행 통합·archive 이슈 PROD-423
- Core/API: 기존 Reply Parent 저장 경계, Post visibility predicate, `CreatePostInput`, Reply Notification source·concrete Node·visible predicate
- Universal client: Post 상세 action, 기존 composer mutation, thread Relay cache, Notification inbox item·Read·badge cache
- Verification: backend service/schema/resolver, client component/route/cache, Notification connection·count·Read·Node와 통합 flow
- Dependencies: `add-post-replies`의 Reply Parent·thread 기반과 `add-in-app-notifications`의 공통 Notification 기반을 재사용한다.
