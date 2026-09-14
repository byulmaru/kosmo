## Why

현재 selected Profile 계약은 실제 선택 자격과 무관한 Profile Origin을 Local-only 또는 Local/Remote capability로
기록하고, 일부 backend action은 이미 검증된 selected Profile의 Instance Kind를 다시 확인한다. 선택 자격을
Account-Profile Membership 하나로 정리해 계약과 구현의 중복 조건을 제거한다.

## What Changes

- selected Profile의 선택 자격을 요청 Account와 Profile 사이의 Account-Profile Membership 존재로 정정한다.
- 선택 경계에서 Profile Origin, Account Profile Role, Profile 생성자 여부를 검사하지 않는다는 계약을 명시한다.
- Remote Profile Membership 생성 경로의 부재를 제품 capability로 승격하지 않으며, Remote 선택 지원·금지 계약을
  추가하지 않는다.
- 이미 검증된 selected Profile identity를 받는 Core/GraphQL action에서 공통 선택 자격을 다시 판단하는
  `InstanceKind.LOCAL` 조건과 그 조건만을 증명하는 fixture·scenario를 제거한다.
- Target, source, recipient, federation delivery와 protocol origin의 의미상 필요한 Local/Remote 분기는 유지한다.
- Local-only 또는 Local/Remote selected Profile capability를 요구하는 active OpenSpec 문구와 인위적인
  Remote-selected 성공·실패 scenario를 제거한다. 이는 도달 가능한 production capability를 변경하는 것이
  아니라, 실제 선택 계약과 어긋난 문구와 테스트를 정정하는 것이다.

## Authority / Provenance

- Canonical:
  - `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
  - `docs/domain/objects/account-profile-membership.md`
  - `docs/architecture/core-services.md`
- Linear Contract: [PROD-962](https://linear.app/byulmaru/issue/PROD-962/프로필-선택-권한을-account-profile-membership-하나로-정리한다)
- Linear Implementations: `PROD-962`가 GraphQL/Core 구현·검증·OpenSpec 정합성과 archive 책임을 함께 소유한다.

## Capabilities

### New Capabilities

없음. 이 change는 새 제품 capability를 추가하지 않는다.

### Modified Capabilities

- `profile`: selected Profile 선택 authorization을 Account-Profile Membership 하나로 정리한다.
- `profile-mute`: selected Profile owner의 중복 Local kind 조건을 제거하고 Target origin 조건은 유지한다.
- `post`: Local/Remote selected Profile capability 및 인위적인 Remote-selected post 작성 scenario를 제거한다.

## Impact

- GraphQL session/context와 `selectProfile`의 선택·복원 경계, selected actor를 소비하는 Core/GraphQL action의
  중복 Origin 조건 및 관련 executable test가 영향을 받는다.
- 현재 active `profile`, `profile-mute` 및 `post` OpenSpec과 Local/Remote selected Profile을 직접 규정한 active
  post delta spec이 정정된다. archived OpenSpec history는 변경하지 않는다.
- Account-Profile Membership DB 구조, Role 모델, target/source/recipient 조회·연합 정책, schema shape와
  Remote Profile materialization에는 변경이 없다.
