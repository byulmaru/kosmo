## Why

현재 Local ActivityPub `Person` 문서는 Profile의 표시 이름과 bio만 표현하고, 이미 편집 가능한
avatar/header와 Follow Approval Policy를 누락한다. 원격 서버가 actor를 다시 조회하거나 후속
`Update(Person)`을 받아도 완전한 최신 Profile 표현을 얻을 수 있도록 canonical local actor projection을
완성해야 한다.

## What Changes

- Local Profile의 표시 이름, bio, Ready Local avatar/header Media와 Follow Approval Policy를 하나의
  canonical ActivityPub `Person` projection으로 제공한다.
- avatar는 `icon`, header는 `image`로 저장된 공개 URL과 Media Type을 투영한다.
- `APPROVAL_REQUIRED`는 `manuallyApprovesFollowers=true`, `OPEN`은 `false`로 투영한다.
- 선택적 bio/avatar/header의 부재와 이미지 교체·제거를 최신 저장 상태대로 표현한다.
- 기존 actor identity, Web URL, endpoint, collection URI와 key 계약은 유지한다.
- Profile Tag·Profile Link 표현과 outbound `Update(Person)` 전달은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- Linear Contract: `PROD-628`
- Linear Implementations: `PROD-628`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-actor-discovery`: Local actor document가 현재 확정된 Profile 표현과 Follow Approval Policy를
  완전하게 제공하도록 확장한다.

## Impact

- `packages/fedify`: Local Profile/Media projection 조회와 ActivityPub `Person` 직렬화
- `openspec/specs/activitypub-actor-discovery`: Local actor document 표현 계약
- DB schema, GraphQL schema, Profile 편집 UI와 outbound activity delivery에는 변경이 없다.
