## REMOVED Requirements

### Requirement: Local Reply Create delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-512

**Reason**: Reply는 일반 Local Post `Create(Note)`와 다른 Activity가 아니며 PROD-494의 Note projection이 이미
`inReplyTo`를 제공한다.

**Migration**: `activitypub-local-post-delivery`의 일반 Create lifecycle과 공통 outbound dispatcher를 사용한다.

### Requirement: Reply delivery recipient와 audience

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, PROD-512

**Reason**: Reply 전용 경계가 actor·inbox를 직접 해석하면 Root Post와 후속 interaction이 recipient policy를
복제한다.

**Migration**: Local Post lifecycle은 논리적 Parent author·followers target만 결정하고
`activitypub-outbound-recipient-dispatch`가 recipient를 확장한다.

### Requirement: Reply Author Local Instance origin

**Authority / Provenance:** `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`, PROD-512

**Reason**: Author Local Instance identity는 Reply에만 적용되는 계약이 아니라 모든 Local Post activity의 계약이다.

**Migration**: `activitypub-local-post-delivery`의 Author Local Instance identity 요구사항을 사용한다.

### Requirement: Local Reply Delete delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-512

**Reason**: Reply 삭제는 일반 Local content Post `Delete(Note URI)`와 다른 lifecycle이 아니다.

**Migration**: `activitypub-local-post-delivery`의 일반 Delete lifecycle을 사용한다.

### Requirement: Post-commit delivery failure isolation

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-447, PROD-512, PROD-533

**Reason**: failure isolation은 Reply 전용이 아니라 모든 Local Post direct delivery에 적용된다.

**Migration**: `activitypub-local-post-delivery`의 Post lifecycle과 delivery failure isolation 요구사항을 사용한다.

### Requirement: 현재 직접 delivery 제한

**Authority / Provenance:** PROD-448, PROD-512, PROD-533

**Reason**: direct-delivery 유실 제한은 Reply 전용 capability가 아니라 공통 Local Post delivery 경계에 속한다.

**Migration**: `activitypub-local-post-delivery`의 현재 direct delivery 제한을 사용하고 durable migration은
PROD-448에 유지한다.
