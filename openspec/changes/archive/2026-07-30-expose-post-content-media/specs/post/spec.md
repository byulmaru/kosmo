## MODIFIED Requirements

### Requirement: PostContent GraphQL object

API는 현재 PostContent를 versioned document와 파생 호환 필드로 노출하고, 조회 가능한 PostContent에서 실제 Media Node 목록을 제공해야 한다(MUST).

#### Scenario: PostContent Media Node 조회

- **WHEN** 조회 가능한 PostContent document가 하나 이상의 Media node를 참조한다
- **THEN** `PostContent.media`는 document 순서대로 실제 `Media` Node를 반환한다
- **AND** 각 Media는 global `id`, 저장된 `url`, `mediaType`, nullable `altText`를 제공한다
- **AND** Sensitive Media는 Media에 복제하지 않고 `PostContent.document` root에 유지한다

#### Scenario: Post 권한 scope grant

- **WHEN** viewer가 Post 조회 정책을 통과해 `PostContent.media`를 조회한다
- **THEN** field는 반환한 Media subtree에 Media 표시 조회 scope를 grant한다
- **AND** Media의 URL, media type, Alt Text는 이 grant를 요구한다
- **AND** standalone Media Node가 참조 Post를 역추적해 권한을 얻는 동작은 제공하지 않는다

#### Scenario: Media-owned Alt Text 갱신

- **WHEN** createPost가 `{mediaId, altText}` 첨부 입력을 받아 유효한 Media를 참조한다
- **THEN** PostContent document에는 Media ID와 순서만 저장한다
- **AND** 같은 transaction에서 Media의 nullable Alt Text를 입력값으로 갱신한다
- **AND** 같은 Media가 다른 값으로 다시 갱신되면 모든 참조 Post가 최신 값을 조회한다

#### Scenario: Media가 없거나 표시할 수 없는 경우

- **WHEN** document에 Media node가 없다
- **THEN** `PostContent.media`는 빈 목록을 반환한다
- **WHEN** 참조 Media row, Ready 상태, URL 또는 media type이 불완전하다
- **THEN** partial list 대신 `PostContent.media` 전체를 unavailable로 반환한다

#### Scenario: 저장된 representation만 사용하는 조회

- **WHEN** 시스템이 `PostContent.media`를 해석한다
- **THEN** Media row에 저장된 값만 사용하고 외부 storage service를 호출하지 않는다
- **AND** storage reference를 공개하지 않는다
