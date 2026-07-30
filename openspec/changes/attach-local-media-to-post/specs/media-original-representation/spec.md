## ADDED Requirements

### Requirement: Local Media Original representation persistence

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, PROD-461, PROD-581. 시스템은 Local Media 업로드 완료 시 Media Storage Service가 반환한 Original URL과 MIME type을 Ready state와 함께 저장해야 한다(MUST).

#### Scenario: Uploading Media 완료

- **WHEN** Upload Account가 Uploading Local Media의 완료를 요청하고 저장 서비스가 유효한 공개 Original URL과 MIME type을 반환한다
- **THEN** 같은 Media에 Original URL, Original MIME, Ready At과 Ready state를 함께 저장한다
- **AND** storage reference 형식, object key, URL 또는 MIME을 Kosmo가 추론하지 않는다

#### Scenario: 완료 확인 실패

- **WHEN** 저장 서비스가 미완료·오류·timeout 또는 잘못된 representation 응답을 반환한다
- **THEN** Media는 Uploading state와 빈 Original metadata를 유지한다

#### Scenario: 기존 Ready Media backfill

- **WHEN** Original URL 또는 MIME이 없는 기존 Ready Local Media를 backfill한다
- **THEN** 저장 서비스의 현재 representation을 idempotent하게 저장한다
- **AND** 성공·실패·남은 누락 수를 확인할 수 있다

### Requirement: Stored Media representation read boundary

**Authority / Provenance:** `docs/domain/objects/media.md`, PROD-559, PROD-570, PROD-581. 시스템은 Post, GraphQL과 ActivityPub read projection에서 저장된 Original URL과 MIME을 사용해야 한다(MUST).

#### Scenario: Read projection

- **WHEN** Ready Local Media를 허용된 read projection으로 표현한다
- **THEN** Media row의 Original URL과 MIME을 사용한다
- **AND** 권한 판정이나 projection 중 Media Storage Service를 호출하지 않는다
