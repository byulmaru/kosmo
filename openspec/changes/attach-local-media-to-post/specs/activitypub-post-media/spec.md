## ADDED Requirements

### Requirement: Local Note Media attachment projection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-436, PROD-461, PROD-559. 시스템은 Media node가 있는 새 Local Post를 ActivityPub Note로 표현할 때 text/rich body와 Media를 각각 `content`와 순서 있는 `attachment` Image로 투영해야 한다(MUST).

#### Scenario: HTML과 attachment 분리

- **WHEN** 현재 PostContent에 paragraph/text/hard-break/link와 Media node가 함께 있다
- **THEN** `Note.content`는 Media node를 제외한 기존 안전한 HTML 의미를 보존한다
- **AND** 각 Media node는 document 순서대로 `Note.attachment` Image가 된다
- **AND** 같은 Media를 HTML `<img>`와 attachment에 중복 제공하지 않는다

#### Scenario: ActivityPub Image 표현

- **WHEN** Ready Local Media node를 attachment Image로 투영한다
- **THEN** Image URL은 Media Storage Service의 공개 immutable WebP 원본을 가리킨다
- **AND** Image media type은 `image/webp`다
- **AND** nullable Alt Text가 있으면 Image의 사람이 읽을 수 있는 이름으로 제공한다
- **AND** 내부 Media DB UUID, GraphQL global ID, storage reference와 upload URL을 ActivityPub 속성으로 노출하지 않는다

#### Scenario: 필요한 Media를 제공할 수 없는 Post

- **WHEN** 현재 PostContent가 참조하는 Media가 없거나 Ready가 아니거나 접근 가능한 공개 원본 URL을 안전하게 만들 수 없다
- **THEN** 시스템은 불완전한 Note나 일부 attachment를 제공하지 않는다
- **AND** unavailable Local Post와 같은 미제공 결과로 수렴한다

### Requirement: Local Note Sensitive Media projection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-559. 시스템은 현재 PostContent document root의 Sensitive Media 값을 지원하는 ActivityPub sensitive 속성으로 투영해야 한다(MUST).

#### Scenario: Sensitive Media가 있는 Note

- **WHEN** 현재 PostContent가 Media node를 가지고 Sensitive Media가 `true`다
- **THEN** Note는 Media를 기본적으로 가릴 수 있는 sensitive 값을 제공한다
- **AND** Content Warning이 있으면 기존 `summary` projection도 함께 유지한다

#### Scenario: Sensitive Media 기본값

- **WHEN** Sensitive Media attr가 생략됐거나 `false`다
- **THEN** Note는 sensitive를 `false`로 표현하거나 의미가 같은 생략 결과를 사용한다

### Requirement: 최초 Local Note 범위

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-559. 이 capability는 새 Local Post의 Note 역참조와 최초 `Create(Note)` delivery에 같은 Media projection을 사용해야 하며(MUST), 기존 Post 수정이나 `Update(Note)` delivery를 추가하면 안 된다(MUST NOT).

#### Scenario: 최초 전송과 역참조 정합성

- **WHEN** Media가 있는 새 Local Post를 역참조하거나 최초 `Create(Note)`로 전달한다
- **THEN** 두 경로는 같은 content, attachment, Alt Text와 sensitive 의미를 사용한다

#### Scenario: 기존 Post 수정 제외

- **WHEN** 이미 게시된 Post의 수정 lifecycle을 평가한다
- **THEN** 이 capability는 새 PostContent revision이나 `Update(Note)` delivery를 만들지 않는다
