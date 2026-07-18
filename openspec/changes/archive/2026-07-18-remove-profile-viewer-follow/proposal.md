## Why

[`PROD-378`](https://linear.app/byulmaru/issue/PROD-378/profileviewerfollow와-viewerstatefollow-중복-계약을-정리한다)에서 확인한 것처럼 `Profile.viewerFollow`와 `Profile.viewerState.follow`가 같은 viewer-relative follow 관계를 중복 표현한다. first-party 애플리케이션이 이미 `viewerState.follow`만 사용하는 상황에서 두 cache slot을 계속 유지하면 follow 상태 확장과 mutation cache 갱신이 불필요하게 복잡해진다.

## What Changes

- **BREAKING** `Profile.viewerFollow` GraphQL 필드를 제거한다.
- `Profile.viewerState.follow`를 viewer-relative established follow 관계의 canonical GraphQL/Relay 표현으로 유지한다.
- follow/unfollow mutation과 active profile 전환 후의 Relay 환경이 canonical viewer state만 갱신·격리하도록 계약을 정리한다.
- API 통합 테스트, GraphQL schema, Relay generated artifact와 아직 active인 follow 관련 OpenSpec을 최종 계약에 맞춘다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: viewer-relative established follow 관계를 `Profile.viewerState.follow`로만 노출한다.
- `web-app-shell`: follow/unfollow 및 active profile 전환 뒤 Relay cache가 `Profile.viewerState`만 canonical viewer-relative 상태로 취급한다.

## Impact

- GraphQL 공개 schema의 `Profile.viewerFollow`가 제거되는 breaking change다.
- `apps/api`의 profile follow resolver와 통합 테스트가 변경된다.
- `apps/app` Relay generated artifact와 active profile 전환 계약이 canonical field 하나에 맞춰진다.
- active `add-activitypub-remote-follow` change에서 중복 cache slot을 전제로 한 표현을 함께 제거한다.
- byulmaru GitHub 조직 전체 코드 검색에서 `viewerFollow` 소비자는 현재 저장소 외부에서 확인되지 않았고, first-party production operation은 `viewerState.follow`만 사용하므로 deprecation 기간은 두지 않는다.
