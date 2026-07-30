## Why

원격 ActivityPub actor의 HTML `summary`가 평문을 전제로 하는 `Profile.bio`에 그대로 저장되어 프로필 화면과 목록에 markup 문자가 노출된다. 최초 materialization, refresh와 기존 저장 데이터가 모두 같은 평문 계약으로 수렴하도록 federation ingress 경계를 복구해야 한다.

## What Changes

- string 및 language-tagged actor `summary`를 표시 가능한 평문으로 투영한 뒤 `Profile.bio`의 trim·500자 제한을 적용한다.
- HTML entity와 링크의 표시 텍스트를 보존하고 문단·줄바꿈을 결정적으로 평문화하며, script/style/template 같은 비표시 내용은 제거한다.
- 최초 remote Profile materialization과 기존 actor refresh가 같은 투영 경계를 사용하게 한다.
- 기존 raw HTML bio를 가진 ActivityPub Remote Profile을 동일한 투영 함수로 보정하는 dry-run 가능·batch·멱등 데이터 정리 경로와 검증 결과를 제공한다.
- GraphQL `Profile.bio`, `ProfileHero`, `ProfileListItem`, Local Profile 편집과 local actor outbound 표현은 기존 평문 계약을 유지하며 HTML renderer나 rich-text 표현을 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`
- Linear Contract: `PROD-536`
- Linear Implementations: `PROD-536` (단일 이슈가 OpenSpec, 구현, 데이터 정리와 검증을 함께 소유)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-remote-profile-federation`: actor `summary`를 평문 `Profile.bio`로 투영하는 규칙, 최초 저장·refresh의 일관성, 기존 raw HTML bio의 명시적 정리 요구사항을 추가한다.

## Impact

- `docs/domain/objects/profile.md`: `Profile.bio`의 평문 및 Remote markup 정규화 계약을 명시한다.
- `packages/core`: 기존 ActivityPub HTML→평문 경계를 공유 가능한 projection으로 정렬하고, 데이터 정리의 멱등 저장 경계를 제공한다.
- `packages/fedify`: remote actor materialization과 refresh에서 평문 projection 후 `profileBioSchema`를 적용한다.
- runtime/operations: 동일 application image에서 dry-run 및 batch 실행 가능한 one-shot 정리 명령과 진행·변경·실패 요약이 필요하다.
- `apps/api`, `apps/app`: GraphQL schema나 UI 렌더러 변경 없이 정규화된 저장값을 기존 `String`/`Text` 경로로 소비한다.
- 새 DB schema나 신규 dependency는 필요하지 않다.
