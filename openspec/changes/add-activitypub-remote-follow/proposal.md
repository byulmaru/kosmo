## Why

[PROD-357](https://linear.app/byulmaru/issue/PROD-357)은 [PROD-235](https://linear.app/byulmaru/issue/PROD-235)와 이미 정의된 구현 이슈의 결과·제약·의존성을 `add-activitypub-remote-follow` 행동 계약으로 구체화한다. 기존 active change는 Linear 구조보다 먼저 만들어진 legacy 입력이므로 source of truth로 사용하지 않는다.

여러 구현 PR이 shared 계약을 각자 재정의하지 않도록 이 spec-only slice를 구현보다 먼저 병합하고, 전체 PROD-235 범위가 끝날 때까지 archive하지 않는다.

## What Changes

- 완료된 저장 count, core action, remote actor materialization과 Fedify inbox route를 현재 기반으로 기록한다.
- remote follow/unfollow mutation은 PROD-242, inbound Follow/Undo와 correlation/generation·조건부 삭제는 PROD-243, pending-only request lifecycle은 PROD-272, inbound Accept/Reject는 PROD-244가 소유하도록 분리한다.
- PROD-243은 PROD-272의 검증된 request boundary를 호출하고, PROD-244는 PROD-243의 exact-row·expected-generation 삭제 primitive를 재사용한다.
- `SUSPENDED` remote profile의 기존 relation/count를 보존하고 GraphQL follow/unfollow에서 NotFound로 숨긴다.
- PROD-245의 DB-known follow graph와 PROD-263의 Web follow action을 별도 구현 slice로 유지한다.
- PROD-282의 SUSPENDED 회귀 검증과 PROD-361의 최종 통합 검증·archive를 별도 구현 slice로 유지하고, 부모 PROD-235는 자체 PR 없이 전체 완료 판단만 소유한다.
- PROD-241이 제공한 actor-scoped/shared inbox route를 activity-neutral handler delegation으로 표현하고, 공통 discovery 경계를 Follow-only 허용 목록으로 축소하지 않는다.
- PROD-354의 Create validation, receipt와 ProseMirror content 계약은 이 change에서 재정의하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-remote-follow`: Fedify 기반 Follow/Undo/Accept/Reject와 kosmo `ProfileFollow`/`ProfileFollowRequest` projection 경계를 정의한다.

### Modified Capabilities

- `activitypub-actor-discovery`: 병합된 actor-scoped/shared inbox route와 activity-neutral handler 위임 경계를 반영한다.
- `data-model`: 저장 count와 inbound Follow correlation/generation, pending-only request 연계를 정의한다.
- `profile`: remote follow mutation, DB-known follow graph, 저장 count와 SUSPENDED 관계 보존 계약을 정의한다.
- `web-app-shell`: remote profile follow action의 구현 소유권을 PROD-263으로 고정한다.

## Impact

- Contract owner: [PROD-357](https://linear.app/byulmaru/issue/PROD-357)
- Parent integration: [PROD-235](https://linear.app/byulmaru/issue/PROD-235)
- Completed foundations: PROD-240, PROD-241, PROD-248, PROD-281, PROD-323
- Remaining implementation: PROD-242, PROD-243, PROD-244, PROD-245, PROD-263, PROD-282, PROD-361
- External dependency: PROD-272 pending-only Follow Request lifecycle
- Final integration and archive owner: PROD-361
- PROD-242/243/244/245/263/282/361은 PROD-357이 완료되기 전까지 blocked 상태를 유지한다.
- PROD-243은 추가로 PROD-272의 pending-only request boundary를 기다린다.
