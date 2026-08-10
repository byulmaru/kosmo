## Why

현재 Kosmo의 Fedify federation은 영속 MessageQueue 없이 inbound listener와 outbound remote HTTP delivery를 요청 프로세스에서 직접 실행하므로, 느린 원격 inbox가 API/Web 요청을 지연시키고 프로세스 재시작 시 수락한 transport 작업을 보존하지 못한다. PROD-448은 Temporal domain Workflow와 별개로 Fedify 공식 PostgreSQL MessageQueue adapter가 inbox/outbox transport를 단독 소유하게 해 이 실행 경계를 분리한다.

## What Changes

- Fedify federation의 inbound inbox, outbound outbox와 recipient fan-out을 공식 `@fedify/postgres` `PostgresMessageQueue`에 연결한다.
- Web ingress는 검증 가능한 ActivityPub 요청을 queue가 수락하면 remote sender에게 응답하고, domain materialization은 Fedify queue consumer에서 실행한다.
- outbound 호출자는 activity와 명시적 actor identity, audience를 Fedify에 넘기고 queue handoff 수락까지만 기다린다. 기존 callsite가 이미 정의한 ordering option은 그대로 전달하며, remote HTTP delivery, retry, 기존 ordering option 실행과 shared inbox recipient 병합 정책은 Fedify가 소유한다.
- Web/API 요청 처리와 독립적으로 배포·확장·재시작할 수 있는 Fedify queue consumer runtime, health/readiness와 graceful shutdown 경계를 제공한다.
- queue runtime은 명시적으로 활성화될 때 공식 adapter가 connection 대상 database 안의 queue table/index를 implicit하게 초기화하게 한다. queue connection은 domain/API DB 및 Worker execution credential과 분리하고, 실제 production queue database·credential 준비와 최초 활성화는 별도 승인·변경에 남긴다.
- Temporal task queue, domain state transition, Notification, domain Workflow/Workflow ID, transactional Workflow intent/outbox/relay는 추가하거나 변경하지 않는다.
- 전환 전에는 domain effects Workflow가 기존 Fedify delivery Activity를 호출하고 Temporal Activity가 delivery request 실패를 재시도할 수 있다. PROD-448 queue producer를 활성화한 뒤에는 queue handoff 수락이 그 Activity의 성공 경계가 되며, 이후 remote HTTP retry와 기존 ordering option 실행은 Fedify만 소유한다. 이 전환은 domain Workflow 구현을 선행 조건으로 만들지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`
- Linear Contract: [PROD-448](https://linear.app/byulmaru/issue/PROD-448/fedify-postgresql-messagequeue-runtime%EC%9D%84-%EA%B5%AC%EC%84%B1%ED%95%9C%EB%8B%A4)
- Linear Implementations: [PROD-448](https://linear.app/byulmaru/issue/PROD-448/fedify-postgresql-messagequeue-runtime%EC%9D%84-%EA%B5%AC%EC%84%B1%ED%95%9C%EB%8B%A4). 역할별 credential selector baseline은 완료된 [PROD-709](https://linear.app/byulmaru/issue/PROD-709/apifedify-runtime%EC%9D%B4-%EC%97%AD%ED%95%A0%EB%B3%84-postgresql-credential%EC%9D%84-%EC%84%A0%ED%83%9D%ED%95%A0-%EC%88%98-%EC%9E%88%EA%B2%8C-%ED%95%9C%EB%8B%A4)가 소유한다.
- Historical cancellation: [PROD-706](https://linear.app/byulmaru/issue/PROD-706/fedify-%EC%9E%91%EC%97%85%EC%97%90-%EB%AA%85%EC%8B%9C%EC%A0%81-db-execution-boundary%EB%A5%BC-%EC%B6%94%EA%B0%ED%95%9C%EB%8B%A4)과 unmerged closed PR #543의 generic execution-context seam은 구현 prerequisite가 아니다.
- Parallel capabilities: PROD-722/720/723/725/665는 PROD-448이 차단하는 downstream이 아니라 기존 Fedify delivery Activity를 사용할 수 있는 관련 병렬 capability다.

## Capabilities

### New Capabilities

- `fedify-postgres-message-queue-runtime`: Fedify PostgreSQL inbox/outbox queue handoff, 독립 consumer runtime, retry·기존 ordering option·shared inbox recipient 병합 소유권과 운영 검증 경계를 정의한다.

### Modified Capabilities

- `activitypub-local-post-delivery`: direct Create/Delete 전달과 허용된 process-loss window를 queue handoff 경계로 전환한다.
- `activitypub-local-profile-update-delivery`: Remote follower direct delivery를 queue handoff와 Fedify-owned retry 경계로 전환한다.
- `activitypub-local-repost-delivery`: Announce/Undo direct delivery·loss window·MessageQueue 금지를 queue handoff 경계로 전환한다.
- `activitypub-outbound-reaction`: Reaction/Undo direct delivery와 queue 금지를 queue handoff·retry 경계로 전환한다.
- `activitypub-outbound-recipient-dispatch`: 공통 direct delivery를 durable fan-out handoff로 전환하되 lifecycle별 ordering 정책을 새로 만들지 않는다.
- `activitypub-remote-follow`: Fedify follow protocol의 queue/retry 후속 보류를 현재 queue runtime 위임으로 전환한다.

이 delta들은 기존 domain state, Activity identity·audience, Notification과 idempotency 요구사항을 보존하고 transport 실행 방식만 새 capability에 위임한다.

## Impact

- `@fedify/postgres` production dependency와 adapter-managed `fedify_message_v2` table/index가 queue connection 대상 PostgreSQL database에 추가된다.
- `packages/fedify` federation construction, inbound/outbound context 생성과 queue lifecycle이 영향을 받는다.
- 공통 runtime image에 Fedify queue consumer entrypoint가 추가되고 Helm에 기본 비활성 또는 별도 opt-in consumer Deployment, probe, resource/replica 설정과 Fedify DB credential 입력이 추가된다.
- 기존 Web ingress, API/Core의 Fedify 호출 경계와 ActivityPub 통합 테스트는 queue handoff 기준으로 갱신된다. API가 outbound producer인 동안 API runtime에도 API domain DB와 분리된 Fedify queue credential 입력이 필요하다.
- 취소된 PROD-706/PR #543 코드를 cherry-pick하거나 재구현하지 않는다. queue consumer의 domain listener는 현재 main의 trusted ingress DB 동작을 보존하며, 별도 runtime role·credential cutover는 제외한다. production values 변경, Argo CD sync, Helm apply와 DB production apply는 이 change의 자동 실행 범위가 아니다.
