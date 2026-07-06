## 1. Data Model

- [ ] 1.1 ActivityPub object URI와 kosmo `Post`를 연결하는 object mapping 테이블 또는 동등한 저장 경계를 추가한다.
- [ ] 1.2 ActivityPub object URI, object type, actor, post unique constraint와 `TableDiscriminator`를 정렬한다.
- [ ] 1.3 remote post materialization에 필요한 Drizzle table/relations/migration fixture를 갱신한다.

## 2. Remote Post Materialization

- [ ] 2.1 Fedify inbox listener가 전달한 verified typed `Create(Note)`를 post materialization handler로 연결한다.
- [ ] 2.2 Fedify typed object를 기준으로 actor attribution 검증, public top-level Note 판정, unsupported object skip, duplicate ActivityPub object URI upsert 정책을 구현한다.
- [ ] 2.3 remote Note를 `Post`와 `PostContent`로 materialize하고 HTML, plain text projection, 단순 TipTap JSON projection을 저장한다.
- [ ] 2.4 `SUSPENDED` instance의 inbound Note side effect를 차단하고 `UNRESPONSIVE` instance의 저장된 active remote profile에 대한 inbound Note materialization 정책을 구현한다.

## 3. GraphQL Post API

- [ ] 3.1 `Profile.posts`가 remote profile에서 remote fetch 없이 이미 materialized된 visible posts를 최신순 connection으로 반환하도록 resolver를 확장한다.
- [ ] 3.2 `Post` visibility access가 remote materialized posts를 local posts와 같은 visibility 규칙으로 다루도록 정렬한다.
- [ ] 3.3 `homeTimeline`이 established `ProfileFollow`로 팔로우 중인 remote followee의 materialized posts를 포함할 수 있게 정렬한다.
- [ ] 3.4 GraphQL schema를 재생성하고 remote `Profile.posts`와 home timeline contract를 확인한다.

## 4. Verification

- [ ] 4.1 remote post ingestion test로 Fedify inbox delivery, actor attribution 검증, public top-level Note materialization, reply Note skip, duplicate object URI reuse, unsupported object skip을 검증한다.
- [ ] 4.2 GraphQL post test로 remote `Profile.posts`의 DB-only materialized read, remote fetch 미시도, `UNRESPONSIVE` instance materialized read, `homeTimeline` 포함 여부를 검증한다.
- [ ] 4.3 `pnpm lint:eslint`, 관련 package typecheck/test, GraphQL schema check, DB migration/schema check, `openspec validate add-activitypub-remote-post-ingestion --strict`를 실행한다.
