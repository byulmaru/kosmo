## Why

현재 원격 `Create(Note)` 수신은 `Note.attachment`의 Image를 무시하므로 이미지가 있는 원격 Post가 Kosmo `Media`와 PostContent Media node를 갖지 못한다. 또한 현재 `media` 스키마는 Local upload 전용 필드를 필수로 요구해 canonical Remote Media를 저장할 수 없다.

## What Changes

- 원격 embedded `Image`와 `mediaType=image/*`인 embedded `Document` attachment의 HTTP(S) URL을 별도 remote URL column 없이 `media.url`에 저장하는 `REMOTE + READY` Media projection을 추가한다.
- Local upload 전용 Media field와 Remote Media field의 존재 조건을 PostgreSQL/Drizzle schema에 반영한다.
- 지원되는 원격 이미지 attachment의 순서는 PostContent V1 Media node로, Alt Text는 해당 Remote Media로 보존한다.
- Remote Media와 기존 ActivityPub Post mapping, Post, PostContent, currentContent를 최초 materialization의 같은 transaction과 first-write-wins 경계에서 생성한다.
- 원격 이미지 URL 중복과 concurrent delivery가 중복 Media 또는 orphan row를 만들지 않도록 한다.
- 원격 byte fetch, Media Storage Service 복제/proxy, Update(Note), Profile representation과 client rendering은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- Linear Contract: PROD-585
- Linear Implementations: PROD-585

## Capabilities

### New Capabilities

- `activitypub-remote-media`: 원격 Note 이미지 attachment를 Remote Media와 PostContent Media node로 원자적으로 투영하는 계약

### Modified Capabilities

- `data-model`: Local upload와 Remote Media의 source/state별 field 존재 조건과 원격 URL identity를 Media 저장 모델에 반영

## Impact

- `packages/core/db`: Media column nullability, source/state invariant, 원격 URL uniqueness와 migration 검증
- `packages/core`: 원격 Media persistence와 PostContent Media document 조합을 포함하는 transaction 경계
- `packages/fedify`: embedded Image와 `image/*` Document attachment 검증 및 원격 Note materialization 입력
- `packages/fedify` 및 `packages/core` 테스트: attachment-only, 중복, concurrent, rollback과 기존 text-only 회귀 검증
- 선행 계약: active `attach-local-media-to-post` change의 PostContent V1 Media node schema를 재사용하며 Local Note attachment projection task는 변경하지 않음
