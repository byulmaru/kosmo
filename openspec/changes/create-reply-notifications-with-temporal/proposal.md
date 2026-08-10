## Why

Reply Notification 생성은 현재 Reply Post transaction 안의 Best Effort savepoint에 머물러 있어, 일시적인
데이터베이스 실패를 source Post와 분리해 재시도하거나 Worker 재시작 뒤 이어갈 실행 이력이 없다. PROD-719와
PROD-730이 Temporal namespace와 Worker runtime 기반을 준비했으므로, 가장 작은 create-only Notification
lifecycle인 Reply를 첫 business Workflow로 전환한다.

## What Changes

- 실제 Reply Post가 commit된 뒤 stable Reply identity로 Temporal Workflow start를 시도한다.
- Workflow는 Reply source를 다시 조회하는 Activity를 실행하고 기존 recipient, self suppression, visibility와
  unique 계약을 그대로 적용해 REPLY Notification을 멱등 생성한다.
- Reply Notification의 transaction savepoint 생성 경로를 제거하고 Local GraphQL과 ActivityPub inbound가 같은
  post-commit Workflow start 경계를 사용한다.
- start 요청과 Activity 실패는 이미 commit된 Post 결과에서 격리한다. commit 뒤 start 요청 전 프로세스 종료로
  생기는 누락은 명시적으로 수용한다.
- Kosmo 공통 task queue에 첫 business Workflow와 Activity를 등록하고 dev에서 Worker를 활성화해 readiness,
  Activity retry와 Worker restart 복구를 검증한다. production 실제 배포는 이 change의 완료 gate가 아니다.
- transactional intent/outbox/relay, 다른 Notification kind, ActivityPub transport와 Notification API/UI는 변경하지
  않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`,
  `docs/architecture/core-services.md`
- Linear Contract: `PROD-722`
- Linear Implementations: `PROD-722`

## Capabilities

### New Capabilities

- `temporal-reply-notification`: committed Reply에서 stable Workflow를 시작하고 REPLY Notification 생성에
  수렴하는 durable execution 경계

### Modified Capabilities

- `notification`: Reply Notification 생성 시점을 transaction savepoint Best Effort에서 post-commit Temporal
  Workflow로 변경
- `temporal-worker-runtime-foundation`: 첫 business registration이 생긴 뒤 환경 중립 Worker component를 기본
  활성 상태로 전환하고 기존 replica·health·credential 계약을 유지

## Impact

- `packages/core/services`: Reply 생성 결과와 post-commit Workflow start, 기존 savepoint 제거
- `apps/worker`: Reply Workflow/Activity 등록과 core Notification service 실행
- `apps/api`, `packages/fedify`: Local·ActivityPub Reply materialization 뒤 공통 post-commit effect 실행
- `apps/helm`, `apps/terraform`, 배포 workflow: 환경 중립 Worker manifest를 사용한 dev 활성화와 restart 처리
- workspace dependencies와 lockfile: Temporal client/workflow 및 Worker의 core dependency
- 외부 GraphQL schema, Notification read model과 ActivityPub vocabulary에는 변경 없음
