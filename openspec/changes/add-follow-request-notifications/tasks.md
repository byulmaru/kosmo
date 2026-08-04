## 1. PROD-321 — Notification enum과 pending request core lifecycle

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `PROD-321`

**Deliverable**

새 Local 또는 verified ActivityPub inbound pending request가 `FOLLOW_REQUEST` Notification 하나로 투영되고, 실제 request 삭제 뒤 대응 item이 정리된다.

**Guardrails**

- request/relation/count transaction은 Notification effect 실패로 rollback하지 않는다.
- 실제 새 request insert 또는 실제 request delete가 있을 때만 post-commit effect를 실행한다.
- duplicate/concurrent request와 이미 배포 전 존재한 pending row는 Notification backfill 대상이 아니다.
- Follow Request와 established Follow Notification의 source/lifecycle을 섞지 않는다.
- create/delete 실패는 operation, `notificationKind = FOLLOW_REQUEST`, `sourceId`만 Sentry context로 전달하고 retry·outbox·queue·reconciliation을 추가하지 않는다.

**Verification**

- Local/remote pending create·duplicate·concurrent DB-backed test로 source/Recipient mapping, 단일 row와 count 불변을 검증한다.
- approve/reject/cancel/inbound Undo의 실제 request deletion, no-op과 cleanup idempotency를 검증한다.
- Notification create/delete failure와 Sentry mock에서 request/relation/count 및 ActivityPub handler 성공 유지와 세 context만 전달되는지 검증한다.

- [x] 1.1 `FOLLOW_REQUEST` enum·projection 저장 경계와 additive dev migration을 추가하고 기존 pending row를 변경하지 않는다.
- [x] 1.2 새 pending request를 생성한 Local 및 verified inbound lifecycle에서 commit 이후에만 source Notification create를 await한다.
- [x] 1.3 승인·거절·취소·verified inbound Undo가 실제 request row를 삭제한 경우에만 commit 이후 Notification delete를 await하고 no-op은 건너뛴다.
- [x] 1.4 post-commit create/delete 오류를 lifecycle과 ActivityPub 처리에서 격리하고 최소 Sentry context를 기록한다.
- [x] 1.5 core service와 production-wired Fedify regression/DB-backed test를 추가해 기존 Follow Notification lifecycle과 pending request lifecycle의 경계를 유지한다.

## 2. PROD-321 — Notification GraphQL visibility와 Profile-scoped API

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/notification.md`
- `docs/domain/objects/profile.md`
- `PROD-321`

**Deliverable**

visible `FOLLOW_REQUEST` item이 기존 Notification connection·Unread count·Node·Read API에서 requester Profile을 Related Profile로 반환한다.

**Guardrails**

- source request가 존재하고 Followee가 저장 Recipient와 일치하며 requester가 Recipient 기준으로 visible일 때만 API에 존재한다.
- hidden/deleted/mismatched source는 connection·count·Node·Read에서 동일하게 숨기며 generic fallback이나 snapshot을 반환하지 않는다.
- Account-Profile membership이 API 권한 기준이고 selected Profile은 UI/cache scope일 뿐이다.

**Verification**

- GraphQL schema/type/Node loader integration test로 concrete Follow Request Notification, requester field와 global ID routing을 검증한다.
- connection, pagination, Unread count, idempotent Read에서 source 삭제·불일치·requester visibility·membership 오류를 검증한다.
- visibility 확인과 concrete source field resolve 사이의 source 삭제를 DB-backed regression으로 재현해 Node·connection·Read가 non-null source 오류 없이 같은 snapshot을 사용하거나 item을 숨기는지 검증한다.

- [x] 2.1 Follow Request Notification concrete GraphQL object와 source loader를 추가해 request의 Follower Profile과 Recipient-visible related Follow Request를 파생한다.
- [x] 2.2 공통 visible predicate를 `FOLLOW_REQUEST` source existence·pair·requester visibility까지 확장하고 connection/count/Node/Read에 재사용한다.
- [x] 2.3 API schema/integration test와 개발 schema validation을 추가해 raw source/data와 received-request transition action이 노출되지 않음을 검증하고 terminal delete와 겹친 stale source row도 모든 API 표면에서 숨긴다.

## 3. PROD-321 — Notification 목록과 requester Profile activation

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/objects/profile.md`
- `docs/design/page-header.md`
- `PROD-321`
- `PROD-566` (받은 요청 관리·승인·거절 UI 소유 경계)

