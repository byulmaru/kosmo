## ADDED Requirements

### Requirement: Post Mentioned Profile 관계 저장

PROD-652에 따라 시스템은 사용자가 선택한 Profile identity만 중복 없는 Mentioned Profile 관계로 저장해야 한다(MUST).
본문 문자열만으로 Profile identity 또는 관계를 추론해서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-652`

#### Scenario: 선택한 Profile 관계 저장

- **WHEN** 유효한 일반 Post 또는 Reply 작성 요청이 서로 다른 Mentioned Profile identity를 포함한다
- **THEN** 시스템은 각 `(post_id, profile_id)` 쌍을 `post_mention` 관계로 한 번씩 저장한다
- **AND** `post_id`는 `post.id`, `profile_id`는 `profile.id`를 foreign key로 참조한다
- **AND** 같은 Post와 Profile 쌍은 둘 이상 저장할 수 없다

#### Scenario: 선택하지 않은 Plain Text mention

- **WHEN** 본문에 `@handle` 또는 `@handle@domain` 형태의 문자열이 있지만 작성 요청에 해당 Profile identity가 없다
- **THEN** 시스템은 본문을 기존 Plain Text로 저장한다
- **AND** 문자열을 lookup하거나 `post_mention` 관계를 생성하지 않는다

#### Scenario: 빈 Mentioned Profile 목록

- **WHEN** 일반 Post 또는 Reply 작성 요청이 Mentioned Profile identity를 생략하거나 빈 목록을 제공한다
- **THEN** 시스템은 기존 Post와 PostContent를 저장한다
- **AND** 해당 Post의 `post_mention` 관계를 만들지 않는다

#### Scenario: 원자적 관계 저장

- **WHEN** Profile 검증, Post, 첫 PostContent 또는 Mentioned Profile 관계 저장 중 하나가 실패한다
- **THEN** 시스템은 작성 transaction 전체를 rollback한다
- **AND** 부분 Post, PostContent 또는 `post_mention` 관계를 남기지 않는다
