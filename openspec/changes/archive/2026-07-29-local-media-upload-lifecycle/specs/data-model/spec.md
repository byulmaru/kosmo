## MODIFIED Requirements

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 계정-프로필 역할, 미디어, 인스턴스, ActivityPub actor, ActivityPub actor key가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`, `MediaState`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyKind`에 정의된 값으로 제한된다

## REMOVED Requirements

### Requirement: 파일과 미디어 메타데이터 저장

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-435, PROD-439

**Reason:** Media Storage Service가 이미지 byte와 원본·파생 파일 표현을 소유하며 Kosmo는 별도 File persistence를 유지하지 않는다.

**Migration:** Local upload는 `local-media-upload-start`와 `local-media-upload-completion` capability의 단일 Media state lifecycle로 대체하고, Remote Media persistence는 실제 구현에서 별도로 정의한다.