**Deliverable**

selected Profile의 Notification 목록이 Follow Request item을 기존 row semantics와 Unread badge에 포함하고, item 활성화가 requester Profile route로 이동한다.

**Guardrails**

- avatar와 본문은 source Follower의 기존 `relativeHandle` Profile route로 이동한다.
- 받은 요청 목록·승인·거절·취소 action 또는 canonical received-request route를 추가하지 않는다.
- Relay/cache와 서버 `unreadNotificationCount`를 사용하며 목록 길이 또는 다른 Profile의 count를 로컬에서 계산하지 않는다.

**Verification**

- App component/storybook 또는 E2E에서 Follow Request row identity·copy·상대 시각·Unread Read 동작과 requester route activation을 검증한다.
- selected Profile 전환·초기/추가 pagination·badge count에서 다른 Profile item/count가 노출되지 않는지 검증한다.

- [x] 3.1 Notification list fragment와 renderer가 `FOLLOW_REQUEST` concrete item을 requester Profile identity와 요청 의미로 표시하도록 확장한다.
- [x] 3.2 avatar/본문 activation을 requester `relativeHandle` route와 기존 best-effort Read/cache updater에 연결하고 받은 요청 transition control은 추가하지 않는다.
- [x] 3.3 목록 empty state, pagination, Relay generated artifacts와 shell Unread badge/story fixture를 갱신하고 UI 회귀 검증을 통과한다.

## 4. PROD-321 — 배포 후 관찰·통합 검증 및 archive gate

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `memory/database-migrations.md`
- `memory/issue-openspec-workflow.md`
- `PROD-321`

**Deliverable**

merge 후 dev migration, 신규 pending lifecycle, 목록/Unread/badge, Sentry 최소 context의 production-equivalent 검증 증거를 남기고 change를 archive할 수 있다.

**Guardrails**

- enum migration은 additive이고 migration history를 수정·재생성하지 않는다.
- 배포 전 pending request에는 Notification을 소급하지 않고 backfill/reconciliation command를 실행하지 않는다.
- archive 전에는 구현·검증·canonical/Linear 정합성이 모두 완료되어야 하며 `PROD-566` UI 결과를 대신 완료하지 않는다.

**Verification**

- dev DB migration/runner smoke와 기존·신규 pending fixture 비교로 enum 적용과 비소급을 확인한다.
- Local 및 verified ActivityPub inbound create/delete, failure isolation, API list/count/Read/Node, app activation/badge를 연결한 smoke 결과를 기록한다.
- merge 직전 최신 canonical·Linear와 active specs를 대조하고 strict validation 및 archive 후 validation을 실행한다.

- [ ] 4.1 dev enum migration과 schema/migration smoke를 실행해 기존 migration history, 신규 enum 값과 배포 전 pending 비소급을 검증한다.
- [ ] 4.2 Local·verified inbound pending create/delete 및 create/delete 실패 Sentry 관찰 결과를 production-equivalent 설정으로 기록한다.
- [ ] 4.3 API·app 목록, Unread count/badge, requester Profile activation, source deletion hidden behavior를 cross-slice smoke로 검증한다.
- [ ] 4.4 PROD-321 구현 PR merge 후 전체 tasks·정합성·남은 위험을 재검토하고 strict validation과 OpenSpec archive gate를 완료한다.
