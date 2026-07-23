## Why

[PROD-357](https://linear.app/byulmaru/issue/PROD-357)은 [PROD-235](https://linear.app/byulmaru/issue/PROD-235)와 이미 정의된 구현 이슈의 결과·제약·의존성을 `add-activitypub-remote-follow` 행동 계약으로 구체화한다. 기존 active change는 Linear 구조보다 먼저 만들어진 legacy 입력이므로 source of truth로 사용하지 않는다.

여러 구현 PR이 shared 계약을 각자 재정의하지 않도록 이 spec-only slice를 구현보다 먼저 병합하고, 전체 PROD-235 범위가 끝날 때까지 archive하지 않는다.

## What Changes

- 완료된 저장 count, core action, remote actor materialization과 Fedify inbox route를 현재 기반으로 기록한다.
- remote OPEN follow/unfollow mutation은 PROD-242, inbound Follow/Undo와 remote pending request 생성·조건부 삭제는 PROD-243, local request 생성과 local/remote 공통 처리 lifecycle은 PROD-272, outbound APPROVAL_REQUIRED request 왕복과 inbound Accept/Reject는 PROD-244가 소유하도록 분리한다.
- verified inbound Follow/Undo와 Follow Notification lifecycle의 공통 core integration은 PROD-380이 소유하고, PROD-244는 해당 runtime과 결정을 포함하지 않는다.
- PROD-243과 PROD-272는 고정된 pending-only DB 계약을 기준으로 병렬 구현하고, PROD-244는 PROD-243의 exact-row 삭제 primitive를 재사용한다.
- `SUSPENDED` remote profile의 기존 relation/count를 보존하고 GraphQL follow/unfollow에서 NotFound로 숨긴다.
- PROD-245의 DB-known follow graph와 PROD-263의 viewer pending read·Web follow 상태 머신을 별도 구현 slice로 유지한다.
- PROD-447이 post-commit Follow/Undo delivery 실패를 관측 경계에서 격리하고 mutation의 committed 결과 payload를 보존하도록 한다.
- PROD-282의 SUSPENDED 회귀 검증과 PROD-361의 최종 통합 검증·archive를 별도 구현 slice로 유지하고, 부모 PROD-235는 자체 PR 없이 전체 완료 판단만 소유한다.
- PROD-380이 기존 verified inbound Follow/Undo를 공통 core Follow lifecycle에 연결해 Local Recipient의 Follow Notification source lifecycle을 보존하도록 cross-capability 경계를 정렬한다. 새 ActivityPub protocol 동작은 추가하지 않는다.
- PROD-241이 제공한 actor-scoped/shared inbox route를 activity-neutral handler delegation으로 표현하고, 공통 discovery 경계를 Follow-only 허용 목록으로 축소하지 않는다.
- PROD-354의 Create validation, receipt와 ProseMirror content 계약은 이 change에서 재정의하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-remote-follow`: Fedify 기반 Follow/Undo/Accept/Reject와 kosmo `ProfileFollow`/`ProfileFollowRequest` projection 경계를 정의한다.

### Modified Capabilities

- `activitypub-actor-discovery`: 병합된 actor-scoped/shared inbox route와 activity-neutral handler 위임 경계를 반영한다.
- `data-model`: 저장 count와 inbound Follow의 기존 relation/request projection 연계를 정의한다.
- `profile`: remote follow mutation result union, DB-known follow graph, viewer relation/request state, 저장 count와 SUSPENDED 관계 보존 계약을 정의한다.
- `web-app-shell`: local/remote profile의 NONE/PENDING/ESTABLISHED follow action과 cache 갱신 소유권을 PROD-263으로 고정한다.

## Impact

- Contract owner: [PROD-357](https://linear.app/byulmaru/issue/PROD-357)
- Parent integration: [PROD-235](https://linear.app/byulmaru/issue/PROD-235)
- Completed foundations: PROD-240, PROD-241, PROD-248, PROD-281, PROD-323
- Completed implementation: PROD-242, PROD-243, PROD-244, PROD-245, PROD-282, PROD-380, PROD-447
- Remaining implementation: PROD-263, PROD-361
- Parallel contract: PROD-272 local request creation and local/remote pending request processing lifecycle
- Cross-capability integration: PROD-380 verified inbound Follow/Undo → common core lifecycle → Follow Notification
- Final integration and archive owner: PROD-361
- PROD-377의 Web pending-request state와 cancel UX는 PROD-263에 흡수됐고 PROD-377은 duplicate로 취소됐다.
- PROD-242/243/244/245/263/282/361은 PROD-357이 완료되기 전까지 blocked 상태를 유지한다.
- PROD-243과 PROD-272는 서로의 구현 또는 병합을 선행 조건으로 두지 않는다.
- PROD-380은 PROD-244 병합 후 inbound Follow/Undo와 Follow Notification lifecycle을 통합한다.
