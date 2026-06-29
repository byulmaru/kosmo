## Context

`add-activitypub-actor-discovery`의 proposal, delta specs, design에 기록된 federation discovery 범위와 ActivityPub 저장 모델 결정을 ADR 형식으로 정리한다.

## Decision Records

### ActivityPub 공개 identity는 웹 origin을 기준으로 한다

- Status: Accepted
- Context / Problem: Actor URI와 WebFinger subject는 외부 서버가 보는 공개 identity이므로 API transport origin이나 요청 Host를 따라가면 프로필 identity가 흔들릴 수 있다.
- Decision Outcome: Actor URI, WebFinger self link, profile page link, key ID는 configured local instance의 canonical origin/domain을 source of truth로 삼는다.
- Alternatives Considered: `PUBLIC_API_ORIGIN` 또는 요청 URL origin을 사용할 수 있지만, federation identity가 배포 topology나 request host에 결합된다.
- Consequences: Runtime은 configured local instance row를 읽고 검증해야 하며, `PUBLIC_ORIGIN`은 bootstrap과 검증 입력으로만 사용한다.
- Confirmation / Follow-up: local instance bootstrap/resolve helper와 actor/WebFinger URL 생성 테스트로 확인한다.

### Fedify integration은 web hook adapter와 federation package로 분리한다

- Status: Accepted
- Context / Problem: SvelteKit route/hook 본문에 WebFinger parsing, actor assembly, ActivityPub response 조립이 섞이면 앱 경계가 흐려진다.
- Decision Outcome: `apps/web`은 Fedify SvelteKit adapter 연결만 담당하고, root federation singleton, actor/key/handle dispatcher, ActivityPub object assembly는 `packages/fedify`가 소유한다.
- Alternatives Considered: 웹 앱 내부 route/hook에서 직접 federation 응답을 만들 수 있지만, ActivityPub 세부가 UI/server app에 누수된다.
- Consequences: workspace dependency ownership은 `@fedify/fedify`가 `packages/fedify`, adapter와 `@kosmo/fedify`가 `apps/web`에 들어가는 구조를 따른다.
- Confirmation / Follow-up: web hook 본문에 ActivityPub parsing/응답 조립 로직이 없는지 구현 검토에서 확인한다.

### Actor URI는 stable profile id를 사용한다

- Status: Accepted
- Context / Problem: `/@{handle}`를 actor URI로 쓰면 HTML route/content negotiation과 결합되고 handle rename 가능성을 닫는다.
- Decision Outcome: Actor URI는 `/ap/actor/{profile.id}`와 raw DB UUID를 사용한다.
- Alternatives Considered: handle URL 또는 GraphQL Relay global ID를 쓸 수 있지만, 각각 rename과 API 표현 계층에 결합된다.
- Consequences: WebFinger username은 handle이고 actor identifier는 profile id로 분리된다.
- Confirmation / Follow-up: WebFinger mapper가 `acct:{handle}@{domain}`을 local active profile UUID로 매핑하는지 확인한다.

### Profile은 local/ActivityPub 공통 social identity로 확장한다

- Status: Accepted
- Context / Problem: remote actor/profile identity를 표현할 저장 모델이 필요하고, local handle uniqueness를 전역으로 유지하면 instance-scoped federation identity와 맞지 않는다.
- Decision Outcome: `instance`를 identity authority 테이블로 추가하고 `profile`을 instance 소속으로 확장하며 handle uniqueness는 `(instance_id, normalized_handle)` 범위로 제한한다.
- Alternatives Considered: remote actor 전용 별도 테이블을 둘 수 있지만 GraphQL `Profile` 조회와 social identity 표현이 분리된다.
- Consequences: local/remote profile policy를 API에서 명확히 분기해야 하며, 저장된 remote profile은 Node 조회만 허용한다.
- Confirmation / Follow-up: data-model delta spec과 GraphQL remote profile policy 테스트로 확인한다.

### Local actor key는 lazy 생성한다

- Status: Accepted
- Context / Problem: 기존 local profile 전체에 대한 migration-time key backfill은 배포 시간과 실패 복구 경로를 키운다.
- Decision Outcome: Actor document 또는 key dispatcher가 local actor key를 필요로 할 때 transaction 안에서 key pair를 idempotent하게 생성한다.
- Alternatives Considered: migration에서 모든 key를 선생성할 수 있지만 실제로 조회되지 않는 actor까지 처리해야 한다.
- Consequences: actor/key lookup 경로는 actor row 보장과 key 생성 idempotency를 함께 처리해야 한다.
- Confirmation / Follow-up: concurrent lazy 생성 테스트 또는 unique constraint 기반 idempotency 확인을 남긴다.

### Actor document는 discovery 필수 surface만 광고한다

- Status: Accepted
- Context / Problem: 이번 cycle은 discovery와 read-only actor document가 범위이며 delivery/submission/collection 동작은 아직 구현하지 않는다.
- Decision Outcome: Actor document에는 필수 `inbox`/`outbox` URI를 포함하되 endpoint 요청은 404로 종료하고, `followers`, `following`, `endpoints.sharedInbox`는 아직 노출하지 않는다.
- Alternatives Considered: follower/following/sharedInbox URI를 미리 광고할 수 있지만 동작하지 않는 federation surface를 공개하게 된다.
- Consequences: remote 서버가 actor를 발견할 수는 있지만 follow/delivery 상호운용은 후속 change 전까지 닫혀 있다.
- Confirmation / Follow-up: actor document shape와 endpoint 404 동작을 검증한다.

## Remaining Decisions

- Remote actor fetch/cache, TTL, 실패 상태, 서명 검증 정책은 후속 change에서 결정한다.
- Followers/following collection을 local follow graph 기반 read-only collection으로 먼저 열지, remote follow 구현과 함께 열지는 후속 change에서 결정한다.
- Handle rename과 ActivityPub alias/history 정책은 federation이 실제로 활성화된 뒤 별도 product decision으로 다룬다.
- Production durable KV store는 후속 구현에서 `MemoryKvStore`를 교체할 때 결정한다.

## Superseded Decisions

- 없음.
