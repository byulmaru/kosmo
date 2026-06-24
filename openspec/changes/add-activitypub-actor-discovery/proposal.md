## Why

kosmo는 로컬 프로필, 게시글, 팔로우의 SNS 뼈대가 갖춰졌지만 ActivityPub에서 로컬 프로필을 어떤 actor로 발견하고 읽을 수 있는지에 대한 계약이 없다. 이번 변경은 원격 follow나 delivery까지 확장하지 않고, 외부 서버가 kosmo 로컬 프로필을 WebFinger로 발견하고 actor document를 역참조할 수 있는 최소 federation 경계를 먼저 확정한다.

## What Changes

- `apps/web` SvelteKit 서버는 Fedify hook 연결만 담당하고, ActivityPub/WebFinger 요청 처리 로직은 새 workspace package인 `packages/fedify`가 소유한다.
- WebFinger `acct:{handle}@{localDomain}` 조회가 local active profile을 actor URI `{localOrigin}/ap/actor/{profile.id}`로 연결하도록 정의한다.
- actor document는 `Person`의 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethods`를 보장한다.
- `inbox`, `outbox`는 ActivityPub actor 필수 속성으로 actor-scoped URI를 광고하되, 실제 delivery/submission/collection endpoint 동작은 이번 범위에서 제공하지 않는다.
- `followers`, `following`, `endpoints.sharedInbox` URI와 endpoint 동작은 이번 범위에서 광고하지 않는다.
- `instance`를 local/ActivityPub identity authority 공통 테이블로 추가하고, `PUBLIC_ORIGIN`과 일치하는 configured local instance row의 canonical origin/domain을 federation identity의 source of truth로 둔다.
- `profile`을 local/ActivityPub 공통 social identity로 확장하고, handle uniqueness를 instance 범위로 변경한다.
- ActivityPub actor metadata와 actor key 저장 경계를 추가한다. local actor key는 RSA-PKCS#1-v1.5와 Ed25519 key pair를 lazy 생성한다.
- GraphQL `Profile.relativeHandle`을 추가해 configured local profile은 `@handle`, 그 외 instance의 profile은 `@handle@domain`으로 표시 문자열을 서버에서 완성한다.
- 저장된 remote profile은 GraphQL Node 조회 대상으로 열어두되, 기존 handle 조회, UI 연결, active profile 선택, follow/unfollow/viewerFollow 동작, `Profile.posts` 확장은 local profile 중심으로 유지한다.

## Capabilities

### New Capabilities

- `activitypub-actor-discovery`: Fedify 기반 WebFinger, actor document, actor key dispatch, SvelteKit hook adapter 연결, 이번 cycle의 federation 포함/제외 범위를 다룬다.

### Modified Capabilities

- `data-model`: `instance`, ActivityPub actor metadata/key 저장 경계, profile의 instance 소속과 instance-scoped handle uniqueness를 추가한다.
- `profile`: `Profile.relativeHandle`과 저장된 remote profile 조회 계약을 추가하고, 기존 handle 기반 조회와 follow graph/mutation은 local profile 중심으로 명확히 한다.
- `post`: remote profile의 `Profile.posts`는 이번 capability에서 remote post fetch로 확장하지 않는다고 명확히 한다.

## Impact

- `apps/web`: SvelteKit `hooks.server.ts`에서 `packages/fedify`가 제공하는 framework-neutral federation instance/request handler 구성요소를 `@fedify/sveltekit` hook adapter로 연결한다.
- `packages/fedify`: federation request 판별, Fedify federation instance/request handler 구성요소, actor dispatcher, WebFinger handle mapping/JRD 응답 조립, key pair dispatch, ActivityPub object assembly를 소유한다.
- `packages/core/db`: `instance`와 ActivityPub actor 관련 테이블, `profile.instance_id`, 관련 unique/index/relation, table discriminator가 추가된다.
- `apps/api`: GraphQL `Profile.relativeHandle` 필드, remote profile Node 조회 정책, remote profile active selection/follow/unfollow/viewerFollow 차단 정책, remote profile posts 빈 connection 정책을 반영한다.
- dependency: `packages/fedify`에는 `@fedify/fedify`를 추가하고, SvelteKit hook adapter가 필요한 `@fedify/sveltekit`은 `apps/web`에 추가한다.
- 환경/운영: configured local instance canonical origin/domain은 DB row가 source of truth이며, `PUBLIC_ORIGIN`은 초기 local instance bootstrap 입력과 runtime local instance 검증 입력으로 사용한다.
