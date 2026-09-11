## ADDED Requirements

### Requirement: Hashtag related Profile candidates apply the selected Profile Block policy

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `openspec/specs/hashtag-related-profile-api/spec.md`, `PROD-822`. 유효한 Account에 selected Profile이 있으면 시스템은 그 Profile을 `Hashtag.relatedProfiles`의 viewer로 사용해야 한다(MUST). 시스템은 기존의 정확한 Hashtag 관계와 공개 Profile 조회 조건을 통과한 후보 중 viewer와 어느 방향으로든 Active Profile Block 관계인 Profile을 pagination·cursor·limit 전에 제외해야 한다(MUST). selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지하고 Profile Block predicate나 selected Local Profile을 새로 요구해서는 안 된다(MUST NOT). 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용해서는 안 된다(MUST NOT).

#### Scenario: selected Profile이 차단한 Profile을 Hashtag 관련 후보에서 제외한다

- **WHEN** 유효한 Account의 selected Profile이 정확한 Hashtag 관계와 공개 조회 조건을 통과한 후보 Profile을 Active Block한 상태에서 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 해당 후보 Profile을 결과에서 제외한다
- **AND** Account의 현재 selected Profile을 viewer로 사용한다

#### Scenario: selected Profile을 차단한 Profile을 Hashtag 관련 후보에서 제외한다

- **WHEN** 정확한 Hashtag 관계와 공개 조회 조건을 통과한 후보 Profile이 유효한 Account의 selected Profile을 Active Block한 상태에서 Account가 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 해당 후보 Profile을 결과에서 제외한다
- **AND** Block 방향과 무관하게 같은 후보 정책을 적용한다

#### Scenario: Block 후보 제외를 pagination 전에 적용한다

- **WHEN** cursor 다음의 정확한 Hashtag 관계 후보 중 양방향 Active Profile Block 관계로 제외되는 Profile 뒤에 공개 조회 가능한 후보가 더 존재한다
- **THEN** 시스템은 Block된 Profile을 pagination·cursor·limit 전에 후보에서 제외한다
- **AND** Block되지 않은 후보를 기준으로 요청한 page 크기와 `pageInfo`를 계산한다

#### Scenario: selected Profile이 없으면 기존 Hashtag 관련 공개 결과를 유지한다

- **WHEN** 유효한 Account에 selected Profile이 없고 Account가 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 기존 Account 인증과 정확한 Hashtag 관계·공개 Profile 후보 결과를 유지한다
- **AND** Profile Block predicate를 적용하거나 selected Local Profile을 새로 요구하지 않는다
- **AND** 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다
