## Why

[PROD-357](https://linear.app/byulmaru/issue/PROD-357)은 병합된 코드와 최신 Linear 자식 계약에 맞춰 `add-activitypub-remote-follow`의 공유 계약을 다시 정렬한다. 현재 change는 완료된 PROD-240/241/248/281/323의 실제 결과와 다르게 correlation·조건부 삭제를 PROD-240에 귀속하고, SUSPENDED 관계를 local-delete하며, PROD-243/244/272가 같은 저장·request 책임을 중복 소유한다.

여러 구현 PR이 같은 active change를 서로 다른 방향으로 수정하지 않도록 이 spec-only slice를 구현보다 먼저 병합한다.

## What Changes

- 완료된 저장 count, core action, remote actor materialization과 Fedify inbox route를 현재 기반으로 기록한다.
- remote follow/unfollow mutation은 PROD-242, inbound Follow/Undo와 correlation/generation·조건부 삭제는 PROD-243, pending-only request lifecycle은 PROD-272, inbound Accept/Reject는 PROD-244가 소유하도록 분리한다.
- PROD-243은 PROD-272의 검증된 request boundary를 호출하고, PROD-244는 PROD-243의 exact-row·expected-generation 삭제 primitive를 재사용한다.
- `SUSPENDED` remote profile의 기존 relation/count를 보존하고 GraphQL follow/unfollow에서 NotFound로 숨긴다.
- PROD-245의 DB-known follow graph와 PROD-263의 Web follow action을 별도 구현 slice로 유지한다.
- PROD-354의 remote-post ingestion, receipt와 content 계약은 이 change에서 재정의하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-remote-follow`: Fedify 기반 Follow/Undo/Accept/Reject와 kosmo `ProfileFollow`/`ProfileFollowRequest` projection 경계를 정의한다.

### Modified Capabilities

- `activitypub-actor-discovery`: 병합된 actor-scoped/shared inbox route와 follow handler 위임 경계를 반영한다.
- `data-model`: 저장 count와 inbound Follow correlation/generation, pending-only request 연계를 정의한다.
- `profile`: remote follow mutation, DB-known follow graph, 저장 count와 SUSPENDED 관계 보존 계약을 정의한다.
- `web-app-shell`: remote profile follow action의 구현 소유권을 PROD-263으로 고정한다.

## Impact

- Contract owner: [PROD-357](https://linear.app/byulmaru/issue/PROD-357)
- Parent integration: [PROD-235](https://linear.app/byulmaru/issue/PROD-235)
- Completed foundations: PROD-240, PROD-241, PROD-248, PROD-281, PROD-323
- Remaining implementation: PROD-242, PROD-243, PROD-244, PROD-245, PROD-263, PROD-272, PROD-282
- PROD-243은 PROD-357과 PROD-272가 완료되기 전까지 blocked 상태를 유지한다.
