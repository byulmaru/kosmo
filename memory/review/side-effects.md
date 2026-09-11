# Review Style: Side Effects And Scope

## Commit And Side Effects

- remote I/O를 domain transaction 안에서 실행하지 않는다. domain transaction commit 뒤 기존 transport boundary로 전달하고 delivery failure가 committed application result를 실패로 바꾸지 않게 격리한다.
- caller-owned transaction에서도 같은 action을 유지해야 하면 Core가 명시적인 post-commit lifecycle을 반환하고 transaction owner가 commit 뒤 호출하게 할 수 있다. 어떤 lifecycle을 만들지는 `tx`가 아니라 actual state change와 domain origin이 결정한다.
- 반환된 lifecycle은 반복·동시 호출이 실제 side effect 중복으로 이어지지 않는지 확인한다.
- queue, outbox와 durable retry가 후속이라면 현재 direct-delivery slice의 선행 조건으로 만들지 않는다. 대신 process 종료 시 유실, retry 부재와 서로 다른 transaction 사이의 ordering 제한을 명시한다.

## Scope And Follow-ups

- 관련 문제를 발견해도 현재 issue의 계약을 넓혀 sibling interaction이나 독립 delivery policy까지 함께 구현하지 않는다.
- 현재 기능에 필수인지, 독립 배포 가능한지, 별도 product/architecture 결정이 필요한지, 이미 소유 issue가 있는지를 확인한다.
- 기존 backlog가 정확히 소유하면 새 issue를 중복 생성하지 않고 현재 failure path, 보장 범위와 완료 기준을 보강한다.
- follow-up으로 분리한 문제는 현재 PR이 보장하는 범위, 아직 보장하지 않는 범위와 현재 실패 동작을 기록한다.

## Spec Reachability

- OpenSpec scenario가 production caller에서 도달 가능한지 확인한다. caller가 없고 현재 issue 목표에도 필요하지 않다면 필요 없는 구현을 추가해 spec을 억지로 만족시키지 않는다.
- 후속 fan-out이나 sibling 기능을 전제한 scenario와 내부 helper 세부사항은 durable public contract에서 제거한다.
- scenario를 제거하거나 계약을 고치면 active spec과 archive artifact를 함께 동기화한다.
