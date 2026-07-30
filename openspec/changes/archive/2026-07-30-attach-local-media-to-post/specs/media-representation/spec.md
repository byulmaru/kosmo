## ADDED Requirements

### Requirement: Local Media representation persistence

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, PROD-461, PROD-581. 시스템은 Local Media 업로드 완료 시 Media Storage Service가 반환한 공개 URL과 media type을 Ready state와 함께 저장해야 한다(MUST).

#### Scenario: Uploading Media 완료

- **WHEN** Upload Account가 Uploading Local Media의 완료를 요청하고 저장 서비스가 계약된 공개 URL과 non-empty Media Type을 반환한다
- **THEN** 같은 Media에 URL, Media Type, Ready At과 Ready state를 함께 저장한다
- **AND** storage reference 형식, object key, URL 또는 Media Type을 Kosmo가 추론하지 않는다
- **AND** Media Type의 MIME 문법·지원 여부나 URL byte와의 일치를 Kosmo가 재검증·정규화하지 않고 반환 문자열을 그대로 저장한다

#### Scenario: 저장 서비스가 확정한 알 수 없는 Media Type

- **WHEN** 저장 서비스가 계약된 응답에서 Kosmo가 알지 못하거나 MIME 문법으로 해석할 수 없는 non-empty Media Type을 반환한다
- **THEN** 시스템은 저장 서비스 결과를 신뢰해 그 문자열과 URL을 저장하고 Media를 Ready로 전환한다
- **AND** 이후 read projection은 저장된 Media Type을 그대로 사용한다

#### Scenario: 완료 확인 실패

- **WHEN** 저장 서비스가 미완료·오류·timeout이거나 필수 필드의 존재·transport type을 충족하지 못한 응답을 반환한다
- **THEN** Media는 Uploading state와 빈 URL·Media Type을 유지한다

### Requirement: Stored Media representation read boundary

**Authority / Provenance:** `docs/domain/objects/media.md`, PROD-559, PROD-570, PROD-581. 시스템은 Post, GraphQL과 ActivityPub read projection에서 저장된 URL과 Media Type을 사용해야 한다(MUST).

#### Scenario: Read projection

- **WHEN** Ready Local Media를 허용된 read projection으로 표현한다
- **THEN** Media row의 URL과 Media Type을 사용한다
- **AND** 권한 판정이나 projection 중 Media Storage Service를 호출하지 않는다

#### Scenario: 공개 표현 URL의 인가 경계

- **WHEN** Post 조회 또는 ActivityPub projection이 Ready Local Media 표현을 권한 있는 viewer나 recipient에게 제공한다
- **THEN** 시스템은 저장된 공개 URL을 전달하고 byte 조회를 Kosmo API로 proxy하지 않는다
- **AND** 전달된 URL은 Post Visibility를 다시 검사하는 인증 경계가 아니며 URL을 획득한 주체의 이후 조회·재전달을 제한하지 않는다
