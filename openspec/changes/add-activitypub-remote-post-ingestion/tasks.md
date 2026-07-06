## 1. Data Model

- [ ] 1.1 ActivityPub object URI와 kosmo `Post`를 연결하는 object mapping 테이블 또는 동등한 저장 경계를 추가한다.
- [ ] 1.2 ActivityPub object URI, object type, actor, post unique constraint와 `TableDiscriminator`를 정렬한다.
- [ ] 1.3 remote post materialization에 필요한 Drizzle table/relations/migration fixture를 갱신한다.

## 2. Remote Post Materialization

- [ ] 2.1 actor-scoped inbox와 shared inbox가 verified typed `Create(Note)`를 unsupported endpoint 404가 아니라 Fedify inbox listener를 거쳐 post materialization handler로 연결하도록 한다.
- [ ] 2.2 Fedify typed object를 기준으로 저장된 remote actor 조회, actor attribution 검증, `to`/`cc` 기반 public top-level Note 판정, unsupported object skip, duplicate ActivityPub object URI upsert 정책을 구현한다.
- [ ] 2.3 remote Note를 `Post`와 `PostContent`로 materialize하고 HTML, plain text projection, 단순 TipTap JSON projection, Note `published` 또는 최초 수신 시각 fallback을 `Post.createdAt`으로 저장하되, Note `published`가 수신 시각보다 5분을 초과해 미래이면 `Post.createdAt`에는 수신 시각 fallback을 사용하고 ActivityPub object mapping에는 원본 published 시각을 보존한다.
- [ ] 2.4 중복 object URI 재전달 시 기존 object mapping의 actor와 이번 delivery actor가 같을 때만 기존 `Post`를 재사용하면서 content와 visibility를 갱신하되 `Post.createdAt`은 최초 materialization 이후 갱신하지 않는다.
- [ ] 2.5 저장되지 않은 actor delivery의 materialization을 skip하고 WebFinger lookup 또는 actor materialization을 수행하지 않도록 한다.
- [ ] 2.6 shared inbox로 들어온 public `Create(Note)`는 local follow 관계나 recipient 검증 없이 actor attribution과 public top-level Note 검증만으로 materialize한다.
- [ ] 2.7 `SUSPENDED` instance의 inbound Note side effect를 차단하고 `UNRESPONSIVE` instance의 저장된 active remote profile에 대한 inbound Note materialization 정책을 구현한다.

## 3. GraphQL Post API

- [ ] 3.1 `Profile.posts`가 remote profile에서 remote fetch 없이 이미 materialized된 visible posts를 최신순 connection으로 반환하도록 resolver를 확장한다.
- [ ] 3.2 `Post` visibility access가 remote materialized posts를 local posts와 같은 visibility 규칙으로 다루도록 정렬한다.
- [ ] 3.3 `homeTimeline`이 established `ProfileFollow`로 팔로우 중인 remote followee의 materialized posts를 포함할 수 있게 정렬한다.
- [ ] 3.4 GraphQL schema를 재생성하고 remote `Profile.posts`와 home timeline contract를 확인한다.

## 4. Verification

- [ ] 4.1 remote post ingestion test로 actor-scoped/shared inbox route의 Fedify listener 연결과 GraphQL proxy 미전달, Fedify inbox delivery, 저장된 remote actor만 materialize, unknown actor에서 추가 WebFinger/materialization 미수행, actor attribution 검증, `to` Public은 `PUBLIC`, `cc` Public은 `UNLISTED`, public top-level Note materialization, shared inbox public Note materialization, reply Note skip, 같은 actor의 duplicate object URI content/visibility update와 createdAt 유지, 다른 actor의 duplicate object URI update 거부, missing published 최초 수신 시각 fallback과 object mapping published `null`, 5분 초과 미래 published의 `Post.createdAt` fallback과 object mapping 원본 published 보존, 재전달 시 published 유무와 값에 관계없이 기존 createdAt 유지, unsupported object skip을 검증한다.
- [ ] 4.2 GraphQL post test로 remote `Profile.posts`의 DB-only materialized read, remote fetch 미시도, `UNRESPONSIVE` instance materialized read, `homeTimeline` 포함 여부를 검증한다.
- [ ] 4.3 `pnpm lint:eslint`, 관련 package typecheck/test, GraphQL schema check, DB migration/schema check, `openspec validate add-activitypub-remote-post-ingestion --strict`를 실행한다.
