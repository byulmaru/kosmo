## Why

Kosmo는 Profile이 Post에 여러 종류의 Reaction을 남기고, 이를 일관되게 집계·조회·표시하며 Notification lifecycle과 연결하는 계약이 필요하다. 저장, API, UI와 Notification 구현이 같은 유일성·권한·멱등성 규칙을 공유해야 하므로 [PROD-390](https://linear.app/byulmaru/issue/PROD-390/reaction-%EA%B3%84%EC%95%BD%EC%9D%84-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%98%EA%B3%A0-openspec%EC%9D%84-archive%ED%95%9C%EB%8B%A4)의 하나의 변경 계약으로 구체화한다.

## What Changes

- Profile, Post와 Unicode 문자열 Reaction Type을 저장하는 Reaction 계약을 추가한다.
- 초기 built-in Reaction Type을 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`로 제한하고, 같은 Profile/Post/Type 조합의 유일성과 다른 Type의 공존을 보장한다.
- 허용된 Reaction의 멱등 생성과 Owner의 멱등 삭제를 제공한다.
- Post별 Type count는 viewer와 무관하게 제공하고, Type별 Profile 목록에만 viewer의 Profile 조회 경계를 적용한다.
- Reaction 선택 UI와 count/Profile 요약 UI를 독립 component/integration 경계로 제공한다.
- 자기 Post 알림을 억제하면서 Reaction Notification을 기존 inbox에 통합하고, Reaction 제거 뒤 Notification을 Best Effort로 정리한다.
- 여러 Post action을 공통 Action Bar와 실제 surface에 조립하는 작업은 PROD-432의 별도 계약으로 유지한다.

## Capabilities

### New Capabilities

- `reaction`: Reaction identity, 허용 Type, 저장 유일성, 생성·삭제, Post별 count와 Profile 조회, 권한·멱등성 계약
- `post-reaction-ui`: Reaction 선택과 요약 UI의 표시, 상호작용, pending·오류 복구와 client cache 동기화 계약

### Modified Capabilities

- `data-model`: Reaction과 Reaction Notification source를 저장하는 관계·제약 조건 추가
- `post`: Post가 Reaction Type별 count와 viewer가 조회할 수 있는 Profile 목록을 제공하도록 조회 계약 확장
- `notification`: Reaction source의 생성·조회·inbox 표시·읽음 처리와 제거 후 Best Effort 정리 계약 추가

## Impact

- Linear: PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-450, PROD-417, PROD-418, PROD-419와 부모 PROD-390
- Core/DB: Reaction schema, migration, 무결성·index 검증
- GraphQL/Core service: 생성·삭제 mutation, count와 Profile connection, Reaction Notification concrete type와 loader
- Universal client: fixture-first Reaction Quick Picker·summary presentation, 후속 Relay mutation/cache·pagination 통합과 component/integration 검증
- Notification: 기존 Profile-scoped projection과 inbox/read/count UI 확장
- Dependency: `add-in-app-notifications`가 active `notification`·`data-model` 기반을 archive한 뒤 Reaction Notification delta를 적용한다.
- Excluded systems: ActivityPub federation, 임의 Unicode와 사용자 정의 Reaction, custom emoji Full Picker·palette·검색, Reaction trigger·popover와 공통 Post Action Bar rollout, 범용 Notification 재설계
