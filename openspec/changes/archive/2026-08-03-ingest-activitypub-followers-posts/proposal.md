## Why

현재 remote Note 수신 계약은 `to`·`cc`의 Public audience를 중심으로 PUBLIC/UNLISTED만 분류하므로, Kosmo의 accepted follower를 대상으로 전달된 외부 Followers Only 게시물이 저장·조회되지 않는다. PROD-360은 검증된 remote actor의 canonical followers collection과 현재 Follow Relationship을 근거로 이 누락을 닫고, 기존 Post/GraphQL 권한·멱등 계약을 재사용하는 단일 결과를 요구한다.

## What Changes

- remote `Create(Note)` audience를 `to Public → PUBLIC`, `cc Public(그리고 to에는 없음) → UNLISTED`, 그 밖의 검증된 author canonical followers URI → `FOLLOWERS` 우선순위로 분류한다. 공식 ActivityPub/Mastodon addressing으로 추가된 actor URI, 순서와 중복은 인식된 marker의 분류를 바꾸지 않는다.
- personal/shared inbox에서 Active local Profile·Active local Instance에 연결된 follower와 remote followee 사이의 현재 Follow Relationship으로 수신 relevance를 확인하고, accepted follower 대상 Note만 `FOLLOWERS` Post로 materialize한다.
- 기존 Post 작성 transaction/idempotency와 GraphQL `Post` Node, `Profile.posts`, `homeTimeline`, 상세 조회의 Post Visibility·Eligibility 정책을 재사용한다.
- actor/object/attribution이 유효하지 않거나 Public·author canonical followers marker가 전혀 없는 actor-only·foreign-followers-only audience는 Post side effect 없이 건너뛴다. 인식된 marker가 있으면 구문상 유효하게 파싱된 extra actor/collection URI(mention addressee, foreign/unknown/spoofed-looking followers URI, 순서·중복)를 무시하고 Note 전체를 거절하지 않는다. raw malformed audience syntax는 기존 vocabulary hydration/basic validation 범위에 남긴다. spoofed-looking URI 자체는 권한 근거가 아니다.
- unfollow·Profile/Instance suspension·duplicate/concurrent delivery 뒤 접근과 exact-once 결과를 명시한다. extra actor URI로 Mention 관계, notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않으며, body/tag Mention 보존·파싱, backfill, outbound delivery와 membership mirror는 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md#activitypub-local-note-표현`, `docs/domain/objects/follow-relationship.md#조회-정책`, `docs/domain/policies/post-list.md#후보-정책`, `docs/architecture/core-services.md#책임`
- Linear Contract: [PROD-360](https://linear.app/byulmaru/issue/PROD-360/외부-서버의-팔로워-한정-게시물을-수신저장하고-조회할-수-있게-한다)
- Linear Implementations: [PROD-360](https://linear.app/byulmaru/issue/PROD-360/외부-서버의-팔로워-한정-게시물을-수신저장하고-조회할-수-있게-한다)가 구현·통합 검증·archive 책임을 함께 소유한다. PROD-634는 공통 inbound 관측 경계를 소유하는 related non-blocker이며 이 change는 그 logging/Sentry 구현을 중복하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-remote-followers-post-ingestion`: verified canonical followers audience, personal/shared inbox relevance, Followers Only materialization, duplicate/rollback와 inbound rejection 계약

### Modified Capabilities

- `activitypub-remote-post-ingestion`: 기존 PUBLIC/UNLISTED inbound 분류를 보존하면서 Followers Only audience와 Public/Unlisted/Followers 우선순위를 기존 remote Note validation과 함께 정렬한다.

## Impact

- 영향 계약: ActivityPub inbox Create boundary, remote actor/audience validation, Post/PostContent/object mapping transaction·idempotency, Follow Relationship relevance와 GraphQL Post read surfaces. 기존 `openspec/specs/activitypub-remote-post-ingestion/spec.md`와 `openspec/specs/post/spec.md`는 정렬 대상 계약으로 독립 대조했다.
- 영향 시스템: ActivityPub handler/worker와 shared inbox entry, 기존 Post materialization service, GraphQL Post/Profile/home/detail read policy 및 통합 fixture·회귀 검증.
- 변경하지 않는 것: DB migration, followers membership mirror, DIRECT/Mention, body Mention, reply/thread·remote Media 확장, historical backfill, Local outbound Followers delivery와 PROD-634의 공통 observability 구현.
