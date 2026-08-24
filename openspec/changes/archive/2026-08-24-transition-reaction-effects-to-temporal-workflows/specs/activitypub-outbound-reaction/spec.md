## ADDED Requirements

### Requirement: Local Reaction Activity의 Temporal queue handoff

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/architecture/core-services.md`, `PROD-448`, `PROD-499`, `PROD-723` — Local-origin Reaction Effects Workflow는 실제 생성에 대해 기존 Like 또는 EmojiReact projection을, 실제 삭제에 대해 기존 Undo projection을 Worker Activity로 Fedify PostgreSQL queue에 handoff해야 한다(MUST). Activity 성공 경계는 queue acceptance이고(MUST), 이후 remote retry와 최종 실패는 Fedify가 소유해야 한다(MUST).

#### Scenario: Local 기본 Reaction 생성

- **WHEN** `❤️` Reaction의 Local-origin Create Effects Workflow가 federation Activity를 실행한다
- **THEN** Activity는 기존 Reaction ID, actor, object, audience와 recipient 정책으로 Like를 queue에 handoff한다

#### Scenario: Local emoji Reaction 생성

- **WHEN** `❤️` 이외 허용 Type의 Local-origin Create Effects Workflow가 federation Activity를 실행한다
- **THEN** Activity는 기존 Reaction ID, actor, object, audience와 recipient 정책으로 EmojiReact를 queue에 handoff한다

#### Scenario: Local Reaction 삭제

- **WHEN** Local-origin Delete Effects Workflow가 deleted Reaction snapshot으로 federation Activity를 실행한다
- **THEN** Activity는 원본 activity URI와 ordering key를 유지한 Undo를 queue에 handoff한다

#### Scenario: queue handoff 재시도

- **WHEN** queue acceptance 전 federation Activity가 재시도 가능한 실패를 만난다
- **THEN** Temporal Activity는 같은 stable activity identity와 ordering key로 handoff를 재시도할 수 있다
- **AND** committed Reaction 결과를 바꾸지 않는다
