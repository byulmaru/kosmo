## Why

현재 Kosmo의 Fedify federation은 영속 MessageQueue 없이 inbound listener와 outbound remote HTTP delivery를 요청 프로세스에서 직접 실행하므로, 느린 원격 inbox가 API/Web 요청을 지연시키고 프로세스 재시작 시 수락한 transport 작업을 보존하지 못한다. PROD-448은 Temporal domain Workflow와 별개로 Fedify 공식 PostgreSQL MessageQueue adapter가 inbox/outbox transport를 단독 소유하게 해 이 실행 경계를 분리한다.

## What Changes

- Fedify federation의 inbound inbox, outbound outbox와 recipient fan-out을 공식 `@fedify/postgres` `PostgresMessageQueue`에 연결한다.
- Web ingress는 검증 가능한 ActivityPub 요청을 queue가 수락하면 remote sender에게 응답하고, domain materialization은 Fedify queue consumer에서 실행한다.
- outbound 호출자는 activity와 명시적 actor identity, audience를 Fedify에 넘기고 queue handoff 수락까지만 기다린다. 기존 callsite가 이미 정의한 ordering option은 그대로 전달하며, remote HTTP delivery, retry, 기존 ordering option 실행과 shared inbox recipient 병합 정책은 Fedify가 소유한다.
- Web/API 요청 처리와 독립적으로 배포·확장·재시작할 수 있는 Fedify queue consumer runtime, health/readiness와 graceful shutdown 경계를 제공한다.
- queue runtime은 producer가 처음 enqueue하거나 consumer가 listen할 때 공식 adapter가 connection 대상 database 안의 queue table/index를 implicit하게 초기화하게 한다. chart는 환경·database 준비·producer·consumer 분기 없이 각 namespace에 기존 CloudNativePG cluster의 `kosmo_fedify_queue` Database/DatabaseRole, 전용 VSO Secret, API/Web queue connection과 consumer Deployment를 함께 선언한다. queue connection은 release의 기존 CloudNativePG direct read-write Service와 전용 database에서 파생해 domain/API DB 및 Worker execution credential과 분리하며, production sync/apply는 별도 승인에 남긴다.
- queue가 수락하고 아직 dequeue하지 않은 message의 process restart 영속성만 보장한다. dequeue 뒤 handler 완료 전 process crash 재전달을 보강하는 custom ack, lease, requeue 또는 relay는 추가하지 않는다.
- Temporal task queue, domain state transition, Notification, domain Workflow/Workflow ID, transactional Workflow intent/outbox/relay는 추가하거나 변경하지 않는다.
- 전환 전에는 domain effects Workflow가 기존 Fedify delivery Activity를 호출하고 Temporal Activity가 delivery request 실패를 재시도할 수 있다. PROD-448 queue producer를 활성화한 뒤에는 queue handoff 수락이 그 Activity의 성공 경계가 되며, 이후 remote HTTP retry와 기존 ordering option 실행은 Fedify만 소유한다. 이 전환은 domain Workflow 구현을 선행 조건으로 만들지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`
- Linear Contract: [PROD-448](https://linear.app/byulmaru/issue/PROD-448/fedify-postgresql-messagequeue-runtime%EC%9D%84-%EA%B5%AC%EC%84%B1%ED%95%9C%EB%8B%A4)
- Linear Implementations: [PROD-448](https://linear.app/byulmaru/issue/PROD-448/fedify-postgresql-messagequeue-runtime%EC%9D%84-%EA%B5%AC%EC%84%B1%ED%95%9C%EB%8B%A4). 역할별 selector baseline은 PROD-709에서 시작해 PROD-715 PR #564가 `worker` 이름으로 교체했지만, MessageQueue transport credential은 PROD-715 범위가 아니며 chart가 파생하는 전용 queue connection을 사용한다.
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
- `packages/fedify` federation construction과 inbound/outbound context 생성이 영향을 받고, 장기 실행 queue lifecycle은 `apps/fedify-consumer`가 소유한다.
- 공통 runtime image에 `apps/fedify-consumer`가 추가되고 Helm에 독립 consumer Deployment, probe와 resource/replica 설정이 추가된다.
- dev와 production Helm은 환경별 실행 분기 없이 각 namespace에 `kosmo_fedify_queue` Database/DatabaseRole, VSO basic-auth Secret, API/Web producer connection과 consumer Deployment를 선언한다. dev는 기존 승인된 GitOps 경계로 reconcile하고 production sync/apply는 별도 승인을 유지한다.
- 기존 Web ingress, API/Core의 Fedify 호출 경계와 ActivityPub 통합 테스트는 queue handoff 기준으로 갱신된다. API가 outbound producer인 동안 API runtime에도 API domain DB와 분리된 Fedify queue credential 입력이 필요하다.
- 취소된 PROD-706/PR #543 코드를 cherry-pick하거나 재구현하지 않는다. queue consumer의 domain listener는 현재 main의 trusted ingress DB 동작을 보존하며, API/Worker runtime role·credential cutover는 제외한다. production 선언은 포함하지만 Argo CD sync, Helm apply, Vault value write와 DB production apply는 이 change의 자동 실행 범위가 아니다.
