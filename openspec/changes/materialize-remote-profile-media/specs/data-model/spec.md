## REMOVED Requirements

### Requirement: Remote Media URL identity

**Authority / Provenance:** `docs/domain/objects/media.md`, PROD-585, PROD-625

**Reason:** Remote URL은 원본 위치 속성일 뿐 Media identity나 재사용 key가 아니다. 같은 URL을 사용하는 서로
다른 attachment와 Profile 표현은 각자의 Media identity와 metadata를 가져야 한다.

**Migration:** 먼저 application을 URL index 유무에 호환되게 배포하고 구버전 active/preview와 rollback 대상을
배수한다. 이후 별도 contract release에서 `source=REMOTE` URL partial unique index를 제거한다. 기존 Media row와
참조는 재작성하지 않는다.

#### Scenario: 같은 Remote URL을 가진 Media 저장

- **WHEN** `source=REMOTE`인 둘 이상의 Media가 같은 canonical `media.url`을 저장한다
- **THEN** PostgreSQL은 URL이 같다는 이유로 저장을 거부하지 않는다
- **AND** 각 Media는 독립된 ID, Profile과 metadata를 보존한다

#### Scenario: Local upload schema 호환

- **WHEN** 기존 Local Media upload 시작과 완료가 실행된다
- **THEN** Local upload 전용 identity인 storage reference와 Upload Account 계약은 유지된다
- **AND** Remote URL index 제거는 Local Media URL이나 storage reference 계약을 변경하지 않는다
