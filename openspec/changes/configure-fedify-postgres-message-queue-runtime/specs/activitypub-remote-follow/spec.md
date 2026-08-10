## MODIFIED Requirements

### Requirement: Fedify follow protocol boundary

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, PROD-235, PROD-241, PROD-448. 시스템은 ActivityPub follow protocol 처리에서 Fedify가 제공하는 inbox, signature, key, PostgreSQL queue와 delivery 경계를 재사용해야 한다(MUST).

#### Scenario: Use Fedify for outbound follow protocol activities

- **WHEN** 시스템이 remote actor로 Follow, Undo(Follow), Accept(Follow), 또는 Reject(Follow)를 발송한다
- **THEN** 시스템은 Fedify PostgreSQL outbox queue에 activity를 handoff하고 HTTP signature 또는 remote retry를 직접 구현하지 않는다
- **AND** 기존 follow capability가 정의한 ordering option은 그대로 전달하며 queue/retry 실행 정책은 Fedify가 소유한다

#### Scenario: Use Fedify for inbound follow activities

- **WHEN** remote actor가 local actor inbox로 Follow, Undo, Accept, Reject activity를 보낸다
- **THEN** Web ingress는 verified request를 Fedify PostgreSQL inbox queue에 handoff하고 별도 Fedify consumer의 inbox listener가 verified typed activity를 kosmo follow handler에 전달한다
- **AND** 시스템은 request parsing, signature verification, remote actor key verification 또는 inbox retry를 직접 구현하지 않는다

#### Scenario: Bind inbound delivery to a local target

- **WHEN** Fedify가 verified follow protocol activity와 inbox delivery target을 전달한다
- **THEN** personal inbox delivery의 식별된 local recipient는 activity가 가리키는 local actor와 일치해야 한다
- **AND** shared inbox delivery는 activity의 actor/object 관계로 대상 local actor를 식별하고 검증해야 한다
- **AND** delivery target과 activity의 local actor가 일치하지 않으면 follow graph 또는 request side effect를 만들지 않는다

#### Scenario: Materialize unknown remote actor through lookup

- **WHEN** follow protocol handler가 remote actor URI를 참조하지만 저장된 ActivityPub remote `Profile`이 없다
- **THEN** 시스템은 actor URI만으로 `Profile`을 생성하지 않는다
- **AND** inbound `Follow`의 local target이 active local actor로 검증되지 않으면 remote actor lookup 또는 materialization을 수행하지 않고 side effect 없이 무시한다
- **AND** actor URI host만으로 federated handle을 추정하지 않고, Fedify-backed lookup이 검증한 canonical federated handle과 ActivityPub actor URI binding만 remote profile materialization 입력으로 사용한다
- **AND** materialization write 전에 해당 `acct:` domain의 기존 instance 상태가 `SUSPENDED`이면 `Profile`을 생성하거나 갱신하지 않고 `ProfileFollow` 또는 `ProfileFollowRequest`도 생성하거나 갱신하지 않는다
- **AND** materialization write 전에 해당 `acct:` domain의 기존 instance 상태가 `UNRESPONSIVE`이면 시스템은 inbound activity를 reachability signal로 보고 instance 상태를 `ACTIVE`로 갱신한 뒤 materialization과 follow 처리를 계속한다
- **AND** materialization 결과의 canonical actor URI는 inbound activity의 remote actor URI와 일치해야 한다
- **AND** lookup이 federated handle과 actor URI binding을 검증하지 못하면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않는다
