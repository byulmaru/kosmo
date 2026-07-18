## Context

`Profile.viewerFollow`와 `Profile.viewerState.follow`는 같은 `viewerFollowLoader(ctx).load(profile.id)` 결과를 반환한다. first-party Relay fragment는 `viewerState.follow`만 선택하지만 API 통합 테스트, schema와 일부 active OpenSpec은 두 필드를 동시에 유지해 같은 관계에 두 cache slot이 존재하는 것처럼 표현한다.

GitHub 조직 전체 코드 검색에서 `viewerFollow` 참조는 `byulmaru/kosmo` 안에서만 확인됐다. 따라서 이 변경은 별도 deprecation 기간 없이 중복 필드를 제거하고 현재 production 경로를 canonical 계약으로 승격한다.

## Goals / Non-Goals

**Goals:**

- viewer-relative established follow 관계를 `Profile.viewerState.follow` 하나로 표현한다.
- API schema, 통합 테스트, Relay generated artifact와 active OpenSpec을 같은 계약에 맞춘다.
- follow/unfollow와 active profile 전환 뒤 하나의 canonical cache slot만 갱신·격리되는지 검증한다.

**Non-Goals:**

- follow/unfollow mutation 행동, count, 접근 정책을 변경하지 않는다.
- pending follow request나 cancel UX를 추가하지 않는다.
- `viewerFollowLoader`의 DB 조회 및 access policy를 재설계하지 않는다.

## Implementation Guidance

### Current Constraints

- `viewerFollowLoader`는 `viewerState.follow`에서도 계속 필요하므로 top-level field 제거와 함께 삭제하면 안 된다.
- `apps/api/schema.graphql`과 Relay generated artifact는 source operation을 바꾼 뒤 저장소의 기존 생성 명령으로 동기화해야 한다.
- active `add-activitypub-remote-follow` change가 optimistic update 대상으로 `viewerFollow`를 명시하므로 그대로 두면 두 OpenSpec 계약이 충돌한다.
- active profile 전환은 field별 수동 invalidation이 아니라 selected profile ID별 Relay environment 재생성으로 cache를 격리한다.

### Recommended Approach

Profile resolver에서 top-level `viewerFollow` 필드만 제거하고 `viewerState` resolver가 기존 loader를 재사용하게 둔다. API 통합 쿼리와 assertion은 `viewerState.follow`만으로 관계 방향, self, no-active-profile, pending 및 visibility 사례를 검증한다. 이후 schema와 Relay artifact를 생성하고 active follow OpenSpec 및 repository memory의 중복 명칭을 정리한다.

### Allowed Alternatives

없음.

### Known Traps

- loader 이름에 `viewerFollow`가 포함된다는 이유만으로 loader까지 제거하거나 새 loader를 만들면 불필요한 쿼리 변경과 추상화가 생긴다.
- archived OpenSpec 기록을 현재 계약처럼 전부 다시 쓰지 않는다. active spec과 active change만 최종 계약에 맞춘다.
- API 테스트에서 top-level field assertion만 삭제하고 `viewerState.follow`의 established 관계 검증까지 약화하지 않는다.

## Risks / Trade-offs

- [Risk] 확인하지 못한 외부 GraphQL 소비자는 breaking schema 변경을 겪을 수 있다. → 조직 전체 코드 검색 결과와 first-party operation을 근거로 즉시 제거하며, 문제가 확인되면 같은 resolver를 복구하는 것으로 rollback한다.
- [Risk] 생성 산출물이나 active OpenSpec에 중복 필드가 남을 수 있다. → 전체 저장소 검색과 OpenSpec strict validation으로 잔존 참조를 확인한다.

## Migration Plan

1. `Profile.viewerFollow` resolver와 schema를 제거한다.
2. API 테스트와 Relay generated artifact를 `viewerState.follow` 기준으로 동기화한다.
3. active spec, active follow change와 repository memory를 정렬한다.
4. 관련 API/App 검증과 OpenSpec strict validation을 실행한다.

Rollback은 top-level field resolver와 schema 계약을 복구하는 단일 코드 변경으로 수행할 수 있다. DB migration이나 데이터 복구는 필요하지 않다.

## Open Questions

없음.
